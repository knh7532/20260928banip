import { describe, expect, it } from "vitest";

import { QUERY_TYPE_COLORS, queryTypeColor } from "../src/lib/colors";
import { FALLBACK_TOKENS } from "../src/lib/echartsTheme";
import type { TimelineRow } from "../src/lib/timeline";
import {
  TL_M, TL_W, bandScale, renderRowBg, renderRowLabel, renderSegment, rowShapes, segmentShapes,
  selectionFromBrushEnd, timelineBrushAreas, timelineBrushStyle, timelineGeometry, timelineOption, withAlpha,
  type TlStyleOpts,
} from "../src/lib/timelineOption";

/** 타임라인 옵션 빌더·기하 (E5 D4) — D3 간트 규격(viewBox 1000 · scaleBand .25 · 행 30/12)이 옮겨졌는지. */
const seg = (node: string, gpu: string, startMs: number, endMs: number, name: string, type: string) =>
  ({ node, gpu, mig: "0", startMs, endMs, value: 1, name, type });
const rows: TimelineRow[] = [
  { node: "gpu-server-01", gpu: "0", mig: "0", key: "gpu-server-01/0/0", segments: [
    seg("gpu-server-01", "0", 1_000_000, 1_400_000, "Group_By_Region", "select"),
    seg("gpu-server-01", "0", 1_800_000, 2_600_000, "Daily_Order_Insert", "etl"), // 도메인 밖으로 돌출 → clamp
  ] },
  { node: "gpu-server-01", gpu: "1", mig: "0", key: "gpu-server-01/1/0", segments: [
    seg("gpu-server-01", "1", 1_500_000, 1_500_500, "Tiny", "join"), // 0.5초 → 최소 폭 1
    seg("gpu-server-01", "1", 3_000_000, 3_100_000, "Outside", "join"), // 도메인 밖 → 없음
  ] },
];
const domain = { startMs: 1_000_000, endMs: 2_000_000 };
const style: TlStyleOpts = {
  colorOf: queryTypeColor,
  rowLabelOf: (node, gpu, mig) => `${node}·G${gpu}M${mig}`,
  single: false,
};

describe("bandScale / timelineGeometry — d3 scaleBand(padding .25)·viewBox 기하", () => {
  it("8행×30: step 29.09, bandwidth 21.82, 시작 오프셋 7.27 (d3 와 동일)", () => {
    const b = bandScale(8, 30);
    expect(b.step).toBeCloseTo(240 / 8.25, 6);
    expect(b.bandwidth).toBeCloseTo((240 / 8.25) * 0.75, 6);
    expect(b.start).toBeCloseTo((240 - (240 / 8.25) * 7.75) / 2, 6);
    expect(bandScale(0, 30).start).toBe(0);
  });

  it("행 높이 30(≤8행)/12(All), viewBox 높이 = 8 + n·rowH + 22, k = 폭/1000(미상이면 1)", () => {
    const g8 = timelineGeometry(8);
    expect(g8.rowH).toBe(30);
    expect(g8.H).toBe(8 + 240 + 22);
    expect(g8.k).toBe(1);
    expect(g8.plot).toEqual({ x0: TL_M.left, x1: TL_W - TL_M.right, y0: 8, y1: 248 });
    const g24 = timelineGeometry(24, 500);
    expect(g24.rowH).toBe(12);
    expect(g24.H).toBe(8 + 288 + 22);
    expect(g24.k).toBe(0.5);
    expect(g24.width).toBe(500);
    expect(g24.height).toBe(318 * 0.5);
  });
});

