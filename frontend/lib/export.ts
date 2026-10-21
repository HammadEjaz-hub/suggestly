import type { ClusterResult, KeywordItem } from "./api";

export type StatusMap = Record<string, string>;

function saveBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function downloadCsv(
  seed: string,
  keywords: KeywordItem[],
  clusterData: ClusterResult | null,
  statuses: StatusMap
) {
  const clusterOf = new Map<string, string>();
  clusterData?.clusters.forEach((c) => c.keywords.forEach((k) => clusterOf.set(k, c.name)));
  const rows: string[][] = [["Keyword", "Intent", "Cluster", "Status", "Source"]];
  for (const item of keywords) {
    rows.push([
      item.keyword,
      clusterData?.intents[item.keyword] ?? "",
      clusterOf.get(item.keyword) ?? "",
      statuses[item.keyword] ?? "Todo",
      item.source,
    ]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  // UTF-8 BOM so Excel on Windows opens Urdu/special characters correctly.
  saveBlob("\uFEFF" + csv, `${seed.replace(/\s+/g, "-")}-keywords.csv`, "text/csv;charset=utf-8");
}

export function downloadTxt(
  seed: string,
  gl: string,
  hl: string,
  clusterData: ClusterResult | null,
  statuses: StatusMap
) {
  const lines: string[] = [];
  lines.push(`KEYWORD RESEARCH — ${seed}`);
  lines.push(`Country: ${gl || "Worldwide"} · Language: ${hl} · Date: ${new Date().toLocaleDateString()}`);
  lines.push(`Total keywords: ${clusterData?.total ?? 0}`);
  lines.push("");
  if (clusterData) {
    for (const c of clusterData.clusters) {
      lines.push(`== ${c.name} (${c.count}) ==`);
      c.keywords.forEach((kw, i) => {
        const st = statuses[kw] ?? "Todo";
        lines.push(`${i + 1}. ${kw}  [${st}]`);
      });
      lines.push("");
    }
  }
  saveBlob(lines.join("\r\n"), `${seed.replace(/\s+/g, "-")}-keywords.txt`, "text/plain;charset=utf-8");
}
