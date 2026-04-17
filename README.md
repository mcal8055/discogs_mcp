# discogs-mcp

A Model Context Protocol (MCP) server that exposes the [Discogs API](https://www.discogs.com/developers) so Claude (or any MCP client) can research music — searching the database, pulling release/artist/label metadata, inspecting your collection and wantlist, and checking marketplace stats — without hitting web-scraping blocks.

## Quick start — one variable

Set `DISCOGS_TOKEN` and you're done. Everything else has a working default.

1. Generate a personal access token at <https://www.discogs.com/settings/developers>.
2. Pick an install target below.

### Claude Code

```bash
claude mcp add discogs --env DISCOGS_TOKEN=your_token_here -- uvx discogs-mcp
```

### Claude Desktop

Edit `claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "discogs": {
      "command": "uvx",
      "args": ["discogs-mcp"],
      "env": { "DISCOGS_TOKEN": "your_token_here" }
    }
  }
}
```

### Claude Agent SDK (Python)

```python
from mcp import StdioServerParameters
from mcp.client.stdio import stdio_client

params = StdioServerParameters(
    command="uvx",
    args=["discogs-mcp"],
    env={"DISCOGS_TOKEN": "your_token_here"},
)
# pass `params` to your MCP client
```

## Configuration

| Env var                   | Required | Default / behavior                                                                    |
| ------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `DISCOGS_TOKEN`           | Yes\*    | Personal access token. Unlocks lookup at 60 req/min plus personal + marketplace data. |
| `DISCOGS_USER_AGENT`      | No       | Auto: `discogs-mcp/<version> +https://github.com/mcal8055/discogs_mcp`.               |
| `DISCOGS_DEFAULT_USERNAME`| No       | Auto-resolved from `/oauth/identity` on first use; cached per process.                |

\* Technically optional for anonymous database lookup (25 req/min), but the token boosts the limit and is required for personal data and marketplace tools.

## Tools

### Core lookup

- `search(q, type, artist, title, label, genre, style, country, year, format, catno, barcode, track, per_page, page)`
- `get_release(release_id)`
- `get_master(master_id)`
- `get_master_versions(master_id, per_page, page)`
- `get_artist(artist_id)`
- `get_artist_releases(artist_id, per_page, page, sort, sort_order)`
- `get_label(label_id)`
- `get_label_releases(label_id, per_page, page)`

### Personal data (requires token)

- `get_identity()`
- `get_collection_folders(username?)`
- `get_collection(username?, folder_id=0, per_page, page)` — `folder_id=0` is the All folder.
- `get_wantlist(username?, per_page, page)`

### Marketplace

- `get_marketplace_listing(listing_id)`
- `get_price_suggestions(release_id)` — token required.
- `get_release_stats(release_id)`

## Development

```bash
uv sync --extra dev
uv run pytest
uv run discogs-mcp                              # stdio server, Ctrl+C to stop
npx @modelcontextprotocol/inspector uv run discogs-mcp
```

## License

MIT — see [LICENSE](LICENSE).
