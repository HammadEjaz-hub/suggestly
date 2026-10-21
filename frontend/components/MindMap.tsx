"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClusterResult } from "@/lib/api";

/**
 * Mind Map view — left-to-right SVG tree of the SAME dataset as the other
 * views: seed (root) -> topic clusters -> keywords (leaves).
 *
 * Layout is a simple deterministic tidy-tree: every cluster owns a disjoint
 * vertical interval (its "subtree"), stacked by cumulative height, so nodes
 * can never overlap by construction. Only VISIBLE nodes are laid out —
 * clusters render collapsed, and an expanded cluster shows at most
 * LEAF_CAP keyword leaves plus a "+N more" leaf.
 *
 * Pan = drag on the canvas, zoom = +/- buttons (around the canvas centre)
 * and a reset button. Hand-rolled SVG + React state only — no dependencies.
 */

const LEAF_CAP = 40;

const PAD = 28;
const ROOT_H = 46;
const ROOT_PAD_X = 20;
const ROOT_MAX_W = 280;
const ROOT_CHAR_W = 7.4;

const GAP_ROOT_CLUSTER = 72;
const CLUSTER_H = 38;
const CLUSTER_PAD_X = 16;
const CLUSTER_MAX_W = 264;
const CLUSTER_CHAR_W = 6.9;
const CLUSTER_GAP = 20;

const GAP_CLUSTER_LEAF = 56;
const LEAF_H = 30;
const LEAF_PAD_X = 14;
const LEAF_MAX_W = 288;
const LEAF_CHAR_W = 6.5;
const LEAF_GAP = 8;

const CANVAS_H = 560;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 1)).trimEnd() + "…";
}

function textW(text: string, charW: number): number {
  return Math.ceil(text.length * charW);
}

/** Width of the count badge inside a cluster pill (digits + padding). */
function badgeW(count: number): number {
  return Math.ceil(String(count).length * 6.8) + 12;
}

interface LeafPos {
  text: string;
  fullText: string;
  more: boolean;
  y: number;
  w: number;
}

interface ClusterPos {
  name: string;
  label: string;
  count: number;
  w: number;
  y: number; // node top
  expanded: boolean;
  leaves: LeafPos[];
}

interface Layout {
  rootLabel: string;
  rootW: number;
  rootY: number;
  clusterX: number;
  leafX: number;
  clusters: ClusterPos[];
  width: number;
  height: number;
}

function computeLayout(seed: string, data: ClusterResult, expanded: Set<string>): Layout {
  const rootLabel = truncate(seed, Math.floor((ROOT_MAX_W - ROOT_PAD_X * 2) / ROOT_CHAR_W));
  const rootW = Math.min(ROOT_MAX_W, textW(rootLabel, ROOT_CHAR_W) + ROOT_PAD_X * 2);
  const clusterX = PAD + rootW + GAP_ROOT_CLUSTER;

  // First pass: per-cluster node widths + visible leaves (widths are needed
  // before positions, because the leaf column aligns to the widest cluster).
  const prepared = data.clusters.map((c) => {
    const bw = badgeW(c.count);
    const reserve = bw + 30; // badge + chevron + gaps
    const maxChars = Math.max(
      4,
      Math.floor((CLUSTER_MAX_W - CLUSTER_PAD_X * 2 - reserve) / CLUSTER_CHAR_W)
    );
    const label = truncate(c.name, maxChars);
    const w = Math.min(
      CLUSTER_MAX_W,
      textW(label, CLUSTER_CHAR_W) + CLUSTER_PAD_X * 2 + reserve
    );
    const isOpen = expanded.has(c.name);
    const shown = isOpen ? c.keywords.slice(0, LEAF_CAP) : [];
    const overflow = isOpen ? c.count - shown.length : 0;
    const leafTexts: { text: string; fullText: string; more: boolean }[] = shown.map((kw) => {
      const t = truncate(kw, Math.floor((LEAF_MAX_W - LEAF_PAD_X * 2) / LEAF_CHAR_W));
      return { text: t, fullText: kw, more: false };
    });
    if (overflow > 0) {
      leafTexts.push({
        text: `+${overflow} more in Clusters view`,
        fullText: `${overflow} more keywords — see the Clusters view`,
        more: true,
      });
    }
    const leaves = leafTexts.map((l) => ({
      ...l,
      w: Math.min(LEAF_MAX_W, textW(l.text, LEAF_CHAR_W) + LEAF_PAD_X * 2),
    }));
    return { cluster: c, label, w, isOpen, leaves };
  });

  const maxClusterW = prepared.reduce((m, p) => Math.max(m, p.w), 0);
  const maxLeafW = prepared.reduce(
    (m, p) => p.leaves.reduce((mm, l) => Math.max(mm, l.w), m),
    0
  );
  const leafX = clusterX + maxClusterW + GAP_CLUSTER_LEAF;

  // Second pass: stack subtrees by cumulative height. Each cluster's
  // interval is [top, top + subtreeH); intervals are disjoint and ordered,
  // which is what guarantees zero overlap.
  let cursor = PAD;
  const clusters: ClusterPos[] = prepared.map((p) => {
    const leavesBlockH = p.leaves.length
      ? p.leaves.length * LEAF_H + (p.leaves.length - 1) * LEAF_GAP
      : 0;
    const subtreeH = Math.max(CLUSTER_H, leavesBlockH);
    const nodeY = cursor + (subtreeH - CLUSTER_H) / 2;
    const leavesStartY = cursor + (subtreeH - leavesBlockH) / 2;
    const leaves: LeafPos[] = p.leaves.map((l, i) => ({
      text: l.text,
      fullText: l.fullText,
      more: l.more,
      w: l.w,
      y: leavesStartY + i * (LEAF_H + LEAF_GAP),
    }));
    cursor += subtreeH + CLUSTER_GAP;
    return {
      name: p.cluster.name,
      label: p.label,
      count: p.cluster.count,
      w: p.w,
      y: nodeY,
      expanded: p.isOpen,
      leaves,
    };
  });

  const height = Math.max(cursor - CLUSTER_GAP + PAD, CLUSTER_H + PAD * 2);
  const width = (maxLeafW > 0 ? leafX + maxLeafW : clusterX + maxClusterW) + PAD;

  return {
    rootLabel,
    rootW,
    rootY: (height - ROOT_H) / 2,
    clusterX,
    leafX,
    clusters,
    width,
    height,
  };
}

