/**
 * ChartBrush 의 순수 옵션·범위 헬퍼 — 컴포넌트 파일과 분리(react-refresh 규칙,
 * `toolbarModel.ts` 와 같은 이유). jsdom 없이 테스트한다. (E5 D3: ECharts 판, SVG linePath 삭제)
 */
import type { EChartsOption } from "echarts";

import { seriesColor } from "../../lib/colors";
import type { ThemeTokens } from "../../lib/echartsTheme";
import type { TimeSeries } from "../../lib/series";
import { normalizeSelection } from "../../lib/timeline";

export const BRUSH_HEIGHT = 48;
export const BRUSH_PAD = { top: 4, bottom: 4 };

/** 선택 영역 채움 — drilldown.css `.sqm-brush .selection` 의 rgb(79 195 247 / 18%) 그대로. */
export const BRUSH_SELECTION_FILL = "rgba(79, 195, 247, 0.18)";

/** 전 계열 공통 y 범위 [0, max] — 미니맵은 모양만 전달한다(유효값 없거나 max<=0 이면 [0,1]). */
export function brushValueRange(series: TimeSeries): readonly [number, number] {
  const vals = series.lines.flatMap((l) =>
    l.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (vals.length === 0) return [0, 1];
  const max = Math.max(...vals);
  return [0, max > 0 ? max : 1];
}

/**
 * y 축 범위 — SVG 시절 선은 위아래 4px 패딩 안(48 중 40)에 그려졌다. canvas 는 grid 를
 * 상자 전체(브러시가 전 높이를 덮어야 한다)로 두고, 대신 값 축을 4/40 만큼 늘려 같은
 * 픽셀 위치에 놓는다.
 */
export function brushAxisRange(lo: number, hi: number): { min: number; max: number } {
  const innerH = BRUSH_HEIGHT - BRUSH_PAD.top - BRUSH_PAD.bottom;
  const span = Math.max(hi - lo, 1e-9);
  return {
    min: lo - (span * BRUSH_PAD.bottom) / innerH,
    max: hi + (span * BRUSH_PAD.top) / innerH,
  };
}

/** 미니맵 옵션 — 축·툴팁·호버 없음, 계열별 1px 선, lineX 브러시(툴박스 없이). */
export function brushOption(series: TimeSeries, tokens: ThemeTokens): EChartsOption {
  const [lo, hi] = brushValueRange(series);
  const y = brushAxisRange(lo, hi);
  const domainStart = series.x[0] ?? 0;
  const domainEnd = series.x[series.x.length - 1] ?? 0;
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
    xAxis: { type: "time", min: domainStart, max: domainEnd, show: false },
    yAxis: { type: "value", min: y.min, max: y.max, show: false },
    tooltip: { show: false },
    brush: {
      toolbox: [],
      xAxisIndex: 0,
      brushType: "lineX",
      brushMode: "single",
      transformable: true,
      removeOnClick: true,
      brushStyle: { color: BRUSH_SELECTION_FILL, borderColor: tokens.accent, borderWidth: 1 },
      // 영역 밖 계열을 흐리지 않는다 — 미니맵 선은 위치 감각용이라 원색 유지.
      outOfBrush: { colorAlpha: 1 },
      throttleType: "debounce",
      throttleDelay: 0,
      z: 10_000,
    },
    series: series.lines.map((l) => ({
      id: l.id,
      name: l.label,
      type: "line" as const,
      showSymbol: false,
      silent: true,
      connectNulls: false,
      lineStyle: { width: 1, color: seriesColor(l.colorKey) },
      emphasis: { disabled: true },
      data: series.x.map((t, i) => [t, l.values[i]] as [number, number | null]),
    })),
  };
}

/** `dispatchAction({type:"brush"})` 인자 — 줌(절대 ms)을 도메인에 clamp, 겹침 없으면 빈 영역. */
export function brushAreas(
  zoom: { startMs: number; endMs: number } | null,
  domainStart: number,
  domainEnd: number,
): Array<{ brushType: "lineX"; xAxisIndex: number; coordRange: [number, number] }> {
  if (!zoom || domainEnd <= domainStart) return [];
  const sel = normalizeSelection(zoom.startMs, zoom.endMs, domainStart, domainEnd);
  return sel ? [{ brushType: "lineX", xAxisIndex: 0, coordRange: [sel.startMs, sel.endMs] }] : [];
}

/** brushEnd params → 줌 창 (빈 영역=해제, 역순·도메인 밖은 normalizeSelection 규칙). */
export function zoomFromBrushEnd(
  params: unknown,
  domainStart: number,
  domainEnd: number,
): { startMs: number; endMs: number } | null {
  const p = params as { areas?: Array<{ coordRange?: [number, number] }> } | undefined;
  const range = p?.areas?.[0]?.coordRange;
  if (!range) return null;
  return normalizeSelection(range[0], range[1], domainStart, domainEnd);
}
