# discogs-mcp

Open-source Model Context Protocol (MCP) server that lets Claude search the [Discogs](https://www.discogs.com/developers) music database and read the authenticated user's collection, wantlist, and marketplace data.

Runs on Cloudflare Workers. Claude connects over streamable HTTP. Per-user auth is handled end-to-end: Claude does OAuth 2.0 with the Worker (CIMD / DCR); the Worker does OAuth 1.0a with Discogs. No tokens are shared between users.

**This repo is self-host only — there is no public hosted instance.** Clone and deploy your own.

## Deploy your own (≈10 min)

Prerequisites: a free [Cloudflare account](https://dash.cloudflare.com/sign-up), a free [Discogs account](https://www.discogs.com/users/create), and Node 20+.

1. **Clone and install**
   ```bash
   git clone https://github.com/mcal8055/discogs_mcp.git
   cd discogs_mcp
   npm install
   ```

2. **Register a Discogs application** at <https://www.discogs.com/settings/developers>. Save the Consumer Key and Consumer Secret. Set the Callback URL to `https://<your-worker-subdomain>.workers.dev/callback/discogs` — you'll know the exact hostname after step 5; initially put a placeholder and update after first deploy.

3. **Create a Cloudflare KV namespace** for OAuth state:
   ```bash
   npx wrangler kv namespace create OAUTH_KV
   ```
   Paste the returned `id` into `wrangler.jsonc` under `kv_namespaces`, replacing the existing id.

4. **Set your Discogs consumer credentials** as Worker secrets (encrypted at rest by Cloudflare):
   ```bash
   npx wrangler secret put DISCOGS_CONSUMER_KEY
   npx wrangler secret put DISCOGS_CONSUMER_SECRET
   ```

5. **Deploy**:
   ```bash
   npx wrangler deploy
   ```
   Wrangler prints your live URL (e.g. `https://discogs-mcp.<account>.workers.dev`). Go back to Discogs and update the Callback URL to `<that URL>/callback/discogs`.

6. **Connect in Claude**: Settings → Connectors → Add custom connector → paste `<your Worker URL>/mcp`. Claude will walk you through the Discogs login / authorize flow.

## Tools (16)

All tools are read-only (`readOnlyHint: true`).

### Core lookup

| Tool | Purpose |
|---|---|
| `search` | Search the Discogs database by query or filters (type, artist, title, year, catno, barcode, etc.) |
| `get_release` | Full metadata for a specific pressing |
| `get_master` | Canonical master release |
| `get_master_versions` | List all pressings of a master |
| `get_artist` | Artist profile, aliases, members |
| `get_artist_releases` | Releases credited to an artist |
| `get_label` | Label profile, parent/sublabels |
| `get_label_releases` | Releases published by a label |

### Personal data (authenticated user)

| Tool | Purpose |
|---|---|
| `get_identity` | Your Discogs username and id |
| `get_collection_folders` | List collection folders |
| `get_collection` | List releases in a folder (folder 0 = All) |
| `get_wantlist` | List your wantlist |

### Marketplace

| Tool | Purpose |
|---|---|
| `get_marketplace_listing` | Fetch a listing by id |
| `get_price_suggestions` | Discogs price suggestions by condition (requires seller account) |
| `get_release_stats` | Number for sale + lowest asking price |

### Health

| Tool | Purpose |
|---|---|
| `ping` | Confirm the connection and report the authenticated username |

## Privacy and data handling

- **Per-user auth.** Each connected user completes OAuth 1.0a with Discogs individually. One user's tokens are never visible to another.
- **Tokens at rest.** Your Discogs access token lives in Cloudflare KV attached to your OAuth grant, readable only by the Worker runtime. Deleting the connector in Claude revokes the grant and drops the KV entry.
- **No conversation storage.** The server doesn't read, keep, or transmit any content from your Claude conversation beyond the tool inputs you send.
- **Read-only upstream.** No write tools ship in this release — the server cannot modify your collection, wantlist, or marketplace listings.
- **Rate limits.** Authenticated Discogs requests are capped at 60/min per token (Discogs-side); the server surfaces HTTP 429s with a clear message when hit.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy, including GDPR legal basis, retention / deletion, and your rights. Note that when you self-host, *you* become the operator responsible for your users' data; treat PRIVACY.md as a template to adapt, not as legal advice.

## Development

```bash
npm install
npm run dev         # local wrangler dev at http://localhost:8787/mcp
npm run type-check  # tsc --noEmit
npm test            # vitest — validates the OAuth 1.0a signer against a reference implementation
```

## Architecture notes

- `src/index.ts` — OAuth 2.0 provider shell + Worker entrypoint. Serves `/mcp`, `/authorize`, `/token`, `/register`, `/.well-known/oauth-authorization-server`, `/favicon.{ico,png,svg}`, and a minimal landing page at `/`.
- `src/mcp.ts` — `DiscogsMCP` agent class (extends `McpAgent`), tool registrations, Discogs response interpretation.
- `src/discogs-oauth.ts` — OAuth 1.0a client: HMAC-SHA1 signer via Web Crypto, RFC 3986 percent-encoding, request-token / access-token / identity callers, plus a `signedFetch` helper used by the tool handlers.
- `src/discogs-handler.ts` — Hono app serving `/authorize` and `/callback/discogs` (the upstream OAuth 1.0a dance).
- `tests/discogs-oauth.test.ts` — vitest suite cross-checking the signer against `oauth-1.0a` (reference impl) across six cases including unicode and percent-encoding edges.

## License

MIT — see [LICENSE](LICENSE).
