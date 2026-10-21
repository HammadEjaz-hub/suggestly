export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export interface ApiStatus {
  serpapi_configured: boolean;
  quota_left: number | null;
  mode: "precise" | "free";
}

export interface PlanBatch {
  id: number;
  label: string;
  feature: string;
  queries: string[];
  use_serpapi: boolean;
}

export interface Plan {
  seed: string;
  gl: string;
  hl: string;
  batches: PlanBatch[];
  total_queries: number;
}

export interface KeywordItem {
  keyword: string;
  source: "serpapi" | "free";
  from_query: string;
}

export interface BatchResult {
  keywords: KeywordItem[];
}

export interface Cluster {
  name: string;
  count: number;
  keywords: string[];
}

export interface ClusterResult {
  total: number;
  intents: Record<string, string>;
  intent_counts: Record<string, number>;
  clusters: Cluster[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getStatus(): Promise<ApiStatus> {
  const res = await fetch(`${API_URL}/api/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`status failed: ${res.status}`);
  return res.json() as Promise<ApiStatus>;
}

export function getPlan(body: {
  seed: string;
  gl: string;
  hl: string;
  features: { az: boolean; questions: boolean; modifiers: boolean };
  serpapi_mode: "auto" | "off";
}): Promise<Plan> {
  return post<Plan>("/api/expand/plan", body);
}

export function postBatch(body: {
  queries: string[];
  gl: string;
  hl: string;
  use_serpapi: boolean;
}): Promise<BatchResult> {
  return post<BatchResult>("/api/expand/batch", body);
}

export function postCluster(keywords: string[], seed: string): Promise<ClusterResult> {
  return post<ClusterResult>("/api/cluster", { keywords, seed });
}
