"""Expansion engine: turns one seed keyword into batches of autocomplete queries.

PER-FEATURE PROVIDER MAP (hard rule): only the seed's own batch may use
SerpApi (seed direct suggestions = the country-precision call, since gl/hl
ride along). A-Z, Questions and Prefix/Suffix batches are free-provider ONLY.
"""
from __future__ import annotations

import string

QUESTION_PREFIXES = [
    "how", "what", "why", "when", "where", "which", "who",
    "can", "is", "are", "do", "does", "will",
]
MODIFIER_PREFIXES = ["best", "top", "cheap", "free", "new", "vs", "for", "how to", "what is"]
MODIFIER_SUFFIXES = ["near me", "price", "vs", "for beginners"]
BATCH_SIZE = 16


def az_variants(seed: str) -> list[str]:
    s = seed.strip()
    variants: list[str] = []
    for ch in string.ascii_lowercase:  # seed + a..z
        variants.append(f"{s} {ch}")
    for d in string.digits:  # seed + 0..9
        variants.append(f"{s} {d}")
    for ch in string.ascii_lowercase:  # a..z + seed
        variants.append(f"{ch} {s}")
    return variants


def question_variants(seed: str) -> list[str]:
    s = seed.strip()
    return [f"{p} {s}" for p in QUESTION_PREFIXES]


def modifier_variants(seed: str) -> list[str]:
    s = seed.strip()
    return [f"{p} {s}" for p in MODIFIER_PREFIXES] + [f"{s} {suf}" for suf in MODIFIER_SUFFIXES]


def _chunks(items: list[str], size: int = BATCH_SIZE) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def build_plan(seed: str, features: dict, serpapi_mode: str = "auto") -> dict:
    """Return {batches: [{id, label, feature, queries, use_serpapi}], total_queries}.

    features: {"az": bool, "questions": bool, "modifiers": bool}
    serpapi_mode: "auto" (seed batch may use SerpApi) | "off" (everything free).
    """
    seed = seed.strip()
    batches: list[dict] = []
    counter = 0

    def add(label: str, feature: str, queries: list[str], use_serpapi: bool) -> None:
        nonlocal counter
        for chunk in _chunks(queries):
            batches.append(
                {
                    "id": counter,
                    "label": label,
                    "feature": feature,
                    "queries": chunk,
                    "use_serpapi": use_serpapi,
                }
            )
            counter += 1

    # Batch group 0: the seed itself — the ONLY group allowed to use SerpApi.
    add("Seed suggestions", "seed", [seed], serpapi_mode == "auto")
    if features.get("az", True):
        add("A-Z expansion", "az", az_variants(seed), False)
    if features.get("questions", True):
        add("Questions", "questions", question_variants(seed), False)
    if features.get("modifiers", True):
        add("Prefix / Suffix", "modifiers", modifier_variants(seed), False)

    total = sum(len(b["queries"]) for b in batches)
    return {"seed": seed, "batches": batches, "total_queries": total}
