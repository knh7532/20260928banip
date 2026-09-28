import { runtimeOverride } from "../runtimeConfig";

// 20260916 추가: realmetric 전용 API
export interface RealMetricPointDto {
  collectTime: string; hostname: string; gpuId: number; worker: string;
  gpuUtilPercent?: number | null; memoryUsedGb?: number | null; memoryTotalGb?: number | null;
  memoryPct?: number | null; temperatureC?: number | null; powerUsageW?: number | null;
}
export interface RealMetricServerDto {
  hostname: string; gpuCount: number; workerCount: number;
  gpuUtilPercent?: number | null; memoryUsedGb?: number | null; memoryTotalGb?: number | null;
  memoryPct?: number | null; temperatureC?: number | null; powerUsageW?: number | null;
}
export interface RealMetricResponseDto { points: RealMetricPointDto[]; servers: RealMetricServerDto[]; }
function baseUrl() { return (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").replace(/\/$/, ""); }
function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(ms: number) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
export async function fetchRealMetrics(startMs: number, endMs: number, filters: {instances:string[];gpus:string[];migs?:string[]}, signal?: AbortSignal) {
  const q = new URLSearchParams({ startTime: fmt(startMs), endTime: fmt(endMs) });
  if (filters.instances.length === 1) q.set("hostname", filters.instances[0]);
  if (filters.gpus.length === 1) q.set("gpuId", filters.gpus[0]);
  // 20260916 추가: GPU 4개 그래프는 Worker/GI 선택을 적용하지 않고 Node+GPU의 GI 평균 사용
  const r = await fetch(`${baseUrl()}/api/aireactechartdashboard/main/realmetric?${q}`, { signal, headers:{Accept:"application/json"} });
  if (!r.ok) throw new Error(`realmetric HTTP ${r.status}`);
  return await r.json() as RealMetricResponseDto;
}
