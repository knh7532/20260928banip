/**
 * X-View 산점도 옵션 빌더 + 좌표 헬퍼 (E5 D2) — D3 `XViewChart` 의 ECharts 판.
 *
 * 현행 규격을 그대로 옮긴다: 여백 M={8,10,20,36} · x=종료 시각(도메인 고정) · y=소요초
 * [0, max(30, 최대×1.1)] 눈금 4 · 성공=원(r 3.5, 유형색, 채움 85%) · 실패=✕(반지름 4,
 * 유형색 stroke 1.6 — 모양이 1차 채널, X2) · 고정 점 강조(r+2.5, 흰 테두리 1.2 / ✕ 2.8) ·
 * 드래그 중 영역 밖 점 dim(합성 불투명도 .22).
 *
 * 현행 SVG 는 `viewBox 0 0 460 200` + preserveAspectRatio 기본(meet) 이라 상자 종횡비가
 * 다르면 작은 비율로 축소돼 가운데 정렬된다(글자·점도 함께 작아진다). canvas 는 그런 일이
 * 없으므로 같은 기하(k·오프셋)를 계산해 옵션에 픽셀로 넣는다 — 픽셀↔값 환산(휠 앵커·드래그
 * 범위·영역 안 판정)도 전부 여기의 순수 스케일이 담당한다(단위 테스트 대상).
 */
import type { EChartsOption } from "echarts";

import { queryTypeColor } from "./colors";
import type { ThemeTokens } from "./echartsTheme";
import { typeOfQuery, type XViewEvent } from "./xview";

export const XV_MARGIN = { top: 8, right: 10, bottom: 20, left: 36 } as const;
export const XV_FALLBACK_SIZE = { width: 460, height: 200 } as const;
export const XV_DOT_R = 3.5;
export const XV_FAIL_R = 4;
export const XV_DOT_OPACITY = 0.85;
/** 영역 밖 dim — SVG 시절 `opacity:.22` 를 채움 .85 위에 곱한 합성값(성공) / 스트로크 그대로(실패). */
export const XV_DIM_DOT_OPACITY = 0.187;
export const XV_DIM_FAIL_OPACITY = 0.22;
/** 실패 ✕ 경로 — 중심 기준 ±4. */
export const XV_FAIL_SYMBOL = `path://M${-XV_FAIL_R},${-XV_FAIL_R}L${XV_FAIL_R},${XV_FAIL_R}M${XV_FAIL_R},${-XV_FAIL_R}L${-XV_FAIL_R},${XV_FAIL_R}`;

export interface XvGeometry {
  width: number;
  height: number;
  /** viewBox(460×200) → 상자 스케일 계수 = min(w/460, h/200). SVG `meet` 규칙 그대로. */
  k: number;
  /** letterbox 오프셋(픽셀) — 축소된 viewBox 를 상자 가운데에 놓는다. */
  ox: number;
  oy: number;
  /** 플롯 사각형(픽셀) */
  plot: { x0: number; x1: number; y0: number; y1: number };
}

/** 크기를 모르면(jsdom·첫 렌더 전) k=1, 460×200. */
export function xviewGeometry(size?: { width: number; height: number }): XvGeometry {
  const width = size && size.width > 0 ? size.width : XV_FALLBACK_SIZE.width;
  const height = size && size.height > 0 ? size.height : XV_FALLBACK_SIZE.height;
  const k = Math.min(width / XV_FALLBACK_SIZE.width, height / XV_FALLBACK_SIZE.height);
  const ox = (width - XV_FALLBACK_SIZE.width * k) / 2;
  const oy = (height - XV_FALLBACK_SIZE.height * k) / 2;
  return {
    width, height, k, ox, oy,
    plot: {
      x0: ox + XV_MARGIN.left * k,
      x1: ox + (XV_FALLBACK_SIZE.width - XV_MARGIN.right) * k,
      y0: oy + XV_MARGIN.top * k,
      y1: oy + (XV_FALLBACK_SIZE.height - XV_MARGIN.bottom) * k,
    },
  };
}

