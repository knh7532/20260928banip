import { runtimeOverride } from "../runtimeConfig";

// ===== 20260908 추가 시작 : GPU/SQream 기본 화면 - PromQL 없는 전용 Spring API =====

export interface MainStatementDto {
  stmtId: string;
  queryId: string;
  user: string;
  node: string;
  gpu: string;
  mig: string;
  worker: string;
  service: string;
  qid: string;
  qidTags: string;
  connectionId: string;
  memoryBytes?: number | null;
  gpuPct?: number | null;
  cpuPct?: number | null;
  startTimeSec?: number | null;
  elapsedSec?: number | null;
  progress?: number | null;
  spoolBytes?: number | null;
  vramBytes?: number | null;
  lockHeldSec?: number | null;
}

export interface MainPerformanceDto {
  queryName: string;
  queryType: string;
  database: string;
  node: string;
  gpu: string;
  mig: string;
  rowsPerSecond?: number | null;
  p95Seconds?: number | null;
  state: number;
}

export interface MainServerDto {
  node: string;
  utilization?: number | null;
  memoryPct?: number | null;
  temperature?: number | null;
  power?: number | null;
  gpuTotal?: number | null;
  migTotal?: number | null;
  gpuBusy?: number | null;
}

export interface MainKpiDto {
  migActive?: number | null;
  migTotal?: number | null;
  inQueue?: number | null;
  rowsPerSecond?: number | null;
  p95Seconds?: number | null;
  queuedStatements?: number | null;
  // ===== 20260908 추가 시작 : Overview Server Status 5단계 =====
  preparingStatements?: number | null;
  initializingStatements?: number | null;
  executingStatements?: number | null;
  stoppingStatements?: number | null;
  // ===== 20260908 추가 끝 : Overview Server Status 5단계 =====
}


export interface MainStatusCountsDto {
  queuedStatements?: number | null;
  preparingStatements?: number | null;
  initializingStatements?: number | null;
  executingStatements?: number | null;
  stoppingStatements?: number | null;
}
export interface MainOverviewDto {
  statements: MainStatementDto[];
  performance: MainPerformanceDto[];
  servers: MainServerDto[];
  kpi: MainKpiDto;
}

export interface MainGpuPointDto {
  id?: string;
  nvidiaSmiId?: string;
  snapshotTime?: string;
  hostname?: string;
  gpuId?: number | null;
  giId?: number | null;
  ciId?: number | null;
  gpuUuid?: string;
  migUuid?: string;
  deviceName?: string;
  temperatureC?: number | null;
  powerUsageW?: number | null;
  memoryUsedMib?: number | null;
  memoryTotalMib?: number | null;
  gpuUtilPercent?: number | null;
  grEngineActivePercent?: number | null;
  smActivePercent?: number | null;
}

export interface MainQueryTimelineDto {
  collectTime?: string;
  hostname?: string;
  globalUuid?: string;
  connectionId?: string;
  statementId?: string;
  queryIdentifier?: string;
  userName?: string;
  queryStart?: string;
  queryEnd?: string;
  executionTimeSec?: number | null;
  totalRuntimeSec?: number | null;
  elapsedSecondsSinceStart?: number | null;
  classifiedState?: string;
  // ===== 20260916 추가 시작 : Worker Log 타임라인 필드 =====
  gpuId?: number | null;
  giId?: number | null;
  serviceName?: string;
  queryExecutionTimeMs?: number | null;
  // ===== 20260916 추가 끝 : Worker Log 타임라인 필드 =====
}

export interface MainChartsDto {
  gpuPoints: MainGpuPointDto[];
  queryTimeline: MainQueryTimelineDto[];
}

export interface MainXViewEventDto {
  node: string;
  gpu: string;
  mig: string;
  stmtId: string;
  queryId: string;
  user: string;
  queryName: string;
  status: "success" | "failed";
  reason: string;
  endMs: number;
  durationSec: number;
  phases: {
    compileSec: number | null;
    queuedSec: number | null;
    initializingSec: number | null;
    executingSec: number | null;
  } | null;
}

export interface MainLiveStatDto {
  stmtId: string;
  elapsed?: number | null;
  prog?: number | null;
}

