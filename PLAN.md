# Keyword Coverage Tool — Full Plan

**Product name (FINAL, picked by Hammad 21 Oct): Suggestly** — GitHub repo + Supabase project bhi isi naam (`suggestly`) se banein ge; app branding code mein lag chuki hai (Phase 1 frontend re-verified clean build ke saath, ZIP refresh ho gaya).

**Date:** 21 Oct 2026
**Status:** PLANNING ONLY — build has NOT started (Hammad's instruction: "pehle plan karle sb kch")
**Purpose:** Hammad's PERSONAL tool (not a public site) — keyword research to plan full **content coverage** for his SEO niche(s). Whatever keywords/topics exist in the niche, he wants them all found, grouped, and tracked so his site misses nothing.

---

## 1. The 8 Features — how each one works

### 1. A–Z Keyword Finder
- Input: one seed keyword (e.g. `kfc menu`)
- Tool automatically queries: seed, seed + a, seed + b, ... seed + z, seed + 0–9, AND letters before the seed (a + seed ...)
- Output: all unique suggestions collected (usually 400–800+ per seed — Hammad's rule: **jitna zyada mile utna acha**; search volume is out of scope, he checks it himself)

### 2. Question Finder
- Prefixes attached to the seed: how, what, why, when, where, which, who, can, is, are, do, does, will + seed
- Output goes into its own "Questions" group — these become FAQ sections and article ideas directly

### 3. Prefix/Suffix Finder
- Prefixes: best, top, cheap, free, new, vs, for, how to, what is (+ user-editable list)
- Suffixes: seed + near me, + price, + vs, + for beginners, + in [city] (+ user-editable list)
- Modifier lists editable in Settings, because every niche has its own money-words

### 4. Deep Keyword Explorer
- Takes the results of round 1 and expands the most promising ones one more level (same A–Z method on sub-keywords)
- Has a request cap + on/off toggle — deep mode multiplies requests, so it must never run away with the quota

### 5. Country-Specific Finder
- Country dropdown + language dropdown on every research run
- Free provider uses Google's `gl`/`hl` parameters (live-tested 21 Oct: Pakistan → Lahore/Karachi results, India → Delhi/Hyderabad — works)
- SerpApi provider additionally accepts an exact city/location for ~99% precision

### 6. Keyword Clustering (grouping)
Rule-based, no AI cost, runs on our own backend:
- **Intent buckets first:** Questions / Commercial (buy, price, cheap, best, deal, offer...) / Local (near me, city names) / Informational (guide, how, what...)
- **Topic clusters second:** count shared words/phrases across all keywords (ignoring the seed words + stopwords), group keywords by their strongest shared phrase — e.g. all keywords containing "azadi deal" form one cluster
- Each cluster = **one article/page topic**. Sorted by size, biggest topics first

### 7. Content Coverage Planner
- Research is saved as a **Session** (name = niche, e.g. "KFC Menu PK") holding: seed keywords, country, language, all keywords + their clusters
- Every keyword/cluster gets a **status**: ⬜ Not started → 📝 Planned → ✍️ Written → ✅ Published
- Coverage progress bar per session: a cluster counts as "covered" when at least one keyword in it is Written/Published
- **Export (Windows-friendly — Hammad's rule):** CSV saved as UTF-8 **with BOM** so it opens correctly in Excel on Windows (Urdu/special characters safe), TXT grouped numbered sheet-style list, JSON for session backup. Files download straight to his Windows machine.
- Sessions exportable/importable as JSON (backup)

### 8. Competitor Gap Checker — LIGHT version (honest scope)
- Input: competitor domain → tool fetches their `sitemap.xml`, extracts page URLs, derives **topics** from URL slugs (and optionally up to 30 page titles)
- Compares competitor topics against the session's keywords/clusters
- Output: "Topics they cover that your research does NOT have" + export
- **Honest label in the UI:** this is a *topic gap from their pages* — NOT their real ranking keywords. Real ranking-keyword gap needs paid ranking data (Ahrefs/SerpApi at scale) and is **out of scope for v1**; a slot is left in the design to add it later if a paid API is ever taken

---

## 2. Data providers & automatic failover (the core design)

Two providers behind one interface — the tool does not care which one answered:

| | SerpApi (primary) | Free Google endpoint (fallback) |
|---|---|---|
| Source | Google Autocomplete API | `suggestqueries.google.com` (same endpoint Google's search box uses) |
| Cost | Free plan: **250 searches/month, 50/hour** (verified 21 Oct 2026); paid from $25/mo | Rs 0, no key |
| Location precision | ~99%, city-level possible | ~90%, country-level (server location slightly leaks in — live test showed "texas/california" inside PK results) |
| Search volume | ❌ neither provider gives volume — volume needs a separate paid API, out of scope | ❌ |

**Failover rules (backend decides per request):**
1. If SerpApi key exists AND quota remains AND mode allows → SerpApi
2. Quota finished / SerpApi error / timeout → free endpoint automatically, the user's search never fails
3. Quota is read from SerpApi's own account API (checking it costs no searches) + cached + locally decremented, so the count shown is near-exact

**Per-feature provider map (Hammad's rule, 21 Oct — SerpApi SIRF jahan zaroorat ho, warna nahi):**

| Feature | Provider | Kyun |
|---|---|---|
| Seed ki direct suggestions | SerpApi (quota ho to), warna free | Precision yahan sab se zyada matter karti hai |
| Country-Specific Finder | SerpApi, fallback free | City-level precision sirf SerpApi deta hai |
| A–Z Finder | **Free only** | Bulk kaam hai — free endpoint kaafi hai, quota zaya na ho |
| Question Finder | **Free only** | Same wajah |
| Prefix/Suffix Finder | **Free only** | Same wajah |
| Deep Keyword Explorer | **Free only** | Sab se zyada requests — SerpApi yahan lagana quota ki barbadi hai |
| Keyword Clustering | **Koi API nahi** | Apni processing hai |
| Content Coverage Planner | **Koi API nahi** | Local data hai |
| Competitor Gap Checker | **Koi API nahi** | Apna crawling hai |

- Is map se ek run mein SerpApi sirf ~5–15 martaba use hoga → **250 free searches mahino chalegi**
- Settings mein ek master **SerpApi on/off** switch bhi rahega — band ho to sab kuch free par
- Caching ki wajah se repeat queries dobara provider ko jati hi nahi (na quota, na waqt zaya)

**Caching:** every (query + country + language) result is cached on the backend. Repeat letters/seeds never burn quota or time twice.

**Rate safety on free endpoint:** small delay between requests, max 3–5 at a time, one retry on a block. Fine for personal use.

**UI badge (always visible in header):**
- 🟢 "Precise Mode (SerpApi) — 183 searches left"
- 🟡 "SerpApi limit khatam — Free Mode (results still Google's own, ~90% location precision)"

---

## 3. Tech architecture

Same proven stack as the previous two tools:

- **Frontend:** Next.js (Vercel, free) — single-page app, 3 tabs:
  - **Research** — form (seed, country, language, feature toggles, provider mode) → live progress bar during expansion → **results workspace with a 3-view switcher (Hammad + ChatGPT spec, 21 Oct): Table** (flat keyword list + Intent column) **/ Clusters** (cluster cards with term counts, folder style) **/ Coverage** (status checkboxes + progress) — all three views of the SAME results on one screen; no page-hopping after a run (his rule: "UI should save your time")
  - **Coverage / Sessions** — session list, per-session progress, statuses, export buttons
  - **Gap Checker** — competitor URL input → gap topic list → export
  - Header: provider badge + quota; Settings: quota mode, editable modifier lists
- **Backend:** FastAPI (Render, free) — endpoints:
  - `GET /api/health`, `GET /api/status` (provider mode + quota left)
  - `POST /api/expand` (batched expansion — frontend calls per batch so the progress bar is real and nothing times out)
  - `POST /api/cluster` (keywords → clusters)
  - `POST /api/gap` (competitor domain + session keywords → gap topics)
  - Proxy-env fix from previous projects applied from day one (known sandbox/httpx issue)

## 4. Storage & Accounts — REVISED (21 Oct, Hammad added Sign up / Sign in)
- Hammad wants **user accounts** (sign up / sign in) so any new person can create an account — the tool is now account-based, not browser-only
- **Supabase Auth** (free): email+password sign up, sign in, sign out, password reset, email verification — all built-in, no custom auth code risk
- **Supabase Postgres** (free): users' sessions/research stored per-account — login from any device, data follows the account; each user sees ONLY their own data (per-user isolation enforced in backend + Supabase row-level security)
- This REPLACES the localStorage idea — localStorage stays only as a guest/demo fallback if ever needed
- Note: SerpApi's 250 free searches/month are now SHARED across all users — the per-feature map (Section 2) keeps burn low; a paid SerpApi plan becomes a "later, if users grow" decision, not a launch blocker

## 5. Hosting decision — Render or Supabase? (REVISED 21 Oct after accounts were added: answer is now BOTH)
- **Render free web service** = backend compute (expire NAHI hota, sirf sota hai; expire sirf Render ka free Postgres hota hai — 30 din)
- **Supabase** = Auth + Postgres database (accounts + per-user sessions) — 30-din expiry nahi; inactive project pause hota hai, data safe rehta hai
- (Purana "no database" faisla accounts ki wajah se khatam — accounts hain to database lazmi hai, aur wo Supabase hoga)

## 6. Deployment plan (same drill as before — Hammad deploys, guided click-by-click)
1. GitHub repo → Render backend (env: `SERPAPI_KEY` optional, `FRONTEND_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) → Vercel frontend (env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) → Supabase project (Auth on, tables for sessions/keywords) — sab free tiers par
2. Tool works 100% WITHOUT the SerpApi key (free-only mode); key just adds precision until its 250 run out
3. Hammad makes a free SerpApi account (no card) and pastes the key into Render env himself — never in chat

## 6. Build phases (each phase tested + verified before the next starts)
- **Phase 1 — Core:** both providers + failover + quota badge, A–Z + Questions + Prefix/Suffix, country/language, dedupe, intent grouping, CSV/TXT export
- **Phase 2 — Planner:** topic clustering (shared-phrase), sessions + coverage statuses + progress, Deep Explorer with caps
- **Phase 3 — Gap:** competitor sitemap topic-gap checker (light), quota-mode polish, final end-to-end test with a real niche seed

## 7. Testing plan
- Backend pytest: provider failover (mocked quota-empty → free), clustering correctness, gap comparison
- Live checks after deploy: same seed in PK vs IN must give clearly different results; quota badge count must match SerpApi account; export files opened and verified

## 8. Honest limitations (final, no surprises later)
- No search volume / CPC anywhere in this tool — autocomplete shows demand, not numbers
- Free endpoint location precision ~90%, not 100% — SerpApi mode exists exactly for this gap
- Gap checker = topics from competitor pages, NOT their ranking keywords
- Render free backend sleeps after ~15 min idle (~30–60s wake) — acceptable for personal use, same as his other tools
- **Total cost: Rs 0** (optional SerpApi paid plan only if Hammad ever wants more than 250 precise searches/month)

## 9. Decisions — ALL RESOLVED (21 Oct)
1. Storage/accounts: **Supabase** (Section 4) — localStorage idea dropped
2. Stack: Hammad delegated — "jo jo best hai jis jis cheez ke liye" → **Vercel (frontend) + Render (backend) + Supabase (auth + DB) + GitHub (code) + SerpApi (precision)** — FINAL
3. Tool/repo name: **keyword-coverage-tool** (GitHub repo + Supabase project isi naam se banenge); display name baad mein bhi badal sakta hai
4. Hammad ko uske 3 "abhi" wale kaamon ki step-by-step list de di gayi hai (SerpApi account → key note; Supabase project, region Singapore, DB password note; khaali GitHub repo). Build uske go par shuru hoga.

## 10. Design — LOCKED (21 Oct 2026, Hammad's pick: "A+B ka mix")
- **Reference A** = Linear's real app (dark, ultra-clean dense list, refined small type, colored tags) — file: `refs/ref-linear.png`
- **Reference B** = Bento glass dashboard (glass stat cards, gradient charts, donut) — file: `refs/ref-bento.png`
- **The mix:** Dashboard/Overview in B-style (glass cards, coverage donut, charts); keyword lists & research results in A-style (clean Linear rows, intent tags, status pills)
- **Density rule (Hammad's own observation):** the references look packed because those apps carry heavy data — OUR tool's data is light (keyword, cluster, status), so keep the same premium polish but **airy: more whitespace, less crowding** than the references
- **Theme:** dark premium · **Font: Inter everywhere** (his explicit complaint about mockup fonts — default fonts are banned)
- **Font spec (verified 21 Oct):** A (Linear) uses ONLY **Inter Variable** — single typeface, headlines ~weight 510–600, tracking −0.011em body / tighter at display sizes, base size 13–14px. B (Bento concept) is a geometric rounded sans in the **Plus Jakarta Sans / Manrope** family. OUR recipe: **Inter** for the whole UI (Linear formula incl. tight tracking + small base size) + **Plus Jakarta Sans** only for big headings & stat numbers (B's touch). Both free via Google Fonts, zero license cost.
- Earlier hand-made HTML mockups were rejected ("lag rha hai html hai", "bakwas designs, font kisi kaam ke nhi") — build must follow these real references, not improvised sketches
- **Motion spec (21 Oct, from Hammad's ChatGPT screenshots):** hover/transition animations **150–250ms**, opacity + transform based only, `prefers-reduced-motion` supported. Premium feel lives in these small timings, not heavy effects.
- **Results workspace (21 Oct):** Table / Clusters / Coverage view switcher on ONE screen after results (see Section 3) — theme stays A+B (glass + Linear) regardless

## 11. Hammad ke kaam (sirf ye — baqi sab Muse karega; har step par click-by-click guidance milegi, kyun ke saath)

**Abhi:**
1. SerpApi free account (serpapi.com, email only, NO card) → API key apne paas rakhe — chat mein kabhi nahi bhejni; deploy par Render env mein khud lagayega
2. GitHub par ek naya khali repo (naam Muse suggest karega)
3. Supabase free account (supabase.com, GitHub se sign in ho jata hai, NO card) → ek naya project banana hai — keys deploy par lagein gi, chat mein nahi bhejni

**Deploy ke waqt (build complete hone ke baad):**
3. Code upload — Muse ZIP dega, Hammad repo mein upload karega (pehle ki tarah)
4. Render backend service + env: `SERPAPI_KEY`, `FRONTEND_ORIGIN` (= Vercel URL, frontend ke baad update)
5. Vercel frontend + env: `NEXT_PUBLIC_API_URL` (= Render URL)
6. Live test — ek research run karke report

**Is dafa NAHI chahiye:** card (Render par pehle se hai), payment, database — kuch nahi
