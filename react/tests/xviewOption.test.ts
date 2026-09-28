import { describe, expect, it } from "vitest";

import { FALLBACK_TOKENS } from "../src/lib/echartsTheme";
import { QUERY_TYPE_COLORS } from "../src/lib/colors";
import type { XViewEvent } from "../src/lib/xview";
import {
  XV_DIM_DOT_OPACITY, XV_DIM_FAIL_OPACITY, XV_DOT_OPACITY, XV_FAIL_SYMBOL, XV_MARGIN, niceStep, niceTicks,
  niceTimeStep, xviewGeometry, xviewKey, xviewOption, xviewScales, xviewYMax, zoneLabel, zoneSelection, type XvDatum,
} from "../src/lib/xviewOption";

/** X-View 옵션 빌더·스케일 (E5 D2) — D3 산점도 규격이 ECharts 옵션으로 옮겨졌는지. */
const ev = (over: Partial<XViewEvent>): XViewEvent => ({
  node: "gpu-server-01", gpu: "0", mig: "0", stmtId: "100411", queryId: "Q-88011", user: "dba1",
  queryName: "Group_By_Region", status: "success", reason: "", endMs: 1_500_000, durationSec: 45,
  phases: null, ...over,
});
const events: XViewEvent[] = [
  ev({ endMs: 1_200_000, durationSec: 40 }),
  ev({ endMs: 1_500_000, durationSec: 60, queryName: "Sales_Aggregation", stmtId: "100412" }),
  ev({ endMs: 1_800_000, durationSec: 160, stmtId: "100548", status: "failed", reason: "lock_timeout" }),
];
const domain = { startMs: 1_000_000, endMs: 2_000_000 };
type Series = Array<{ id: string; symbol: string; symbolSize: number; data: XvDatum[] }>;

describe("xviewGeometry / xviewScales — 현행 좌표 공식", () => {
  it("크기 미상은 460×200(k=1) 폴백, 플롯은 M={8,10,20,36} 안", () => {
    const g = xviewGeometry(undefined);
    expect(g.width).toBe(460);
    expect(g.k).toBe(1);
    expect(g.ox).toBe(0);
    expect(g.plot).toEqual({ x0: 36, x1: 450, y0: 8, y1: 180 });
  });

  it("상자 종횡비가 viewBox 와 다르면 SVG meet 규칙처럼 작은 비율로 축소해 가운데 정렬(letterbox)", () => {
    const g = xviewGeometry({ width: 306, height: 196 });
    const k = 306 / 460;
    expect(g.k).toBeCloseTo(k, 9);
    expect(g.ox).toBe(0);
    expect(g.oy).toBeCloseTo((196 - 200 * k) / 2, 9);
    expect(g.plot.x0).toBeCloseTo(36 * k, 9);
    expect(g.plot.x1).toBeCloseTo(450 * k, 9);
    expect(g.plot.y0).toBeCloseTo(g.oy + 8 * k, 9);
    expect(g.plot.y1).toBeCloseTo(g.oy + 180 * k, 9);
  });

  it("y 도메인은 [0, max(30, 최대×1.1)] — 160s 면 176", () => {
    expect(xviewYMax(events)).toBeCloseTo(176, 6);
    expect(xviewYMax([ev({ durationSec: 5 })])).toBe(30);
    expect(xviewYMax([])).toBe(30);
  });

  it("x/y 와 역변환이 서로 맞고 clamp 는 플롯 안으로 (jsdom 폴백 기하 = 현 테스트 수치)", () => {
    const s = xviewScales(domain, events, xviewGeometry(undefined));
    expect(s.x(domain.startMs)).toBe(36);
    expect(s.x(domain.endMs)).toBe(450);
    expect(s.xInv(s.x(1_234_567))).toBeCloseTo(1_234_567, 3);
    expect(s.y(0)).toBe(180);
    expect(s.y(176)).toBeCloseTo(8, 6);
    expect(s.yInv(160)).toBeCloseTo(20.465, 2); // 2D 드래그 테스트가 보던 값
    expect(s.yInv(100)).toBeCloseTo(81.86, 2);
    expect(s.clampX(0)).toBe(36);
    expect(s.clampX(9999)).toBe(450);
    expect(s.clampY(0)).toBe(8);
    expect(s.clampY(999)).toBe(180);
  });
});

