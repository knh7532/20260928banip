import { useCallback, useEffect, useRef, useState } from "react";

import { promQueryRange, resolveStep } from "../api/prom";
import {
  LLM_CATALOG,
  type Filters,
  llmGpuTimeseries,
  llmGpuTimeseriesAvg,
  llmTimeline,
} from "../api/queries";
import type { TimeseriesBundle } from "../components/charts/MetricStrip";
import { nodeGpuSeriesKey, nodeSeriesKey, toTimeSeries, type TimeSeries } from "../lib/series";
import { segmentTimeline, type CatalogEntry, type TimelineRow } from "../lib/timeline";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

const EMPTY_TS: TimeSeries = { x: [], lines: [] };
const EMPTY_BUNDLE: TimeseriesBundle = {
  utilization: EMPTY_TS,
  memory: EMPTY_TS,
  temperature: EMPTY_TS,
  power: EMPTY_TS,
};

/** 타임라인 step 상한 — 짧은 배치(60~300초)를 샘플 사이에 놓치지 않도록 (useCharts와 동일). */
const TIMELINE_MAX_STEP = 15;

/** LLM 카탈로그 → 세그먼트화 입력 (type=분류 — 색·범례 매핑 키). */
export const LLM_TIMELINE_CATALOG: Record<number, CatalogEntry> = Object.fromEntries(
  Object.entries(LLM_CATALOG).map(([idx, w]) => [
    idx,
    { name: w.label, type: w.category, database: "" },
  ]),
);

export interface LlmChartsData {
  series: TimeseriesBundle;
  timelineRows: TimelineRow[];
  domain: { startMs: number; endMs: number };
}

/**
 * LLM 화면 차트 훅 — GPU 단위 시계열 4종 + LLM 타임라인(12행)을 폴링한다.
 * useCharts와 1:1 미러. All 뷰도 GPU 단위 12선(3노드×4GPU — 라벨 "S01·GPU0")이다.
 */
export function useLlmCharts(
  filters: Filters,
  rangeSec: number,
  refreshSec: number,
): { data: LlmChartsData; failStreak: number; lastSuccessAt: number | null } {
  const [data, setData] = useState<LlmChartsData>({
    series: EMPTY_BUNDLE,
    timelineRows: [],
    domain: { startMs: 0, endMs: 0 },
  });
  const paramsRef = useRef({ filters, rangeSec });
  paramsRef.current = { filters, rangeSec };

  const tick = useCallback(async (signal: AbortSignal) => {
    const { filters: f, rangeSec: rs } = paramsRef.current;
    // All(선택 0)이면 노드 평균 3선 — GPU/SQream 화면과 동일 규칙(R9 F2.2 미러, 인간 지시).
    const allView = f.instances.length === 0;
    const gt = allView ? llmGpuTimeseriesAvg(f) : llmGpuTimeseries(f);
    const endMs = Math.floor(Date.now() / 1000) * 1000;
    const opts = { signal, endMs };

    const [util, mem, temp, pow, tl] = await Promise.all([
      promQueryRange(gt.utilization, rs, opts),
      promQueryRange(gt.memory, rs, opts),
      promQueryRange(gt.temperature, rs, opts),
      promQueryRange(gt.power, rs, opts),
      promQueryRange(llmTimeline(f), rs, { ...opts, maxStepSec: TIMELINE_MAX_STEP }),
    ]);

    const step = resolveStep(rs, { maxStepSec: TIMELINE_MAX_STEP });
    // All이면 노드 라벨 3선("icspreamh2gpu01"), 선택 시 GPU 단위 라인("GPU-0" / "S01·GPU0")
    const key = allView ? nodeSeriesKey() : nodeGpuSeriesKey(f.instances.length === 1);
    setData({
      series: {
        utilization: toTimeSeries(util, key),
        memory: toTimeSeries(mem, key),
        temperature: toTimeSeries(temp, key),
        power: toTimeSeries(pow, key),
      },
      timelineRows: segmentTimeline(tl, LLM_TIMELINE_CATALOG, step),
      domain: { startMs: endMs - rs * 1000, endMs },
    });
  }, []);

  const { failStreak, lastSuccessAt } = usePolling(tick, refreshSec * 1000, [
    filters.env,
    filters.instances.join(","),
    filters.gpus.join(","),
    rangeSec,
  ]);

  // 연결 끊김이면 차트·타임라인을 비운다 (R7 C-4).
  useEffect(() => {
    if (failStreak >= DISCONNECT_THRESHOLD) {
      setData({ series: EMPTY_BUNDLE, timelineRows: [], domain: { startMs: 0, endMs: 0 } });
    }
  }, [failStreak]);

  return { data, failStreak, lastSuccessAt };
}
