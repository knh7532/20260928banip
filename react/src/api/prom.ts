/**
 * ===== 20260908 추가 시작 : Prometheus 직접 호출 완전 제거 =====
 *
 * 기존 화면의 promQuery/promQueryRange 호출 인터페이스는 유지하지만,
 * 실제 네트워크 호출은 Spring Boot 페이지 분리 API로 보낸다.
 * 따라서 브라우저에서 :3002 /api/v1/query /api/v1/query_range 호출은 더 이상 발생하지 않는다.
 *
 * Spring API:
 *   /api/aireactechartdashboard/main/*
 *   /api/aireactechartdashboard/query/*
 *   /api/aireactechartdashboard/worker/*
 *   /api/aireactechartdashboard/table/* 등 페이지별 API
 *
 * 기존 컴포넌트/ECharts 변환 로직을 한 번에 깨지 않기 위한 호환 계층이다.
 * ===== 20260908 추가 끝 : Prometheus 직접 호출 완전 제거 =====
 */

// ===== 20260908 추가 : com.apptomo.v4.aireactechartdashboard 페이지 분리 API로 재매핑 =====
/** 기존 화면이 사용하는 시계열 형식은 그대로 유지한다. */
export interface PromSeries {
  metric: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>;
}

export type PromErrorKind = "http" | "status" | "network" | "timeout" | "input" | "malformed";

export class PromError extends Error {
  constructor(
    message: string,
    readonly kind: PromErrorKind,
  ) {
    super(message);
    this.name = "PromError";
  }
}

export class PromAbortError extends Error {
  constructor() {
    super("aborted by caller");
    this.name = "PromAbortError";
  }
}

const INSTANT_TIMEOUT_MS = 6000;
const RANGE_TIMEOUT_MS = 10000;
export const MIN_STEP_S = 5;
const DEFAULT_TARGET_POINTS = 60;

// ===== 20260908 추가 시작 : 사용자가 지정한 조회 종료시각 전역 적용 =====
let fixedQueryEndMs: number | null = null;

/**
 * 상세 대시보드의 "조회기간 시작 ~ 끝"에서 지정한 종료시각을
 * 기존 promQuery/promQueryRange 호환 호출에 공통 적용한다.
 * null이면 기존처럼 현재 시각(Date.now()) 기준으로 동작한다.
 */
export function setCompatQueryEndMs(endMs: number | null): void {
  fixedQueryEndMs = endMs !== null && Number.isFinite(endMs) && endMs > 0 ? endMs : null;
}
// ===== 20260908 추가 끝 : 사용자가 지정한 조회 종료시각 전역 적용 =====

function apiBaseUrl(): string {
  return (import.meta.env.VITE_PORTAL_API_BASE ?? "").replace(/\/+$/, "");
}

/**
 * 과거 코드가 promBaseUrl을 import하더라도 깨지지 않게 이름만 유지한다.
 * 반환값은 이제 Prometheus가 아니라 Spring Portal API base다.
 */
export function promBaseUrl(): string {
  return apiBaseUrl();
}


// ===== 20260908 추가 시작 : GPU/SQream 7개 페이지 전용 API 패키지/경로 분리 =====
function currentPageApiPrefix(): string | null {
  const hash = typeof location !== "undefined" ? location.hash : "";
  if (hash.startsWith("#/drilldown/main")) return "/api/aireactechartdashboard/main";
  if (hash.startsWith("#/drilldown/worker")) return "/api/aireactechartdashboard/worker";
  if (hash.startsWith("#/drilldown/query")) return "/api/aireactechartdashboard/query";
  if (hash.startsWith("#/drilldown/logs")) return "/api/aireactechartdashboard/log";
  if (hash.startsWith("#/drilldown/session")) return "/api/aireactechartdashboard/session";
  if (hash.startsWith("#/drilldown/usage")) return "/api/aireactechartdashboard/table";
  if (hash.startsWith("#/drilldown/activity")) return "/api/aireactechartdashboard/activity";
  return null;
}

function pageApiPrefix(expr: string): string {
  // 현재 페이지가 7개 대상 페이지 중 하나면 페이지 API를 최우선 사용한다.
  const current = currentPageApiPrefix();
  if (current) return current;

  // 공통 훅/초기 조회 시 metric 이름 기준 fallback도 7개 범위만 유지한다.
  if (/node_(cpu|memory|disk|filesystem)/.test(expr) || expr.includes("DCGM_FI_DEV_")) {
    return "/api/aireactechartdashboard/main";
  }
  if (expr.includes("sqm_worker_")) return "/api/aireactechartdashboard/worker";
  if (expr.includes("sqm_session_")) return "/api/aireactechartdashboard/session";
  if (expr.includes("sqm_log_entries_total")) return "/api/aireactechartdashboard/log";
  if (expr.includes("sqm_table_")) return "/api/aireactechartdashboard/table";
  if (expr.includes("sqm_table_activity_") || expr.includes("sqm_activity_")) {
    return "/api/aireactechartdashboard/activity";
  }
  return "/api/aireactechartdashboard/query";
}
// ===== 20260908 추가 끝 : GPU/SQream 7개 페이지 전용 API 패키지/경로 분리 =====

function apiUrl(path: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  return `${apiBaseUrl()}${path}?${q.toString()}`;
}

function isSample(x: unknown): x is [number, string] {
  return Array.isArray(x) && x.length === 2 && typeof x[0] === "number" && typeof x[1] === "string";
}

