# Suggestly — Phase 1 Build Notes

**Built:** 21 Oct 2026 · **Scope:** Phase 1 only (core research engine). Auth/sessions and gap checker are later phases by design.

## What was built

### Backend (`backend/` — FastAPI)
- `app/__init__.py` — proxy-env sanitizer at import time (strips bracketed IPv6 entries from `no_proxy`/`NO_PROXY` so httpx 0.28.1 doesn't crash).
- `app/providers.py` — one `suggest(query, gl, hl)` interface, two providers:
  - **FreeGoogleProvider** — `suggestqueries.google.com` (no key), max 4 concurrent, tiny pacing delay, 1 retry.
  - **SerpApiProvider** — `google_autocomplete` engine; quota from `account.json`, cached ~10 min, decremented locally per call.
  - **SuggestService** — in-memory cache keyed (query, gl, hl) + routing: SerpApi only when asked and possible; **any SerpApi problem (no key, quota 0, error) silently falls back to free** — requests never fail because of SerpApi.
- `app/expand.py` — batch planner. Per-feature provider map enforced here: **only the seed batch may use SerpApi**; A–Z (62 variants: seed+a–z, seed+0–9, a–z+seed), Questions (13 prefixes), Prefix/Suffix (9 prefixes + 4 suffixes) are free-only. Queries ship in batches of 16 so the UI progress bar is real.
- `app/cluster.py` — rule-based grouping, zero external calls: intent per keyword (Questions / Local / Commercial / Informational) + topic clusters from shared phrases (bigrams first, then unigrams; seed words + stopwords ignored).
- Endpoints: `GET /api/health`, `GET /api/status`, `POST /api/expand/plan`, `POST /api/expand/batch`, `POST /api/cluster`. CORS from `FRONTEND_ORIGIN` env (default `*`).

### Frontend (`frontend/` — Next.js 14 + Tailwind)
- Design per PLAN.md Section 10 (A+B mix): near-black dark premium, glass cards, Linear-clean lists, Inter everywhere (13–14px base, −0.011em tracking, tabular numbers) + Plus Jakarta Sans for big headings/stat numbers, indigo→violet accent family only, airy spacing, 150–250ms opacity/transform transitions, `prefers-reduced-motion` respected.
- Left sidebar: logo, nav (Research active; Sessions = Phase 2 tag; Gap Checker = Phase 3 tag), **SerpApi quota card** (searches left + bar), workspace placeholder.
- Research form: seed, country (27 options incl. Worldwide, with Google `gl` codes), language (12, `hl` codes), toggles for A–Z / Questions / Prefix–Suffix, SerpApi master switch, live progress bar with per-batch keyword count.
- Header **quota badge**: green "Precise Mode (SerpApi) · N searches left" or amber "Free Mode".
- Bento stat cards: Total Keywords, Topic Clusters, Questions Found, SerpApi usage.
- **Results workspace, 4 views of one dataset:** Table (keyword + intent tag + source) / Clusters (topic cards with counts) / Mind Map (pure-SVG left-to-right tree — gradient seed root → glass cluster pills with count badges → keyword leaf pills; no new dependencies) / Coverage (status per keyword — Todo/Planned/Written/Published — with topic-coverage donut; statuses saved in localStorage per seed until Phase 2 accounts land).
- **Mind Map behaviour:** clusters start **collapsed** (root + clusters only), so a 400–800 keyword run opens instantly; clicking a cluster expands/collapses its leaves (220ms fade/slide-in, reduced-motion respected, capped at **40 leaves per cluster** + a dashed "+N more in Clusters view" leaf); **Expand all / Collapse all** controls; canvas supports **drag-to-pan** and **+/−/Reset zoom** (hand-rolled transform state); positions come from a deterministic cumulative-height layout (see test results).
- Exports (client-side): **CSV with UTF-8 BOM** (opens correctly in Excel on Windows) and **TXT** grouped numbered sheet-style list.

## How to run locally
```bash
# Backend (terminal 1)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
# optional: SERPAPI_KEY=xxxx .venv/bin/uvicorn app.main:app --port 8000

# Frontend (terminal 2)
cd frontend
npm install
npm run dev        # http://localhost:3000  (API defaults to http://localhost:8000)
# production check: npm run build && npx next start
```
Env: backend `SERPAPI_KEY` (optional), `FRONTEND_ORIGIN`; frontend `NEXT_PUBLIC_API_URL`. See `.env.example` files. Deploy shape (for the deploy session): backend → Render (root dir `backend`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`), frontend → Vercel (root dir `frontend`).

## Test results (real, this build)
- **Backend pytest: 14/14 passed** — SerpApi quota-0 → free fallback, SerpApi success + quota decrement, SerpApi 500 → fallback, no-key never touches SerpApi, cache prevents repeat hits, per-feature map (only seed batch flagged SerpApi), variant counts (62/13/13, plan total 89), batch chunking, API dedupe, health/status, intent classification, bigram clustering ("Azadi Deal" ×3), input dedupe.
- **Live smoke:** real `kfc menu` (gl=pk) batch returned genuine PK suggestions (lahore, karachi, islamabad…); cluster endpoint correct on live data; production frontend served and rendered against the live backend.
- **Frontend `npm run build`: clean** (Next 14.2.35, types + lint pass; `/` = 7.4 kB, 94.8 kB first load).
- **Mind Map view (added post-Phase-1, same day, at Hammad's request):** frontend `npm run build` re-run **clean** after the change (types + lint pass; `/` = 9.68 kB). No-overlap is guaranteed by construction: the layout assigns each cluster a disjoint vertical interval sized by its visible leaves (cumulative subtree heights), the cluster pill is centred in its interval and leaves fill sequential 30px slots inside it, and the three columns (root / clusters / leaves) are strictly ordered on x — so nodes cannot collide regardless of dataset size.

## Honest flags
- **No SerpApi key exists yet**, so the SerpApi path is verified by mocked tests only — first live check happens at deploy when the key is added on Render. The free path is fully live-verified.
- Next.js was bumped 14.2.18 → **14.2.35** during the build (npm flagged 14.2.18 under a Dec 2025 security advisory); build re-verified clean after the bump.
- Coverage statuses live in the browser (localStorage) for now — they move to Supabase accounts in Phase 2, per plan.
- Country precision on the free endpoint is ~90% (Google's own suggestions; occasional out-of-country bleed, e.g. "texas" inside PK results — seen in live test, same as research predicted).

## Deferred (by design)
- **Phase 2:** Supabase sign up/sign in, server-side sessions + coverage planner sync, Deep Keyword Explorer, editable modifier lists in Settings.
- **Phase 3:** Competitor Gap Checker (light, sitemap topic-gap), quota-mode polish.
