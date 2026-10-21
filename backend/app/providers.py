"""Suggestion providers behind one interface: suggest(query, gl, hl) -> list[str].

- FreeGoogleProvider: Google's public suggest endpoint, no key, paced + 1 retry.
- SerpApiProvider: SerpApi google_autocomplete engine; quota tracked via the
  account API (cached ~10 min, decremented locally per successful call).
- SuggestService: cache + routing + automatic fallback. A SerpApi failure,
  missing key, or exhausted quota silently falls back to the free provider so
  a request never fails because of SerpApi.
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Optional

import httpx

FREE_URL = "https://suggestqueries.google.com/complete/search"
SERPAPI_SEARCH_URL = "https://serpapi.com/search.json"
SERPAPI_ACCOUNT_URL = "https://serpapi.com/account.json"
QUOTA_CACHE_SECONDS = 600  # ~10 min
HTTP_TIMEOUT = 12.0


async def _http_get(url: str, params: dict) -> httpx.Response:
    """Single HTTP entry point (monkeypatch target for tests)."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        return await client.get(url, params=params)


class FreeGoogleProvider:
    name = "free"

    def __init__(self, delay: float = 0.05, max_concurrent: int = 4):
        self._delay = delay
        self._sem = asyncio.Semaphore(max_concurrent)

    async def suggest(self, query: str, gl: str, hl: str) -> list[str]:
        params = {"client": "firefox", "q": query, "hl": hl or "en"}
        if gl:
            params["gl"] = gl
        for attempt in range(2):  # 1 retry on failure
            try:
                async with self._sem:
                    await asyncio.sleep(self._delay)
                    resp = await _http_get(FREE_URL, params)
                    resp.raise_for_status()
                    data = resp.json()
                if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
                    return [str(s) for s in data[1]]
                return []
            except Exception:
                if attempt == 1:
                    return []
                await asyncio.sleep(0.4)
        return []


class SerpApiProvider:
    name = "serpapi"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key if api_key is not None else os.environ.get("SERPAPI_KEY", "")
        self._quota_left: Optional[int] = None
        self._quota_at: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def quota_left(self, force: bool = False) -> Optional[int]:
        """Remaining searches this month, or None if unknown/unconfigured."""
        if not self.configured:
            return None
        now = time.monotonic()
        if not force and self._quota_left is not None and (now - self._quota_at) < QUOTA_CACHE_SECONDS:
            return self._quota_left
        try:
            resp = await _http_get(SERPAPI_ACCOUNT_URL, {"api_key": self.api_key})
            resp.raise_for_status()
            data = resp.json()
            left = data.get("total_searches_left")
            if left is None:  # older/alternate field names
                limit = data.get("searches_per_month") or data.get("plan_searches_per_month")
                used = data.get("total_searches_used") or data.get("this_month_usage")
                if limit is not None and used is not None:
                    left = int(limit) - int(used)
            self._quota_left = int(left) if left is not None else None
            self._quota_at = now
        except Exception:
            # Keep the last known value (may be None); callers treat None as unknown.
            pass
        return self._quota_left

    def _decrement(self) -> None:
        if self._quota_left is not None and self._quota_left > 0:
            self._quota_left -= 1

    async def suggest(self, query: str, gl: str, hl: str) -> list[str]:
        params = {
            "engine": "google_autocomplete",
            "q": query,
            "hl": hl or "en",
            "api_key": self.api_key,
        }
        if gl:
            params["gl"] = gl
        resp = await _http_get(SERPAPI_SEARCH_URL, params)
        resp.raise_for_status()
        data = resp.json()
        if data.get("error"):
            raise RuntimeError(f"SerpApi error: {data['error']}")
        suggestions = []
        for item in data.get("suggestions", []) or []:
            value = item.get("value") if isinstance(item, dict) else str(item)
            if value:
                suggestions.append(value)
        async with self._lock:
            self._decrement()
        return suggestions


class SuggestService:
    """Routes a suggest() call to SerpApi (when asked + possible) or free,
    with an in-memory cache keyed (query, gl, hl). Returns (suggestions, source).
    """

    def __init__(self, free: Optional[FreeGoogleProvider] = None, serp: Optional[SerpApiProvider] = None):
        self.free = free or FreeGoogleProvider()
        self.serp = serp or SerpApiProvider()
        self._cache: dict[tuple[str, str, str], tuple[list[str], str]] = {}

    def cache_clear(self) -> None:
        self._cache.clear()

    async def suggest(self, query: str, gl: str, hl: str, prefer_serpapi: bool = False) -> tuple[list[str], str]:
        key = (query.strip().lower(), gl.lower(), hl.lower())
        if key in self._cache:
            return self._cache[key]

        result: Optional[tuple[list[str], str]] = None
        if prefer_serpapi and self.serp.configured:
            quota = await self.serp.quota_left()
            if quota is None or quota > 0:
                try:
                    suggestions = await self.serp.suggest(query, gl, hl)
                    result = (suggestions, "serpapi")
                except Exception:
                    result = None  # fall through to free
        if result is None:
            suggestions = await self.free.suggest(query, gl, hl)
            result = (suggestions, "free")

        self._cache[key] = result
        return result

    async def status(self) -> dict:
        configured = self.serp.configured
        quota = await self.serp.quota_left() if configured else None
        mode = "precise" if (configured and (quota is None or quota > 0)) else "free"
        return {"serpapi_configured": configured, "quota_left": quota, "mode": mode}
