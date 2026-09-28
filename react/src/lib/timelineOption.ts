/**
 * 타임라인(간트) 옵션 빌더 + 기하 (E5 D4) — D3 `Timeline` 의 ECharts 판.
 *
 * 현행 SVG 는 `viewBox 0 0 1000 H` + width 100% / height auto 라 **모든 것이 폭에 비례해
 * 스케일**된다(글자·행 높이·여백까지). canvas 는 그런 일이 없으므로 같은 기하를 viewBox
 * 단위로 계산한 뒤 k = 폭/1000 을 곱해 픽셀로 넣는다. 행 배치는 d3 scaleBand(padding .25)
 * 공식 그대로, x 눈금은 scaleLinear(ms).ticks(6) 그대로(1·2·5 배수).
 *
 * 그리기는 custom 시리즈 3개(행 배경 · 세그먼트+라벨 · 행 라벨) — renderItem 은 여기서 미리
 * 계산한 도형(viewBox 단위)을 k 배 해 반환하므로 api 없이도 단위 테스트할 수 있다.
 */
import type { EChartsOption } from "echarts";

import type { ThemeTokens } from "./echartsTheme";
import { fitLabel, normalizeSelection, type TimelineRow } from "./timeline";
import { niceTicks } from "./xviewOption";

export const TL_W = 1000;
export const TL_M = { top: 8, right: 14, bottom: 22, left: 92 } as const;
/** d3 scaleBand padding — inner·outer 모두 .25, align .5 */
const BAND_PADDING = 0.25;

/** 행 높이 — 단일 인스턴스(≤8행)는 30, All(24행)은 12 (2026-09-04 축소). */
export function rowHeight(rowCount: number): number {
  return rowCount <= 8 ? 30 : 12;
}
/** 행 라벨 글자 크기(viewBox 단위) */
export function rowLabelFontSize(rowCount: number): number {
  return rowCount <= 8 ? 11 : 8;
}
/** 세그먼트 라벨 글자 크기 — 콤팩트 행은 행 라벨보다 1 작게 */
export function segLabelFontSize(rowCount: number): number {
  return rowCount <= 8 ? 11 : rowLabelFontSize(rowCount) - 1;
}

export interface BandScale {
  /** 행 간격 */
  step: number;
  /** 막대 높이 */
  bandwidth: number;
  /** 첫 행 시작 오프셋(range 시작 기준) */
  start: number;
}

/** d3 scaleBand().domain(n).range([0, n*rowH]).padding(.25) 와 같은 값. */
export function bandScale(n: number, rowH: number): BandScale {
  if (n <= 0) return { step: rowH, bandwidth: rowH * (1 - BAND_PADDING), start: 0 };
  const range = n * rowH;
  const step = range / Math.max(1, n - BAND_PADDING + 2 * BAND_PADDING);
  const bandwidth = step * (1 - BAND_PADDING);
  const start = (range - step * (n - BAND_PADDING)) * 0.5;
  return { step, bandwidth, start };
}

export interface TlGeometry {
  /** 폭/1000 스케일 계수 (폭 미상이면 1) */
  k: number;
  /** viewBox 높이 = top + n*rowH + bottom */
  H: number;
  rowH: number;
  band: BandScale;
  /** 플롯(viewBox 단위) */
  plot: { x0: number; x1: number; y0: number; y1: number };
  /** 캔버스 픽셀 크기 */
  width: number;
  height: number;
}

export function timelineGeometry(rowCount: number, width?: number): TlGeometry {
  const k = width && width > 0 ? width / TL_W : 1;
  const rowH = rowHeight(rowCount);
  const H = TL_M.top + rowCount * rowH + TL_M.bottom;
  return {
    k, H, rowH,
    band: bandScale(rowCount, rowH),
    plot: { x0: TL_M.left, x1: TL_W - TL_M.right, y0: TL_M.top, y1: TL_M.top + rowCount * rowH },
    width: TL_W * k,
    height: H * k,
  };
}

/** 행 i 의 막대 y(viewBox) */
export function rowY(geo: TlGeometry, i: number): number {
  return geo.plot.y0 + geo.band.start + i * geo.band.step;
}

export interface TlSegShape {
  x: number; y: number; w: number; h: number;
  color: string;
  /** 막대 안 라벨(없으면 null) */
  label: string | null;
  node: string; gpu: string;
  /** 네이티브 title 툴팁 문구 — "{행 라벨} · {쿼리명}" */
  title: string;
  highlight: boolean;
}

