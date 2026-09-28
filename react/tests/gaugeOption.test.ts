import { describe, expect, it } from "vitest";

import { FALLBACK_TOKENS } from "../src/lib/echartsTheme";
import {
  GAUGE_ARC_WIDTH, GAUGE_VALUE_FONT_PX, gaugeGeometry, gaugeLevelColor, gaugeOption,
} from "../src/lib/gaugeOption";
import { GAUGE_LEVEL_COLORS } from "../src/lib/colors";

/**
 * 게이지 옵션 빌더 (E5 D1) — C3 gaugeConfig 의 규격이 ECharts 옵션으로 그대로 옮겨졌는지.
 * (렌더는 canvas 라 jsdom 에서 불가 — 옵션 객체를 대사한다.)
 */
type GaugeSeries = {
  type: string; startAngle: number; endAngle: number; min: number; max: number;
  radius: number | string; center: [number | string, number | string];
  axisLine: { lineStyle: { width: number; color: Array<[number, string]> } };
  progress: { show: boolean; width: number; itemStyle: { color: string } };
  pointer: { show: boolean }; axisTick: { show: boolean }; splitLine: { show: boolean };
  axisLabel: { show: boolean }; title: { show: boolean };
  detail: { fontSize: number; fontWeight: number; color: string; formatter: (v: number) => string; offsetCenter: [number, string] };
  data: Array<{ value: number }>;
};
const series = (o: ReturnType<typeof gaugeOption>) => (o.series as GaugeSeries[])[0];

const PCT = {
  min: 0, max: 100,
  colors: [GAUGE_LEVEL_COLORS.ok, GAUGE_LEVEL_COLORS.warn, GAUGE_LEVEL_COLORS.danger],
  thresholds: [70, 85],
  format: (v: number) => `${Math.round(v)}%`,
};

describe("gaugeLevelColor — C3 color.threshold(unit:value) 의미", () => {
  it("경계 미만 ok · 70 이상 warn · 85 이상 danger (경계 포함)", () => {
    expect(gaugeLevelColor(69.9, PCT.colors, PCT.thresholds)).toBe(GAUGE_LEVEL_COLORS.ok);
    expect(gaugeLevelColor(70, PCT.colors, PCT.thresholds)).toBe(GAUGE_LEVEL_COLORS.warn);
    expect(gaugeLevelColor(84.9, PCT.colors, PCT.thresholds)).toBe(GAUGE_LEVEL_COLORS.warn);
    expect(gaugeLevelColor(85, PCT.colors, PCT.thresholds)).toBe(GAUGE_LEVEL_COLORS.danger);
    expect(gaugeLevelColor(999, PCT.colors, PCT.thresholds)).toBe(GAUGE_LEVEL_COLORS.danger);
  });
  it("임계가 없으면 첫 색(전력 info 단색), 결측은 첫 색", () => {
    expect(gaugeLevelColor(1840, [GAUGE_LEVEL_COLORS.info])).toBe(GAUGE_LEVEL_COLORS.info);
    expect(gaugeLevelColor(Number.NaN, PCT.colors, PCT.thresholds)).toBe(GAUGE_LEVEL_COLORS.ok);
  });
});

describe("gaugeGeometry — 반원을 상자에 맞춘다", () => {
  it("크기 미상이면 퍼센트 기본, 알면 픽셀 반지름·중심", () => {
    expect(gaugeGeometry(undefined)).toEqual({ radius: "95%", center: ["50%", "82%"] });
    expect(gaugeGeometry({ width: 0, height: 60 }).radius).toBe("95%");
    const g = gaugeGeometry({ width: 84, height: 70 });
    expect(g.center).toEqual([42, 70 * 0.82]);
    expect(g.radius).toBe(Math.floor(Math.min(42, 70 * 0.82) - 2)); // 폭 제한 40
    const tall = gaugeGeometry({ width: 200, height: 40 });
    expect(tall.radius).toBe(Math.floor(40 * 0.82 - 2)); // 높이 제한
  });
});

describe("gaugeOption — C3 규격 이식", () => {
  it("반원 180→0 · 호 두께 12 · 트랙 = panel-alt · 값 구간색 progress · 눈금/포인터/타이틀 없음", () => {
    const s = series(gaugeOption(72, PCT, { width: 84, height: 70 }, FALLBACK_TOKENS));
    expect(s.type).toBe("gauge");
    expect([s.startAngle, s.endAngle]).toEqual([180, 0]);
    expect([s.min, s.max]).toEqual([0, 100]);
    expect(s.axisLine.lineStyle.width).toBe(GAUGE_ARC_WIDTH);
    expect(s.axisLine.lineStyle.color).toEqual([[1, FALLBACK_TOKENS.panelAlt]]);
    expect(s.progress).toMatchObject({ show: true, width: GAUGE_ARC_WIDTH, itemStyle: { color: GAUGE_LEVEL_COLORS.warn } });
    expect(s.pointer.show).toBe(false);
    expect(s.axisTick.show).toBe(false);
    expect(s.splitLine.show).toBe(false);
    expect(s.axisLabel.show).toBe(false);
    expect(s.title.show).toBe(false);
    expect(s.data).toEqual([{ value: 72 }]);
  });

  it("값 라벨은 15px/600 흰색, 포맷은 호출자 함수", () => {
    const s = series(gaugeOption(72.4, PCT, undefined, FALLBACK_TOKENS));
    expect(s.detail).toMatchObject({ fontSize: GAUGE_VALUE_FONT_PX, fontWeight: 600, color: FALLBACK_TOKENS.text });
    expect(s.detail.formatter(72.4)).toBe("72%");
  });

  it("범위 밖 값은 호에서 clamp 되고 결측(NaN)은 0 호 + 포맷터에 원값 전달", () => {
    expect(series(gaugeOption(130, PCT, undefined, FALLBACK_TOKENS)).data[0].value).toBe(100);
    expect(series(gaugeOption(-5, PCT, undefined, FALLBACK_TOKENS)).data[0].value).toBe(0);
    const nan = series(gaugeOption(Number.NaN, { ...PCT, format: (v) => (Number.isFinite(v) ? `${v}` : "—") }, undefined, FALLBACK_TOKENS));
    expect(nan.data[0].value).toBe(0);
    expect(nan.detail.formatter(0)).toBe("—");
  });

  it("전력(단색·max 2800): 임계 없음이면 progress 색은 info", () => {
    const s = series(gaugeOption(1840, { min: 0, max: 2800, colors: [GAUGE_LEVEL_COLORS.info], format: (v) => `${v} W` }, undefined, FALLBACK_TOKENS));
    expect(s.progress.itemStyle.color).toBe(GAUGE_LEVEL_COLORS.info);
    expect(s.max).toBe(2800);
  });

  it("animation 은 꺼져 있다(5s 폴링)", () => {
    expect(gaugeOption(1, PCT, undefined, FALLBACK_TOKENS).animation).toBe(false);
  });
});
