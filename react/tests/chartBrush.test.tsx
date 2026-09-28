import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FALLBACK_TOKENS } from "../src/lib/echartsTheme";
import type { TimeSeries } from "../src/lib/series";
import { ChartBrush } from "../src/screens/drilldown/ChartBrush";
import {
  BRUSH_SELECTION_FILL, brushAreas, brushAxisRange, brushOption, brushValueRange, zoomFromBrushEnd,
} from "../src/screens/drilldown/chartBrushModel";

/**
 * 드릴다운 브러시 (ECharts, E5 D3) — 옵션 빌더(순수) + 컴포넌트 배선(스텁):
 * brushEnd → onZoom(절대 ms, clamp), zoom prop → dispatchAction brush areas, 툴박스 없는
 * 브러시 커서(takeGlobalCursor), 점 1개면 렌더 안 함.
 */
const x = [1_000_000, 1_060_000, 1_120_000, 1_180_000, 1_240_000];
const series: TimeSeries = {
  x,
  lines: [
    { id: "a", label: "A", colorKey: "gpu-server-01", values: [10, 20, null, 40, 50] },
    { id: "b", label: "B", colorKey: "gpu-server-02", values: [5, 5, 5, 5, 5] },
  ],
};
type Opt = {
  grid: Record<string, number | boolean>;
  xAxis: { min: number; max: number; show: boolean };
  yAxis: { min: number; max: number; show: boolean };
  brush: { brushType: string; toolbox: unknown[]; brushStyle: { color: string; borderColor: string }; outOfBrush: { colorAlpha: number } };
  series: Array<{ id: string; type: string; lineStyle: { width: number; color: string }; data: Array<[number, number | null]> }>;
};

describe("brushOption / 범위 헬퍼", () => {
  it("값 범위는 [0, max], 유효값 없으면 [0,1]; 축 범위는 4/40 패딩만큼 늘어난다", () => {
    expect(brushValueRange(series)).toEqual([0, 50]);
    expect(brushValueRange({ x, lines: [{ id: "z", label: "Z", colorKey: "k", values: [null, null] }] })).toEqual([0, 1]);
    expect(brushValueRange({ x, lines: [{ id: "z", label: "Z", colorKey: "k", values: [0, -3] }] })).toEqual([0, 1]);
    expect(brushAxisRange(0, 40)).toEqual({ min: -4, max: 44 });
  });

  it("옵션: grid 0, 축 숨김·도메인 고정, lineX 브러시(툴박스 없음·선택색 18%·밖 dim 없음), 계열별 1px 선·null 끊김", () => {
    const o = brushOption(series, FALLBACK_TOKENS) as unknown as Opt;
    expect(o.grid).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(o.xAxis).toMatchObject({ min: 1_000_000, max: 1_240_000, show: false });
    expect(o.yAxis.show).toBe(false);
    expect(o.yAxis.min).toBeCloseTo(-5, 9);
    expect(o.yAxis.max).toBeCloseTo(55, 9);
    expect(o.brush.brushType).toBe("lineX");
    expect(o.brush.toolbox).toEqual([]);
    expect(o.brush.brushStyle).toMatchObject({ color: BRUSH_SELECTION_FILL, borderColor: FALLBACK_TOKENS.accent });
    expect(o.brush.outOfBrush.colorAlpha).toBe(1);
    expect(o.series.map((s) => s.id)).toEqual(["a", "b"]);
    expect(o.series[0].type).toBe("line");
    expect(o.series[0].lineStyle.width).toBe(1);
    expect(o.series[0].data[2]).toEqual([1_120_000, null]);
    expect(o.series[0].lineStyle.color).not.toBe(o.series[1].lineStyle.color);
  });

  it("brushAreas: 줌을 도메인에 clamp, 겹침 없거나 줌 없으면 []", () => {
    expect(brushAreas(null, 1_000_000, 1_240_000)).toEqual([]);
    expect(brushAreas({ startMs: 1_060_000, endMs: 1_180_000 }, 1_000_000, 1_240_000))
      .toEqual([{ brushType: "lineX", xAxisIndex: 0, coordRange: [1_060_000, 1_180_000] }]);
    expect(brushAreas({ startMs: 900_000, endMs: 1_100_000 }, 1_000_000, 1_240_000)[0].coordRange)
      .toEqual([1_000_000, 1_100_000]);
    // 과거 고정 창이 흐르는 context 밖으로 밀림 (codex Z2-02) → 숨김
    expect(brushAreas({ startMs: 800_000, endMs: 900_000 }, 1_000_000, 1_240_000)).toEqual([]);
    expect(brushAreas({ startMs: 1_060_000, endMs: 1_180_000 }, 1_000_000, 1_000_000)).toEqual([]);
  });

  it("zoomFromBrushEnd: 영역 없으면 null(해제), 역순은 정렬, 도메인 밖은 clamp", () => {
    expect(zoomFromBrushEnd({ areas: [] }, 1_000_000, 1_240_000)).toBeNull();
    expect(zoomFromBrushEnd(undefined, 1_000_000, 1_240_000)).toBeNull();
    expect(zoomFromBrushEnd({ areas: [{ coordRange: [1_180_000, 1_060_000] }] }, 1_000_000, 1_240_000))
      .toEqual({ startMs: 1_060_000, endMs: 1_180_000 });
    expect(zoomFromBrushEnd({ areas: [{ coordRange: [900_000, 2_000_000] }] }, 1_000_000, 1_240_000))
      .toEqual({ startMs: 1_000_000, endMs: 1_240_000 });
  });
});

