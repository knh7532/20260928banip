import { useCallback, useEffect, useRef, useState } from "react";

import { promQuery, scalarOf } from "../api/prom";
import { type Filters, llmRangeDetail } from "../api/queries";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";
import type { RangeSelection } from "./useRangeDetail";

export interface LlmRangeDetailData {
  startMs: number;
  endMs: number;
  /** 구간 끝에 워크로드가 실행 중인 (node,gpu) 수 */
  gpuCount: number;
  /** 실행 중 프로세스명 목록 (중복 제거) */
  procNames: string[];
  /** 활동 중(TPS>0) 모델 목록 */
  models: string[];
  tps: number;
  p95Seconds: number;
  requestCount: number;
  memoryBytes: number;
}

/**
 * LLM 선택 구간 상세 — useRangeDetail과 1:1 미러 (평가 시각·창 규칙 동일).
 * 시안 8항목 중 시간 구간은 TimeRangePanel, 나머지 7행을 이 데이터로 그린다.
 */
export function useLlmRangeDetail(
  filters: Filters,
  rangeSec: number,
  selection: RangeSelection | null,
  refreshSec: number,
): { detail: LlmRangeDetailData | null; failStreak: number; lastSuccessAt: number | null } {
  const [detail, setDetail] = useState<LlmRangeDetailData | null>(null);
  const paramsRef = useRef({ filters, rangeSec, selection });
  paramsRef.current = { filters, rangeSec, selection };

  const tick = useCallback(async (signal: AbortSignal) => {
    const { filters: f, rangeSec: rs, selection: sel } = paramsRef.current;
    const winSec = sel ? Math.max(1, Math.round((sel.endMs - sel.startMs) / 1000)) : rs;
    const evalMs = sel ? sel.endMs : Date.now();
    const q = llmRangeDetail(f, winSec);

    const [gpuState, procs, models, tps, p95, reqs, mem] = await Promise.all([
      promQuery(q.gpuState, signal, evalMs),
      promQuery(q.procs, signal, evalMs),
      promQuery(q.models, signal, evalMs),
      promQuery(q.tps, signal, evalMs),
      promQuery(q.p95, signal, evalMs),
      promQuery(q.requestCount, signal, evalMs),
      promQuery(q.memoryBytes, signal, evalMs),
    ]);

    const endMs = evalMs;
    const startMs = sel ? sel.startMs : evalMs - rs * 1000;
    const procNames = [...new Set(procs.map((s) => s.metric.proc_name).filter(Boolean))].sort();
    const modelNames = [...new Set(models.map((s) => s.metric.model).filter(Boolean))].sort();

    setDetail({
      startMs,
      endMs,
      gpuCount: gpuState.length,
      procNames,
      models: modelNames,
      tps: scalarOf(tps, Number.NaN),
      p95Seconds: scalarOf(p95, Number.NaN),
      requestCount: scalarOf(reqs, Number.NaN),
      memoryBytes: scalarOf(mem, Number.NaN),
    });
  }, []);

  const selKey = selection ? `${selection.startMs}-${selection.endMs}` : "none";
  const { failStreak, lastSuccessAt } = usePolling(tick, refreshSec * 1000, [
    filters.env,
    filters.instances.join(","),
    filters.gpus.join(","),
    rangeSec,
    selKey,
  ]);

  // 연결 끊김이면 상세 값을 비운다 (R7 C-4).
  useEffect(() => {
    if (failStreak >= DISCONNECT_THRESHOLD) setDetail(null);
  }, [failStreak]);

  return { detail, failStreak, lastSuccessAt };
}
