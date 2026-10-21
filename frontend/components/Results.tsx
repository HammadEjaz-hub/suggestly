"use client";

import { useMemo, useState } from "react";
import type { ClusterResult, KeywordItem } from "@/lib/api";
import type { StatusMap } from "@/lib/export";
import MindMap from "./MindMap";

export const STATUSES = ["Todo", "Planned", "Written", "Published"] as const;

const INTENT_STYLES: Record<string, string> = {
  Questions: "bg-sky-400/10 text-sky-300 border-sky-400/20",
  Commercial: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
  Local: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  Informational: "bg-zinc-400/10 text-zinc-300 border-zinc-400/20",
};

function IntentTag({ intent }: { intent?: string }) {
  if (!intent) return null;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${INTENT_STYLES[intent] ?? INTENT_STYLES.Informational}`}>
      {intent}
    </span>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke="url(#donutGrad)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          className="transition-all duration-300"
        />
        <defs>
          <linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-zinc-50 tnum">
        {Math.round(pct)}%
      </div>
    </div>
  );
}

interface Props {
  seed: string;
  keywords: KeywordItem[];
  clusterData: ClusterResult | null;
  statuses: StatusMap;
  onStatusChange: (keyword: string, status: string) => void;
}

export default function Results({ seed, keywords, clusterData, statuses, onStatusChange }: Props) {
  const [view, setView] = useState<"table" | "clusters" | "mindmap" | "coverage">("table");

  const clusterOf = useMemo(() => {
    const m = new Map<string, string>();
    clusterData?.clusters.forEach((c) => c.keywords.forEach((k) => m.set(k, c.name)));
    return m;
  }, [clusterData]);

  const coverage = useMemo(() => {
    if (!clusterData) return { covered: 0, totalClusters: 0, pct: 0, done: 0 };
    let covered = 0;
    for (const c of clusterData.clusters) {
      if (c.keywords.some((k) => ["Written", "Published"].includes(statuses[k] ?? "Todo"))) covered += 1;
    }
    const done = keywords.filter((k) => ["Written", "Published"].includes(statuses[k.keyword] ?? "Todo")).length;
    return {
      covered,
      totalClusters: clusterData.clusters.length,
      pct: clusterData.clusters.length ? (covered / clusterData.clusters.length) * 100 : 0,
      done,
    };
  }, [clusterData, statuses, keywords]);

  if (keywords.length === 0) return null;

  const views = [
    { id: "table", label: "Table" },
    { id: "clusters", label: "Clusters" },
    { id: "mindmap", label: "Mind Map" },
    { id: "coverage", label: "Coverage" },
  ] as const;

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-zinc-50">Results workspace</h2>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            <span className="tnum">{keywords.length}</span> unique keywords · one dataset, four views
          </p>
        </div>
        <div className="flex rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                view === v.id ? "bg-white/[0.12] text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "table" && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.06]">
          <div className="grid grid-cols-[1fr_130px_130px] gap-3 border-b border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <span>Keyword</span>
            <span>Intent</span>
            <span className="text-right">Source</span>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {keywords.map((item, i) => (
              <div
                key={item.keyword}
                className="grid grid-cols-[1fr_130px_130px] items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 transition-colors duration-200 last:border-0 hover:bg-white/[0.03]"
              >
                <span className="text-[13px] text-zinc-100">
                  <span className="mr-2.5 text-zinc-600 tnum">{i + 1}.</span>
                  {item.keyword}
                </span>
                <IntentTag intent={clusterData?.intents[item.keyword]} />
                <span className={`text-right text-[11px] font-medium ${item.source === "serpapi" ? "text-violet-300" : "text-zinc-500"}`}>
                  {item.source === "serpapi" ? "SerpApi" : "Free"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "clusters" && clusterData && (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clusterData.clusters.map((c) => (
            <div key={c.name} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition-colors duration-200 hover:bg-white/[0.05]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100">{c.name}</h3>
                <span className="rounded-full bg-gradient-to-r from-indigo-500/20 to-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-400/25 tnum">
                  {c.count} terms
                </span>
              </div>
              <ul className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {c.keywords.map((kw) => (
                  <li key={kw} className="flex items-center justify-between gap-2 text-[12.5px] text-zinc-400">
                    <span className="truncate">{kw}</span>
                    <IntentTag intent={clusterData.intents[kw]} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {view === "mindmap" && clusterData && (
        <MindMap seed={seed} clusterData={clusterData} />
      )}

      {view === "coverage" && clusterData && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
            <Donut pct={coverage.pct} />
            <div className="space-y-1 text-[13px] text-zinc-400">
              <div className="font-display text-base font-bold text-zinc-50">Topic coverage</div>
              <div>
                <span className="tnum text-zinc-100">{coverage.covered}</span> of{" "}
                <span className="tnum text-zinc-100">{coverage.totalClusters}</span> clusters covered
                (a cluster counts when one keyword is Written or Published)
              </div>
              <div>
                <span className="tnum text-zinc-100">{coverage.done}</span> of{" "}
                <span className="tnum text-zinc-100">{keywords.length}</span> keywords written/published
              </div>
            </div>
          </div>
          <div className="mt-4 max-h-[480px] overflow-y-auto rounded-2xl border border-white/[0.06]">
            {keywords.map((item) => (
              <div
                key={item.keyword}
                className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 transition-colors duration-200 last:border-0 hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{item.keyword}</span>
                <span className="hidden text-[11px] text-zinc-500 md:block">{clusterOf.get(item.keyword) ?? ""}</span>
                <select
                  value={statuses[item.keyword] ?? "Todo"}
                  onChange={(e) => onStatusChange(item.keyword, e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-zinc-200 outline-none transition-colors duration-200 focus:border-indigo-400/60"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-[#121218]">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