describe("segmentShapes / rowShapes — 도메인 clamp·최소 폭·라벨", () => {
  const geo = timelineGeometry(rows.length);
  it("도메인 밖은 버리고, 돌출은 우측 경계에서 자르며(CDX-R4-02), 폭 0 은 1 로", () => {
    const s = segmentShapes(rows, domain, geo, style);
    expect(s).toHaveLength(3);
    const [a, b, c] = s;
    expect(a.x).toBe(TL_M.left);
    expect(a.w).toBeCloseTo((TL_W - TL_M.right - TL_M.left) * 0.4, 6);
    expect(b.x + b.w).toBeCloseTo(TL_W - TL_M.right, 6); // 2.6M → 2.0M 로 clamp
    expect(c.w).toBe(1);
    expect(c.x + c.w).toBeLessThanOrEqual(TL_W - TL_M.right);
    expect(a.color).toBe(QUERY_TYPE_COLORS.select);
    expect(a.label).toBe("Group_By_Region");
    expect(c.label).toBeNull();
    expect(a.title).toBe("gpu-server-01·G0M0 · Group_By_Region");
    // 두 번째 행은 한 step 아래
    expect(c.y).toBeCloseTo(a.y + geo.band.step, 6);
    expect(a.h).toBeCloseTo(geo.band.bandwidth, 6);
  });

  it("행 도형: 라벨은 rowLabelOf, 막대 높이 = bandwidth", () => {
    const r = rowShapes(rows, geo, { ...style, single: true, rowLabelOf: (_n, g, _m, single) => (single ? `GPU-${g}` : "x") });
    expect(r.map((x) => x.label)).toEqual(["GPU-0", "GPU-1"]);
    expect(r[0].y).toBeCloseTo(8 + geo.band.start, 6);
    expect(r[0].h).toBeCloseTo(geo.band.bandwidth, 6);
  });
});

describe("renderItem 결과 — 픽셀은 viewBox×k", () => {
  const geo = timelineGeometry(rows.length, 500); // k=.5
  const segs = segmentShapes(rows, domain, geo, style);
  const rs = rowShapes(rows, geo, style);

  it("행 배경: 플롯 폭 전체·panel-alt·silent", () => {
    const el = renderRowBg(rs[0], geo, FALLBACK_TOKENS) as { type: string; silent: boolean; shape: Record<string, number>; style: { fill: string } };
    expect(el.type).toBe("rect");
    expect(el.silent).toBe(true);
    expect(el.shape.x).toBe(TL_M.left * 0.5);
    expect(el.shape.width).toBe((TL_W - TL_M.right - TL_M.left) * 0.5);
    expect(el.shape.height).toBeCloseTo(geo.band.bandwidth * 0.5, 6);
    expect(el.style.fill).toBe(FALLBACK_TOKENS.panelAlt);
  });

  it("행 라벨: x = (left-8)k 우측 정렬·모노 11k(≤8행)·text-2·pointer", () => {
    const el = renderRowLabel(rs[0], geo, FALLBACK_TOKENS, 2) as { type: string; x: number; cursor: string; style: Record<string, unknown> };
    expect(el.type).toBe("text");
    expect(el.x).toBe((TL_M.left - 8) * 0.5);
    expect(el.cursor).toBe("pointer");
    expect(el.style).toMatchObject({ text: "gpu-server-01·G0M0", fill: FALLBACK_TOKENS.text2, fontSize: 5.5, fontFamily: FALLBACK_TOKENS.fontMono, align: "right" });
    const el24 = renderRowLabel(rs[0], geo, FALLBACK_TOKENS, 24) as { style: { fontSize: number } };
    expect(el24.style.fontSize).toBe(8 * 0.5);
  });

  it("세그먼트: 라벨 있으면 group(rect r=2k + text 11k), 없으면 rect 만; hover 는 opacity .85", () => {
    const withLabel = renderSegment(segs[0], geo, FALLBACK_TOKENS, 2) as { type: string; children: Array<Record<string, unknown>> };
    expect(withLabel.type).toBe("group");
    const rect = withLabel.children[0] as { shape: Record<string, number>; style: { fill: string }; emphasis: { style: { opacity: number } }; cursor: string };
    expect(rect.shape.r).toBe(1);
    expect(rect.shape.x).toBe(TL_M.left * 0.5);
    expect(rect.style.fill).toBe(QUERY_TYPE_COLORS.select);
    expect(rect.emphasis.style.opacity).toBe(0.85);
    expect(rect.cursor).toBe("pointer");
    const text = withLabel.children[1] as { silent: boolean; x: number; style: Record<string, unknown> };
    expect(text.silent).toBe(true);
    expect(text.x).toBe((segs[0].x + 4) * 0.5);
    expect(text.style).toMatchObject({ text: "Group_By_Region", fill: FALLBACK_TOKENS.text, fontSize: 5.5 });
    const noLabel = renderSegment(segs[2], geo, FALLBACK_TOKENS, 2) as { type: string };
    expect(noLabel.type).toBe("rect");
    // 콤팩트(24행) 세그먼트 라벨은 7 단위
    const compact = renderSegment(segs[0], geo, FALLBACK_TOKENS, 24) as { children: Array<{ style: { fontSize: number } }> };
    expect(compact.children[1].style.fontSize).toBe(7 * 0.5);
  });
});

