import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { DiscogsMCP } from "./mcp";
import discogsHandler from "./discogs-handler";

export { DiscogsMCP };

export default new OAuthProvider({
	apiHandler: DiscogsMCP.serve("/mcp") as never,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	clientIdMetadataDocumentEnabled: true,
	defaultHandler: discogsHandler as never,
	tokenEndpoint: "/token",
});
