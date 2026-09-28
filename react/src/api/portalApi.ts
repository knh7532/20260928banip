import { runtimeOverride } from "../runtimeConfig";

// ===== 20260908 추가 시작 : Prometheus 제거 - Spring REST API 데이터 클라이언트 =====

export interface SpringPage<T> {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
}

export interface NvidiaPage<T> {
  content?: T[];
  rows?: T[];
  data?: T[];
  totalElements?: number;
  total?: number;
  page?: number;
  size?: number;
}

export interface QueryRuntimeRow {
  id?: string;
  collectTime?: string;
  hostname?: string;
  hostip?: string;
  globalUuid?: string;
  connectionId?: number | string;
  statementId?: number | string;
  queryIdentifier?: string;
  userName?: string;
  queryStart?: string;
  queryEnd?: string;
  compileTimeSec?: number;
  compileExecutionTimeSec?: number;
  inqueueTimeSec?: number;
  executionTimeSec?: number;
  idleConnTimeSec?: number;
  totalRuntimeSec?: number;
  elapsedSecondsSinceStart?: number;
  classifiedState?: string;
  performanceGrade?: string;
  bottleneckStage?: string;
  bottleneckTimeSec?: number;
  bottleneckRatio?: number;
  efficiencyScore?: number;
  isUserQuery?: boolean;
  isLongRunning?: boolean;
}

export interface NodeChartRow {
  globalUuid?: string;
  collectTime?: string;
  cpuUsagePercent?: number;
  memoryTotalBytes?: number;
  memoryUsedBytes?: number;
  memoryUsagePercent?: number;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  diskUsagePercent?: number;
  uptimeSeconds?: number;
  loadAvg1m?: number;
  loadAvg5m?: number;
  loadAvg15m?: number;
  success?: boolean;
}

export interface NvidiaSmiRow {
  id: string;
  snapshotTime?: string;
  collectTime?: string;
  hostname?: string;
  hostip?: string;
  globalUuid?: string;
}

export interface DcgmRow {
  id?: string;
  nvidiaSmiId?: string;
  snapshotTime?: string;
  gpuId?: number;
  giId?: number;
  ciId?: number;
  gpuUuid?: string;
  migUuid?: string;
  deviceName?: string;
  temperatureC?: number;
  powerUsageW?: number;
  memoryUsedMib?: number;
  memoryTotalMib?: number;
  gpuUtilPercent?: number;
  grEngineActivePercent?: number;
  smActivePercent?: number;
}

export interface ServerStatusRow {
  globalUuid?: string;
  collectTime?: string;
  hostname?: string;
  hostip?: string;
  service?: string;
  instanceId?: string;
  connectionId?: number | string;
  databaseName?: string;
  userName?: string;
  statementId?: number | string;
  statementStartTime?: string;
  statementStatus?: string;
  elapsedSeconds?: number;
  classifiedState?: string;
  longRunning?: boolean;
}

export interface ChunkRow {
  id?: string;
  collectTime?: string;
  hostname?: string;
  globalUuid?: string;
  tableId?: number;
  databaseName?: string;
  schemaName?: string;
  tableName?: string;
  totalChunks?: number;
  totalRows?: number;
  noDeletionCnt?: number;
  someDeletionCnt?: number;
  allDeletionCnt?: number;
  compressedTableSizeByte?: number;
  uncompressedTableSizeByte?: number;
  compressionRatio?: number;
}

export interface SqreamTableRow {
  globalUuid?: string;
  collectTime?: string;
  hostname?: string;
  databaseName?: string;
  tableId?: number;
  schemaName?: string;
  tableName?: string;
  rowCount?: number;
  deletedRowCount?: number;
  deletedRowRatio?: number;
  rowConsistent?: boolean;
  needsRechunk?: boolean;
  fullTableName?: string;
}

const JSON_HEADERS = { Accept: "application/json" };

function pageRows<T>(body: SpringPage<T> | NvidiaPage<T> | T[]): T[] {
  if (Array.isArray(body)) return body;
  const x = body as NvidiaPage<T> & SpringPage<T>;
  if (Array.isArray(x.content)) return x.content;
  if (Array.isArray(x.rows)) return x.rows;
  if (Array.isArray(x.data)) return x.data;
  return [];
}

function apiUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  const base = (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").replace(/\/$/, "");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return `${base}${path}${q.size ? `?${q.toString()}` : ""}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: JSON_HEADERS });
  if (!res.ok) throw new Error(`Spring API HTTP ${res.status}: ${url}`);
  return (await res.json()) as T;
}

