import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { signedFetch } from "./discogs-oauth";

const API_BASE = "https://api.discogs.com";

export type DiscogsProps = {
	username: string;
	accessToken: string;
	accessSecret: string;
};

type DiscogsEnv = Env & {
	DISCOGS_CONSUMER_KEY: string;
	DISCOGS_CONSUMER_SECRET: string;
};

const paginationShape = {
	per_page: z.number().int().min(1).max(100).optional().describe("Items per page (max 100)"),
	page: z.number().int().min(1).optional().describe("1-indexed page number"),
};

function asText(obj: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

export class DiscogsMCP extends McpAgent<DiscogsEnv, unknown, DiscogsProps> {
	server = new McpServer(
		{ name: "discogs-mcp", version: "0.1.0" },
		{
			instructions:
				"Search the Discogs music database and access the authenticated user's collection, wantlist, and marketplace data. Prefer `search` before `get_release`/`get_master`/`get_artist`/`get_label` — Discogs IDs aren't guessable. Release IDs and master IDs are different namespaces: use `get_release` on a release ID, `get_master` on a master ID.",
		},
	);

	// env and props are guaranteed populated when tool handlers run — the
	// OAuth provider gates /mcp behind a successful grant.
	private get consumer() {
		const env = this.env as DiscogsEnv;
		return { key: env.DISCOGS_CONSUMER_KEY, secret: env.DISCOGS_CONSUMER_SECRET };
	}

	private get access() {
		const p = this.props as DiscogsProps;
		return { token: p.accessToken, secret: p.accessSecret };
	}

	private get username(): string {
		return (this.props as DiscogsProps).username;
	}

	private async call(
		method: string,
		path: string,
		params?: Record<string, string | number | undefined | null>,
	): Promise<unknown> {
		let url = `${API_BASE}${path}`;
		if (params) {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params)) {
				if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
			}
			const query = qs.toString();
			if (query) url += `?${query}`;
		}
		const res = await signedFetch(url, { method }, this.consumer, this.access);
		if (!res.ok) {
			throw new Error(`Discogs ${method} ${path} failed: ${res.status} ${await res.text()}`);
		}
		return res.json();
	}

	async init() {
		const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

		this.server.registerTool(
			"ping",
			{
				description:
					"Health check. Returns the authenticated Discogs username so you can verify the connection is live.",
				inputSchema: {},
				annotations: readOnly,
			},
			async () => ({
				content: [{ type: "text", text: `pong — authenticated as ${this.username}` }],
			}),
		);

		// ── Core lookup ────────────────────────────────────────────────────────

		this.server.registerTool(
			"search",
			{
				description:
					"Search the Discogs database. Supply at least one of `q` or a specific filter. Returns a paginated list of release/master/artist/label results with IDs usable by the get_* tools.",
				inputSchema: {
					q: z.string().optional().describe("Free-text query matching any field"),
					type: z
						.enum(["release", "master", "artist", "label"])
						.optional()
						.describe("Restrict to one result type"),
					artist: z.string().optional(),
					title: z.string().optional(),
					label: z.string().optional(),
					genre: z.string().optional(),
					style: z.string().optional(),
					country: z.string().optional(),
					year: z.string().optional().describe("Year or year range, e.g. '1977' or '1977-1980'"),
					format: z.string().optional().describe("e.g. 'Vinyl', 'CD', 'Album'"),
					catno: z.string().optional().describe("Catalog number"),
					barcode: z.string().optional(),
					track: z.string().optional(),
					...paginationShape,
				},
				annotations: readOnly,
			},
			async (args) => asText(await this.call("GET", "/database/search", args)),
		);

		this.server.registerTool(
			"get_release",
			{
				description:
					"Fetch full metadata for a specific release (pressing). Use a release ID from `search` results, not a master ID.",
				inputSchema: {
					release_id: z.number().int().positive().describe("Discogs release ID"),
				},
				annotations: readOnly,
			},
			async ({ release_id }) => asText(await this.call("GET", `/releases/${release_id}`)),
		);

		this.server.registerTool(
			"get_master",
			{
				description:
					"Fetch a master release (the canonical entry grouping all pressings). Use `get_master_versions` to list its pressings.",
				inputSchema: {
					master_id: z.number().int().positive().describe("Discogs master ID"),
				},
				annotations: readOnly,
			},
			async ({ master_id }) => asText(await this.call("GET", `/masters/${master_id}`)),
		);

		this.server.registerTool(
			"get_master_versions",
			{
				description:
					"List all pressings (versions) of a master release. Each entry includes a release_id usable with `get_release`.",
				inputSchema: {
					master_id: z.number().int().positive(),
					...paginationShape,
				},
				annotations: readOnly,
			},
			async ({ master_id, ...rest }) =>
				asText(await this.call("GET", `/masters/${master_id}/versions`, rest)),
		);

		this.server.registerTool(
			"get_artist",
			{
				description: "Fetch an artist's profile, aliases, members, and URLs.",
				inputSchema: { artist_id: z.number().int().positive() },
				annotations: readOnly,
			},
			async ({ artist_id }) => asText(await this.call("GET", `/artists/${artist_id}`)),
		);

		this.server.registerTool(
			"get_artist_releases",
			{
				description: "List releases credited to an artist, sorted by year/title/format.",
				inputSchema: {
					artist_id: z.number().int().positive(),
					sort: z.enum(["year", "title", "format"]).optional(),
					sort_order: z.enum(["asc", "desc"]).optional(),
					...paginationShape,
				},
				annotations: readOnly,
			},
			async ({ artist_id, ...rest }) =>
				asText(await this.call("GET", `/artists/${artist_id}/releases`, rest)),
		);

		this.server.registerTool(
			"get_label",
			{
				description: "Fetch a label's profile, parent label, and sublabels.",
				inputSchema: { label_id: z.number().int().positive() },
				annotations: readOnly,
			},
			async ({ label_id }) => asText(await this.call("GET", `/labels/${label_id}`)),
		);

		this.server.registerTool(
			"get_label_releases",
			{
				description: "List releases published by a label.",
				inputSchema: {
					label_id: z.number().int().positive(),
					...paginationShape,
				},
				annotations: readOnly,
			},
			async ({ label_id, ...rest }) =>
				asText(await this.call("GET", `/labels/${label_id}/releases`, rest)),
		);

		// ── Personal data ──────────────────────────────────────────────────────

		this.server.registerTool(
			"get_identity",
			{
				description: "Return the authenticated user's Discogs identity (username, id, resource URL).",
				inputSchema: {},
				annotations: readOnly,
			},
			async () => asText(await this.call("GET", "/oauth/identity")),
		);

		this.server.registerTool(
			"get_collection_folders",
			{
				description:
					"List collection folders for a user. Defaults to the authenticated user. Folder 0 (`All`) is the union of everything.",
				inputSchema: {
					username: z
						.string()
						.optional()
						.describe("Discogs username (defaults to authenticated user)"),
				},
				annotations: readOnly,
			},
			async ({ username }) => {
				const u = username ?? this.username;
				return asText(await this.call("GET", `/users/${encodeURIComponent(u)}/collection/folders`));
			},
		);

		this.server.registerTool(
			"get_collection",
			{
				description:
					"List releases in a user's collection folder. `folder_id=0` is the `All` folder. Defaults to the authenticated user.",
				inputSchema: {
					username: z.string().optional(),
					folder_id: z.number().int().nonnegative().default(0),
					...paginationShape,
				},
				annotations: readOnly,
			},
			async ({ username, folder_id, ...rest }) => {
				const u = username ?? this.username;
				return asText(
					await this.call(
						"GET",
						`/users/${encodeURIComponent(u)}/collection/folders/${folder_id}/releases`,
						rest,
					),
				);
			},
		);

		this.server.registerTool(
			"get_wantlist",
			{
				description: "List a user's wantlist. Defaults to the authenticated user.",
				inputSchema: {
					username: z.string().optional(),
					...paginationShape,
				},
				annotations: readOnly,
			},
			async ({ username, ...rest }) => {
				const u = username ?? this.username;
				return asText(await this.call("GET", `/users/${encodeURIComponent(u)}/wants`, rest));
			},
		);

		// ── Marketplace ────────────────────────────────────────────────────────

		this.server.registerTool(
			"get_marketplace_listing",
			{
				description: "Fetch a single marketplace listing by ID.",
				inputSchema: { listing_id: z.number().int().positive() },
				annotations: readOnly,
			},
			async ({ listing_id }) =>
				asText(await this.call("GET", `/marketplace/listings/${listing_id}`)),
		);

		this.server.registerTool(
			"get_price_suggestions",
			{
				description:
					"Get Discogs's suggested marketplace prices by condition for a release. Requires an authenticated seller account.",
				inputSchema: { release_id: z.number().int().positive() },
				annotations: readOnly,
			},
			async ({ release_id }) =>
				asText(await this.call("GET", `/marketplace/price_suggestions/${release_id}`)),
		);

		this.server.registerTool(
			"get_release_stats",
			{
				description:
					"Get marketplace stats for a release: number for sale and lowest asking price.",
				inputSchema: { release_id: z.number().int().positive() },
				annotations: readOnly,
			},
			async ({ release_id }) =>
				asText(await this.call("GET", `/marketplace/stats/${release_id}`)),
		);
	}
}
