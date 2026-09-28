import { type RefObject, useEffect, useRef } from "react";

/** ECharts 인스턴스(useEchart 경유 전 차트 공용) — 이 시그니처의 resize 를 갖는다. (C3 는 E5 에서 제거) */
interface Resizable {
  resize(size: { width: number; height: number }): unknown;
}

/**
 * Resize a generated chart to its actual CSS container without regenerating it.
 * `onResized`(E5, 옵셔널)는 resize 뒤에 실측 크기를 넘긴다 — 크기에 따라 옵션이 달라지는
 * 차트(게이지 반지름·타임라인 스케일)가 다시 그릴 때 쓴다. 기존 호출부(MetricChart)는 불변.
 */
export function useChartResize<T extends HTMLElement>(
  containerRef: RefObject<T>,
  chartRef: RefObject<Resizable | null>,
  onResized?: (size: { width: number; height: number }) => void,
) {
  const onResizedRef = useRef(onResized);
  onResizedRef.current = onResized;
  const lastSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    /* v8 ignore next -- React commit supplies the ref; the guard keeps the hook safe in non-DOM hosts. */
    if (!container || typeof ResizeObserver === "undefined") return;

    let active = true;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!active || !entry) return;

      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;
      if (lastSize.current.width === width && lastSize.current.height === height) return;

      const chart = chartRef.current;
      /* v8 ignore next -- the chart generate effect is registered before this observer effect. */
      if (!chart) return;
      lastSize.current = { width, height };
      chart.resize({ width, height });
      onResizedRef.current?.({ width, height });
    });

    observer.observe(container);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [chartRef, containerRef]);
}
