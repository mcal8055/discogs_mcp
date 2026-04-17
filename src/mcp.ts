import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

export type DiscogsProps = {
	username: string;
	accessToken: string;
	accessSecret: string;
};

export class DiscogsMCP extends McpAgent<Env, unknown, DiscogsProps> {
	server = new McpServer(
		{ name: "discogs-mcp", version: "0.1.0" },
		{
			instructions:
				"Search the Discogs music database and access the authenticated user's collection, wantlist, and marketplace data. Prefer `search` before `get_release` — Discogs IDs aren't guessable.",
		},
	);

	async init() {
		this.server.registerTool(
			"ping",
			{
				description:
					"Health check. Returns the authenticated Discogs username so you can verify the connection.",
				inputSchema: {},
				annotations: { readOnlyHint: true },
			},
			async () => {
				const username = this.props?.username ?? "(unauthenticated)";
				return { content: [{ type: "text", text: `pong — ${username}` }] };
			},
		);
	}
}
