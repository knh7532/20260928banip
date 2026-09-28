// ===== 20260908 추가 시작 : Worker Dashboard - MQuery 직접 REST API =====
import { runtimeOverride } from "../runtimeConfig";

export interface WorkerDashboardRowDto {
  hostname: string;
  gpuId: number | null;
  giId: number | null;
  ciId: number | null;
  migInstanceId: number | null;
  workerHostname: string;
  connectionId: number | null;
  statementId: number | null;
  serviceName: string;
  userId: string;
  queryStartTime: string | null;
  queryEndTime: string | null;
  queryTerminationStatus: string;
  queryExecutionTimeSec: number | null;
  peakCpuUsagePercent: number | null;
  peakMemoryUsagePercent: number | null;
  peakDiskUsagePercent: number | null;
  peakGrEngineActivePercent: number | null;
  peakSmActivePercent: number | null;
  peakGpuMemoryUsedMib: number | null;
  peakGpuMemoryTotalMib: number | null;
  peakGpuMemoryUsagePercent: number | null;
}
export interface WorkerDashboardNodeDto { hostname: string; rows: WorkerDashboardRowDto[] }
export interface WorkerDashboardResponseDto { nodes: WorkerDashboardNodeDto[] }

function baseUrl(): string {
  const configured = (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").trim();
  return configured.replace(/\/$/, "");
}
function fmt(ms: number): string {
  const d = new Date(ms); const p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function fetchWorkerDashboard(
  startMs:number,endMs:number,hostname:string,gpu:string,migSlot:string,signal?:AbortSignal,
): Promise<WorkerDashboardResponseDto> {
  const q = new URLSearchParams({ startTime:fmt(startMs), endTime:fmt(endMs) });
  if (hostname) q.set("hostname",hostname);
  let gpuId = gpu;
  let migInstanceId = "";
  if (migSlot !== "") {
    const slot = Number(migSlot);
    if (Number.isFinite(slot)) {
      if (!gpuId) gpuId = String(Math.floor(slot / 2));
      migInstanceId = String(slot % 2);
    }
  }
  if (gpuId) q.set("gpuId",gpuId);
  if (migInstanceId) q.set("migInstanceId",migInstanceId);
  const res = await fetch(`${baseUrl()}/api/aireactechartdashboard/worker/overview?${q}`, {signal,credentials:"include"});
  if(!res.ok) throw new Error(`Worker Dashboard API HTTP ${res.status}`);
  return res.json() as Promise<WorkerDashboardResponseDto>;
}
// ===== 20260908 추가 끝 : Worker Dashboard - MQuery 직접 REST API =====