export function formatApiTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function fetchQueryRuntime(
  startMs: number,
  endMs: number,
  signal?: AbortSignal,
  size = 500,
): Promise<QueryRuntimeRow[]> {
  const body = await getJson<SpringPage<QueryRuntimeRow>>(
    apiUrl("/api/aisqreamboard/query_runtime", {
      page: 0, size, startTime: formatApiTime(startMs), endTime: formatApiTime(endMs),
    }), signal,
  );
  return pageRows(body);
}

export async function fetchNodeChart(startMs: number, endMs: number, signal?: AbortSignal): Promise<NodeChartRow[]> {
  return getJson<NodeChartRow[]>(
    apiUrl("/api/aimetricsboard/node/chart", {
      startTime: formatApiTime(startMs), endTime: formatApiTime(endMs),
    }), signal,
  );
}

export async function fetchServerStatus(startMs: number, endMs: number, signal?: AbortSignal): Promise<ServerStatusRow[]> {
  const body = await getJson<SpringPage<ServerStatusRow>>(
    apiUrl("/api/aisqreamboard/server_status", {
      page: 0, size: 200, startTime: formatApiTime(startMs), endTime: formatApiTime(endMs),
    }), signal,
  );
  return pageRows(body);
}

export async function fetchChunks(startMs: number, endMs: number, signal?: AbortSignal): Promise<ChunkRow[]> {
  const body = await getJson<SpringPage<ChunkRow>>(
    apiUrl("/api/aisqreamboard/chunk", {
      page: 0, size: 500, startTime: formatApiTime(startMs), endTime: formatApiTime(endMs),
    }), signal,
  );
  return pageRows(body);
}

export async function fetchSqreamTables(startMs: number, endMs: number, signal?: AbortSignal): Promise<SqreamTableRow[]> {
  const body = await getJson<SpringPage<SqreamTableRow>>(
    apiUrl("/api/aisqreamboard/table", {
      page: 0, size: 200, startTime: formatApiTime(startMs), endTime: formatApiTime(endMs),
    }), signal,
  );
  return pageRows(body);
}

export async function fetchNvidiaSnapshots(
  startMs: number,
  endMs: number,
  signal?: AbortSignal,
  hostname?: string,
): Promise<NvidiaSmiRow[]> {
  const body = await getJson<NvidiaPage<NvidiaSmiRow>>(
    apiUrl("/api/ainvidiaboard/nvidia-smi", {
      page: 0, size: 100, startTime: formatApiTime(startMs), endTime: formatApiTime(endMs), hostname,
    }), signal,
  );
  return pageRows(body);
}

export async function fetchDcgmSnapshot(
  nvidiaSmiId: string,
  signal?: AbortSignal,
): Promise<DcgmRow[]> {
  const body = await getJson<NvidiaPage<DcgmRow>>(
    apiUrl("/api/ainvidiaboard/dcgmi", { nvidiaSmiId, page: 0, size: 20 }), signal,
  );
  return pageRows(body);
}

export interface DcgmPoint extends DcgmRow {
  hostname: string;
  timeMs: number;
}

/** 20260908: DCGMI 시계열은 Spring JOIN 차트 API 1회 호출로 조회한다. */
export async function fetchDcgmRange(startMs: number, endMs: number, signal?: AbortSignal): Promise<DcgmPoint[]> {
  // ===== 20260908 추가 시작 : DCGMI N+1 제거 - 차트 전용 Spring JOIN API 사용 =====
  const rows = await getJson<Array<DcgmRow & { hostname?: string; collectTime?: string }>>(
    apiUrl("/api/ainvidiaboard/dcgmi/chart", {
      startTime: formatApiTime(startMs),
      endTime: formatApiTime(endMs),
    }),
    signal,
  );

  return rows.map((d) => {
    const timeMs = Date.parse(d.snapshotTime ?? d.collectTime ?? "");
    return {
      ...d,
      hostname: d.hostname ?? "",
      timeMs,
    } as DcgmPoint;
  }).filter((p) => Number.isFinite(p.timeMs));
  // ===== 20260908 추가 끝 : DCGMI N+1 제거 - 차트 전용 Spring JOIN API 사용 =====
}

// ===== 20260908 추가 끝 : Prometheus 제거 - Spring REST API 데이터 클라이언트 =====
