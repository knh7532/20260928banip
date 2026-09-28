import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { XViewChart } from "../src/components/charts/XViewChart";
import type { XViewEvent } from "../src/lib/xview";
import type { XvDatum } from "../src/lib/xviewOption";

/**
 * X-View 컴포넌트 배선 (ECharts, E5 D2) — 스텁 인스턴스로 배선을 검증한다: 시리즈 데이터, 호버/고정
 * 툴팁(포털), 휠 줌·더블클릭, 2D 드래그(오버레이·건수 라벨·dim·onDragRange). jsdom 은 레이아웃이
 * 없어 client 좌표 = 플롯 픽셀(폴백 460×200) — 현행 xviewRender 테스트와 같은 수치를 쓴다.
 */
const ev = (over: Partial<XViewEvent>): XViewEvent => ({
  node: "gpu-server-01", gpu: "0", mig: "0", stmtId: "100411", queryId: "Q-88011", user: "dba1",
  queryName: "Group_By_Region", status: "success", reason: "", endMs: 1_500_000, durationSec: 45,
  phases: { compileSec: 1, queuedSec: 2, initializingSec: 1, executingSec: 41 }, ...over,
});
const events: XViewEvent[] = [
  ev({ endMs: 1_200_000, durationSec: 40 }),
  ev({ endMs: 1_500_000, durationSec: 60, queryName: "Sales_Aggregation", stmtId: "100412" }),
  ev({ endMs: 1_800_000, durationSec: 160, stmtId: "100548", status: "failed", reason: "lock_timeout" }),
];
const domain = { domainStart: 1_000_000, domainEnd: 2_000_000 };
type Opt = { series: Array<{ id: string; data: XvDatum[] }> };
const inst = () => globalThis.__echartsMock.instances[0];
const last = () => inst().lastOption() as Opt;
const pointParams = (key: string, clientX = 100, clientY = 100) => ({ data: { key }, event: { event: { clientX, clientY } } });

