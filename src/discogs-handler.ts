import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { z } from "zod";
import {
	AUTHORIZE_URL,
	getAccessToken,
	getIdentity,
	getRequestToken,
} from "./discogs-oauth";

const stashedSchema = z.object({
	requestTokenSecret: z.string().min(1),
	oauthReqInfo: z.unknown(),
});

type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
	OAUTH_KV: KVNamespace;
	DISCOGS_CONSUMER_KEY: string;
	DISCOGS_CONSUMER_SECRET: string;
};

const KV_TTL_SECONDS = 600;
const kvKey = (requestToken: string) => `discogs_req:${requestToken}`;

const app = new Hono<{ Bindings: Bindings }>();

app.get("/authorize", async (c) => {
	let oauthReqInfo: AuthRequest;
	try {
		oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	} catch {
		return c.text("Invalid authorization request", 400);
	}
	if (!oauthReqInfo.clientId) return c.text("Missing client_id", 400);

	const consumer = {
		key: c.env.DISCOGS_CONSUMER_KEY,
		secret: c.env.DISCOGS_CONSUMER_SECRET,
	};
	const callbackUrl = new URL("/callback/discogs", c.req.url).toString();

	let requestToken: string;
	let requestTokenSecret: string;
	try {
		({ requestToken, requestTokenSecret } = await getRequestToken(consumer, callbackUrl));
	} catch (err) {
		console.error("discogs request_token failed:", err);
		return c.text("Upstream authorization error", 502);
	}

	await c.env.OAUTH_KV.put(
		kvKey(requestToken),
		JSON.stringify({ requestTokenSecret, oauthReqInfo }),
		{ expirationTtl: KV_TTL_SECONDS },
	);

	const redirect = `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(requestToken)}`;
	return c.redirect(redirect, 302);
});

app.get("/callback/discogs", async (c) => {
	const requestToken = c.req.query("oauth_token");
	const verifier = c.req.query("oauth_verifier");
	if (!requestToken || !verifier) return c.text("Missing oauth_token or oauth_verifier", 400);

	const stashed = await c.env.OAUTH_KV.get(kvKey(requestToken));
	if (!stashed) return c.text("Authorization request expired or unknown", 400);
	let requestTokenSecret: string;
	let oauthReqInfo: AuthRequest;
	try {
		const parsed = stashedSchema.parse(JSON.parse(stashed));
		requestTokenSecret = parsed.requestTokenSecret;
		oauthReqInfo = parsed.oauthReqInfo as AuthRequest;
	} catch (err) {
		console.error("corrupt KV stash for", requestToken, err);
		return c.text("Authorization request expired or unknown", 400);
	}

	const consumer = {
		key: c.env.DISCOGS_CONSUMER_KEY,
		secret: c.env.DISCOGS_CONSUMER_SECRET,
	};

	// Delete the KV stash before the token exchange so concurrent callbacks
	// (browser back/refresh) can't both call getAccessToken with the same
	// request token. The second arrival sees an empty KV and 400s cleanly.
	await c.env.OAUTH_KV.delete(kvKey(requestToken));

	let accessToken: string;
	let accessSecret: string;
	try {
		({ accessToken, accessSecret } = await getAccessToken(
			consumer,
			{ token: requestToken, secret: requestTokenSecret },
			verifier,
		));
	} catch (err) {
		console.error("discogs access_token failed:", err);
		return c.text("Upstream authorization error", 502);
	}

	let username: string;
	let id: number;
	try {
		({ username, id } = await getIdentity(consumer, { token: accessToken, secret: accessSecret }));
	} catch (err) {
		console.error("discogs identity failed:", err);
		return c.text("Upstream authorization error", 502);
	}

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: String(id),
		scope: ["discogs"],
		metadata: { username },
		props: { username, accessToken, accessSecret },
	});
	return Response.redirect(redirectTo, 302);
});

app.all("*", (c) => c.text("Not found", 404));

export default app;