describe("niceStep / niceTicks / niceTimeStep — d3 ticks(4) 재현", () => {
  it("d3 tickStep: 176→50, 30→10, 100→20, 88→20", () => {
    expect(niceStep(176, 4)).toBe(50);
    expect(niceStep(30, 4)).toBe(10);
    expect(niceStep(100, 4)).toBe(20);
    expect(niceStep(88, 4)).toBe(20);
    expect(niceStep(0, 4)).toBe(1);
  });

  it("niceTicks: step 배수만 [lo, hi] 안 — 상한(176)은 눈금이 아니다; ms 도메인은 1·2·5 배수", () => {
    expect(niceTicks(0, 176, 4)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0, 88, 4)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(0, 30, 4)).toEqual([0, 10, 20, 30]);
    // 30분(1,800,000ms) → step 500,000 → 시작부터 8분20초 간격(현행 d3 scaleLinear 축과 동일)
    const start = 1_800_000_000; // 500,000 의 배수
    expect(niceTicks(start, start + 1_800_000, 4)).toEqual([start, start + 500_000, start + 1_000_000, start + 1_500_000]);
  });

  it("niceTimeStep(참고용): 관습 후보 중 target 에 가장 가까운 것", () => {
    expect(niceTimeStep(30 * 60_000, 4)).toBe(5 * 60_000);
    expect(niceTimeStep(60 * 60_000, 4)).toBe(15 * 60_000);
    expect(niceTimeStep(6 * 3_600_000, 4)).toBe(3_600_000);
  });
});

