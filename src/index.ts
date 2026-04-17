import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

export class DiscogsMCP extends McpAgent {
	server = new McpServer(
		{ name: "discogs-mcp", version: "0.1.0" },
		{
			instructions:
				"Search the Discogs music database and access the user's collection, wantlist, and marketplace data. Prefer `search` before `get_release` — Discogs IDs aren't guessable.",
		},
	);

	async init() {
		this.server.registerTool(
			"ping",
			{
				description: "Health check. Returns 'pong' so you can verify the server is reachable.",
				inputSchema: {},
				annotations: { readOnlyHint: true },
			},
			async () => ({ content: [{ type: "text", text: "pong" }] }),
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return DiscogsMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
