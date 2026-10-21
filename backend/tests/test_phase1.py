"""Phase 1 backend tests: provider fallback, expansion plan, dedupe, clustering."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app import providers
from app.cluster import cluster_keywords, intent_of
from app.expand import az_variants, build_plan, modifier_variants, question_variants
from app.main import app
from app.providers import FreeGoogleProvider, SerpApiProvider, SuggestService


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


def install_fake_http(monkeypatch, *, quota_left=0, serpapi_suggestions=None, fail_serpapi=False):
    """Patch providers._http_get with a URL-routed fake. Returns call log."""
    calls = []

    async def fake_get(url, params):
        calls.append(url)
        if "account.json" in url:
            return FakeResponse({"total_searches_left": quota_left, "searches_per_month": 250})
        if "serpapi.com" in url:
            if fail_serpapi:
                return FakeResponse({}, status=500)
            values = serpapi_suggestions or ["seed result via serpapi"]
            return FakeResponse({"suggestions": [{"value": v} for v in values]})
        if "suggestqueries" in url:
            q = params["q"]
            return FakeResponse([q, [f"{q} alpha", f"{q} beta"]])
        raise AssertionError(f"unexpected url {url}")

    monkeypatch.setattr(providers, "_http_get", fake_get)
    return calls


# ---------- Provider fallback ----------

def test_serpapi_quota_zero_falls_back_to_free(monkeypatch):
    install_fake_http(monkeypatch, quota_left=0)
    svc = SuggestService(free=FreeGoogleProvider(delay=0), serp=SerpApiProvider(api_key="k"))
    suggestions, source = asyncio.run(svc.suggest("kfc menu", "pk", "en", prefer_serpapi=True))
    assert source == "free"
    assert suggestions == ["kfc menu alpha", "kfc menu beta"]


def test_serpapi_used_when_quota_available_and_decrements(monkeypatch):
    install_fake_http(monkeypatch, quota_left=5, serpapi_suggestions=["precise kw"])
    serp = SerpApiProvider(api_key="k")
    svc = SuggestService(free=FreeGoogleProvider(delay=0), serp=serp)
    suggestions, source = asyncio.run(svc.suggest("kfc menu", "pk", "en", prefer_serpapi=True))
    assert source == "serpapi"
    assert suggestions == ["precise kw"]
    assert asyncio.run(serp.quota_left()) == 4  # decremented locally


def test_serpapi_error_falls_back_to_free(monkeypatch):
    install_fake_http(monkeypatch, quota_left=10, fail_serpapi=True)
    svc = SuggestService(free=FreeGoogleProvider(delay=0), serp=SerpApiProvider(api_key="k"))
    suggestions, source = asyncio.run(svc.suggest("kfc menu", "pk", "en", prefer_serpapi=True))
    assert source == "free"
    assert suggestions


def test_no_key_never_touches_serpapi(monkeypatch):
    calls = install_fake_http(monkeypatch, quota_left=10)
    svc = SuggestService(free=FreeGoogleProvider(delay=0), serp=SerpApiProvider(api_key=""))
    _, source = asyncio.run(svc.suggest("kfc menu", "pk", "en", prefer_serpapi=True))
    assert source == "free"
    assert not any("serpapi" in u for u in calls)


def test_cache_prevents_second_provider_hit(monkeypatch):
    calls = install_fake_http(monkeypatch, quota_left=0)
    svc = SuggestService(free=FreeGoogleProvider(delay=0), serp=SerpApiProvider(api_key="k"))
    asyncio.run(svc.suggest("kfc menu", "pk", "en", prefer_serpapi=True))
    n = len(calls)
    asyncio.run(svc.suggest("kfc menu", "pk", "en", prefer_serpapi=True))
    assert len(calls) == n  # second call fully served from cache


def test_free_batches_never_use_serpapi_even_in_auto_mode(monkeypatch):
    """Per-feature map: only the seed batch may flag use_serpapi."""
    plan = build_plan("kfc menu", {"az": True, "questions": True, "modifiers": True}, "auto")
    for batch in plan["batches"]:
        if batch["feature"] == "seed":
            assert batch["use_serpapi"] is True
        else:
            assert batch["use_serpapi"] is False


# ---------- Expansion variant generation ----------

def test_variant_counts():
    assert len(az_variants("kfc menu")) == 62  # 26 after + 10 digits + 26 before
    assert len(question_variants("kfc menu")) == 13
    assert len(modifier_variants("kfc menu")) == 13  # 9 prefixes + 4 suffixes


def test_plan_totals_and_feature_toggles():
    all_on = build_plan("kfc menu", {"az": True, "questions": True, "modifiers": True}, "auto")
    assert all_on["total_queries"] == 1 + 62 + 13 + 13
    seed_only = build_plan("kfc menu", {"az": False, "questions": False, "modifiers": False}, "auto")
    assert seed_only["total_queries"] == 1
    off = build_plan("kfc menu", {"az": True, "questions": True, "modifiers": True}, "off")
    assert all(b["use_serpapi"] is False for b in off["batches"])


def test_plan_batches_are_chunked():
    plan = build_plan("kfc menu", {"az": True, "questions": False, "modifiers": False}, "auto")
    az_batches = [b for b in plan["batches"] if b["feature"] == "az"]
    assert len(az_batches) == 4  # ceil(62 / 16)
    assert all(len(b["queries"]) <= 16 for b in plan["batches"])


# ---------- API: dedupe + health + status ----------

def test_batch_endpoint_dedupes(monkeypatch):
    install_fake_http(monkeypatch, quota_left=0)
    client = TestClient(app)
    resp = client.post(
        "/api/expand/batch",
        json={"queries": ["kfc menu", "kfc menu"], "gl": "pk", "hl": "en", "use_serpapi": False},
    )
    assert resp.status_code == 200
    keywords = resp.json()["keywords"]
    # fake returns "<q> alpha" / "<q> beta" for both identical queries -> deduped to 2
    assert len(keywords) == 2
    assert all(k["source"] == "free" for k in keywords)


def test_health_and_status(monkeypatch):
    install_fake_http(monkeypatch, quota_left=0)
    client = TestClient(app)
    assert client.get("/api/health").json() == {"status": "ok"}
    status = client.get("/api/status").json()
    assert status["serpapi_configured"] is False  # no SERPAPI_KEY in test env
    assert status["mode"] == "free"


# ---------- Clustering ----------

FIXTURE = [
    "kfc menu",
    "kfc menu with prices",
    "kfc azadi deal",
    "kfc azadi deal 2026",
    "kfc azadi deal today",
    "kfc menu lahore",
    "kfc menu near me",
    "how to order kfc online",
    "what is kfc delivery number",
    "kfc zinger price",
    "kfc family bucket price",
]


def test_intent_classification():
    assert intent_of("how to order kfc online") == "Questions"
    assert intent_of("what is kfc delivery number") == "Questions"
    assert intent_of("kfc menu near me") == "Local"
    assert intent_of("kfc menu lahore") == "Local"
    assert intent_of("kfc zinger price") == "Commercial"
    assert intent_of("kfc menu") == "Informational"


def test_clustering_finds_shared_phrase_cluster():
    result = cluster_keywords(FIXTURE, seed="kfc menu")
    names = {c["name"]: c for c in result["clusters"]}
    assert "Azadi Deal" in names
    assert names["Azadi Deal"]["count"] == 3
    assert set(names["Azadi Deal"]["keywords"]) == {
        "kfc azadi deal",
        "kfc azadi deal 2026",
        "kfc azadi deal today",
    }
    assert result["total"] == len(FIXTURE)
    # every keyword appears in exactly one cluster
    all_members = [kw for c in result["clusters"] for kw in c["keywords"]]
    assert sorted(all_members) == sorted(FIXTURE)
    assert result["intent_counts"]["Questions"] == 2
    assert result["intent_counts"]["Local"] == 2


def test_clustering_dedupes_input():
    result = cluster_keywords(["kfc menu", "KFC Menu", "kfc menu "], seed="kfc menu")
    assert result["total"] == 1
