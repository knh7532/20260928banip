// ===== 20260908 추가 시작 : Prometheus 제거 - 공통 상태 PostgreSQL REST API =====
import { runtimeOverride } from "../runtimeConfig";

export interface CommonServerStatusDto {
  hostname: string;
  gpu_total: number | null;
  mig_total: number | null;
  gpu_busy: number | null;
  // ===== 20260908 추가 : 최신 NVIDIA 수집 여부로 서버 정상/중단 판정 =====
  online?: boolean | null;
  last_collect_time?: string | null;
}

export interface CommonStatusDto {
  healthy: boolean;
  nodes: number;
  alerts: number;
  servers: CommonServerStatusDto[];
}

function baseUrl(): string {
  const configured = (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").trim();
  return configured.replace(/\/$/, "");
}

function fmt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function fetchCommonStatus(endMs: number, signal?: AbortSignal): Promise<CommonStatusDto> {
  const q = new URLSearchParams({ endTime: fmt(endMs) });
  const res = await fetch(`${baseUrl()}/api/aireactechartdashboard/common/status?${q}`, {
    signal,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Common Status API HTTP ${res.status}`);
  return res.json() as Promise<CommonStatusDto>;
}
// ===== 20260908 추가 끝 : Prometheus 제거 - 공통 상태 PostgreSQL REST API =====
