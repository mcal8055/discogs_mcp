import OAuth from "oauth-1.0a";
import CryptoJS from "crypto-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthHeader, getIdentity } from "../src/discogs-oauth";

/**
 * Verify our Web-Crypto HMAC-SHA1 signer produces the same signature as
 * oauth-1.0a (a widely-used, battle-tested npm package) for a variety of
 * inputs covering Discogs's actual flows and RFC 3986 encoding edge cases.
 */

function oracleSignature(opts: {
	method: string;
	url: string;
	consumerKey: string;
	consumerSecret: string;
	token?: string;
	tokenSecret?: string;
	nonce: string;
	timestamp: string;
	data?: Record<string, string>;
}): string {
	const oauth = new OAuth({
		consumer: { key: opts.consumerKey, secret: opts.consumerSecret },
		signature_method: "HMAC-SHA1",
		hash_function(base: string, key: string) {
			return CryptoJS.HmacSHA1(base, key).toString(CryptoJS.enc.Base64);
		},
	});
	// Override defaults — the 3rd `options` arg on authorize() doesn't replace these.
	(oauth as unknown as { getNonce: () => string }).getNonce = () => opts.nonce;
	(oauth as unknown as { getTimeStamp: () => number }).getTimeStamp = () => Number(opts.timestamp);

	const requestData = { url: opts.url, method: opts.method, data: opts.data };
	const authorization = oauth.authorize(
		requestData,
		opts.token ? { key: opts.token, secret: opts.tokenSecret ?? "" } : undefined,
	);
	return authorization.oauth_signature;
}

function extractSignatureFromHeader(header: string): string {
	const match = header.match(/oauth_signature="([^"]+)"/);
	if (!match) throw new Error("no oauth_signature in header");
	return decodeURIComponent(match[1]);
}

const FIXED_NONCE = "0123456789abcdef0123456789abcdef";
const FIXED_TS = "1700000000";

describe("OAuth 1.0a signer — matches oauth-1.0a reference", () => {
	const cases = [
		{
			name: "POST request_token (two-leg, with oauth_callback)",
			method: "POST",
			url: "https://api.discogs.com/oauth/request_token",
			consumer: { key: "abc123", secret: "secret_xyz" },
			extra: { oauth_callback: "https://example.com/callback/discogs" },
		},
		{
			name: "POST access_token (three-leg, with oauth_verifier)",
			method: "POST",
			url: "https://api.discogs.com/oauth/access_token",
			consumer: { key: "abc123", secret: "secret_xyz" },
			token: { token: "req_tok", secret: "req_sec" },
			extra: { oauth_verifier: "abc+def/123=" },
		},
		{
			name: "GET identity (authenticated, no extras)",
			method: "GET",
			url: "https://api.discogs.com/oauth/identity",
			consumer: { key: "abc123", secret: "secret_xyz" },
			token: { token: "acc_tok", secret: "acc_sec" },
			extra: {},
		},
		{
			name: "GET with URL query params (search)",
			method: "GET",
			url: "https://api.discogs.com/database/search?q=daft+punk&type=release&per_page=50",
			consumer: { key: "consumer_key", secret: "consumer_secret!" },
			token: { token: "user_token", secret: "user_token_secret" },
			extra: {},
		},
		{
			name: "Encoding edge cases: spaces, quotes, reserved chars in params",
			method: "GET",
			url: "https://api.discogs.com/database/search?q=Sgt.%20Pepper%27s&type=release",
			consumer: { key: "key with space", secret: "secret!*'()" },
			token: { token: "tok", secret: "sec" },
			extra: {},
		},
		{
			name: "Unicode in secret",
			method: "GET",
			url: "https://api.discogs.com/oauth/identity",
			consumer: { key: "k", secret: "café☕" },
			token: { token: "t", secret: "s" },
			extra: {},
		},
	];

	it.each(cases)("$name", async ({ method, url, consumer, token, extra }) => {
		const extraWithFixed = { ...extra, oauth_nonce: FIXED_NONCE, oauth_timestamp: FIXED_TS };
		const header = await buildAuthHeader(method, url, consumer, token, extraWithFixed);
		const ourSig = extractSignatureFromHeader(header);

		// oauth-1.0a takes query params via the URL string directly
		const parsedUrl = new URL(url);
		const urlParams: Record<string, string> = {};
		for (const [k, v] of parsedUrl.searchParams) urlParams[k] = v;
		const urlBase = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;

		const expectedSig = oracleSignature({
			method,
			url: urlBase,
			consumerKey: consumer.key,
			consumerSecret: consumer.secret,
			token: token?.token,
			tokenSecret: token?.secret,
			nonce: FIXED_NONCE,
			timestamp: FIXED_TS,
			data: { ...urlParams, ...extra },
		});

		expect(ourSig).toBe(expectedSig);
	});
});

describe("getIdentity — validates Discogs response shape", () => {
	const consumer = { key: "k", secret: "s" };
	const access = { token: "t", secret: "ts" };

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function mockFetchResponse(body: unknown, ok = true, status = 200) {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(typeof body === "string" ? body : JSON.stringify(body), {
				status: ok ? status : status || 500,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}

	it("returns username and id on a valid response", async () => {
		mockFetchResponse({ username: "alice", id: 42 });
		const result = await getIdentity(consumer, access);
		expect(result).toEqual({ username: "alice", id: 42 });
	});

	it("throws when username is missing", async () => {
		mockFetchResponse({ id: 42 });
		await expect(getIdentity(consumer, access)).rejects.toThrow();
	});

	it("throws when id is a string instead of a number", async () => {
		mockFetchResponse({ username: "alice", id: "42" });
		await expect(getIdentity(consumer, access)).rejects.toThrow();
	});

	it("throws when username is empty", async () => {
		mockFetchResponse({ username: "", id: 42 });
		await expect(getIdentity(consumer, access)).rejects.toThrow();
	});

	it("throws with upstream error message on non-2xx", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Unauthorized", { status: 401 }),
		);
		await expect(getIdentity(consumer, access)).rejects.toThrow(/401/);
	});
});
