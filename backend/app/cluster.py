"""Rule-based keyword clustering (no external calls).

Two outputs:
- Intent per keyword: Questions / Local / Commercial / Informational.
- Topic clusters: shared significant phrases (bigrams first, then unigrams),
  ignoring seed words and stopwords. A cluster = one article/page topic.
"""
from __future__ import annotations

import re
from collections import Counter

STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by",
    "with", "without", "is", "are", "was", "were", "be", "been", "it", "its",
    "this", "that", "these", "those", "i", "you", "he", "she", "we", "they",
    "me", "my", "your", "our", "their", "am", "do", "does", "did", "done",
    "can", "could", "will", "would", "should", "may", "might", "how", "what",
    "why", "when", "where", "which", "who", "whom", "whose", "vs", "near",
}
QUESTION_STARTERS = {
    "how", "what", "why", "when", "where", "which", "who", "whom", "whose",
    "can", "could", "is", "are", "was", "were", "do", "does", "did",
    "will", "would", "should",
}
COMMERCIAL_WORDS = {
    "buy", "price", "prices", "pricing", "cost", "costs", "cheap", "cheapest",
    "best", "deal", "deals", "offer", "offers", "discount", "discounts",
    "sale", "sales", "shop", "store", "order", "booking", "book", "rent",
    "rental", "hire", "fee", "fees", "charges", "rate", "rates", "package",
    "packages", "subscription", "coupon", "promo",
}
LOCAL_PHRASES = ["near me"]
LOCAL_WORDS = {
    "lahore", "karachi", "islamabad", "rawalpindi", "faisalabad", "multan",
    "peshawar", "quetta", "sialkot", "gujranwala", "hyderabad", "sukkur",
    "delhi", "mumbai", "chennai", "kolkata", "bangalore", "pune", "jaipur",
    "dubai", "abudhabi", "sharjah", "riyadh", "jeddah", "doha", "dhaka",
    "london", "toronto", "sydney", "york",
}
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def intent_of(keyword: str) -> str:
    kw = keyword.strip().lower()
    toks = _tokens(kw)
    if not toks:
        return "Informational"
    if toks[0] in QUESTION_STARTERS or kw.endswith("?"):
        return "Questions"
    if any(p in kw for p in LOCAL_PHRASES) or any(t in LOCAL_WORDS for t in toks):
        return "Local"
    if any(t in COMMERCIAL_WORDS for t in toks):
        return "Commercial"
    return "Informational"


def _significant(tokens: list[str], seed_tokens: set[str]) -> list[str]:
    return [t for t in tokens if t not in STOPWORDS and t not in seed_tokens and len(t) > 1]


def cluster_keywords(keywords: list[str], seed: str = "") -> dict:
    seed_tokens = set(_tokens(seed)) if seed else set()

    # Normalize + dedupe, preserve first-seen order.
    seen: set[str] = set()
    unique: list[str] = []
    for kw in keywords:
        k = kw.strip()
        if k and k.lower() not in seen:
            seen.add(k.lower())
            unique.append(k)

    intents = {kw: intent_of(kw) for kw in unique}
    intent_counts = Counter(intents.values())
    for name in ("Questions", "Commercial", "Local", "Informational"):
        intent_counts.setdefault(name, 0)

    sig = {kw: _significant(_tokens(kw), seed_tokens) for kw in unique}

    # Bigrams first (strongest shared phrases), then unigrams.
    bigram_counts: Counter = Counter()
    unigram_counts: Counter = Counter()
    for kw in unique:
        toks = sig[kw]
        for a, b in zip(toks, toks[1:]):
            bigram_counts[f"{a} {b}"] += 1
        for t in set(toks):
            unigram_counts[t] += 1

    phrases: list[tuple[str, bool]] = []  # (phrase, is_bigram)
    for phrase, count in bigram_counts.most_common():
        if count >= 2:
            phrases.append((phrase, True))
    for word, count in unigram_counts.most_common():
        if count >= 2:
            phrases.append((word, False))
    # Biggest clusters first; bigrams win ties by insertion order (already first).
    phrases.sort(key=lambda p: -(bigram_counts[p[0]] if p[1] else unigram_counts[p[0]]))

    assigned: dict[str, str] = {}
    clusters_map: dict[str, list[str]] = {}
    for phrase, _is_bigram in phrases:
        ptoks = phrase.split()
        members = [
            kw
            for kw in unique
            if kw not in assigned
            and all(t in sig[kw] for t in ptoks)
            and (len(ptoks) == 2 and any(
                sig[kw][i] == ptoks[0] and sig[kw][i + 1] == ptoks[1]
                for i in range(len(sig[kw]) - 1)
            ) or (len(ptoks) == 1))
        ]
        if len(members) >= 2:
            label = phrase.title()
            clusters_map[label] = members
            for m in members:
                assigned[m] = label

    leftovers = [kw for kw in unique if kw not in assigned]
    if leftovers:
        clusters_map["Other Topics"] = leftovers

    clusters = [
        {"name": name, "count": len(members), "keywords": members}
        for name, members in sorted(clusters_map.items(), key=lambda kv: -len(kv[1]))
    ]
    return {
        "total": len(unique),
        "intents": intents,
        "intent_counts": dict(intent_counts),
        "clusters": clusters,
    }
