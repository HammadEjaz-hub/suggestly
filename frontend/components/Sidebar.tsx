import type { ApiStatus } from "@/lib/api";

const NAV = [
  { label: "Research", active: true, tag: null as string | null },
  { label: "Sessions", active: false, tag: "Phase 2" },
  { label: "Gap Checker", active: false, tag: "Phase 3" },
  { label: "Settings", active: false, tag: "Phase 2" },
];

export default function Sidebar({ status }: { status: ApiStatus | null }) {
  const quotaPct =
    status?.quota_left != null ? Math.max(0, Math.min(100, (status.quota_left / 250) * 100)) : null;

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-white/[0.07] bg-[#0b0b10] px-4 py-6">
      <div className="flex items-center gap-2.5 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 font-display text-sm font-bold text-white">
          S
        </div>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight text-zinc-50">Suggestly</div>
          <div className="text-[11px] text-zinc-500">Coverage Planner</div>
        </div>
      </div>

      <nav className="mt-9 space-y-1">
        {NAV.map((item) => (
          <div
            key={item.label}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors duration-200 ${
              item.active
                ? "bg-white/[0.07] font-medium text-zinc-50"
                : "cursor-not-allowed text-zinc-500"
            }`}
          >
            <span>{item.label}</span>
            {item.tag && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                {item.tag}
              </span>
            )}
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="glass rounded-2xl p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">SerpApi Quota</div>
          {status?.serpapi_configured ? (
            <>
              <div className="mt-2 font-display text-2xl font-bold text-zinc-50 tnum">
                {status.quota_left ?? "—"}
                <span className="ml-1 text-xs font-medium text-zinc-500">searches left</span>
              </div>
              {quotaPct !== null && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>
              )}
              <div className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
                Used only for seed + country precision. Everything else runs free.
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 font-display text-2xl font-bold text-zinc-50">Free</div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                No SerpApi key set — the tool runs 100% on Google&apos;s free suggestions. Add
                SERPAPI_KEY on the backend for precise mode.
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-[11px] font-semibold text-zinc-100 ring-1 ring-white/15">
            H
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-zinc-200">My Workspace</div>
            <div className="text-[11px] text-zinc-500">Accounts arrive in Phase 2</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
