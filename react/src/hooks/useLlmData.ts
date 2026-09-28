import { useCallback, useEffect, useRef, useState } from "react";

import { promQuery, type PromSeries } from "../api/prom";
import {
  NODES,
  type Filters,
  llmProcesses,
  llmServerStatus,
  llmServices,
  serverCard,
} from "../api/queries";
import { cmpNumDesc, firstScalar, indexBy, valueOf } from "../lib/join";
import type { ServerSummary } from "./useDashboardData";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

/** ⑦ 실행 중 프로세스 테이블의 행 (pid 조인 결과). */
export interface LlmProcessRow {
  pid: string;
  procName: string;
  user: string;
  node: string;
  gpu: string;
  memoryBytes: number;
  gpuPct: number;
  cpuPct: number;
  startTimeSec: number;
}

/** ⑧ LLM/AI 서비스 테이블의 행 (service 조인 결과). */
export interface LlmServiceRow {
  service: string;
  model: string;
  engine: string;
  node: string;
  gpu: string;
  tps: number;
  p95Seconds: number;
  state: number;
}

export interface LlmData {
  processes: LlmProcessRow[];
  services: LlmServiceRow[];
  servers: ServerSummary[];
}

const EMPTY: LlmData = { processes: [], services: [], servers: [] };

export function buildLlmProcesses(res: {
  identity: PromSeries[];
  memory: PromSeries[];
  gpuPct: PromSeries[];
  cpuPct: PromSeries[];
  startTime: PromSeries[];
}): LlmProcessRow[] {
  const mem = indexBy(res.memory, "pid");
  const gpu = indexBy(res.gpuPct, "pid");
  const cpu = indexBy(res.cpuPct, "pid");
  const start = indexBy(res.startTime, "pid");
  return res.identity
    .map((s) => {
      const pid = s.metric.pid;
      return {
        pid,
        procName: s.metric.proc_name,
        user: s.metric.os_user,
        node: s.metric.node,
        gpu: s.metric.gpu,
        memoryBytes: valueOf(mem.get(pid)),
        gpuPct: valueOf(gpu.get(pid)),
        cpuPct: valueOf(cpu.get(pid)),
        startTimeSec: valueOf(start.get(pid)),
      };
    })
    // GPU 사용률 내림차순 (시안 정렬과 동일 규칙). 결측(NaN)은 최하위, pid로 tie-break.
    .sort((a, b) => cmpNumDesc(a.gpuPct, b.gpuPct) || a.pid.localeCompare(b.pid));
}

export function buildLlmServices(res: {
  tps: PromSeries[];
  p95: PromSeries[];
  state: PromSeries[];
}): LlmServiceRow[] {
  const p95 = indexBy(res.p95, "service");
  const state = indexBy(res.state, "service");
  return res.tps
    .map((s) => {
      const name = s.metric.service;
      return {
        service: name,
        model: s.metric.model,
        engine: s.metric.engine,
        node: s.metric.node,
        gpu: s.metric.gpu,
        tps: valueOf(s),
        p95Seconds: valueOf(p95.get(name)),
        state: valueOf(state.get(name)),
      };
    })
    // TPS 내림차순. 결측(NaN)은 최하위, service로 tie-break.
    .sort((a, b) => cmpNumDesc(a.tps, b.tps) || a.service.localeCompare(b.service));
}

/**
 * LLM 화면 데이터 조회 훅 — 프로세스·서비스 표와 서버 카드(GPU 단위)를 폴링한다.
 * useDashboardData와 1:1 미러 구조 — 화면별 훅 분리라 비마운트 화면은 폴링하지 않는다.
 */
export function useLlmData(
  filters: Filters,
  refreshSec: number,
): { data: LlmData; failStreak: number; lastSuccessAt: number | null } {
  const [data, setData] = useState<LlmData>(EMPTY);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const tick = useCallback(async (signal: AbortSignal) => {
    const f = filtersRef.current;
    const proc = llmProcesses(f);
    const svc = llmServices(f);

    const [identity, memory, gpuPct, cpuPct, startTime, tps, p95, state, ...serverResults] =
      await Promise.all([
        promQuery(proc.identity, signal),
        promQuery(proc.memory, signal),
        promQuery(proc.gpuPct, signal),
        promQuery(proc.cpuPct, signal),
        promQuery(proc.startTime, signal),
        promQuery(svc.tps, signal),
        promQuery(svc.p95, signal),
        promQuery(svc.state, signal),
        ...NODES.flatMap((node) => {
          const card = serverCard(node);
          const status = llmServerStatus(node);
          return [
            promQuery(card.utilization, signal),
            promQuery(card.memory, signal),
            promQuery(card.temperature, signal),
            promQuery(card.power, signal),
            promQuery(status.gpuTotal, signal),
            promQuery(status.gpuBusy, signal),
          ];
        }),
      ]);

    // GPU 단위 카드 — migTotal은 이 화면에서 쓰지 않으므로 NaN(표시 계층이 숨긴다).
    const servers: ServerSummary[] = NODES.map((node, i) => {
      const base = i * 6;
      return {
        node,
        utilization: firstScalar(serverResults[base]),
        memoryPct: firstScalar(serverResults[base + 1]),
        temperature: firstScalar(serverResults[base + 2]),
        power: firstScalar(serverResults[base + 3]),
        gpuTotal: firstScalar(serverResults[base + 4]),
        migTotal: Number.NaN,
        gpuBusy: firstScalar(serverResults[base + 5]),
      };
    });

    setData({
      processes: buildLlmProcesses({ identity, memory, gpuPct, cpuPct, startTime }),
      services: buildLlmServices({ tps, p95, state }),
      servers,
    });
  }, []);

  const { failStreak, lastSuccessAt } = usePolling(tick, refreshSec * 1000, [
    filters.env,
    filters.instances.join(","),
    filters.gpus.join(","),
  ]);

  // 연결 끊김이면 마지막 값(stale)을 지우고 공란으로 (R7 C-4).
  useEffect(() => {
    if (failStreak >= DISCONNECT_THRESHOLD) setData(EMPTY);
  }, [failStreak]);

  return { data, failStreak, lastSuccessAt };
}
