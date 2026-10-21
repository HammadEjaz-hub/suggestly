"""Suggestly — FastAPI backend (Phase 1).

Endpoints:
- GET  /api/health          -> {"status": "ok"}
- GET  /api/status          -> SerpApi configured? quota left? mode?
- POST /api/expand/plan     -> batch plan for a seed (frontend runs it batch-by-batch)
- POST /api/expand/batch    -> suggestions for one batch of queries
- POST /api/cluster         -> rule-based intent + topic clustering

Auth / sessions / gap-checker are later phases; the module layout
(providers / expand / cluster) is ready for them.
"""
from __future__ import annotations

import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .cluster import cluster_keywords
from .expand import build_plan
from .providers import SuggestService

app = FastAPI(title="Suggestly", version="0.1.0")

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = SuggestService()


class PlanRequest(BaseModel):
    seed: str
    gl: str = "pk"
    hl: str = "en"
    features: dict = Field(default_factory=lambda: {"az": True, "questions": True, "modifiers": True})
    serpapi_mode: str = "auto"  # "auto" | "off"


class BatchRequest(BaseModel):
    queries: list[str]
    gl: str = "pk"
    hl: str = "en"
    use_serpapi: bool = False


class ClusterRequest(BaseModel):
    keywords: list[str]
    seed: str = ""


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/status")
async def status() -> dict:
    return await service.status()


@app.post("/api/expand/plan")
async def expand_plan(req: PlanRequest) -> dict:
    plan = build_plan(req.seed, req.features, req.serpapi_mode)
    plan["gl"] = req.gl
    plan["hl"] = req.hl
    return plan


@app.post("/api/expand/batch")
async def expand_batch(req: BatchRequest) -> dict:
    async def run(query: str) -> tuple[str, list[str], str]:
        suggestions, source = await service.suggest(query, req.gl, req.hl, prefer_serpapi=req.use_serpapi)
        return query, suggestions, source

    results = await asyncio.gather(*(run(q) for q in req.queries))

    keywords: list[dict] = []
    seen: set[str] = set()
    for query, suggestions, source in results:
        for kw in suggestions:
            key = kw.strip().lower()
            if key and key not in seen:
                seen.add(key)
                keywords.append({"keyword": kw, "source": source, "from_query": query})
    return {
        "results": [
            {"query": q, "suggestions": s, "source": src} for q, s, src in results
        ],
        "keywords": keywords,
    }


@app.post("/api/cluster")
async def cluster(req: ClusterRequest) -> dict:
    return cluster_keywords(req.keywords, req.seed)
