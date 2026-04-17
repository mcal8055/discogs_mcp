from __future__ import annotations

import json

import httpx
import pytest

from discogs_mcp.client import (
    BASE_URL,
    DiscogsAuthError,
    DiscogsClient,
    DiscogsNotFound,
)
from discogs_mcp.config import DEFAULT_USER_AGENT, Settings


def _make_client(handler, token: str | None = "test-token") -> DiscogsClient:
    settings = Settings(token=token, user_agent=DEFAULT_USER_AGENT, default_username=None)
    transport = httpx.MockTransport(handler)
    headers = {"User-Agent": settings.user_agent, "Accept": "application/vnd.discogs.v2.discogs+json"}
    if settings.token:
        headers["Authorization"] = f"Discogs token={settings.token}"
    httpx_client = httpx.AsyncClient(base_url=BASE_URL, headers=headers, transport=transport)
    return DiscogsClient(settings, client=httpx_client)


async def test_search_sends_auth_and_user_agent() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, json={"results": []})

    client = _make_client(handler)
    try:
        await client.search(q="Radiohead", type="release")
    finally:
        await client.aclose()

    assert captured["headers"]["authorization"] == "Discogs token=test-token"
    assert captured["headers"]["user-agent"].startswith("discogs-mcp/")
    assert "q=Radiohead" in captured["url"]
    assert "type=release" in captured["url"]


async def test_search_omits_none_params() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"results": []})

    client = _make_client(handler)
    try:
        await client.search(q="Beatles", type=None, year=None)
    finally:
        await client.aclose()

    assert "type=" not in captured["url"]
    assert "year=" not in captured["url"]


async def test_missing_token_raises_for_personal_data() -> None:
    client = _make_client(lambda r: httpx.Response(200, json={}), token=None)
    try:
        with pytest.raises(DiscogsAuthError):
            await client.get_identity()
        with pytest.raises(DiscogsAuthError):
            await client.get_collection()
        with pytest.raises(DiscogsAuthError):
            await client.get_price_suggestions(1)
    finally:
        await client.aclose()


async def test_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "Release not found."})

    client = _make_client(handler)
    try:
        with pytest.raises(DiscogsNotFound):
            await client.get_release(999999999)
    finally:
        await client.aclose()


async def test_resolve_username_uses_identity_and_caches() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/oauth/identity":
            calls["count"] += 1
            return httpx.Response(200, json={"username": "alice"})
        return httpx.Response(200, json={"releases": []})

    client = _make_client(handler)
    try:
        first = await client.resolve_username()
        second = await client.resolve_username()
    finally:
        await client.aclose()

    assert first == "alice"
    assert second == "alice"
    assert calls["count"] == 1


async def test_release_stats_does_not_require_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"lowest_price": 12.99})

    client = _make_client(handler, token=None)
    try:
        data = await client.get_release_stats(123)
    finally:
        await client.aclose()

    assert data == {"lowest_price": 12.99}