export interface TlRowShape {
  y: number; h: number;
  label: string;
  node: string; gpu: string;
  key: string;
}

export interface TlStyleOpts {
  colorOf: (type: string) => string;
  rowLabelOf: (node: string, gpu: string, mig: string, single: boolean) => string;
  single: boolean;
  // ===== 20260916 추가 : 실행시간(초) 이상 빨간 테두리 =====
  highlightThresholdMs?: number | null;
}

/** 행 도형(배경·라벨) — viewBox 단위 */
export function rowShapes(rows: readonly TimelineRow[], geo: TlGeometry, s: TlStyleOpts): TlRowShape[] {
  return rows.map((r, i) => ({
    y: rowY(geo, i), h: geo.band.bandwidth,
    label: s.rowLabelOf(r.node, r.gpu, r.mig, s.single),
    node: r.node, gpu: r.gpu, key: r.key,
  }));
}

/** 세그먼트 도형 — 도메인 clamp(CDX-R4-02)·최소 폭 1·우측 경계 안, 라벨 fitLabel. viewBox 단위 */
export function segmentShapes(
  rows: readonly TimelineRow[],
  domain: { startMs: number; endMs: number },
  geo: TlGeometry,
  s: TlStyleOpts,
): TlSegShape[] {
  const { x0: left, x1: right } = geo.plot;
  const span = Math.max(1, domain.endMs - domain.startMs);
  const px = (ms: number) => left + ((ms - domain.startMs) / span) * (right - left);
  const out: TlSegShape[] = [];
  rows.forEach((r, i) => {
    const yy = rowY(geo, i);
    for (const d of r.segments) {
      const a = Math.max(left, Math.min(px(d.startMs), right));
      const b = Math.max(left, Math.min(px(d.endMs), right));
      if (b <= a) continue;
      const w = Math.max(1, b - a);
      const x = Math.min(a, right - w);
      out.push({
        x, y: yy, w, h: geo.band.bandwidth,
        color: s.colorOf(d.type),
        label: fitLabel(d.name, w),
        node: d.node, gpu: d.gpu,
        title: `${s.rowLabelOf(d.node, d.gpu, d.mig, s.single)} · ${d.serviceName ?? d.name} · ${((d.executionTimeMs ?? 0) / 1000).toFixed(3)}초`,
        highlight: s.highlightThresholdMs != null && s.highlightThresholdMs > 0 && (d.executionTimeMs ?? 0) >= s.highlightThresholdMs,
      });
    }
  });
  return out;
}

/** #rrggbb → rgba(r,g,b,a). 그 외 형식은 그대로(이미 rgba 등). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ── renderItem 결과 (ECharts custom 시리즈 요소) — 순수 함수로 두어 api 목 없이 테스트 ── */
type El = Record<string, unknown>;

export function renderRowBg(shape: TlRowShape, geo: TlGeometry, tokens: ThemeTokens): El {
  const { k, plot } = geo;
  return {
    type: "rect", silent: true,
    shape: { x: plot.x0 * k, y: shape.y * k, width: (plot.x1 - plot.x0) * k, height: shape.h * k },
    style: { fill: tokens.panelAlt },
  };
}

export function renderRowLabel(shape: TlRowShape, geo: TlGeometry, tokens: ThemeTokens, rowCount: number): El {
  const { k, plot } = geo;
  return {
    type: "text",
    cursor: "pointer",
    x: (plot.x0 - 8) * k, y: (shape.y + shape.h / 2) * k,
    style: {
      text: shape.label, fill: tokens.text2,
      fontSize: rowLabelFontSize(rowCount) * k, fontFamily: tokens.fontMono,
      align: "right", verticalAlign: "middle",
    },
  };
}

export function renderSegment(shape: TlSegShape, geo: TlGeometry, tokens: ThemeTokens, rowCount: number): El {
  const { k } = geo;
  const rect: El = {
    type: "rect",
    cursor: "pointer",
    shape: { x: shape.x * k, y: shape.y * k, width: shape.w * k, height: shape.h * k, r: 2 * k },
    style: { fill: shape.color, stroke: shape.highlight ? "#ff3b30" : undefined, lineWidth: shape.highlight ? Math.max(3, 3 * k) : 0 },
    // .tl-seg:hover { opacity: .85 }
    emphasis: { style: { opacity: 0.85 } },
  };
  if (shape.label === null) return rect;
  return {
    type: "group",
    children: [
      rect,
      {
        type: "text", silent: true,
        x: (shape.x + 4) * k, y: Math.max(2 * k, (shape.y - 1) * k),
        style: {
          text: shape.label, fill: tokens.text,
          fontSize: segLabelFontSize(rowCount) * k, fontFamily: tokens.font,
          verticalAlign: "bottom",
        },
      },
    ],
  };
}

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 선택 영역 스타일 — `.tl-brush .selection`(link 14% 채움 · 60% 테두리) */
export function timelineBrushStyle(tokens: ThemeTokens): { color: string; borderColor: string; borderWidth: number } {
  return { color: withAlpha(tokens.link, 0.14), borderColor: withAlpha(tokens.link, 0.6), borderWidth: 1 };
}

