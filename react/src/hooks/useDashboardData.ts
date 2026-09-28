import { useCallback, useEffect, useRef, useState } from "react";

import { fetchMainOverview, fetchMainStatusCounts } from "../api/aiReactEchartMainApi";
import type { Filters } from "../api/queries";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

export interface StatementRow {
  stmtId: string; queryId: string; user: string; node: string; gpu: string; mig: string; worker: string; service: string;
  qid: string; qidTags: string; connectionId: string; memoryBytes: number; gpuPct: number; cpuPct: number;
  startTimeSec: number; elapsedSec: number; progress: number; spoolBytes: number; vramBytes: number; lockHeldSec: number;
}
export interface PerformanceRow { queryName: string; queryType: string; database: string; node: string; gpu: string; mig: string; rowsPerSecond: number; p95Seconds: number; state: number; }
export interface ServerSummary {
  node: string; utilization: number; memoryPct: number; temperature: number; power: number;
  gpuTotal: number; migTotal: number; gpuBusy: number;
  // ===== 20260908 추가 : 서버 상태를 GPU 개수와 분리 =====
  online?: boolean;
}
export interface KpiData {
  migActive: number; migTotal: number; inQueue: number; rowsPerSecond: number; p95Seconds: number; queuedStatements: number;
  // ===== 20260908 추가 시작 : Overview Server Status 5단계 =====
  preparingStatements: number; initializingStatements: number; executingStatements: number; stoppingStatements: number;
  // ===== 20260908 추가 끝 : Overview Server Status 5단계 =====
}
export interface DashboardData { statements: StatementRow[]; performance: PerformanceRow[]; servers: ServerSummary[]; kpi: KpiData; }

export const EMPTY_KPI: KpiData = { migActive: Number.NaN, migTotal: Number.NaN, inQueue: Number.NaN, rowsPerSecond: Number.NaN, p95Seconds: Number.NaN, queuedStatements: Number.NaN, preparingStatements: Number.NaN, initializingStatements: Number.NaN, executingStatements: Number.NaN, stoppingStatements: Number.NaN };
const EMPTY: DashboardData = { statements: [], performance: [], servers: [], kpi: EMPTY_KPI };
const n = (v: number | null | undefined) => v == null ? Number.NaN : Number(v);

// ===== 20260908 추가 시작 : 기본 GPU/SQream 화면 - PromQL 제거, Main Overview DTO 직접 매핑 =====
export function useDashboardData(filters: Filters, _refreshSec: number, rangeSec: number, startMs: number | null, endMs: number | null): { data: DashboardData; failStreak: number; lastSuccessAt: number | null } {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const filtersRef = useRef(filters); filtersRef.current = filters;

  const tick = useCallback(async (signal: AbortSignal) => {
    const f = filtersRef.current;
    // ===== 20260908 추가 시작 : Overview 선택 조회기간 그대로 API 전달 =====
    const requestEndMs = endMs ?? Date.now();
    const requestStartMs = startMs ?? (requestEndMs - rangeSec * 1000);
    const apiFilters = { instances: f.instances, gpus: f.gpus, migs: f.migs };
    const [body, statusCounts] = await Promise.all([
      fetchMainOverview(requestStartMs, requestEndMs, apiFilters, signal),
      fetchMainStatusCounts(requestStartMs, requestEndMs, apiFilters, signal),
    ]);
    // ===== 20260908 추가 끝 : Overview 선택 조회기간 그대로 API 전달 =====

    const statements = (body.statements ?? []).filter((r) => !f.instances.length || f.instances.includes(r.node)).map((r) => ({
      stmtId: r.stmtId ?? "", queryId: r.queryId ?? "", user: r.user ?? "", node: r.node ?? "", gpu: r.gpu ?? "", mig: r.mig ?? "",
      worker: r.worker ?? "", service: r.service ?? "", qid: r.qid ?? "", qidTags: r.qidTags ?? "", connectionId: r.connectionId ?? "",
      memoryBytes: n(r.memoryBytes), gpuPct: n(r.gpuPct), cpuPct: n(r.cpuPct), startTimeSec: n(r.startTimeSec), elapsedSec: n(r.elapsedSec),
      progress: n(r.progress), spoolBytes: n(r.spoolBytes), vramBytes: n(r.vramBytes), lockHeldSec: n(r.lockHeldSec),
    }));
    const performance = (body.performance ?? []).filter((r) => !f.instances.length || f.instances.includes(r.node)).map((r) => ({
      queryName: r.queryName ?? "", queryType: r.queryType ?? "query", database: r.database ?? "", node: r.node ?? "", gpu: r.gpu ?? "", mig: r.mig ?? "",
      rowsPerSecond: n(r.rowsPerSecond), p95Seconds: n(r.p95Seconds), state: Number(r.state ?? 0),
    }));
    const servers = (body.servers ?? []).filter((r) => !f.instances.length || f.instances.includes(r.node)).map((r) => ({
      node: r.node ?? "", utilization: n(r.utilization), memoryPct: n(r.memoryPct), temperature: n(r.temperature), power: n(r.power),
      gpuTotal: Number(r.gpuTotal ?? 0), migTotal: Number(r.migTotal ?? 0), gpuBusy: Number(r.gpuBusy ?? 0),
    }));
    const k = body.kpi ?? {};
    setData({ statements, performance, servers, kpi: {
      migActive: n(k.migActive), migTotal: n(k.migTotal), inQueue: n(k.inQueue), rowsPerSecond: n(k.rowsPerSecond), p95Seconds: n(k.p95Seconds),
      queuedStatements: n(statusCounts.queuedStatements),
      preparingStatements: n(statusCounts.preparingStatements), initializingStatements: n(statusCounts.initializingStatements), executingStatements: n(statusCounts.executingStatements), stoppingStatements: n(statusCounts.stoppingStatements),
    } });
  }, []);

  const { failStreak, lastSuccessAt } = usePolling(tick, 0, [filters.env, filters.instances.join(","), filters.gpus.join(","), filters.migs.join(","), rangeSec, startMs, endMs]);
  useEffect(() => { if (failStreak >= DISCONNECT_THRESHOLD) setData(EMPTY); }, [failStreak]);
  return { data, failStreak, lastSuccessAt };
}
// ===== 20260908 추가 끝 : 기본 GPU/SQream 화면 - PromQL 제거, Main Overview DTO 직접 매핑 =====
