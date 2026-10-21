"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import QuotaBadge from "@/components/QuotaBadge";
import Results from "@/components/Results";
import {
  getPlan,
  getStatus,
  postBatch,
  postCluster,
  type ApiStatus,
  type ClusterResult,
  type KeywordItem,
} from "@/lib/api";
import { downloadCsv, downloadTxt, type StatusMap } from "@/lib/export";

const COUNTRIES: { name: string; gl: string }[] = [
  { name: "Pakistan", gl: "pk" },
  { name: "India", gl: "in" },
  { name: "United States", gl: "us" },
  { name: "United Kingdom", gl: "uk" },
  { name: "UAE", gl: "ae" },
  { name: "Saudi Arabia", gl: "sa" },
  { name: "Bangladesh", gl: "bd" },
  { name: "Qatar", gl: "qa" },
  { name: "Kuwait", gl: "kw" },
  { name: "Canada", gl: "ca" },
  { name: "Australia", gl: "au" },
  { name: "Germany", gl: "de" },
  { name: "France", gl: "fr" },
  { name: "Spain", gl: "es" },
  { name: "Italy", gl: "it" },
  { name: "Turkey", gl: "tr" },
  { name: "Egypt", gl: "eg" },
  { name: "Kenya", gl: "ke" },
  { name: "Nigeria", gl: "ng" },
  { name: "South Africa", gl: "za" },
  { name: "Malaysia", gl: "my" },
  { name: "Indonesia", gl: "id" },
  { name: "Philippines", gl: "ph" },
  { name: "Sri Lanka", gl: "lk" },
  { name: "Nepal", gl: "np" },
  { name: "Netherlands", gl: "nl" },
  { name: "Worldwide", gl: "" },
];

const LANGUAGES: { name: string; hl: string }[] = [
  { name: "English", hl: "en" },
  { name: "Urdu", hl: "ur" },
  { name: "Hindi", hl: "hi" },
  { name: "Arabic", hl: "ar" },
  { name: "Bengali", hl: "bn" },
  { name: "Punjabi", hl: "pa" },
  { name: "Spanish", hl: "es" },
  { name: "French", hl: "fr" },
  { name: "German", hl: "de" },
  { name: "Turkish", hl: "tr" },
  { name: "Indonesian", hl: "id" },
  { name: "Malay", hl: "ms" },
];