/** 선택(절대 ms) → brush areas(도메인 clamp, 겹침 없으면 []) */
export function timelineBrushAreas(
  selection: { startMs: number; endMs: number } | null,
  domain: { startMs: number; endMs: number },
): Array<{ brushType: "lineX"; xAxisIndex: number; coordRange: [number, number] }> {
  if (!selection || domain.endMs <= domain.startMs) return [];
  const sel = normalizeSelection(selection.startMs, selection.endMs, domain.startMs, domain.endMs);
  return sel ? [{ brushType: "lineX", xAxisIndex: 0, coordRange: [sel.startMs, sel.endMs] }] : [];
}

/** brushEnd params → 선택 구간(빈 영역=해제) */
export function selectionFromBrushEnd(
  params: unknown,
  domain: { startMs: number; endMs: number },
): { startMs: number; endMs: number } | null {
  const p = params as { areas?: Array<{ coordRange?: [number, number] }> } | undefined;
  const range = p?.areas?.[0]?.coordRange;
  if (!range) return null;
  return normalizeSelection(range[0], range[1], domain.startMs, domain.endMs);
}

export interface TlDatum { value: number; node: string; gpu: string; title?: string }

export function timelineOption(
  rows: readonly TimelineRow[],
  domain: { startMs: number; endMs: number },
  geo: TlGeometry,
  tokens: ThemeTokens,
  s: TlStyleOpts,
): EChartsOption {
  const { k, plot } = geo;
  const n = rows.length;
  const rowsS = rowShapes(rows, geo, s);
  const segs = segmentShapes(rows, domain, geo, s);
  const ticks = niceTicks(domain.startMs, domain.endMs, 6);
  const tickLen = 6 * k;
  return {
    animation: false,
    grid: {
      left: plot.x0 * k, right: (TL_W - plot.x1) * k, top: plot.y0 * k, bottom: (geo.H - plot.y1) * k,
      containLabel: false,
    },
    xAxis: {
      type: "time",
      min: domain.startMs,
      max: domain.endMs,
      axisLine: { lineStyle: { color: tokens.border } },
      axisTick: { length: tickLen, lineStyle: { color: tokens.border }, customValues: ticks },
      axisLabel: {
        color: tokens.text3, fontSize: 10 * k, fontFamily: tokens.font, margin: 3 * k + tickLen,
        hideOverlap: true, customValues: ticks, formatter: (v: number) => hhmm(v),
      },
      splitLine: { show: false },
    },
    // 세로는 custom 시리즈가 픽셀로 직접 놓는다 — 축은 좌표계 성립용
    yAxis: { type: "value", min: 0, max: 1, show: false },
    tooltip: { show: false },
    brush: {
      toolbox: [],
      xAxisIndex: 0,
      brushType: "lineX",
      brushMode: "single",
      transformable: true,
      removeOnClick: true,
      brushStyle: timelineBrushStyle(tokens),
      outOfBrush: { colorAlpha: 1 },
      throttleType: "debounce",
      throttleDelay: 0,
      z: 10_000,
    },
    series: [
      {
        id: "rowbg", type: "custom", silent: true, z: 1,
        data: rowsS.map((r, i) => ({ value: i, node: r.node, gpu: r.gpu })),
        renderItem: (params: { dataIndex: number }) => renderRowBg(rowsS[params.dataIndex], geo, tokens) as never,
      },
      {
        id: "segments", type: "custom", z: 3,
        data: segs.map((g, i) => ({ value: i, node: g.node, gpu: g.gpu, title: g.title })),
        renderItem: (params: { dataIndex: number }) => renderSegment(segs[params.dataIndex], geo, tokens, n) as never,
      },
      {
        id: "rowlabels", type: "custom", z: 2,
        data: rowsS.map((r, i) => ({ value: i, node: r.node, gpu: r.gpu })),
        renderItem: (params: { dataIndex: number }) => renderRowLabel(rowsS[params.dataIndex], geo, tokens, n) as never,
      },
    ],
  };
}
