/**
 * Focus + Context 줌 상태 훅 (2026-08-10, 인간 지시).
 *
 * Context(전체 구간, 미니맵)는 기존 `useRangeSeries` 그대로 — 툴바 주기로 계속
 * 갱신된다. 브러시로 구간을 잡으면 Focus 는 그 창을 **더 촘촘한 step 으로 재조회**
 * 한다(사용자 확정 — 로컬 확대는 점이 모자라 뭉개진다). 줌이 없으면 Focus 는
 * Context 를 그대로 쓴다 — 추가 조회 없음, 현행과 같은 비용.
 *
 * 줌 창은 과거의 고정 구간이므로 Focus 폴링은 동결한다(refreshMs=0 → usePolling 이
 * 첫 조회만). 툴바 구간(rangeSec)이 바뀌면 줌은 자동 해제된다 — 옛 창이 새 구간
 * 밖일 수 있고, 사용자가 축을 갈아탄 것이기도 하다.
 */
import { useEffect, useState } from "react";

import { MIN_STEP_S } from "../../api/prom";
import type { TimeSeries } from "../../lib/series";
import { type ChartSpec, useRangeSeries } from "./useRangeSeries";

export interface ZoomWindow {
  startMs: number;
  endMs: number;
}

/** 줌 창의 재조회 step(초) — 60점 목표, scrape 주기(MIN_STEP_S) 아래로는 안 내려간다. */
export function zoomStepSec(zoom: ZoomWindow): number {
  return Math.max(MIN_STEP_S, Math.floor((zoom.endMs - zoom.startMs) / 1000 / 60));
}

/** 브러시 최소 폭 — 기존 step 2칸 미만이면 확대해도 점이 1~2개라 의미가 없다. */
export function minZoomMs(stepSec: number): number {
  return stepSec * 2 * 1000;
}

export function useFocusContext(
  specs: ChartSpec[],
  rangeSec: number,
  refreshMs: number,
  stepSec = 15,
): {
  focus: TimeSeries;
  context: TimeSeries;
  failed: boolean;
  zoom: ZoomWindow | null;
  setZoom: (z: ZoomWindow | null) => void;
} {
  const [zoom, setZoomState] = useState<ZoomWindow | null>(null);

  // 툴바 구간이 바뀌면 줌 해제 — 이전 창은 새 축의 밖일 수 있다.
  useEffect(() => {
    setZoomState(null);
  }, [rangeSec]);

  const setZoom = (z: ZoomWindow | null) => {
    // 너무 좁은 브러시는 해제로 취급한다 — "무시"하면 d3 쪽 시각적 선택만 남아
    // 화면과 상태가 어긋난다(codex Z2-01). 클릭에 가까운 제스처이기도 하다.
    setZoomState(z !== null && z.endMs - z.startMs < minZoomMs(stepSec) ? null : z);
  };

  const contextQ = useRangeSeries(specs, rangeSec, refreshMs, stepSec);

  // 줌 창 재조회. 줌이 없을 때도 훅 호출 순서는 유지해야 하므로(React 규칙)
  // specs 를 비워 조회 자체를 없앤다 — usePolling 은 빈 allSettled 로 즉시 끝난다.
  const zoomRangeSec = zoom ? Math.max(1, Math.round((zoom.endMs - zoom.startMs) / 1000)) : rangeSec;
  const focusQ = useRangeSeries(
    zoom ? specs : [],
    zoomRangeSec,
    0, // 과거의 고정 창 — 폴링 동결
    zoom ? zoomStepSec(zoom) : stepSec,
    zoom ? { endMs: zoom.endMs, failThreshold: 1 } : undefined,
  );

  // 창 A→B 직행 시 A 의 샘플이 B 의 축 아래 남지 않게 — 받은 데이터가 현재 창
  // 안의 것일 때만 쓴다(codex Z1-02). 아니면 잠시 "데이터 없음"이 옳다.
  const SLACK_MS = 120_000;
  const fx = focusQ.series.x;
  const focusValid = zoom !== null && fx.length > 0
    && fx[0] >= zoom.startMs - SLACK_MS && fx[fx.length - 1] <= zoom.endMs + SLACK_MS;

  return {
    focus: zoom ? (focusValid ? focusQ.series : { x: [], lines: [] }) : contextQ.series,
    context: contextQ.series,
    failed: zoom ? focusQ.failed || contextQ.failed : contextQ.failed,
    zoom,
    setZoom,
  };
}