describe("timelineOption — 축·브러시·시리즈", () => {
  it("grid = M×k, x 눈금 d3 ticks(6)·HH:MM, y 숨김, lineX 브러시(link 14%/60%), custom 시리즈 3개", () => {
    const geo = timelineGeometry(rows.length);
    const o = timelineOption(rows, domain, geo, FALLBACK_TOKENS, style) as unknown as {
      grid: Record<string, number>;
      xAxis: { min: number; max: number; axisLabel: { customValues: number[]; fontSize: number; formatter: (v: number) => string } };
      yAxis: { show: boolean };
      brush: { brushType: string; brushStyle: { color: string; borderColor: string } };
      series: Array<{ id: string; type: string; silent?: boolean; data: Array<{ node: string; gpu: string; title?: string }>; renderItem: (p: { dataIndex: number }) => { type: string } }>;
    };
    expect(o.grid).toMatchObject({ left: 92, right: 14, top: 8, bottom: 22 });
    expect(o.xAxis.min).toBe(domain.startMs);
    expect(o.xAxis.axisLabel.customValues).toEqual([1_000_000, 1_200_000, 1_400_000, 1_600_000, 1_800_000, 2_000_000]);
    expect(o.xAxis.axisLabel.fontSize).toBe(10);
    expect(o.xAxis.axisLabel.formatter(Date.UTC(2026, 0, 1, 1, 2))).toMatch(/^\d{2}:\d{2}$/);
    expect(o.yAxis.show).toBe(false);
    expect(o.brush.brushType).toBe("lineX");
    expect(o.brush.brushStyle).toEqual({ ...timelineBrushStyle(FALLBACK_TOKENS) });
    expect(o.series.map((s) => s.id)).toEqual(["rowbg", "segments", "rowlabels"]);
    expect(o.series.every((s) => s.type === "custom")).toBe(true);
    expect(o.series[0].silent).toBe(true);
    expect(o.series[1].data).toHaveLength(3);
    expect(o.series[1].data[0]).toMatchObject({ node: "gpu-server-01", gpu: "0", title: "gpu-server-01·G0M0 · Group_By_Region" });
    expect(o.series[2].data.map((d) => d.gpu)).toEqual(["0", "1"]);
    expect(o.series[1].renderItem({ dataIndex: 0 }).type).toBe("group");
    expect(o.series[2].renderItem({ dataIndex: 1 }).type).toBe("text");
  });

  it("withAlpha·brush areas·brushEnd 변환", () => {
    expect(withAlpha("#4fc3f7", 0.14)).toBe("rgba(79, 195, 247, 0.14)");
    expect(withAlpha("rgba(1,2,3,.5)", 0.14)).toBe("rgba(1,2,3,.5)");
    expect(timelineBrushAreas(null, domain)).toEqual([]);
    expect(timelineBrushAreas({ startMs: 900_000, endMs: 1_500_000 }, domain))
      .toEqual([{ brushType: "lineX", xAxisIndex: 0, coordRange: [1_000_000, 1_500_000] }]);
    expect(timelineBrushAreas({ startMs: 100, endMs: 200 }, domain)).toEqual([]);
    expect(selectionFromBrushEnd({ areas: [] }, domain)).toBeNull();
    expect(selectionFromBrushEnd({ areas: [{ coordRange: [1_700_000, 1_300_000] }] }, domain))
      .toEqual({ startMs: 1_300_000, endMs: 1_700_000 });
  });
});
