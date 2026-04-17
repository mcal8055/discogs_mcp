from __future__ import annotations

import os
from dataclasses import dataclass

from . import __version__

DEFAULT_USER_AGENT = (
    f"discogs-mcp/{__version__} +https://github.com/mcal8055/discogs_mcp"
)


@dataclass(frozen=True)
class Settings:
    token: str | None
    user_agent: str
    default_username: str | None

    @property
    def has_token(self) -> bool:
        return bool(self.token)


def load_settings() -> Settings:
    return Settings(
        token=_clean(os.environ.get("DISCOGS_TOKEN")),
        user_agent=_clean(os.environ.get("DISCOGS_USER_AGENT")) or DEFAULT_USER_AGENT,
        default_username=_clean(os.environ.get("DISCOGS_DEFAULT_USERNAME")),
    )


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None
