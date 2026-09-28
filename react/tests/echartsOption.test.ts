/**
 * ECharts 옵션 빌더 대사 (E1) — 시안 통일 스펙이 옵션에 그대로 실리는지 잠근다.
 * 렌더는 jsdom에서 불가하므로 빌더 결과(순수 객체)만 검증한다 (C3 시절과 같은 전략).
 */
import { describe, expect, it } from "vitest";

import {
  AREA_ALPHA, CROSSHAIR_COLOR, PIN_COLOR,
  lineChartOption, lineSeries, pinMarkLine, tooltipFormatter,
} from "../src/lib/echartsOption";
import type { TimeSeries } from "../src/lib/series";

const TS: TimeSeries = {
  x: [1000, 2000],
  lines: [
    { id: "n/0/0", label: "sqream101", colorKey: "0", values: [1, 2] },
    { id: "n/0/1", label: "sqream102", colorKey: "1", values: [3, null] },
  ],
};

describe("lineSeries — 통일 스펙 시리즈", () => {
  it("선 2px·점 숨김·호버 강조(blur)·정의 순서를 굳힌다", () => {
    const s = lineSeries(TS, {});
    expect(s.map((x) => x.name)).toEqual(["sqream101", "sqream102"]);
    expect(s[0].lineStyle).toEqual({ width: 2 });
    expect(s[0].showSymbol).toBe(false);
    expect(s[0].symbolSize).toBe(8);
    expect(s[0].emphasis?.focus).toBe("series");
    expect(s[0].blur).toEqual({ lineStyle: { opacity: 0.1 }, areaStyle: { opacity: 0.04 } });
    expect(s[0].connectNulls).toBe(false);
  });

  it("계열색은 seriesColor(colorKey) — GPU 팔레트 매핑", () => {
    const s = lineSeries(TS, {});
    expect(s[0].color).toBe("#8ab4f8"); // --gpu-0 (E4 뮤티드)
    expect(s[1].color).toBe("#81c995"); // --gpu-1
  });

  it("면 그라디언트는 계열색 15%(위)→투명(아래) — Google Finance 질감(E4)", () => {
    const s = lineSeries(TS, {});
    const grad = (s[0].areaStyle as { color: { args: unknown[] } }).color;
    // 전역 echarts 목의 LinearGradient 스텁은 생성 인자를 보존한다.
    expect(grad.args[4]).toEqual([
      { offset: 0, color: `#8ab4f8${AREA_ALPHA.top}` },
      { offset: 1, color: `#8ab4f8${AREA_ALPHA.bottom}` },
    ]);
  });

  it("x·값을 [ms, v] 쌍으로 싣고 null은 그대로 둔다 (끊어 그리기)", () => {
    const s = lineSeries(TS, {});
    expect(s[1].data).toEqual([[1000, 3], [2000, null]]);
  });

  it("groups 멤버는 stack id를 공유하고, y2Keys 계열은 오른쪽 축에 붙는다", () => {
    const s = lineSeries(TS, {
      groups: [["sqream101", "sqream102"]],
      y2Keys: ["sqream102"],
    });
    expect(s[0].stack).toBe("g0");
    expect(s[1].stack).toBe("g0");
    expect(s[0].yAxisIndex).toBeUndefined();
    expect(s[1].yAxisIndex).toBe(1);
  });
});

