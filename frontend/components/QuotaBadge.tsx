import type { ApiStatus } from "@/lib/api";

export default function QuotaBadge({ status }: { status: ApiStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
        Backend not connected
      </span>
    );
  }
  if (status.mode === "precise") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Precise Mode (SerpApi)
        {status.quota_left !== null && <span className="tnum text-emerald-200/80">· {status.quota_left} searches left</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Free Mode
      <span className="text-amber-200/70">· Google&apos;s own suggestions, ~90% location precision</span>
    </span>
  );
}
