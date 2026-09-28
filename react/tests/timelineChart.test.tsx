import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Timeline } from "../src/components/charts/Timeline";
import type { TimelineRow } from "../src/lib/timeline";

/**
 * 타임라인 컴포넌트 배선 (ECharts, E5 D4) — 스텁으로 배선을 본다: 시리즈 데이터, 캔버스 높이(viewBox×k),
 * 클릭(막대·행 라벨) → onSelectGpu, 네이티브 title 툴팁, brushEnd → onSelectRange,
 * selection prop → dispatchAction brush(재발화 없음), 빈 rows → 안내 문구, 범례·panControl 슬롯.
 */
const seg = (node: string, gpu: string, startMs: number, endMs: number, name: string, type: string) =>
  ({ node, gpu, mig: "0", startMs, endMs, value: 1, name, type });
const rows: TimelineRow[] = [
  { node: "gpu-server-01", gpu: "0", mig: "0", key: "gpu-server-01/0/0", segments: [seg("gpu-server-01", "0", 1_000_000, 1_400_000, "Group_By_Region", "select")] },
  { node: "gpu-server-01", gpu: "1", mig: "0", key: "gpu-server-01/1/0", segments: [seg("gpu-server-01", "1", 1_500_000, 1_900_000, "Daily_Order_Insert", "etl")] },
];
const base = { rows, domainStart: 1_000_000, domainEnd: 2_000_000, selection: null, onSelectRange: () => undefined, onSelectGpu: () => undefined };
type Opt = { series: Array<{ id: string; data: Array<{ node: string; gpu: string; title?: string }> }> };
const inst = () => globalThis.__echartsMock.instances.at(-1)!;
const last = () => inst().lastOption() as Opt;
const brushActs = () => inst().dispatchAction.mock.calls.map((c) => c[0] as { type: string; areas?: unknown[] }).filter((a) => a.type === "brush");

describe("Timeline", () => {
  beforeEach(() => {
    globalThis.__echartsMock.reset();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });

  it("호스트 .timeline__chart(role=img) · 세그먼트 2 · 행 라벨 2 · 캔버스 높이 90px(2행×30, k=1)", () => {
    const { container } = render(<Timeline {...base} />);
    const host = container.querySelector(".timeline__chart") as HTMLElement;
    expect(host.getAttribute("role")).toBe("img");
    expect(host.style.height).toBe("90px");
    expect(last().series[1].data).toHaveLength(2);
    expect(last().series[2].data).toHaveLength(2);
    expect(container.querySelector(".timeline__plot-scroll > .timeline__chart")).not.toBeNull();
  });

  it("행 수 > 8 이면 콤팩트(12): 24행 → 318px", () => {
    const many: TimelineRow[] = Array.from({ length: 24 }, (_, i) => ({
      node: "gpu-server-01", gpu: String(i % 4), mig: String(Math.floor(i / 4)), key: `k${i}`, segments: [],
    }));
    const { container } = render(<Timeline {...base} rows={many} />);
    expect((container.querySelector(".timeline__chart") as HTMLElement).style.height).toBe("318px");
  });

  it("막대 클릭·행 라벨 클릭 → onSelectGpu(node,gpu); 다른 시리즈(행 배경) 클릭은 무시", () => {
    const onSelectGpu = vi.fn();
    render(<Timeline {...base} onSelectGpu={onSelectGpu} />);
    act(() => inst().emit("click", { seriesId: "segments", data: last().series[1].data[1] }));
    expect(onSelectGpu).toHaveBeenLastCalledWith("gpu-server-01", "1");
    act(() => inst().emit("click", { seriesId: "rowlabels", data: last().series[2].data[0] }));
    expect(onSelectGpu).toHaveBeenLastCalledWith("gpu-server-01", "0");
    act(() => inst().emit("click", { seriesId: "rowbg", data: last().series[0].data[0] }));
    expect(onSelectGpu).toHaveBeenCalledTimes(2);
  });

  it("막대 호버 → 호스트 title '{워커} · {쿼리명}' (네이티브 툴팁), 벗어나면 제거", () => {
    const { container } = render(<Timeline {...base} />);
    const host = container.querySelector(".timeline__chart") as HTMLElement;
    act(() => inst().emit("mouseover", { seriesId: "segments", data: last().series[1].data[0] }));
    expect(host.title).toBe("sqream101 · Group_By_Region"); // 노드1·g0·m0 → sqream101
    act(() => inst().emit("mouseout", {}));
    expect(host.hasAttribute("title")).toBe(false);
  });

  it("brushEnd → onSelectRange(clamp) / 빈 영역 → null; 외부 selection 은 dispatchAction brush 로만(재발화 없음)", () => {
    const onSelectRange = vi.fn();
    const { rerender } = render(<Timeline {...base} onSelectRange={onSelectRange} />);
    act(() => inst().emit("brushEnd", { areas: [{ coordRange: [1_200_000, 2_500_000] }] }));
    expect(onSelectRange).toHaveBeenLastCalledWith({ startMs: 1_200_000, endMs: 2_000_000 });
    act(() => inst().emit("brushEnd", { areas: [] }));
    expect(onSelectRange).toHaveBeenLastCalledWith(null);
    onSelectRange.mockClear();
    rerender(<Timeline {...base} onSelectRange={onSelectRange} selection={{ startMs: 1_100_000, endMs: 1_300_000 }} />);
    expect(brushActs().at(-1)?.areas).toEqual([{ brushType: "lineX", xAxisIndex: 0, coordRange: [1_100_000, 1_300_000] }]);
    rerender(<Timeline {...base} onSelectRange={onSelectRange} selection={null} />);
    expect(brushActs().at(-1)?.areas).toEqual([]);
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
  });

  it("빈 rows → 안내 문구·차트 없음(emptyText 우선); 데이터가 오면 그때 init", () => {
    const { container, rerender } = render(<Timeline {...base} rows={[]} emptyText="불러오는 중…" />);
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
    expect(container.querySelector(".timeline__chart")).toBeNull();
    expect(globalThis.__echartsMock.init).not.toHaveBeenCalled();
    rerender(<Timeline {...base} />);
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
  });

  it("범례 기본 6종·주입 범례·panControl 슬롯·제목 접미사, LLM 변형 props(colorOf·rowLabelOf) 반영", () => {
    const { container, rerender } = render(<Timeline {...base} titleSuffix="(인스턴스: All)" />);
    expect(container.querySelectorAll(".timeline__legend li")).toHaveLength(6);
    expect(container.textContent).toContain("시간대별 GPU 세션 & SQL 쿼리 실행 타임라인 (인스턴스: All)");
    expect(container.querySelector(".pan-scroll-slot")).toBeNull();
    rerender(
      <Timeline
        {...base} title="LLM" legendItems={[{ key: "a", color: "#111111", label: "A" }]}
        colorOf={() => "#123456"} rowLabelOf={(_n, g) => `GPU-${g}`} singleInstance
        panControl={<div className="pan-scroll-slot" />}
      />,
    );
    expect(container.querySelectorAll(".timeline__legend li")).toHaveLength(1);
    expect(container.querySelector(".pan-scroll-slot")).not.toBeNull();
    expect(last().series[1].data[0].title).toBe("GPU-0 · Group_By_Region");
    const el = (last() as unknown as { series: Array<{ renderItem: (p: { dataIndex: number }) => { children: Array<{ style: { fill: string } }> } }> })
      .series[1].renderItem({ dataIndex: 0 });
    expect(el.children[0].style.fill).toBe("#123456");
  });
});