describe("lineChartOption — 축·crosshair·툴팁", () => {
  it("yMax를 주면 균등 분할 interval, 없으면 splitNumber (탑뷰 3틱 기본)", () => {
    const fixed = lineChartOption(TS, { yMax: 100 });
    const yAxis = fixed.yAxis as Array<{ max?: number; interval?: number; splitNumber?: number }>;
    expect(yAxis[0].max).toBe(100);
    expect(yAxis[0].interval).toBe(50); // 3틱 → 0/50/100
    const auto = lineChartOption(TS, { tickCount: { y: 5 } });
    expect((auto.yAxis as Array<{ splitNumber?: number }>)[0].splitNumber).toBe(5);
  });

  it("hideXAxis는 축 라벨을 숨기고 플롯을 확보한다", () => {
    const o = lineChartOption(TS, { hideXAxis: true });
    expect((o.xAxis as { axisLabel: { show: boolean } }).axisLabel.show).toBe(false);
    expect((o.grid as { bottom: number }).bottom).toBe(8);
  });

  it("domain을 주면 x축을 요청 구간에 고정한다", () => {
    const o = lineChartOption(TS, { domain: { startMs: 1000, endMs: 9000 } });
    const x = o.xAxis as { min?: number; max?: number };
    expect(x.min).toBe(1000);
    expect(x.max).toBe(9000);
  });

  it("crosshair는 세로 점선(E4 — Google Finance 질감) — 값 라벨 없음", () => {
    const o = lineChartOption(TS, {});
    const ap = (o.xAxis as { axisPointer: { lineStyle: { type: string; color: string }; label: { show: boolean } } }).axisPointer;
    expect(ap.lineStyle.type).toBe("dashed");
    expect(ap.lineStyle.color).toBe(CROSSHAIR_COLOR);
    expect(ap.label.show).toBe(false);
  });

  it("툴팁은 계열 정의 순서(seriesAsc) — 값 내림차순 폐기, 인셋 범례 없음", () => {
    const o = lineChartOption(TS, {});
    expect((o.tooltip as { order: string }).order).toBe("seriesAsc");
    expect((o.legend as { show: boolean }).show).toBe(false);
    expect((o as { animation: boolean }).animation).toBe(false);
  });

  it("y2Keys가 있으면 오른쪽 축이 생기고 우측 여백을 넓힌다", () => {
    const o = lineChartOption(TS, { y2Keys: ["sqream102"], y2Max: 200 });
    const yAxis = o.yAxis as Array<{ max?: number }>;
    expect(yAxis).toHaveLength(2);
    expect(yAxis[1].max).toBe(200);
    expect((o.grid as { right: number }).right).toBe(56);
  });

  it("pinnedMs는 첫 시리즈의 마크라인(청록 점선)으로 실린다", () => {
    const o = lineChartOption(TS, { pinnedMs: 1500 });
    const s = o.series as Array<{ markLine?: { data: Array<{ xAxis: number }>; lineStyle: { color: string } } }>;
    expect(s[0].markLine?.data).toEqual([{ xAxis: 1500 }]);
    expect(s[0].markLine?.lineStyle.color).toBe(PIN_COLOR);
    expect(s[1].markLine).toBeUndefined();
    expect(pinMarkLine(null)).toBeUndefined();
  });
});

describe("tooltipFormatter — 통일 마크업(.ec-tip)", () => {
  const fmt = tooltipFormatter({
    yFormat: (v) => `${v}%`,
    y2Format: (v) => `${v} MB/s`,
    y2Keys: ["Disk I/O"],
  });

  it("일시 머리글 + 색점·라벨·굵은 값, 값은 그 계열이 붙은 축의 단위로 찍는다", () => {
    const html = fmt([
      { seriesName: "CPU", color: "#7dd3fc", value: [1_700_000_000_000, 42] },
      { seriesName: "Disk I/O", color: "#fcd34d", value: [1_700_000_000_000, 900] },
    ]);
    expect(html).toContain('<div class="ec-tip">');
    expect(html).toContain("CPU<b>42%</b>");
    expect(html).toContain("Disk I/O<b>900 MB/s</b>");
    expect(html).toContain('background:#7dd3fc');
  });

  it("null 값은 '-'로, HTML 특수문자는 이스케이프한다", () => {
    const html = fmt([
      { seriesName: "<script>", color: "#fff", value: [1_700_000_000_000, null] },
    ]);
    expect(html).toContain("&lt;script&gt;<b>-</b>");
    expect(html).not.toContain("<script>");
  });

  it("빈 파라미터는 빈 문자열", () => {
    expect(fmt([])).toBe("");
  });
});
