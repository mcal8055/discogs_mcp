from __future__ import annotations

import pytest

from discogs_mcp import server


EXPECTED_TOOLS = {
    "search",
    "get_release",
    "get_master",
    "get_master_versions",
    "get_artist",
    "get_artist_releases",
    "get_label",
    "get_label_releases",
    "get_identity",
    "get_collection_folders",
    "get_collection",
    "get_wantlist",
    "get_marketplace_listing",
    "get_price_suggestions",
    "get_release_stats",
}


async def test_all_expected_tools_are_registered() -> None:
    tools = await server.mcp.list_tools()
    names = {t.name for t in tools}
    assert EXPECTED_TOOLS.issubset(names), EXPECTED_TOOLS - names


async def test_tool_descriptions_present() -> None:
    tools = await server.mcp.list_tools()
    for tool in tools:
        if tool.name in EXPECTED_TOOLS:
            assert tool.description, f"{tool.name} has no description"
