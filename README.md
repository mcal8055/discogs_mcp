# discogs-mcp

Remote Model Context Protocol (MCP) server that lets Claude search the [Discogs](https://www.discogs.com/developers) music database and read the authenticated user's collection, wantlist, and marketplace data.

Runs on Cloudflare Workers. Claude connects over streamable HTTP. Per-user auth is handled end-to-end: Claude does OAuth 2.0 with the Worker (CIMD / DCR); the Worker does OAuth 1.0a with Discogs. No tokens are shared between users.

## Connect from Claude

In Claude: **Settings → Connectors → Add custom connector**

```
https://discogs-mcp.discogsmcp.workers.dev/mcp
```

Claude will walk you through the authorize flow — log in with your Discogs account, grant access, and the connection is ready. You can disconnect any time from the same screen; disconnecting revokes the Worker-side token and deletes stored Discogs credentials.

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
| `get_price_suggestions` | Discogs price suggestions by condition |
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

See [PRIVACY.md](PRIVACY.md) for the full privacy policy, including GDPR legal basis, retention / deletion, and your rights.

## Self-host

If you'd rather run your own Worker instead of using the hosted instance above:

1. Clone this repo
2. Register a Discogs application at <https://www.discogs.com/settings/developers> — note the Consumer Key and Consumer Secret, and set the Callback URL to `https://<your-worker-url>/callback/discogs`
3. Create a Cloudflare KV namespace: `npx wrangler kv namespace create OAUTH_KV` and paste the id into `wrangler.jsonc`
4. Set secrets:
   ```
   npx wrangler secret put DISCOGS_CONSUMER_KEY
   npx wrangler secret put DISCOGS_CONSUMER_SECRET
   ```
5. Deploy: `npx wrangler deploy`

## Development

```bash
npm install
npm run dev         # local wrangler dev at http://localhost:8787/mcp
npm run type-check  # tsc --noEmit
npm test            # vitest — validates the OAuth 1.0a signer against a reference implementation
```

## License

MIT — see [LICENSE](LICENSE).
