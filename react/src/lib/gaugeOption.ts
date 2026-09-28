/**
 * 서버 게이지 옵션 빌더 (E5 D1) — C3 반원 게이지(`c3config.gaugeConfig`)의 ECharts 판.
 *
 * 현행 규격을 그대로 옮긴다: 반원(180°→0°) · 호 두께 12px · 미사용 호 = `--panel-alt`
 * (Grafana 어두운 트랙) · **값의 임계 구간색 한 가지**로 현재값 호를 칠한다(C3 의
 * `color.threshold unit:"value"` 는 띠가 아니라 전체 호 색 전환이다) · 눈금·min/max 라벨
 * 없음 · 중앙 값 15px/600 흰색(`.c3-gauge-value`) · 라벨은 컴포넌트의 `.gauge__label` DOM.
 *
 * 순수 함수 — 컨테이너 크기·토큰을 인자로 받아 테스트가 DOM 없이 대사한다.
 */
import type { EChartsOption } from "echarts";

import type { ThemeTokens } from "./echartsTheme";

export interface GaugeOpts {
  min: number;
  max: number;
  /** 단계 색 배열 — thresholds 없으면 첫 색 단색. */
  colors: string[];
  /** 색 전환 경계값(value 단위, 오름차순). colors.length === thresholds.length + 1. */
  thresholds?: number[];
  /** 값 라벨 포맷 (단위). */
  format: (v: number) => string;
}

export const GAUGE_ARC_WIDTH = 12;
export const GAUGE_VALUE_FONT_PX = 15;

/** C3 `color.threshold` 의미 그대로 — 값이 경계 이상이면 다음 색. */
export function gaugeLevelColor(value: number, colors: string[], thresholds?: number[]): string {
  if (!thresholds || thresholds.length === 0) return colors[0];
  let idx = 0;
  for (const t of thresholds) {
    if (Number.isFinite(value) && value >= t) idx += 1;
  }
  return colors[Math.min(idx, colors.length - 1)];
}

/**
 * 반원 기하 — 상자에 맞춘 반지름·중심(픽셀). C3 는 반원을 상자에 꽉 채우고 값 글자를
 * 호 안쪽 중앙에 둔다. 크기를 모르면(jsdom·첫 렌더 전) 퍼센트 기본값을 쓴다.
 */
export function gaugeGeometry(size?: { width: number; height: number }): {
  radius: number | string; center: [number | string, number | string];
} {
  if (!size || size.width <= 0 || size.height <= 0) {
    return { radius: "95%", center: ["50%", "82%"] };
  }
  const cy = size.height * 0.82;
  const radius = Math.max(8, Math.floor(Math.min(size.width / 2, cy) - 2));
  return { radius, center: [size.width / 2, cy] };
}

export function gaugeOption(
  value: number,
  opts: GaugeOpts,
  size: { width: number; height: number } | undefined,
  tokens: ThemeTokens,
): EChartsOption {
  const v = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(opts.min, Math.min(opts.max, v));
  const color = gaugeLevelColor(v, opts.colors, opts.thresholds);
  const geo = gaugeGeometry(size);
  return {
    animation: false,
    series: [{
      id: "gauge",
      type: "gauge",
      startAngle: 180,
      endAngle: 0,
      min: opts.min,
      max: opts.max,
      radius: geo.radius,
      center: geo.center,
      // 미사용 호(트랙) — Grafana 어두운 호. 구간색 띠는 그리지 않는다(C3 규격).
      axisLine: { lineStyle: { width: GAUGE_ARC_WIDTH, color: [[1, tokens.panelAlt]] } },
      progress: { show: true, width: GAUGE_ARC_WIDTH, roundCap: false, itemStyle: { color } },
      pointer: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: false,
        formatter: (val: number) => opts.format(Number.isFinite(value) ? val : value),
        fontSize: GAUGE_VALUE_FONT_PX,
        fontWeight: 600,
        fontFamily: tokens.font,
        color: tokens.text,
        offsetCenter: [0, "-18%"],
      },
      data: [{ value: clamped }],
    }],
  };
}