describe("ChartBrush", () => {
  beforeEach(() => {
    globalThis.__echartsMock.reset();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  const inst = () => globalThis.__echartsMock.instances[0];
  const actions = () => inst().dispatchAction.mock.calls.map((c) => c[0] as { type: string; key?: string; areas?: unknown[] });

  it("호스트 .sqm-brush(role=application) + 옵션 setOption, 브러시 커서 takeGlobalCursor, 줌 없으면 areas []", () => {
    const { container } = render(<ChartBrush series={series} zoom={null} onZoom={() => undefined} />);
    expect(container.querySelector(".sqm-brush[role='application']")).not.toBeNull();
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
    const opt = inst().lastOption() as Opt;
    expect(opt.series).toHaveLength(2);
    expect(actions().some((a) => a.type === "takeGlobalCursor" && a.key === "brush")).toBe(true);
    expect(actions().filter((a) => a.type === "brush").at(-1)?.areas).toEqual([]);
  });

  it("zoom prop → dispatchAction brush areas(clamp), 해제 → []; 재발화 없음", () => {
    const onZoom = vi.fn();
    const { rerender } = render(<ChartBrush series={series} zoom={{ startMs: 1_060_000, endMs: 1_180_000 }} onZoom={onZoom} />);
    let brushActs = actions().filter((a) => a.type === "brush");
    expect(brushActs.at(-1)?.areas).toEqual([{ brushType: "lineX", xAxisIndex: 0, coordRange: [1_060_000, 1_180_000] }]);
    rerender(<ChartBrush series={series} zoom={null} onZoom={onZoom} />);
    brushActs = actions().filter((a) => a.type === "brush");
    expect(brushActs.at(-1)?.areas).toEqual([]);
    expect(onZoom).not.toHaveBeenCalled(); // prop 반영은 콜백을 되부르지 않는다
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
  });

  it("brushEnd → onZoom(절대 ms, 도메인 clamp), 빈 영역(빈 곳 클릭) → onZoom(null)", () => {
    const onZoom = vi.fn();
    render(<ChartBrush series={series} zoom={null} onZoom={onZoom} />);
    act(() => inst().emit("brushEnd", { areas: [{ coordRange: [1_060_000, 1_500_000] }] }));
    expect(onZoom).toHaveBeenLastCalledWith({ startMs: 1_060_000, endMs: 1_240_000 });
    act(() => inst().emit("brushEnd", { areas: [] }));
    expect(onZoom).toHaveBeenLastCalledWith(null);
  });

  it("context 가 흐르면(새 series) setOption 재적용 — 인스턴스 재생성 없음; 점 1개면 렌더 안 함", () => {
    const { rerender, container } = render(<ChartBrush series={series} zoom={null} onZoom={() => undefined} />);
    const before = inst().setOption.mock.calls.length;
    const moved: TimeSeries = { ...series, x: series.x.map((t) => t + 60_000) };
    rerender(<ChartBrush series={moved} zoom={null} onZoom={() => undefined} />);
    expect(inst().setOption.mock.calls.length).toBeGreaterThan(before);
    expect((inst().lastOption() as Opt).xAxis.min).toBe(1_060_000);
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
    rerender(<ChartBrush series={{ x: [1], lines: [] }} zoom={null} onZoom={() => undefined} />);
    expect(container.querySelector(".sqm-brush")).toBeNull();
    expect(inst().dispose).toHaveBeenCalledTimes(1);
  });

  it("빈 시계열로 시작해(드릴다운 첫 조회 전) 데이터가 오면 그때 init 한다 — 회귀: 첫 렌더 null 뒤 영영 미생성", () => {
    const { rerender, container } = render(<ChartBrush series={{ x: [], lines: [] }} zoom={null} onZoom={() => undefined} />);
    expect(container.querySelector(".sqm-brush")).toBeNull();
    expect(globalThis.__echartsMock.init).not.toHaveBeenCalled();
    rerender(<ChartBrush series={series} zoom={null} onZoom={() => undefined} />);
    expect(container.querySelector(".sqm-brush")).not.toBeNull();
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
    expect((inst().lastOption() as Opt).series).toHaveLength(2);
  });
});
