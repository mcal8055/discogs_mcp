import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";

type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) return c.text("Invalid authorization request", 400);

	// TODO(task-3): start Discogs OAuth 1.0a request-token flow.
	// 1. POST https://api.discogs.com/oauth/request_token (signed with consumer key/secret)
	// 2. Persist (request_token, oauthReqInfo) in OAUTH_KV so callback can finish the flow
	// 3. Redirect to https://www.discogs.com/oauth/authorize?oauth_token=...
	return c.text("Discogs OAuth 1.0a flow not yet wired (task 3)", 501);
});

app.get("/callback/discogs", async (c) => {
	const token = c.req.query("oauth_token");
	const verifier = c.req.query("oauth_verifier");
	if (!token || !verifier) return c.text("Missing oauth_token or oauth_verifier", 400);

	// TODO(task-3):
	// 1. Look up stored (request_token → oauthReqInfo) in OAUTH_KV
	// 2. POST https://api.discogs.com/oauth/access_token with verifier (signed)
	// 3. GET https://api.discogs.com/oauth/identity to fetch username
	// 4. const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
	//      request: oauthReqInfo, userId: username, scope: ["discogs"],
	//      props: { username, accessToken, accessSecret },
	//    });
	//    return Response.redirect(redirectTo, 302);
	return c.text("Callback not yet wired (task 3)", 501);
});

app.all("*", (c) => c.text("Not found", 404));

export default app;
