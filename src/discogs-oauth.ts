/**
 * Discogs OAuth 1.0a client — Web Crypto HMAC-SHA1 signer + three-leg flow.
 *
 * Spec: https://datatracker.ietf.org/doc/html/rfc5849
 * Discogs: https://www.discogs.com/developers/#page:authentication
 */
import { z } from "zod";

export const USER_AGENT = "discogs-mcp/0.1.0 +https://github.com/mcal8055/discogs_mcp";

const identitySchema = z.object({
	username: z.string().min(1),
	id: z.number().int(),
});

const FETCH_TIMEOUT_MS = 15_000;

const API_BASE = "https://api.discogs.com";
const REQUEST_TOKEN_URL = `${API_BASE}/oauth/request_token`;
const ACCESS_TOKEN_URL = `${API_BASE}/oauth/access_token`;
const IDENTITY_URL = `${API_BASE}/oauth/identity`;
export const AUTHORIZE_URL = "https://www.discogs.com/oauth/authorize";

export type ConsumerCreds = { key: string; secret: string };
export type TokenCreds = { token: string; secret: string };

/** RFC 3986 percent-encoding — OAuth 1.0a requires strict compliance. */
function percentEncode(str: string): string {
	return encodeURIComponent(str).replace(
		/[!*'()]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

function randomNonce(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1Base64(key: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(key),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
	return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Build the OAuth 1.0a Authorization header value.
 * `extraParams` merges into the signed param set (e.g. oauth_callback, oauth_verifier).
 * If `extraParams` includes `oauth_nonce` or `oauth_timestamp`, those override the
 * auto-generated values — useful for deterministic tests.
 */
export async function buildAuthHeader(
	method: string,
	url: string,
	consumer: ConsumerCreds,
	token?: TokenCreds,
	extraParams: Record<string, string> = {},
): Promise<string> {
	const oauthParams: Record<string, string> = {
		oauth_consumer_key: consumer.key,
		oauth_nonce: randomNonce(),
		oauth_signature_method: "HMAC-SHA1",
		oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
		oauth_version: "1.0",
		...extraParams,
	};
	if (token) oauthParams.oauth_token = token.token;

	// Collect all params: oauth_* + URL query string
	const parsed = new URL(url);
	const allParams: [string, string][] = [];
	for (const [k, v] of Object.entries(oauthParams)) allParams.push([k, v]);
	for (const [k, v] of parsed.searchParams) allParams.push([k, v]);

	// Sort by encoded key, then encoded value
	const sorted = allParams
		.map(([k, v]) => [percentEncode(k), percentEncode(v)] as [string, string])
		.sort(([k1, v1], [k2, v2]) => (k1 === k2 ? v1.localeCompare(v2) : k1.localeCompare(k2)));
	const paramString = sorted.map(([k, v]) => `${k}=${v}`).join("&");

	// Base URL is scheme://host/path (no query, no fragment)
	const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
	const baseString = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;

	const signingKey = `${percentEncode(consumer.secret)}&${percentEncode(token?.secret ?? "")}`;
	const signature = await hmacSha1Base64(signingKey, baseString);

	oauthParams.oauth_signature = signature;

	const headerParams = Object.entries(oauthParams)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
		.join(", ");
	return `OAuth ${headerParams}`;
}

function parseFormEncoded(body: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const pair of body.split("&")) {
		const [k, v = ""] = pair.split("=");
		out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
	}
	return out;
}

export async function getRequestToken(
	consumer: ConsumerCreds,
	callbackUrl: string,
): Promise<{ requestToken: string; requestTokenSecret: string }> {
	const authHeader = await buildAuthHeader("POST", REQUEST_TOKEN_URL, consumer, undefined, {
		oauth_callback: callbackUrl,
	});
	const res = await fetch(REQUEST_TOKEN_URL, {
		method: "POST",
		headers: { Authorization: authHeader, "User-Agent": USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`request_token failed: ${res.status} ${await res.text()}`);
	const body = parseFormEncoded(await res.text());
	if (!body.oauth_token || !body.oauth_token_secret)
		throw new Error("request_token response missing token fields");
	return { requestToken: body.oauth_token, requestTokenSecret: body.oauth_token_secret };
}

export async function getAccessToken(
	consumer: ConsumerCreds,
	requestToken: TokenCreds,
	verifier: string,
): Promise<{ accessToken: string; accessSecret: string }> {
	const authHeader = await buildAuthHeader(
		"POST",
		ACCESS_TOKEN_URL,
		consumer,
		requestToken,
		{ oauth_verifier: verifier },
	);
	const res = await fetch(ACCESS_TOKEN_URL, {
		method: "POST",
		headers: { Authorization: authHeader, "User-Agent": USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`access_token failed: ${res.status} ${await res.text()}`);
	const body = parseFormEncoded(await res.text());
	if (!body.oauth_token || !body.oauth_token_secret)
		throw new Error("access_token response missing token fields");
	return { accessToken: body.oauth_token, accessSecret: body.oauth_token_secret };
}

export async function getIdentity(
	consumer: ConsumerCreds,
	access: TokenCreds,
): Promise<{ username: string; id: number }> {
	const res = await signedFetch(IDENTITY_URL, { method: "GET" }, consumer, access);
	if (!res.ok) throw new Error(`identity failed: ${res.status} ${await res.text()}`);
	const body = identitySchema.parse(await res.json());
	return { username: body.username, id: body.id };
}

/** Sign and send an arbitrary authenticated request — used by tool handlers. */
export async function signedFetch(
	url: string,
	init: RequestInit,
	consumer: ConsumerCreds,
	access: TokenCreds,
): Promise<Response> {
	const method = (init.method ?? "GET").toUpperCase();
	const authHeader = await buildAuthHeader(method, url, consumer, access);
	const headers = new Headers(init.headers);
	headers.set("Authorization", authHeader);
	headers.set("User-Agent", USER_AGENT);
	return fetch(url, {
		...init,
		headers,
		signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
}
