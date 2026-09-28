/**
 * Context 미니맵 + 브러시 (Focus+Context 줌, 2026-08-10 인간 지시) — ECharts 판 (E5 D3, 2026-09-07 승인).
 * d3.brushX 판과 props·동작이 같다:
 * 드래그로 확대 구간(절대 ms) 선택 → onZoom, 빈 곳 클릭 → 해제(null), `zoom` prop 변화는
 * `dispatchAction brush areas` 로 반영(재발화 없음 — brushEnd 는 사용자 mouseup 에만 온다).
 * 툴박스 없이 브러시를 쓰므로 setOption 뒤마다 takeGlobalCursor 로 커서를 다시 잡는다.
 */
import type { ECharts } from "echarts";
import { useEffect, useRef } from "react";

import { useEchart } from "../../hooks/useEchart";
import { themeTokens } from "../../lib/echartsTheme";
import type { TimeSeries } from "../../lib/series";
import { BRUSH_HEIGHT, brushAreas, brushOption, zoomFromBrushEnd } from "./chartBrushModel";
import type { ZoomWindow } from "./useFocusContext";

const BRUSH_CURSOR = {
  type: "takeGlobalCursor", key: "brush", brushOption: { brushType: "lineX", brushMode: "single" },
} as const;

interface ChartBrushProps {
  series: TimeSeries;
  zoom: ZoomWindow | null;
  onZoom: (z: ZoomWindow | null) => void;
}

/**
 * 점 1개로는 구간을 잡을 수 없다 → 렌더 안 함. 드릴다운 context 는 첫 조회 전 빈 시계열로
 * 오므로, canvas 는 데이터가 생긴 뒤 **마운트되는 내부 컴포넌트**가 만든다 — useEchart 의
 * init 은 마운트 1회라 바깥에서 null 을 먼저 반환하면 ref 없이 지나가 영영 안 만들어진다
 * (d3 판의 "g 가 마운트된 뒤 브러시 생성" 과 같은 함정).
 */
export function ChartBrush(props: ChartBrushProps) {
  if (props.series.x.length < 2) return null;
  return <BrushCanvas {...props} />;
}

function BrushCanvas({ series, zoom, onZoom }: ChartBrushProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  // 바깥 ChartBrush 가 x.length >= 2 를 보장한다
  const domainStart = series.x[0];
  const domainEnd = series.x[series.x.length - 1];
  const domainRef = useRef({ start: domainStart, end: domainEnd });
  domainRef.current = { start: domainStart, end: domainEnd };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const apply = (c: ECharts, s: TimeSeries) => {
    c.setOption(brushOption(s, themeTokens()), { replaceMerge: ["series"] });
    c.dispatchAction(BRUSH_CURSOR);
    const { start, end } = domainRef.current;
    c.dispatchAction({ type: "brush", areas: brushAreas(zoomRef.current, start, end) });
  };

  const chart = useEchart(hostRef, {
    fixedHeight: BRUSH_HEIGHT,
    onInit: (c) => {
      apply(c, series);
      c.on("brushEnd", (params: unknown) => {
        const { start, end } = domainRef.current;
        onZoomRef.current(zoomFromBrushEnd(params, start, end));
      });
    },
  });

  // 데이터(context 가 now 로 흐름)·줌이 바뀌면 옵션과 선택 영역을 다시 넣는다.
  useEffect(() => {
    const c = chart.current;
    /* v8 ignore next -- init 효과가 선행한다 */
    if (!c) return;
    apply(c, series);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, zoom]);

  return (
    <div
      ref={hostRef}
      className="sqm-brush"
      aria-label="구간 선택 미니맵 — 드래그로 확대, 빈 곳 클릭으로 해제"
      role="application"
    />
  );
}