describe("xviewOption — 점/✕·축·dim·고정 강조", () => {
  const opt = () => xviewOption(events, domain, xviewGeometry(undefined), FALLBACK_TOKENS);
  const series = (o: ReturnType<typeof xviewOption>) => o.series as Series;

  it("성공은 원(r 3.5→symbolSize 7, 유형색 .85), 실패는 ✕ path(반지름 4, 유형색 stroke 1.6)", () => {
    const [ok, fail] = series(opt());
    expect(ok.id).toBe("ok");
    expect(ok.symbol).toBe("circle");
    expect(ok.symbolSize).toBe(7);
    expect(ok.data).toHaveLength(2);
    expect(ok.data[0].itemStyle).toEqual({ color: QUERY_TYPE_COLORS.select, opacity: XV_DOT_OPACITY });
    expect(ok.data[1].itemStyle.color).toBe(QUERY_TYPE_COLORS.aggregation);
    expect(fail.id).toBe("fail");
    expect(fail.symbol).toBe(XV_FAIL_SYMBOL);
    expect(XV_FAIL_SYMBOL.startsWith("path://M-4,-4L4,4M4,-4L-4,4")).toBe(true);
    expect(fail.data).toHaveLength(1);
    expect(fail.data[0].itemStyle).toEqual({ color: "none", borderColor: QUERY_TYPE_COLORS.select, borderWidth: 1.6, opacity: 1 });
    expect(fail.data[0].key).toBe("100548|1800000");
  });

  it("축: x 시간 도메인 고정·d3 눈금 값 명시, y 0~176 눈금 0/50/100/150 `${v}s`, 격자 없음, 내장 툴팁 끔, 애니메이션 끔", () => {
    const o = opt() as {
      xAxis: { min: number; max: number; axisLabel: { customValues: number[]; fontSize: number; formatter: (v: number) => string }; axisTick: { customValues: number[] } };
      yAxis: { min: number; max: number; axisLabel: { customValues: number[]; formatter: (v: number) => string }; splitLine: { show: boolean } };
      grid: Record<string, number | boolean>; tooltip: { show: boolean }; animation: boolean;
    };
    expect(o.xAxis.min).toBe(domain.startMs);
    expect(o.xAxis.max).toBe(domain.endMs);
    expect(o.xAxis.axisLabel.customValues).toEqual([1_000_000, 1_200_000, 1_400_000, 1_600_000, 1_800_000, 2_000_000]);
    expect(o.xAxis.axisTick.customValues).toEqual(o.xAxis.axisLabel.customValues);
    expect(o.xAxis.axisLabel.fontSize).toBe(10); // k=1
    expect(o.xAxis.axisLabel.formatter(Date.UTC(2026, 0, 1, 14, 5))).toMatch(/^\d{2}:\d{2}$/);
    expect(o.yAxis.min).toBe(0);
    expect(o.yAxis.max).toBeCloseTo(176, 6);
    expect(o.yAxis.axisLabel.customValues).toEqual([0, 50, 100, 150]);
    expect(o.yAxis.axisLabel.formatter(40)).toBe("40s");
    expect(o.yAxis.splitLine.show).toBe(false);
    expect(o.grid).toMatchObject({ left: XV_MARGIN.left, right: XV_MARGIN.right, top: XV_MARGIN.top, bottom: XV_MARGIN.bottom });
    expect(o.tooltip.show).toBe(false);
    expect(o.animation).toBe(false);
  });

  it("letterbox 축소(k<1)면 점·글자·테두리·그리드도 함께 작아진다 — SVG 스케일과 동일", () => {
    const g = xviewGeometry({ width: 306, height: 196 });
    const o = xviewOption(events, domain, g, FALLBACK_TOKENS) as {
      grid: { left: number; top: number; right: number; bottom: number };
      xAxis: { axisLabel: { fontSize: number } };
    };
    const [ok, fail] = series(xviewOption(events, domain, g, FALLBACK_TOKENS));
    expect(ok.symbolSize).toBeCloseTo(7 * g.k, 9);
    expect(fail.symbolSize).toBeCloseTo(8 * g.k, 9);
    expect(fail.data[0].itemStyle.borderWidth).toBeCloseTo(1.6 * g.k, 9);
    expect(o.xAxis.axisLabel.fontSize).toBeCloseTo(10 * g.k, 9);
    expect(o.grid.left).toBeCloseTo(g.plot.x0, 9);
    expect(o.grid.top).toBeCloseTo(g.plot.y0, 9);
    expect(o.grid.right).toBeCloseTo(306 - g.plot.x1, 9);
    expect(o.grid.bottom).toBeCloseTo(196 - g.plot.y1, 9);
  });

  it("고정 점: 원은 symbolSize 12 + 흰 테두리 1.2, ✕는 stroke 2.8", () => {
    const pinnedOk = series(xviewOption(events, domain, xviewGeometry(undefined), FALLBACK_TOKENS, { pinnedKey: "100411|1200000" }));
    expect(pinnedOk[0].data[0].symbolSize).toBe(12);
    expect(pinnedOk[0].data[0].itemStyle).toMatchObject({ borderColor: "#ffffff", borderWidth: 1.2 });
    expect(pinnedOk[0].data[1].symbolSize).toBeUndefined();
    const pinnedFail = series(xviewOption(events, domain, xviewGeometry(undefined), FALLBACK_TOKENS, { pinnedKey: "100548|1800000" }));
    expect(pinnedFail[1].data[0].itemStyle.borderWidth).toBe(2.8);
  });

  it("드래그 중 영역 밖 점은 dim(성공 .187 / ✕ .22), 안은 그대로", () => {
    const inZone = new Set(["100411|1200000", "100412|1500000"]);
    const [ok, fail] = series(xviewOption(events, domain, xviewGeometry(undefined), FALLBACK_TOKENS, { inZone }));
    expect(ok.data.map((d) => d.itemStyle.opacity)).toEqual([XV_DOT_OPACITY, XV_DOT_OPACITY]);
    expect(fail.data[0].itemStyle.opacity).toBe(XV_DIM_FAIL_OPACITY);
    const [ok2] = series(xviewOption(events, domain, xviewGeometry(undefined), FALLBACK_TOKENS, { inZone: new Set() }));
    expect(ok2.data.map((d) => d.itemStyle.opacity)).toEqual([XV_DIM_DOT_OPACITY, XV_DIM_DOT_OPACITY]);
  });
});

describe("zoneSelection / zoneLabel — 2D 영역 판정", () => {
  it("영역 안 키·건수·실패 수·[ms, sec] 범위", () => {
    const s = xviewScales(domain, events, xviewGeometry(undefined));
    // x 40~445 (전 구간), y 100~160 → 20.5s~81.9s → 40·60 만
    const sel = zoneSelection({ x: 40, y: 100, w: 405, h: 60 }, events, s);
    expect(sel.total).toBe(2);
    expect(sel.failed).toBe(0);
    expect([...sel.keys]).toEqual(["100411|1200000", "100412|1500000"]);
    expect(sel.loSec).toBeCloseTo(20.465, 2);
    expect(sel.hiSec).toBeCloseTo(81.86, 2);
    // 전 높이 → 3건, 실패 1
    const all = zoneSelection({ x: 36, y: 8, w: 414, h: 172 }, events, s);
    expect(all.total).toBe(3);
    expect(all.failed).toBe(1);
    expect(zoneLabel(all.total, all.failed)).toBe("3건 · 실패 1");
    expect(zoneLabel(2, 0)).toBe("2건");
  });

  it("xviewKey 는 stmtId|endMs", () => {
    expect(xviewKey(events[2])).toBe("100548|1800000");
  });
});