describe("XViewChart", () => {
  beforeEach(() => {
    globalThis.__echartsMock.reset();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });

  it("호스트 div(role=img) + 성공 2/실패 1 시리즈 데이터, 폴링 갱신은 replaceMerge setOption", () => {
    const { container, rerender } = render(<XViewChart events={events} {...domain} />);
    expect(container.querySelector(".xview__plotwrap > .xview__chart[role='img']")).not.toBeNull();
    expect(last().series[0].data).toHaveLength(2);
    expect(last().series[1].data).toHaveLength(1);
    rerender(<XViewChart events={events.slice(0, 1)} {...domain} />);
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
    expect(last().series[0].data).toHaveLength(1);
    const lastCall = inst().setOption.mock.calls.at(-1) as unknown[];
    expect(lastCall[1]).toEqual({ replaceMerge: ["series"] });
  });

  it("호버 → 포털 툴팁, 벗어나면 사라짐; 클릭 → 고정(Esc 해제) + 고정 점 강조", () => {
    render(<XViewChart events={events} {...domain} />);
    act(() => inst().emit("mouseover", pointParams("100411|1200000")));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("tooltip").textContent).toContain("Group_By_Region");
    act(() => inst().emit("mouseout"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => inst().emit("click", pointParams("100412|1500000", 120, 90)));
    const tip = screen.getByRole("tooltip");
    expect(tip.classList.contains("xview__tip--pinned")).toBe(true);
    expect(tip.textContent).toContain("Sales_Aggregation");
    // 고정 중 호버는 무시, 고정 점은 옵션에서 강조
    act(() => inst().emit("mouseover", pointParams("100411|1200000")));
    expect(screen.getByRole("tooltip").textContent).toContain("Sales_Aggregation");
    const okData = last().series[0].data;
    expect(okData.find((d) => d.key === "100412|1500000")?.symbolSize).toBe(12);
    expect(okData.find((d) => d.key === "100411|1200000")?.symbolSize).toBeUndefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    // zr globalout 도 비고정 툴팁을 숨긴다
    act(() => inst().emit("mouseover", pointParams("100411|1200000")));
    act(() => inst().emitZr("globalout"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("휠 줌: 앵커는 커서 시각, 위=확대(1/1.2) 아래=축소(1.2); 더블클릭 → 리셋", () => {
    const onZoom = vi.fn();
    const onResetView = vi.fn();
    const { container } = render(
      <XViewChart events={events} {...domain} onZoom={onZoom} onResetView={onResetView} />,
    );
    const host = container.querySelector(".xview__chart") as HTMLElement;
    fireEvent.wheel(host, { deltaY: -100, clientX: 243 }); // 플롯 중앙(36~450) → 1.5M
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0][0]).toBeCloseTo(1 / 1.2, 6);
    expect(onZoom.mock.calls[0][1]).toBeCloseTo(1_500_000, -3);
    fireEvent.wheel(host, { deltaY: 100, clientX: 36 });
    expect(onZoom.mock.calls[1][0]).toBe(1.2);
    expect(onZoom.mock.calls[1][1]).toBeCloseTo(1_000_000, -3);
    fireEvent.doubleClick(host);
    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it("2D 드래그: 오버레이 영역·건수 라벨·영역 밖 dim → 놓으면 onDragRange(ms, ms, {minSec,maxSec})", () => {
    const onDragRange = vi.fn();
    const { container } = render(<XViewChart events={events} {...domain} onDragRange={onDragRange} />);
    const host = container.querySelector(".xview__chart") as HTMLElement;
    fireEvent.mouseDown(host, { clientX: 40, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 445, clientY: 160 });
    const zone = container.querySelector(".xvo-zone") as HTMLElement;
    expect(zone).not.toBeNull();
    expect(zone.style.left).toBe("40px");
    expect(zone.style.top).toBe("100px");
    expect(zone.style.height).toBe("60px");
    expect(container.querySelector(".xvo-count")?.textContent).toBe("2건");
    // 라벨 상자 치수는 차트 스케일 k 를 따른다 (jsdom 폴백 k=1 → 10px/16px, codex E5-01)
    const count = container.querySelector(".xvo-count") as HTMLElement;
    expect(count.style.fontSize).toBe("10px");
    expect(count.style.height).toBe("16px");
    // dim: 160s 실패 ✕ 만 밖
    expect(last().series[0].data.map((d) => d.itemStyle.opacity)).toEqual([0.85, 0.85]);
    expect(last().series[1].data[0].itemStyle.opacity).toBe(0.22);
    fireEvent.mouseUp(document, { clientX: 445, clientY: 160 });
    expect(container.querySelector(".xv-overlay")).toBeNull();
    expect(last().series[1].data[0].itemStyle.opacity).toBe(1);
    expect(onDragRange).toHaveBeenCalledTimes(1);
    const [s, e, d] = onDragRange.mock.calls[0] as [number, number, { minSec: number; maxSec: number }];
    expect(s).toBeCloseTo(1_009_661, -3);
    expect(e).toBeCloseTo(1_987_922, -3);
    expect(d.minSec).toBeCloseTo(20.465, 2);
    expect(d.maxSec).toBeCloseTo(81.86, 2);
  });

  it("가로 전용 드래그(세로 4px 미만)는 y 전체·duration 없음, 4px 미만 이동은 드래그 아님, 1초 미만 구간 무시", () => {
    const onDragRange = vi.fn();
    const { container } = render(<XViewChart events={events} {...domain} onDragRange={onDragRange} />);
    const host = container.querySelector(".xview__chart") as HTMLElement;
    fireEvent.mouseDown(host, { clientX: 40, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 445, clientY: 102 });
    const zone = container.querySelector(".xvo-zone") as HTMLElement;
    expect(zone.style.top).toBe("8px");
    expect(zone.style.height).toBe("172px");
    expect(container.querySelector(".xvo-count")?.textContent).toBe("3건 · 실패 1");
    fireEvent.mouseUp(document, { clientX: 445, clientY: 102 });
    expect(onDragRange).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), undefined);
    // 미세 이동 → 드래그 아님
    fireEvent.mouseDown(host, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 102, clientY: 100 });
    expect(container.querySelector(".xvo-zone")).toBeNull();
    fireEvent.mouseUp(document, { clientX: 102, clientY: 100 });
    expect(onDragRange).toHaveBeenCalledTimes(1);
    // 오른쪽 버튼은 무시
    fireEvent.mouseDown(host, { clientX: 100, clientY: 100, button: 2 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 100 });
    expect(container.querySelector(".xvo-zone")).toBeNull();
  });

  it("onDragRange 미제공이면 드래그를 시작하지 않는다; 언마운트 시 dispose", () => {
    const { container, unmount } = render(<XViewChart events={events} {...domain} />);
    const host = container.querySelector(".xview__chart") as HTMLElement;
    fireEvent.mouseDown(host, { clientX: 40, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 150 });
    expect(container.querySelector(".xvo-zone")).toBeNull();
    unmount();
    expect(inst().dispose).toHaveBeenCalledTimes(1);
  });
});
