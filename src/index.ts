import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { DiscogsMCP } from "./mcp";
import discogsHandler from "./discogs-handler";

export { DiscogsMCP };

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="discogs-mcp"><title>discogs-mcp</title><circle cx="256" cy="256" r="240" fill="#141414"/><circle cx="256" cy="256" r="220" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="200" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="180" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="160" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="140" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="120" fill="none" stroke="#262626" stroke-width="1.5"/><circle cx="256" cy="256" r="100" fill="#c96442"/><circle cx="256" cy="256" r="100" fill="none" stroke="#8a3f27" stroke-width="2"/><circle cx="256" cy="256" r="9" fill="#f5f5f5"/></svg>`;

const oauth = new OAuthProvider({
	apiHandler: DiscogsMCP.serve("/mcp") as never,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	clientIdMetadataDocumentEnabled: true,
	defaultHandler: discogsHandler as never,
	tokenEndpoint: "/token",
});

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname === "/logo.svg" || url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
			return new Response(LOGO_SVG, {
				headers: {
					"Content-Type": "image/svg+xml",
					"Cache-Control": "public, max-age=86400",
				},
			});
		}
		return oauth.fetch(req, env, ctx);
	},
} satisfies ExportedHandler<Env>;