function parseCompatSeries(body: unknown, expected: "vector" | "matrix"): PromSeries[] {
  if (!Array.isArray(body)) throw new PromError("Spring ReactEchart API 응답이 배열이 아니다", "malformed");
  for (const raw of body) {
    if (typeof raw !== "object" || raw === null) throw new PromError("metric series 형식 오류", "malformed");
    const s = raw as { metric?: unknown; value?: unknown; values?: unknown };
    if (typeof s.metric !== "object" || s.metric === null) throw new PromError("metric labels 형식 오류", "malformed");
    if (expected === "vector") {
      if (!isSample(s.value)) throw new PromError("instant metric sample 형식 오류", "malformed");
    } else if (!Array.isArray(s.values) || !s.values.every(isSample)) {
      throw new PromError("range metric sample 형식 오류", "malformed");
    }
  }
  return body as PromSeries[];
}

async function fetchSeries(
  url: string,
  timeoutMs: number,
  expected: "vector" | "matrix",
  signal?: AbortSignal,
): Promise<PromSeries[]> {
  if (signal?.aborted) throw new PromAbortError();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new PromError(`Spring ReactEchart API HTTP ${res.status}`, "http");
    return parseCompatSeries(await res.json(), expected);
  } catch (e) {
    if (e instanceof PromError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      if (timedOut && !signal?.aborted) throw new PromError(`Spring ReactEchart API timeout (${timeoutMs}ms)`, "timeout");
      throw new PromAbortError();
    }
    throw new PromError(e instanceof Error ? e.message : String(e), "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ===== 20260908 추가 시작 : instant -> Spring API =====
export function promQuery(expr: string, signal?: AbortSignal, atMs?: number): Promise<PromSeries[]> {
  if (atMs !== undefined && (!Number.isFinite(atMs) || atMs <= 0)) {
    return Promise.reject(new PromError(`invalid time: ${atMs}`, "input"));
  }
  const url = apiUrl(`${pageApiPrefix(expr)}/query`, {
    expr,
    // ===== 20260908 추가 : 고정 종료시각이 있으면 instant 조회도 같은 시점 사용 =====
    time: Math.floor((atMs ?? fixedQueryEndMs ?? Date.now()) / 1000),
  });
  return fetchSeries(url, INSTANT_TIMEOUT_MS, "vector", signal);
}
// ===== 20260908 추가 끝 : instant -> Spring API =====

export interface RangeOptions {
  signal?: AbortSignal;
  endMs?: number;
  stepSec?: number;
  targetPoints?: number;
  maxStepSec?: number;
}

export function resolveStep(rangeSec: number, opts: RangeOptions = {}): number {
  const target = opts.targetPoints && opts.targetPoints > 0 ? opts.targetPoints : DEFAULT_TARGET_POINTS;
  let step = opts.stepSec ?? Math.floor(rangeSec / target);
  if (opts.maxStepSec !== undefined) step = Math.min(step, opts.maxStepSec);
  return Math.max(MIN_STEP_S, Math.floor(step));
}

// ===== 20260908 추가 시작 : range -> Spring API =====
export function promQueryRange(
  expr: string,
  rangeSec: number,
  opts: RangeOptions = {},
): Promise<PromSeries[]> {
  if (!Number.isFinite(rangeSec) || rangeSec <= 0) {
    return Promise.reject(new PromError(`invalid range: ${rangeSec}`, "input"));
  }
  if (opts.stepSec !== undefined && (!Number.isFinite(opts.stepSec) || opts.stepSec <= 0)) {
    return Promise.reject(new PromError(`invalid step: ${opts.stepSec}`, "input"));
  }
  // ===== 20260908 추가 : 툴바에서 고정한 종료시각 우선 사용 =====
  const endMs = opts.endMs ?? fixedQueryEndMs ?? Date.now();
  const end = Math.floor(endMs / 1000);
  const start = end - Math.floor(rangeSec);
  const step = resolveStep(rangeSec, opts);
  const url = apiUrl(`${pageApiPrefix(expr)}/query-range`, { expr, start, end, step });
  return fetchSeries(url, RANGE_TIMEOUT_MS, "matrix", opts.signal);
}
// ===== 20260908 추가 끝 : range -> Spring API =====

// ===== 20260908 추가 시작 : label-values -> Spring API =====
export async function promLabelValues(
  label: string,
  matcher: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (signal?.aborted) throw new PromAbortError();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, INSTANT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(
      apiUrl("/api/aireactechartdashboard/main/label-values", { label, matcher }),
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new PromError(`Spring ReactEchart label API HTTP ${res.status}`, "http");
    const body = await res.json();
    if (!Array.isArray(body)) throw new PromError("Spring ReactEchart label API 응답이 배열이 아니다", "malformed");
    return body.filter((v): v is string => typeof v === "string").slice().sort();
  } catch (e) {
    if (e instanceof PromError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      if (timedOut && !signal?.aborted) throw new PromError(`Spring ReactEchart label API timeout (${INSTANT_TIMEOUT_MS}ms)`, "timeout");
      throw new PromAbortError();
    }
    throw new PromError(e instanceof Error ? e.message : String(e), "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
// ===== 20260908 추가 끝 : label-values -> Spring API =====

export function scalarOf(result: PromSeries[], fallback = 0): number {
  const raw = result[0]?.value?.[1];
  if (raw === undefined) return fallback;
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}