function StatCard({ label, value, sub, gradient }: { label: string; value: string; sub: string; gradient?: boolean }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={`mt-2 font-display text-[32px] font-bold leading-none tracking-tight tnum ${
          gradient ? "bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent" : "text-zinc-50"
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 ${
        on
          ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-950/40"
          : "border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [seed, setSeed] = useState("");
  const [gl, setGl] = useState("pk");
  const [hl, setHl] = useState("en");
  const [features, setFeatures] = useState({ az: true, questions: true, modifiers: true });
  const [serpapiOn, setSerpapiOn] = useState(true);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [error, setError] = useState<string | null>(null);
  const [runSeed, setRunSeed] = useState("");
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [clusterData, setClusterData] = useState<ClusterResult | null>(null);
  const [statuses, setStatuses] = useState<StatusMap>({});

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Coverage statuses persist per-seed in localStorage (server sessions = Phase 2).
  useEffect(() => {
    if (!runSeed) return;
    try {
      const raw = localStorage.getItem(`kct:status:${runSeed.toLowerCase()}`);
      setStatuses(raw ? (JSON.parse(raw) as StatusMap) : {});
    } catch {
      setStatuses({});
    }
  }, [runSeed]);

  const onStatusChange = useCallback(
    (keyword: string, value: string) => {
      setStatuses((prev) => {
        const next = { ...prev, [keyword]: value };
        try {
          localStorage.setItem(`kct:status:${runSeed.toLowerCase()}`, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [runSeed]
  );

  async function runResearch() {
    const s = seed.trim();
    if (!s || running) return;
    setRunning(true);
    setError(null);
    setKeywords([]);
    setClusterData(null);
    setRunSeed(s);
    try {
      const plan = await getPlan({
        seed: s,
        gl,
        hl,
        features,
        serpapi_mode: serpapiOn ? "auto" : "off",
      });
      setProgress({ done: 0, total: plan.batches.length, label: "Starting…" });
      const map = new Map<string, KeywordItem>();
      for (const batch of plan.batches) {
        setProgress((p) => ({ ...p, label: batch.label }));
        const res = await postBatch({
          queries: batch.queries,
          gl,
          hl,
          use_serpapi: batch.use_serpapi,
        });
        for (const item of res.keywords) {
          const key = item.keyword.toLowerCase();
          if (!map.has(key)) map.set(key, item);
        }
        setKeywords([...map.values()]);
        setProgress((p) => ({ ...p, done: p.done + 1, label: batch.label }));
      }
      const all = [...map.values()];
      const clustered = await postCluster(all.map((k) => k.keyword), s);
      setClusterData(clustered);
      refreshStatus();
    } catch (e) {
      setError(
        "Could not reach the backend or a research step failed. Make sure the API is running, then try again."
      );
    } finally {
      setRunning(false);
    }
  }

  const stats = useMemo(() => {
    const serpCount = keywords.filter((k) => k.source === "serpapi").length;
    return {
      total: keywords.length,
      clusters: clusterData?.clusters.length ?? 0,
      questions: clusterData?.intent_counts?.["Questions"] ?? 0,
      serpCount,
    };
  }, [keywords, clusterData]);

  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar status={status} />

      <main className="min-w-0 flex-1 px-6 py-7 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-zinc-50">
                Keyword Research
              </h1>
              <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-zinc-500">
                One seed in — every autocomplete keyword in the niche out. Grouped into topics,
                ready to plan your content coverage.
              </p>
            </div>
            <QuotaBadge status={status} />
          </header>

          <section className="glass rounded-3xl p-6">
            <div className="grid gap-4 md:grid-cols-[1fr_180px_160px]">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Seed keyword</label>
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runResearch()}
                  placeholder="e.g. kfc menu"
                  className="field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Country</label>
                <select value={gl} onChange={(e) => setGl(e.target.value)} className="field">
                  {COUNTRIES.map((c) => (
                    <option key={c.name} value={c.gl}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Language</label>
                <select value={hl} onChange={(e) => setHl(e.target.value)} className="field">
                  {LANGUAGES.map((l) => (
                    <option key={l.hl} value={l.hl}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Toggle on={features.az} onClick={() => setFeatures((f) => ({ ...f, az: !f.az }))}>
                A–Z Finder
              </Toggle>
              <Toggle on={features.questions} onClick={() => setFeatures((f) => ({ ...f, questions: !f.questions }))}>
                Question Finder
              </Toggle>
              <Toggle on={features.modifiers} onClick={() => setFeatures((f) => ({ ...f, modifiers: !f.modifiers }))}>
                Prefix / Suffix
              </Toggle>

              <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

              <button
                type="button"
                onClick={() => setSerpapiOn((v) => !v)}
                className="flex items-center gap-2.5 text-[13px] text-zinc-300"
                aria-pressed={serpapiOn}
              >
                <span
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                    serpapiOn ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                      serpapiOn ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </span>
                SerpApi precision
                <span className="text-zinc-500">(seed + country only)</span>
              </button>

              <button
                onClick={runResearch}
                disabled={running || !seed.trim()}
                className="ml-auto rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? "Researching…" : "Research"}
              </button>
            </div>

            {running && (
              <div className="mt-5">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{progress.label}</span>
                  <span className="tnum">
                    {progress.done}/{progress.total} batches · {keywords.length} keywords so far
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
            {error && (
              <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[13px] text-red-200">
                {error}
              </div>
            )}
          </section>

          {keywords.length > 0 && (
            <>
              <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard label="Total Keywords" value={String(stats.total)} sub={`Seed: ${runSeed}`} gradient />
                <StatCard label="Topic Clusters" value={String(stats.clusters)} sub="Each cluster = one article topic" />
                <StatCard label="Questions Found" value={String(stats.questions)} sub="FAQ + article ideas" />
                <StatCard
                  label="SerpApi Searches Used"
                  value={String(stats.serpCount > 0 ? 1 : 0)}
                  sub={stats.serpCount > 0 ? "Seed suggestions via SerpApi" : "This run used the free provider"}
                />
              </section>

              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => downloadCsv(runSeed, keywords, clusterData, statuses)}
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-zinc-200 transition-colors duration-200 hover:bg-white/[0.09]"
                >
                  Download CSV (Excel)
                </button>
                <button
                  onClick={() => downloadTxt(runSeed, gl, hl, clusterData, statuses)}
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-zinc-200 transition-colors duration-200 hover:bg-white/[0.09]"
                >
                  Download TXT (grouped list)
                </button>
              </div>

              <Results seed={runSeed} keywords={keywords} clusterData={clusterData} statuses={statuses} onStatusChange={onStatusChange} />
            </>
          )}

          {keywords.length === 0 && !running && (
            <section className="glass rounded-3xl px-6 py-14 text-center">
              <div className="font-display text-lg font-bold text-zinc-100">No research yet</div>
              <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-zinc-500">
                Enter a seed keyword, pick the country and language, and hit Research. The tool
                expands it A–Z, with questions and modifiers — hundreds of real Google
                suggestions, grouped for you.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
