import { useCallback, useEffect, useRef, useState } from "react";

import { promQuery, scalarOf } from "../api/prom";
import { type Filters, rangeDetail } from "../api/queries";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

export interface RangeSelection {
  startMs: number;
  endMs: number;
}

export interface RangeDetailData {
  startMs: number;
  endMs: number;
  /** 구간에 활성한 (node,gpu) 수 */
  gpuCount: number;
  /** 구간의 서로 다른 query_id 수 */
  queryIdCount: number;
  /** 관여한 데이터베이스 이름 */
  databases: string[];
  rowsPerSecond: number;
  p95Seconds: number;
  queryCount: number;
  memoryBytes: number;
}

/**
 * 선택 구간 상세 — 브러시 선택(있으면 그 끝 시각·폭)으로, 없으면 전체 범위로 평가한다.
 *
 * 상태·신원·집계는 **선택 구간의 끝 시각(atMs)** 에서 instant 평가하고, `[window]`
 * 집계는 선택 폭을 창으로 쓴다(R2 rangeDetail). 필터·범위·선택 변경마다 재조회한다.
 */
export function useRangeDetail(
  filters: Filters,
  rangeSec: number,
  selection: RangeSelection | null,
  refreshSec: number,
): { detail: RangeDetailData | null; failStreak: number; lastSuccessAt: number | null } {
  const [detail, setDetail] = useState<RangeDetailData | null>(null);
  const paramsRef = useRef({ filters, rangeSec, selection });
  paramsRef.current = { filters, rangeSec, selection };

  const tick = useCallback(async (signal: AbortSignal) => {
    const { filters: f, rangeSec: rs, selection: sel } = paramsRef.current;
    const winSec = sel ? Math.max(1, Math.round((sel.endMs - sel.startMs) / 1000)) : rs;
    // 모든 instant 요청과 표시 구간을 **한 시각(evalMs)** 에 고정한다 — 요청마다 now가
    // 달라 상태·신원·메모리가 다른 순간에서 평가되는 것을 막는다 (CDX-R4).
    const evalMs = sel ? sel.endMs : Date.now();
    const q = rangeDetail(f, winSec);

    const [gpuState, queryIds, rows, p95, qcount, mem, dbs] = await Promise.all([
      promQuery(q.gpuState, signal, evalMs),
      promQuery(q.queryIds, signal, evalMs),
      promQuery(q.rowsPerSecond, signal, evalMs),
      promQuery(q.p95, signal, evalMs),
      promQuery(q.queryCount, signal, evalMs),
      promQuery(q.memoryBytes, signal, evalMs),
      promQuery(q.databases, signal, evalMs),
    ]);

    const endMs = evalMs;
    const startMs = sel ? sel.startMs : evalMs - rs * 1000;
    const databases = [...new Set(dbs.map((s) => s.metric.database).filter(Boolean))].sort();

    setDetail({
      startMs,
      endMs,
      gpuCount: gpuState.length,
      queryIdCount: queryIds.length,
      databases,
      rowsPerSecond: scalarOf(rows, Number.NaN),
      p95Seconds: scalarOf(p95, Number.NaN),
      queryCount: scalarOf(qcount, Number.NaN),
      memoryBytes: scalarOf(mem, Number.NaN),
    });
  }, []);

  const selKey = selection ? `${selection.startMs}-${selection.endMs}` : "none";
  const { failStreak, lastSuccessAt } = usePolling(tick, refreshSec * 1000, [
    filters.env,
    filters.instances.join(","),
    filters.gpus.join(","),
    filters.migs.join(","),
    rangeSec,
    selKey,
  ]);

  // 연결 끊김이면 상세 값을 비운다 — 정지된 숫자가 남지 않는다 (R7 C-4).
  useEffect(() => {
    if (failStreak >= DISCONNECT_THRESHOLD) setDetail(null);
  }, [failStreak]);

  return { detail, failStreak, lastSuccessAt };
}
