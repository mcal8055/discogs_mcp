# Privacy Policy

`discogs-mcp` is an open-source MCP server that relays Discogs data to Claude on your behalf. This document describes exactly what it does with your data.

## Controller and processor

You are the **controller** of your Discogs data — you own the account and decide what to share. This server acts as a **processor**: it passes requests you make in Claude to the Discogs API and returns the response. It does not add, remove, or modify your data without a tool call you initiated.

## What's processed

When you use this server:

- **Your tool-call arguments** (search queries, filters, release / artist / label IDs) are sent to Discogs so the relevant API endpoint can be called.
- **Your own collection, wantlist, marketplace, and identity data** are fetched from Discogs on your behalf only when you ask Claude to read them.
- **Request / response bodies** live transiently in Worker memory during a single request and are discarded when the response is returned to Claude.

## What's stored

The server stores exactly three things persistently, all tied to your authenticated session:

| Stored | Where | Why |
|---|---|---|
| OAuth 1.0a access token | Cloudflare KV | Needed to sign Discogs API calls on your behalf |
| OAuth 1.0a access token secret | Cloudflare KV | Paired with the token above |
| Your Discogs username | Cloudflare KV | Used to default the `username` arg on personal-data tools |

Nothing else is stored. No copies of search results, collection contents, Claude conversations, tool arguments, or IP logs are cached or written to disk.

## Retention and deletion

The three stored values persist only for the lifetime of your OAuth 2.0 grant with Claude. They are deleted when any of the following happens:

- You disconnect the connector in Claude (Settings → Connectors → Disconnect)
- You revoke the application's access at <https://www.discogs.com/settings/applications>
- Claude's OAuth refresh policy expires the underlying grant

Deletion is immediate at the KV level on disconnect. After deletion, any further tool call requires a fresh OAuth flow.

## Your rights

- **Access** — Your Discogs data is viewable at <https://www.discogs.com>. This server doesn't hold a copy.
- **Erasure** — Disconnecting the connector deletes everything this server stores about you.
- **Rectification and portability** — Manage these directly at Discogs; this server has no persistent copy to rectify.
- **Withdrawal of consent** — Disconnect the connector, or revoke the application at Discogs. Effective immediately.

## Third parties

No data is shared with third parties. The server calls only `api.discogs.com` on your behalf.

- **Anthropic** (as MCP host) receives only the tool arguments and responses you exchange with Claude during conversation. That scope is controlled by you inside Claude.
- **Cloudflare** (as host) runs the Worker and stores the three KV values described above, encrypted at rest per their platform defaults. See Cloudflare's privacy policy for their data practices.
- **Discogs** is the source of the data, not a recipient; they see tool-call arguments as normal API requests made with your own OAuth token.

## Security

- All network traffic is HTTPS / TLS, end to end (Claude ↔ Worker ↔ Discogs).
- OAuth tokens are held in Cloudflare KV, encrypted at rest.
- Consumer secrets are held in Cloudflare's encrypted secret store, never in source control.
- The full source code is public at <https://github.com/mcal8055/discogs_mcp>. Review it, fork it, self-host it.

## Legal basis

The processing basis is your consent, granted via the OAuth flow (GDPR Art. 6(1)(a) for EU users). Withdrawing consent is as easy as disconnecting the connector; see "Your rights" above.

## Jurisdiction

The Worker runs on Cloudflare's global edge; request processing may occur in any Cloudflare location geographically near you. Discogs itself is operated by Discogs.com in the United States — see Discogs's privacy policy for their data practices.

## Changes

This policy is versioned in git. Material changes are committed with clear commit messages; check the git history at <https://github.com/mcal8055/discogs_mcp/commits/main/PRIVACY.md> for an audit trail.

## Contact

Open an issue at <https://github.com/mcal8055/discogs_mcp/issues>.
