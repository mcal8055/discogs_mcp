from __future__ import annotations

import asyncio
from typing import Any

import httpx

from .config import Settings

BASE_URL = "https://api.discogs.com"


class DiscogsError(Exception):
    """Base error for Discogs API failures."""


class DiscogsAuthError(DiscogsError):
    """401 — token missing or invalid."""


class DiscogsNotFound(DiscogsError):
    """404 — resource does not exist."""


class DiscogsRateLimit(DiscogsError):
    """429 — exceeded retry budget."""


class DiscogsClient:
    """Async Discogs API client.

    A user only needs to set ``DISCOGS_TOKEN``; every other header (including the
    mandatory ``User-Agent``) is supplied by default.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._cached_username: str | None = settings.default_username
        headers = {
            "User-Agent": settings.user_agent,
            "Accept": "application/vnd.discogs.v2.discogs+json",
        }
        if settings.token:
            headers["Authorization"] = f"Discogs token={settings.token}"
        self._client = client or httpx.AsyncClient(
            base_url=BASE_URL, headers=headers, timeout=30.0
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    @property
    def has_token(self) -> bool:
        return self._settings.has_token

    async def resolve_username(self, username: str | None = None) -> str:
        """Return ``username`` if given, else default/cached, else call /oauth/identity."""
        if username:
            return username
        if self._cached_username:
            return self._cached_username
        self._require_token("resolve default username")
        data = await self._request("GET", "/oauth/identity")
        resolved = data.get("username")
        if not resolved:
            raise DiscogsError("identity response missing 'username'")
        self._cached_username = resolved
        return resolved

    # ---------- Core lookup ----------

    async def search(self, **params: Any) -> dict[str, Any]:
        return await self._request("GET", "/database/search", params=_clean_params(params))

    async def get_release(self, release_id: int) -> dict[str, Any]:
        return await self._request("GET", f"/releases/{release_id}")

    async def get_master(self, master_id: int) -> dict[str, Any]:
        return await self._request("GET", f"/masters/{master_id}")

    async def get_master_versions(
        self, master_id: int, per_page: int | None = None, page: int | None = None
    ) -> dict[str, Any]:
        return await self._request(
            "GET",
            f"/masters/{master_id}/versions",
            params=_clean_params({"per_page": per_page, "page": page}),
        )

    async def get_artist(self, artist_id: int) -> dict[str, Any]:
        return await self._request("GET", f"/artists/{artist_id}")

    async def get_artist_releases(
        self,
        artist_id: int,
        per_page: int | None = None,
        page: int | None = None,
        sort: str | None = None,
        sort_order: str | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "GET",
            f"/artists/{artist_id}/releases",
            params=_clean_params(
                {"per_page": per_page, "page": page, "sort": sort, "sort_order": sort_order}
            ),
        )

    async def get_label(self, label_id: int) -> dict[str, Any]:
        return await self._request("GET", f"/labels/{label_id}")

    async def get_label_releases(
        self, label_id: int, per_page: int | None = None, page: int | None = None
    ) -> dict[str, Any]:
        return await self._request(
            "GET",
            f"/labels/{label_id}/releases",
            params=_clean_params({"per_page": per_page, "page": page}),
        )

    # ---------- Personal data (token required) ----------

    async def get_identity(self) -> dict[str, Any]:
        self._require_token("/oauth/identity")
        return await self._request("GET", "/oauth/identity")

    async def get_collection_folders(self, username: str | None = None) -> dict[str, Any]:
        self._require_token("collection folders")
        user = await self.resolve_username(username)
        return await self._request("GET", f"/users/{user}/collection/folders")

    async def get_collection(
        self,
        username: str | None = None,
        folder_id: int = 0,
        per_page: int | None = None,
        page: int | None = None,
    ) -> dict[str, Any]:
        self._require_token("collection")
        user = await self.resolve_username(username)
        return await self._request(
            "GET",
            f"/users/{user}/collection/folders/{folder_id}/releases",
            params=_clean_params({"per_page": per_page, "page": page}),
        )

    async def get_wantlist(
        self,
        username: str | None = None,
        per_page: int | None = None,
        page: int | None = None,
    ) -> dict[str, Any]:
        self._require_token("wantlist")
        user = await self.resolve_username(username)
        return await self._request(
            "GET",
            f"/users/{user}/wants",
            params=_clean_params({"per_page": per_page, "page": page}),
        )

    # ---------- Marketplace (token required) ----------

    async def get_marketplace_listing(self, listing_id: int) -> dict[str, Any]:
        self._require_token("marketplace listing")
        return await self._request("GET", f"/marketplace/listings/{listing_id}")

    async def get_price_suggestions(self, release_id: int) -> dict[str, Any]:
        self._require_token("price suggestions")
        return await self._request("GET", f"/marketplace/price_suggestions/{release_id}")

    async def get_release_stats(self, release_id: int) -> dict[str, Any]:
        return await self._request("GET", f"/marketplace/stats/{release_id}")

    # ---------- Internals ----------

    def _require_token(self, feature: str) -> None:
        if not self._settings.token:
            raise DiscogsAuthError(
                f"DISCOGS_TOKEN is required for {feature}. "
                "Generate one at https://www.discogs.com/settings/developers."
            )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        backoffs = [2.0, 4.0, 8.0]
        attempt = 0
        while True:
            response = await self._client.request(method, path, params=params)
            if response.status_code == 429 and attempt < len(backoffs):
                await asyncio.sleep(backoffs[attempt])
                attempt += 1
                continue
            return self._handle(response)

    def _handle(self, response: httpx.Response) -> dict[str, Any]:
        if response.status_code == 200:
            return response.json()
        if response.status_code == 401:
            raise DiscogsAuthError(_extract_message(response, "unauthorized"))
        if response.status_code == 404:
            raise DiscogsNotFound(_extract_message(response, "not found"))
        if response.status_code == 429:
            raise DiscogsRateLimit(_extract_message(response, "rate limit exceeded"))
        raise DiscogsError(
            f"Discogs API error {response.status_code}: "
            f"{_extract_message(response, response.text)}"
        )


def _clean_params(params: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in params.items() if v is not None}


def _extract_message(response: httpx.Response, fallback: str) -> str:
    try:
        data = response.json()
    except ValueError:
        return fallback
    if isinstance(data, dict) and "message" in data:
        return str(data["message"])
    return fallback