export interface XvScales {
  yMax: number;
  x: (ms: number) => number;
  xInv: (px: number) => number;
  y: (sec: number) => number;
  yInv: (py: number) => number;
  clampX: (px: number) => number;
  clampY: (py: number) => number;
}

export function xviewYMax(events: readonly XViewEvent[]): number {
  let maxDur = 0;
  for (const e of events) if (e.durationSec > maxDur) maxDur = e.durationSec;
  return Math.max(30, maxDur * 1.1);
}

export function xviewScales(
  domain: { startMs: number; endMs: number },
  events: readonly XViewEvent[],
  geo: XvGeometry,
): XvScales {
  const { x0, x1, y0, y1 } = geo.plot;
  const pw = Math.max(1, x1 - x0);
  const ph = Math.max(1, y1 - y0);
  const span = Math.max(1, domain.endMs - domain.startMs);
  const yMax = xviewYMax(events);
  return {
    yMax,
    x: (ms) => x0 + ((ms - domain.startMs) / span) * pw,
    xInv: (px) => domain.startMs + ((px - x0) / pw) * span,
    y: (sec) => y1 - (sec / yMax) * ph,
    yInv: (py) => ((y1 - py) / ph) * yMax,
    clampX: (px) => Math.min(Math.max(px, x0), x1),
    clampY: (py) => Math.min(Math.max(py, y0), y1),
  };
}

export const xviewKey = (e: XViewEvent): string => `${e.stmtId}|${e.endMs}`;

export interface XvState {
  /** 고정된 점 키 — 강조. */
  pinnedKey?: string | null;
  /** 드래그 중 영역 안 키 집합 — 있으면 나머지를 dim. */
  inZone?: ReadonlySet<string> | null;
}

/** 데이터 아이템 — 이벤트 역참조용 key 를 실어 이벤트 핸들러가 찾는다. */
export interface XvDatum {
  value: [number, number];
  key: string;
  itemStyle: { color: string; opacity?: number; borderColor?: string; borderWidth?: number };
  symbolSize?: number;
}

/** d3 `ticks(count)` 의 눈금 간격 — 1·2·5×10^k 중 count 에 가장 가까운 것 (d3-array tickStep). */
export function niceStep(span: number, count: number): number {
  if (span <= 0 || count <= 0) return 1;
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / pow;
  const factor = err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.sqrt(2) ? 2 : 1;
  return pow * factor;
}

