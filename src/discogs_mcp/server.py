from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .client import DiscogsClient
from .config import load_settings

mcp = FastMCP("discogs-mcp")

_client: DiscogsClient | None = None


def _get_client() -> DiscogsClient:
    global _client
    if _client is None:
        _client = DiscogsClient(load_settings())
    return _client


# ---------- Core lookup ----------


@mcp.tool()
async def search(
    q: str | None = None,
    type: str | None = None,
    artist: str | None = None,
    title: str | None = None,
    release_title: str | None = None,
    label: str | None = None,
    genre: str | None = None,
    style: str | None = None,
    country: str | None = None,
    year: str | None = None,
    format: str | None = None,
    catno: str | None = None,
    barcode: str | None = None,
    track: str | None = None,
    per_page: int = 25,
    page: int = 1,
) -> dict[str, Any]:
    """Search the Discogs database.

    ``type`` must be one of: release, master, artist, label (or omitted).
    Any combination of other filters narrows results. Pass ``q`` for a
    general full-text search.
    """
    return await _get_client().search(
        q=q,
        type=type,
        artist=artist,
        title=title,
        release_title=release_title,
        label=label,
        genre=genre,
        style=style,
        country=country,
        year=year,
        format=format,
        catno=catno,
        barcode=barcode,
        track=track,
        per_page=per_page,
        page=page,
    )


@mcp.tool()
async def get_release(release_id: int) -> dict[str, Any]:
    """Fetch a single release by its Discogs release id."""
    return await _get_client().get_release(release_id)


@mcp.tool()
async def get_master(master_id: int) -> dict[str, Any]:
    """Fetch a master release (the umbrella record that groups all pressings)."""
    return await _get_client().get_master(master_id)


@mcp.tool()
async def get_master_versions(
    master_id: int, per_page: int = 25, page: int = 1
) -> dict[str, Any]:
    """List all releases (pressings/editions) associated with a master."""
    return await _get_client().get_master_versions(master_id, per_page=per_page, page=page)


@mcp.tool()
async def get_artist(artist_id: int) -> dict[str, Any]:
    """Fetch an artist's Discogs profile."""
    return await _get_client().get_artist(artist_id)


@mcp.tool()
async def get_artist_releases(
    artist_id: int,
    per_page: int = 25,
    page: int = 1,
    sort: str | None = None,
    sort_order: str | None = None,
) -> dict[str, Any]:
    """List an artist's releases. ``sort`` is one of year|title|format; ``sort_order`` is asc|desc."""
    return await _get_client().get_artist_releases(
        artist_id, per_page=per_page, page=page, sort=sort, sort_order=sort_order
    )


@mcp.tool()
async def get_label(label_id: int) -> dict[str, Any]:
    """Fetch a record label's profile."""
    return await _get_client().get_label(label_id)


@mcp.tool()
async def get_label_releases(
    label_id: int, per_page: int = 25, page: int = 1
) -> dict[str, Any]:
    """List releases issued by a label."""
    return await _get_client().get_label_releases(label_id, per_page=per_page, page=page)


# ---------- Personal data (token required) ----------


@mcp.tool()
async def get_identity() -> dict[str, Any]:
    """Return the authenticated user's identity (username, consumer name, resource_url)."""
    return await _get_client().get_identity()


@mcp.tool()
async def get_collection_folders(username: str | None = None) -> dict[str, Any]:
    """List the folders in a user's collection. ``username`` defaults to the token owner."""
    return await _get_client().get_collection_folders(username)


@mcp.tool()
async def get_collection(
    username: str | None = None,
    folder_id: int = 0,
    per_page: int = 50,
    page: int = 1,
) -> dict[str, Any]:
    """Fetch releases from a collection folder. ``folder_id=0`` is the All folder."""
    return await _get_client().get_collection(
        username=username, folder_id=folder_id, per_page=per_page, page=page
    )


@mcp.tool()
async def get_wantlist(
    username: str | None = None, per_page: int = 50, page: int = 1
) -> dict[str, Any]:
    """Fetch the authenticated user's wantlist."""
    return await _get_client().get_wantlist(username=username, per_page=per_page, page=page)


# ---------- Marketplace ----------


@mcp.tool()
async def get_marketplace_listing(listing_id: int) -> dict[str, Any]:
    """Fetch a marketplace listing by id."""
    return await _get_client().get_marketplace_listing(listing_id)


@mcp.tool()
async def get_price_suggestions(release_id: int) -> dict[str, Any]:
    """Fetch marketplace price suggestions (by condition) for a release."""
    return await _get_client().get_price_suggestions(release_id)


@mcp.tool()
async def get_release_stats(release_id: int) -> dict[str, Any]:
    """Fetch marketplace stats (lowest price, number for sale) for a release."""
    return await _get_client().get_release_stats(release_id)


def main() -> None:
    mcp.run(transport="stdio")
