/**
 * ECharts 인스턴스 생명주기 훅 (Phase E5).
 *
 * `MetricChart.tsx`의 규약을 일반화했다: **init은 마운트 시 1회**(컨테이너 실측 크기, canvas),
 * 이후 갱신은 호출자가 `chart.current.setOption`으로, 언마운트 시 dispose. 크기 변화는
 * `useChartResize`가 `resize`하고, 크기에 따라 옵션 자체가 달라지는 차트(게이지 반지름·
 * 타임라인 스케일 계수)는 `onResize(size)`로 다시 그린다.
 *
 * 테스트(jsdom)에서는 `tests/setup.ts`의 전역 echarts 스텁이 init을 가로챈다.
 */
import * as echarts from "echarts";
import { type RefObject, useEffect, useRef } from "react";

import { useChartResize } from "./useChartResize";

export interface ChartSize {
  width: number;
  height: number;
}

export function useEchart<T extends HTMLElement>(
  hostRef: RefObject<T>,
  opts: {
    /** 생성 직후 1회 — 첫 옵션을 넣는다. size 는 실측(0이면 undefined). */
    onInit: (chart: echarts.ECharts, size: ChartSize | undefined) => void;
    /** 컨테이너 크기 변화 — resize 는 훅이 먼저 하고, 옵션 재계산이 필요하면 여기서. */
    onResize?: (chart: echarts.ECharts, size: ChartSize) => void;
    /** 캔버스 높이를 호출자가 정하는 차트(타임라인) — 실측 대신 이 높이로 init 한다. */
    fixedHeight?: number;
  },
): RefObject<echarts.ECharts | null> {
  const chart = useRef<echarts.ECharts | null>(null);
  // 콜백은 ref 로 최신을 본다 — deps 에 넣으면 init 이 반복된다(MetricChart 의 pickRef 규칙).
  const onInitRef = useRef(opts.onInit);
  onInitRef.current = opts.onInit;
  const onResizeRef = useRef(opts.onResize);
  onResizeRef.current = opts.onResize;
  const fixedHeight = opts.fixedHeight;

  useEffect(() => {
    /* v8 ignore next -- React 가 커밋 후 ref 를 보장한다 (TS 내로잉용) */
    if (!hostRef.current) return;
    const { clientWidth: w, clientHeight: h } = hostRef.current;
    const height = fixedHeight ?? h;
    const size = w > 0 && height > 0 ? { width: w, height } : undefined;
    const c = echarts.init(hostRef.current, null, { renderer: "canvas", ...(size ?? {}) });
    chart.current = c;
    onInitRef.current(c, size);
    return () => {
      /* v8 ignore next */
      chart.current?.dispose();
      chart.current = null;
    };
    // init 은 마운트 시 1회 — fixedHeight 변화는 아래 resize 경로가 처리한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useChartResize(hostRef, chart, (size) => {
    const c = chart.current;
    /* v8 ignore next */
    if (!c) return;
    onResizeRef.current?.(c, size);
  });

  // 고정 높이가 바뀌면(타임라인 행 수 변화) resize 로 반영한다.
  useEffect(() => {
    const c = chart.current;
    if (!c || fixedHeight === undefined) return;
    const width = hostRef.current?.clientWidth ?? 0;
    if (width <= 0) return;
    c.resize({ width, height: fixedHeight });
    onResizeRef.current?.(c, { width, height: fixedHeight });
  }, [fixedHeight, hostRef]);

  return chart;
}