/** d3 `ticks(count)` 의 눈금 값 — step 의 배수 중 [lo, hi] 안. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  const step = niceStep(hi - lo, count);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** d3 시간축 ticks(count) 의 간격(ms) — 초·분·시 단위의 관습적 후보 중 가장 가까운 것 (참고용). */
const TIME_STEPS_MS = [
  1000, 5_000, 15_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 86_400_000,
];
export function niceTimeStep(spanMs: number, count: number): number {
  const target = spanMs / Math.max(1, count);
  let best = TIME_STEPS_MS[0];
  for (const step of TIME_STEPS_MS) {
    if (Math.abs(Math.log(step / target)) < Math.abs(Math.log(best / target))) best = step;
  }
  return best;
}

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function xviewOption(
  events: readonly XViewEvent[],
  domain: { startMs: number; endMs: number },
  geo: XvGeometry,
  tokens: ThemeTokens,
  state: XvState = {},
): EChartsOption {
  const yMax = xviewYMax(events);
  const { k, plot } = geo;
  const dimming = state.inZone != null;
  const ok: XvDatum[] = [];
  const fail: XvDatum[] = [];
  for (const e of events) {
    const key = xviewKey(e);
    const color = queryTypeColor(typeOfQuery(e.queryName));
    const pinned = state.pinnedKey === key;
    const dim = dimming && !state.inZone!.has(key);
    if (e.status === "failed") {
      fail.push({
        value: [e.endMs, e.durationSec], key,
        itemStyle: {
          color: "none", borderColor: color,
          borderWidth: (pinned ? 2.8 : 1.6) * k,
          opacity: dim ? XV_DIM_FAIL_OPACITY : 1,
        },
      });
    } else {
      ok.push({
        value: [e.endMs, e.durationSec], key,
        itemStyle: {
          color,
          opacity: dim ? XV_DIM_DOT_OPACITY : XV_DOT_OPACITY,
          ...(pinned ? { borderColor: "#ffffff", borderWidth: 1.2 * k } : {}),
        },
        ...(pinned ? { symbolSize: (XV_DOT_R + 2.5) * 2 * k } : {}),
      });
    }
  }
  // d3 축 재현: x 는 scaleLinear(ms).ticks(4) — 시간 nice 가 아니라 ms 의 1·2·5 배수(30분 도메인
  // → 500,000ms = 8분20초 간격), y 는 ticks(4) — 상한(예 176)은 눈금이 아니다. 눈금 값을 명시해
  // ECharts 의 자체 분할을 끈다.
  const xTicks = niceTicks(domain.startMs, domain.endMs, 4);
  const yTicks = niceTicks(0, yMax, 4);
  const font = 10 * k;
  const tickLen = 6 * k;
  return {
    animation: false,
    grid: {
      left: plot.x0, right: geo.width - plot.x1, top: plot.y0, bottom: geo.height - plot.y1,
      containLabel: false,
    },
    xAxis: {
      type: "time",
      min: domain.startMs,
      max: domain.endMs,
      axisLine: { lineStyle: { color: tokens.border } },
      axisTick: { length: tickLen, lineStyle: { color: tokens.border }, customValues: xTicks },
      axisLabel: {
        color: tokens.text3, fontSize: font, fontFamily: tokens.font, margin: 3 * k + tickLen,
        hideOverlap: true, customValues: xTicks, formatter: (v: number) => hhmm(v),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: yMax,
      axisLine: { show: true, lineStyle: { color: tokens.border } },
      axisTick: { show: true, length: tickLen, lineStyle: { color: tokens.border }, customValues: yTicks },
      axisLabel: {
        color: tokens.text3, fontSize: font, fontFamily: tokens.font, margin: 3 * k + tickLen,
        customValues: yTicks, formatter: (v: number) => `${v}s`,
      },
      splitLine: { show: false },
    },
    tooltip: { show: false },
    series: [
      {
        id: "ok", name: "ok", type: "scatter", symbol: "circle", symbolSize: XV_DOT_R * 2 * k,
        data: ok, cursor: "pointer", emphasis: { disabled: true }, z: 3,
      },
      {
        id: "fail", name: "fail", type: "scatter", symbol: XV_FAIL_SYMBOL, symbolSize: XV_FAIL_R * 2 * k,
        symbolKeepAspect: true, data: fail, cursor: "pointer", emphasis: { disabled: true }, z: 4,
      },
    ],
  };
}

/** 드래그 영역(플롯 픽셀) → 안에 든 이벤트 집합과 [ms, sec] 범위. */
export function zoneSelection(
  zone: { x: number; y: number; w: number; h: number },
  events: readonly XViewEvent[],
  scales: XvScales,
): { keys: Set<string>; total: number; failed: number; loMs: number; hiMs: number; loSec: number; hiSec: number } {
  const loMs = scales.xInv(zone.x);
  const hiMs = scales.xInv(zone.x + zone.w);
  const hiSec = scales.yInv(zone.y);
  const loSec = scales.yInv(zone.y + zone.h);
  const keys = new Set<string>();
  let failed = 0;
  for (const e of events) {
    if (e.endMs >= loMs && e.endMs <= hiMs && e.durationSec >= loSec && e.durationSec <= hiSec) {
      keys.add(xviewKey(e));
      if (e.status === "failed") failed += 1;
    }
  }
  return { keys, total: keys.size, failed, loMs, hiMs, loSec, hiSec };
}

/** 건수 라벨 문구 — 실패가 있으면 함께. */
export function zoneLabel(total: number, failed: number): string {
  return failed > 0 ? `${total}건 · 실패 ${failed}` : `${total}건`;
}