function baseUrl(): string {
  return (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").replace(/\/$/, "");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatMainApiTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface MainOverviewFilterParams {
  instances?: string[];
  gpus?: string[];
  migs?: string[];
}

function url(path: string, startMs: number, endMs: number, filters?: MainOverviewFilterParams): string {
  const q = new URLSearchParams({ startTime: formatMainApiTime(startMs), endTime: formatMainApiTime(endMs) });
  // ===== 20260908 추가 시작 : Overview Node/GPU/Worker 필터 직접 API 전달 =====
  if (filters?.instances?.length) q.set("hostname", filters.instances.join(","));
  if (filters?.gpus?.length) q.set("gpuId", filters.gpus.join(","));
  if (filters?.migs?.length) q.set("giId", filters.migs.join(","));
  // ===== 20260908 추가 끝 : Overview Node/GPU/Worker 필터 직접 API 전달 =====
  return `${baseUrl()}/api/aireactechartdashboard/main/${path}?${q.toString()}`;
}

async function getJson<T>(requestUrl: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(requestUrl, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Spring AiReactEchart API HTTP ${res.status}: ${requestUrl}`);
  return (await res.json()) as T;
}

export function fetchMainOverview(startMs: number, endMs: number, filters?: MainOverviewFilterParams, signal?: AbortSignal): Promise<MainOverviewDto> {
  return getJson<MainOverviewDto>(url("overview", startMs, endMs, filters), signal);
}

export function fetchMainStatusCounts(startMs: number, endMs: number, filters?: MainOverviewFilterParams, signal?: AbortSignal): Promise<MainStatusCountsDto> {
  return getJson<MainStatusCountsDto>(url("status-counts", startMs, endMs, filters), signal);
}

export function fetchMainCharts(startMs: number, endMs: number, filters?: MainOverviewFilterParams, signal?: AbortSignal): Promise<MainChartsDto> {
  return getJson<MainChartsDto>(url("charts", startMs, endMs, filters), signal);
}

export function fetchMainXView(startMs: number, endMs: number, filters?: MainOverviewFilterParams, signal?: AbortSignal): Promise<MainXViewEventDto[]> {
  // 20260916 추가: X-View Node/GPU/Worker 필터를 Spring API로 전달
  return getJson<MainXViewEventDto[]>(url("xview", startMs, endMs, filters), signal);
}

export function fetchMainLiveStats(startMs: number, endMs: number, signal?: AbortSignal): Promise<MainLiveStatDto[]> {
  return getJson<MainLiveStatDto[]>(url("live-stats", startMs, endMs), signal);
}

// ===== 20260908 추가 끝 : GPU/SQream 기본 화면 - PromQL 없는 전용 Spring API =====

// ===== 20260916 추가 시작 : Overview 하단 Table Chunk / Internal Runtime Error =====
export interface MainTableChunkDto {
  hostname?: string; tableId?: number; databaseName?: string; schemaName?: string; tableName?: string;
  compressedTableSizeByte?: number; uncompressedTableSizeByte?: number; savingsRate?: number; compressionRatio?: number;
  pct90100?: number; pct8090?: number; pct7080?: number; pct6070?: number; pct5060?: number; pct4050?: number;
  pct3040?: number; pct2030?: number; pct1020?: number; pct010?: number; pct090?: number;
  noDeletionCnt?: number; someDeletionCnt?: number; allDeletionCnt?: number; deletionCount?: string; rechunk?: string; needsRechunk?: string;
  collectTime?: string;
}
export interface MainInternalErrorPointDto {
  hostname?: string; instanceId?: string; statementId?: number; connectionId?: number; queryEndTime?: string;
  statement?: string; messageTypeId?: string; message?: string; errorType?: boolean;
}
export function fetchMainTableChunks(startMs:number,endMs:number,filters?:MainOverviewFilterParams,signal?:AbortSignal):Promise<MainTableChunkDto[]> {
  return getJson<MainTableChunkDto[]>(url("table-chunks",startMs,endMs,filters),signal);
}
export function fetchMainInternalErrors(startMs:number,endMs:number,filters?:MainOverviewFilterParams,signal?:AbortSignal):Promise<MainInternalErrorPointDto[]> {
  return getJson<MainInternalErrorPointDto[]>(url("internal-errors",startMs,endMs,filters),signal);
}
// ===== 20260916 추가 끝 : Overview 하단 Table Chunk / Internal Runtime Error =====