function connector(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(24, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

interface Props {
  seed: string;
  clusterData: ClusterResult;
}

export default function MindMap({ seed, clusterData }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 24, y: 24, k: 1 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    px: number;
    py: number;
    vx: number;
    vy: number;
    moved: boolean;
    cluster: string | null;
  } | null>(null);

  // A new research run = a new tree: start collapsed, view reset.
  useEffect(() => {
    setExpanded(new Set());
    setView({ x: 24, y: 24, k: 1 });
  }, [clusterData]);

  const layout = useMemo(
    () => computeLayout(seed, clusterData, expanded),
    [seed, clusterData, expanded]
  );

  function toggleCluster(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function clusterFromEvent(e: React.PointerEvent): string | null {
    const el = (e.target as Element).closest?.("[data-cluster]");
    return el ? el.getAttribute("data-cluster") : null;
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
      cluster: clusterFromEvent(e),
    };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const name = clusterFromEvent(e);
    if (name && name === d.cluster) toggleCluster(name);
  }

  function zoom(factor: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.25, v.k * factor));
      const s = k / v.k;
      return { k, x: cx - (cx - v.x) * s, y: cy - (cy - v.y) * s };
    });
  }

  if (clusterData.clusters.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-white/[0.06] px-4 py-12 text-center text-[13px] text-zinc-500">
        No topic clusters to map yet — the mind map appears once a research run has been grouped
        into clusters.
      </div>
    );
  }

  const rootCx = PAD + layout.rootW;
  const rootCy = layout.rootY + ROOT_H / 2;
  const zoomBtn =
    "flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-2 text-sm text-zinc-200 backdrop-blur transition-colors duration-200 hover:bg-white/[0.1]";

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setExpanded(new Set(clusterData.clusters.map((c) => c.name)))}
          className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-zinc-200 transition-colors duration-200 hover:bg-white/[0.09]"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-zinc-200 transition-colors duration-200 hover:bg-white/[0.09]"
        >
          Collapse all
        </button>
        <span className="ml-auto text-xs text-zinc-500">
          Click a cluster to expand it · drag the canvas to pan
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0b10]"
        style={{ height: CANVAS_H }}
      >
        <svg
          className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => (drag.current = null)}
          role="img"
          aria-label={`Mind map of keywords for ${seed}`}
        >
          <defs>
            <linearGradient id="mmGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <pattern id="mmDots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1.2" cy="1.2" r="1.2" fill="rgba(255,255,255,0.05)" />
            </pattern>
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <rect x={-2400} y={-2400} width={7200} height={7200} fill="url(#mmDots)" />

            {/* connectors: cluster -> leaves */}
            {layout.clusters.map((c) =>
              c.leaves.map((leaf) => (
                <path
                  key={`${c.name}::${leaf.fullText}`}
                  d={connector(
                    layout.clusterX + c.w,
                    c.y + CLUSTER_H / 2,
                    layout.leafX,
                    leaf.y + LEAF_H / 2
                  )}
                  fill="none"
                  stroke="rgba(255,255,255,0.10)"
                  strokeWidth={1.25}
                />
              ))
            )}
            {/* connectors: root -> clusters */}
            {layout.clusters.map((c) => (
              <path
                key={`root::${c.name}`}
                d={connector(rootCx, rootCy, layout.clusterX, c.y + CLUSTER_H / 2)}
                fill="none"
                stroke="url(#mmGrad)"
                strokeOpacity={0.45}
                strokeWidth={1.5}
              />
            ))}

            {/* leaves */}
            {layout.clusters.map((c) =>
              c.leaves.map((leaf, i) => (
                <g
                  key={`${c.name}::${leaf.fullText}`}
                  className="mm-leaf"
                  style={{ animationDelay: `${Math.min(i * 15, 240)}ms` }}
                >
                  <rect
                    x={layout.leafX}
                    y={leaf.y}
                    width={leaf.w}
                    height={LEAF_H}
                    rx={LEAF_H / 2}
                    fill="rgba(255,255,255,0.03)"
                    stroke="rgba(255,255,255,0.07)"
                    strokeDasharray={leaf.more ? "4 4" : undefined}
                  />
                  <text
                    x={layout.leafX + LEAF_PAD_X}
                    y={leaf.y + LEAF_H / 2}
                    dominantBaseline="central"
                    fontSize={12.5}
                    fontStyle={leaf.more ? "italic" : undefined}
                    fill={leaf.more ? "#71717a" : "#a1a1aa"}
                  >
                    {leaf.text}
                  </text>
                  <title>{leaf.fullText}</title>
                </g>
              ))
            )}

            {/* cluster nodes */}
            {layout.clusters.map((c) => {
              const bw = badgeW(c.count);
              const badgeX = layout.clusterX + c.w - 30 - bw;
              return (
                <g
                  key={c.name}
                  data-cluster={c.name}
                  className="mm-cluster cursor-pointer"
                >
                  <rect
                    className="mm-body"
                    x={layout.clusterX}
                    y={c.y}
                    width={c.w}
                    height={CLUSTER_H}
                    rx={CLUSTER_H / 2}
                    fill="rgba(255,255,255,0.05)"
                    stroke="rgba(255,255,255,0.10)"
                  />
                  <text
                    x={layout.clusterX + CLUSTER_PAD_X}
                    y={c.y + CLUSTER_H / 2}
                    dominantBaseline="central"
                    fontSize={13}
                    fontWeight={500}
                    fill="#f4f4f5"
                  >
                    {c.label}
                  </text>
                  <rect
                    x={badgeX}
                    y={c.y + (CLUSTER_H - 18) / 2}
                    width={bw}
                    height={18}
                    rx={9}
                    fill="#6366f1"
                    fillOpacity={0.18}
                  />
                  <text
                    x={badgeX + bw / 2}
                    y={c.y + CLUSTER_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10.5}
                    fontWeight={600}
                    fill="#c7d2fe"
                    className="tnum"
                  >
                    {c.count}
                  </text>
                  <text
                    x={layout.clusterX + c.w - 15}
                    y={c.y + CLUSTER_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={14}
                    fill="#a1a1aa"
                  >
                    {c.expanded ? "−" : "+"}
                  </text>
                  <title>{`${c.name} — ${c.count} keywords`}</title>
                </g>
              );
            })}

            {/* root node */}
            <g>
              <rect
                x={PAD}
                y={layout.rootY}
                width={layout.rootW}
                height={ROOT_H}
                rx={ROOT_H / 2}
                fill="url(#mmGrad)"
              />
              <text
                x={PAD + layout.rootW / 2}
                y={layout.rootY + ROOT_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontWeight={600}
                fill="#ffffff"
                className="font-display"
              >
                {layout.rootLabel}
              </text>
              <title>{seed}</title>
            </g>
          </g>
        </svg>

        <div className="absolute right-3 top-3 flex gap-1.5">
          <button type="button" aria-label="Zoom out" className={zoomBtn} onClick={() => zoom(1 / 1.25)}>
            −
          </button>
          <button type="button" aria-label="Zoom in" className={zoomBtn} onClick={() => zoom(1.25)}>
            +
          </button>
          <button
            type="button"
            className={`${zoomBtn} text-xs font-medium`}
            onClick={() => setView({ x: 24, y: 24, k: 1 })}
          >
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}
