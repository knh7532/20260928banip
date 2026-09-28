import { runtimeOverride } from "../runtimeConfig";

export interface WorkerFilterOption {
  name: string;
  hostname: string;
  gpuId: number;
  giId: number;
}
export interface MonitoringFilterOptions {
  nodes: string[];
  gpus: number[];
  workers: WorkerFilterOption[];
}

function baseUrl(): string {
  return (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").replace(/\/$/, "");
}

export async function fetchMonitoringFilterOptions(
  hostname?: string,
  gpuId?: string,
  signal?: AbortSignal,
): Promise<MonitoringFilterOptions> {
  const q = new URLSearchParams();
  if (hostname) q.set("hostname", hostname);
  if (gpuId) q.set("gpuId", gpuId);
  const res = await fetch(`${baseUrl()}/api/aireactechartdashboard/main/filter-options${q.size ? `?${q}` : ""}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`filter-options HTTP ${res.status}`);
  return res.json() as Promise<MonitoringFilterOptions>;
}
