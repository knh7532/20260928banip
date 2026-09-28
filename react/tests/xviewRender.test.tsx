// @vitest-environment jsdom
import { useState } from "react";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import { XViewChart } from "../src/components/charts/XViewChart";
import { XViewListModal } from "../src/components/detail/XViewListModal";
import { XViewPanel } from "../src/components/detail/XViewPanel";
import type { XViewEvent } from "../src/lib/xview";
import type { XvDatum } from "../src/lib/xviewOption";

/**
 * X-View 렌더 (E5 D2 — ECharts 판). 점/✕ 는 canvas 라 DOM 에 없다: 마지막 setOption 의
 * 시리즈 데이터(스텁 `lastOption()`)로 "무엇을 그리나"를 보고, 점 위 호버/클릭은 스텁의
 * `emit("mouseover"|"click", params)` 로 발화한다. 툴팁 포털·드래그 오버레이·목록 모달·
 * 필터 팝오버는 그대로 DOM 이다. jsdom 은 레이아웃이 없어 client 좌표 = 플롯 픽셀(폴백 460×200).
 */
const ev = (over: Partial<XViewEvent>): XViewEvent => {
  const base: XViewEvent = {
    node: "gpu-server-01",
    gpu: "0",
    mig: "1",
    stmtId: "100411",
    queryId: "Q-88003",
    user: "analyst2",
    queryName: "Customer_Join",
    status: "success",
    reason: "",
    endMs: 1_500_000,
    durationSec: 45,
    phases: null,
    ...over,
  };
  // X3: phases를 명시하지 않으면 실행시간과 정합하는 기본 단계를 채운다
  if (base.phases === null && !("phases" in over)) {
    base.phases = {
      compileSec: 1.2, queuedSec: 0.5, initializingSec: 0.8,
      executingSec: base.durationSec,
    };
  }
  return base;
};

const events: XViewEvent[] = [
  ev({ endMs: 1_200_000, durationSec: 40 }),
  ev({ endMs: 1_500_000, durationSec: 60, queryName: "Sales_Aggregation" }),
  ev({
    endMs: 1_800_000, durationSec: 160, stmtId: "100548",
    status: "failed", reason: "lock_timeout",
  }),
];
/** 데이터 키 = stmtId|endMs */
const K_JOIN = "100411|1200000";
const K_AGG = "100411|1500000";
const K_FAIL = "100548|1800000";

type Opt = { series: Array<{ id: string; data: XvDatum[] }> };
/** 가장 최근에 만들어진 차트 인스턴스(패널이 재마운트되면 새 인스턴스). */
const inst = () => globalThis.__echartsMock.instances.at(-1)!;
const last = () => inst().lastOption() as Opt;
const okData = () => last().series[0].data;
const failData = () => last().series[1].data;
const pointCount = () => okData().length + failData().length;
const pointParams = (key: string, clientX = 100, clientY = 100) => ({ data: { key }, event: { event: { clientX, clientY } } });
const hover = (key: string, clientX?: number, clientY?: number) => act(() => inst().emit("mouseover", pointParams(key, clientX, clientY)));
const move = (key: string, clientX: number, clientY: number) => act(() => inst().emit("mousemove", pointParams(key, clientX, clientY)));
const leave = () => act(() => inst().emit("mouseout"));
const clickPoint = (key: string, clientX?: number, clientY?: number) => act(() => inst().emit("click", pointParams(key, clientX, clientY)));
const host = (container: HTMLElement) => container.querySelector(".xview__chart") as HTMLElement;

beforeEach(() => {
  globalThis.__echartsMock.reset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});

describe("XViewChart (ECharts 산점도)", () => {
  it("성공은 원(ok 시리즈), 실패는 ✕(fail 시리즈) — 이벤트 수만큼 그린다", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    expect(okData()).toHaveLength(2);
    expect(failData()).toHaveLength(1);
    expect(last().series.map((s) => s.id)).toEqual(["ok", "fail"]);
  });

  it("점 색은 쿼리 유형색이다 (join=#22d3ee, aggregation=#a78bfa) — 실패도 유형색 유지", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    expect(okData().find((d) => d.key === K_JOIN)?.itemStyle.color).toBe("#22d3ee");
    expect(okData().find((d) => d.key === K_AGG)?.itemStyle.color).toBe("#a78bfa");
    // 실패 ✕는 **모양이 1차 채널** — 색만으로는 fullscan(#f87171)과 못 가른다 (X2 계획)
    const fail = failData()[0];
    expect(fail.itemStyle.borderColor).toBe("#22d3ee");
    expect(fail.itemStyle.color).toBe("none");
    expect(fail.key).toBe(K_FAIL);
  });

  it("호버 툴팁(X2-f1): 쿼리명·유형·워커·stmt_id·사용자·성공이 뜨고, 떠나면 사라진다", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    hover(K_JOIN);
    const tipEl = screen.getByRole("tooltip");
    expect(tipEl.textContent).toContain("Customer_Join");
    expect(tipEl.textContent).toContain("JOIN 쿼리");        // 유형 표기
    expect(tipEl.textContent).toContain("sqream102");        // 워커 (노드1·g0·m1 → sqream102)
    expect(tipEl.textContent).toContain("100411");           // stmt_id
    expect(tipEl.textContent).toContain("Q-88003");          // 쿼리 ID
    expect(tipEl.textContent).toContain("analyst2");         // 사용자
    expect(tipEl.textContent).toContain("성공");
    leave();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("호버 툴팁(X3): Node(서버) 행이 워커 위에 있고 displayNode 표기를 쓴다", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    hover(K_JOIN);
    const tipEl = screen.getByRole("tooltip");
    expect(tipEl.textContent).toContain("icspreamh2gpu01"); // displayNode
    const labels = [...tipEl.querySelectorAll(".xview__tip-rows dt")].map((d) => d.textContent);
    expect(labels.indexOf("Node(서버)")).toBeLessThan(labels.indexOf("워커"));
  });

  it("호버 툴팁(X3): 100% 누적 막대 — 4세그먼트·단계별 초·Completed 시각/총소요", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    hover(K_JOIN);
    const tipEl = screen.getByRole("tooltip");
    const segs = [...tipEl.querySelectorAll(".xview__tip-seg")];
    expect(segs).toHaveLength(4);
    // Executing(40s)이 총 42.5s의 대부분 — 폭 %가 가장 커야 한다
    const widths = segs.map((s) => Number.parseFloat((s as HTMLElement).style.width));
    expect(Math.max(...widths)).toBeCloseTo((40 / 42.5) * 100, 0);
    expect(tipEl.textContent).toContain("Compile");
    expect(tipEl.textContent).toContain("In Queue");
    expect(tipEl.textContent).toContain("Initializing");
    expect(tipEl.textContent).toContain("Executing");
    expect(tipEl.textContent).toContain("40.0 s");         // Executing 행
    expect(tipEl.textContent).toContain("총 42.5s");        // Completed 행 총소요
  });

  it("호버 툴팁(X3): phases 없으면 막대 대신 '단계 정보 없음' — 점은 그대로", () => {
    const noPhase = [ev({ phases: null })];
    render(<XViewChart events={noPhase} domainStart={1_000_000} domainEnd={2_000_000} />);
    expect(okData()).toHaveLength(1); // 산점도 무영향
    hover(K_AGG); // 기본 endMs 1.5M
    const tipEl = screen.getByRole("tooltip");
    expect(tipEl.textContent).toContain("단계 정보 없음");
    expect(tipEl.querySelectorAll(".xview__tip-seg")).toHaveLength(0);
  });

  it("호버 툴팁(X3): 실패는 유형·발생 시점(단계)을 보여주고 해당 세그먼트를 강조한다", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    hover(K_FAIL);
    const tipEl = screen.getByRole("tooltip");
    expect(tipEl.textContent).toContain("실패: Execution Error — Executing 단계");
    expect(tipEl.textContent).toContain("lock_timeout (실행하다 실패)");
    expect(tipEl.textContent).toContain("100548");
    // 매핑된 단계(executing) 세그먼트·행 강조
    const failSeg = tipEl.querySelector(".xview__tip-seg--fail") as HTMLElement;
    expect(failSeg?.getAttribute("data-phase")).toBe("executingSec");
    expect(tipEl.querySelector(".xview__tip-phase-row--fail")?.textContent).toContain("Executing");
  });

  it("호버 툴팁: 뷰포트 여백이 모자라면 커서 반대쪽으로 편다 (fixed 포털 — 잘림 방지)", () => {
    // jsdom 기본 뷰포트 1024×768 기준 — 우/하단 여백 부족 시 translate로 플립
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    // mousemove 경로도 함께 탄다 — 900+290 > 1024 → flip
    hover(K_JOIN, 900, 40);
    move(K_JOIN, 900, 42);
    const tipEl = screen.getByRole("tooltip");
    expect(tipEl.style.transform).toBe("translateX(-100%)");
    // 하단 여백 부족 — 600+310 > 768 → 위로도 편다
    move(K_JOIN, 900, 600);
    expect(screen.getByRole("tooltip").style.transform).toBe("translateX(-100%) translateY(-100%)");
    // 좌상단이면 flip 없음 — 그리고 툴팁은 body 포털이다 (패널 밖, position:fixed)
    move(K_JOIN, 60, 42);
    const tip2 = screen.getByRole("tooltip");
    expect(tip2.style.transform).toBe("");
    expect(tip2.closest(".xview__plotwrap")).toBeNull();
  });
});

describe("XViewPanel — 요약행은 표시 이벤트 집합에서 계산 (XR-04)", () => {
  const domain = { startMs: 1_000_000, endMs: 2_000_000 };
  const noop = () => undefined;

  it("선택 없음: 전체 배지 + 전 이벤트 집계", () => {
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} onClose={noop} />,
    );
    expect(screen.getByText("전체")).toBeInTheDocument();
    const summary = container.querySelector(".xview__summary") as HTMLElement;
    expect(summary.textContent).toContain("완료 3건");
    expect(summary.textContent).toContain("에러 1건");
    // 평균 (40+60+160)/3 ≈ 86.7 s
    expect(summary.textContent).toContain("86.7 s");
    expect(pointCount()).toBe(3);
  });

  it("선택 있음: 구간 밖 점 제외 — 차트·요약이 같은 집합으로 줄어든다", () => {
    const { container } = render(
      <XViewPanel
        events={events}
        selection={{ startMs: 1_400_000, endMs: 1_900_000 }}
        domain={domain}
        onClose={noop}
      />,
    );
    const summary = container.querySelector(".xview__summary") as HTMLElement;
    expect(summary.textContent).toContain("완료 2건");
    expect(summary.textContent).toContain("에러 1건");
    expect(screen.queryByText("전체")).toBeNull();
    expect(pointCount()).toBe(2);
  });

  it("×는 선택 없으면 비활성, 있으면 onClose를 부른다 (구 RangeDetail 승계)", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <XViewPanel events={events} selection={null} domain={domain} onClose={onClose} />,
    );
    const btn = screen.getByRole("button", { name: "선택 구간 해제" });
    expect(btn).toBeDisabled();
    rerender(
      <XViewPanel
        events={events}
        selection={{ startMs: 1_400_000, endMs: 1_900_000 }}
        domain={domain}
        onClose={onClose}
      />,
    );
    // 선택 prop 반영 자체는 콜백을 되부르지 않는다 (재발화 금지 — timelineRender 패턴)
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "선택 구간 해제" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("클릭 고정(X3-f2): 클릭하면 마우스가 떠나도 유지 — pinned 클래스·복사 가능", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    clickPoint(K_JOIN);
    leave(); // 호버 이탈에도 유지된다
    const tipEl = screen.getByRole("tooltip");
    expect(tipEl.textContent).toContain("Customer_Join");
    expect(tipEl.className).toContain("xview__tip--pinned"); // pointer-events·user-select 활성
  });

  it("클릭 고정(X3-f2): 고정 중 다른 점 호버는 무시, 다른 점 클릭은 재고정", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    clickPoint(K_JOIN);
    hover(K_AGG); // 호버로는 내용이 바뀌지 않는다 — 고정이 이긴다
    expect(screen.getByRole("tooltip").textContent).toContain("Customer_Join");
    clickPoint(K_AGG); // 클릭은 그 점으로 재고정
    expect(screen.getByRole("tooltip").textContent).toContain("Sales_Aggregation");
  });

  it("클릭 고정(X3-f2): 바깥 mousedown으로 해제, 툴팁 내부 mousedown은 유지", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    clickPoint(K_JOIN);
    // 툴팁 내부 클릭(텍스트 선택·복사)은 해제하지 않는다
    fireEvent.mouseDown(screen.getByRole("tooltip"));
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    // 바깥 클릭은 해제한다
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("클릭 고정(X3-f2): Escape로 해제", () => {
    render(<XViewChart events={events} domainStart={1_000_000} domainEnd={2_000_000} />);
    clickPoint(K_JOIN);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("표시 필터(X4): 아이콘 → 팝오버(상태 2·유형 6칩), 에러 off면 ✕·요약이 함께 빠진다", () => {
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} onClose={noop} />,
    );
    const btn = screen.getByRole("button", { name: "표시 필터" });
    fireEvent.click(btn);
    const pop = screen.getByRole("dialog", { name: "X-View 표시 필터" });
    const chips = within(pop).getAllByRole("button").filter((b) => b.className.includes("xview__chip"));
    expect(chips).toHaveLength(8); // 상태 2 + 유형 6
    // 에러 off → ✕ 사라지고 요약행도 같은 집합으로 준다 (XR-04)
    fireEvent.click(within(pop).getByRole("button", { name: "에러 ✕" }));
    expect(failData()).toHaveLength(0);
    expect(okData()).toHaveLength(2);
    const summary = container.querySelector(".xview__summary") as HTMLElement;
    expect(summary.textContent).toContain("완료 2건");
    expect(summary.textContent).toContain("에러 0건");
    expect(summary.textContent).toContain("필터"); // 활성 배지
    expect(btn.className).toContain("xview__filter-btn--active");
  });

  it("표시 필터(X4): 유형 칩 off → 해당 색 점 제거, '모두 표시'로 리셋", () => {
    render(<XViewPanel events={events} selection={null} domain={domain} onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "표시 필터" }));
    const pop = screen.getByRole("dialog", { name: "X-View 표시 필터" });
    fireEvent.click(within(pop).getByRole("button", { name: /JOIN 쿼리/ }));
    // join(Customer_Join) 성공 1 + 실패 1 제거 → 남는 건 Sales_Aggregation 1개
    expect(pointCount()).toBe(1);
    fireEvent.click(within(pop).getByRole("button", { name: "모두 표시" }));
    expect(pointCount()).toBe(3);
  });

  it("표시 필터(X4): 전부 끄면 '필터로 모두 숨겨졌습니다' 안내 — 차트는 내려간다(dispose)", () => {
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} onClose={noop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "표시 필터" }));
    const pop = screen.getByRole("dialog", { name: "X-View 표시 필터" });
    fireEvent.click(within(pop).getByRole("button", { name: "완료" }));
    fireEvent.click(within(pop).getByRole("button", { name: "에러 ✕" }));
    expect(screen.getByText(/필터로 모두 숨겨졌습니다/)).toBeInTheDocument();
    expect(container.querySelector(".xview__chart")).toBeNull();
    expect(inst().dispose).toHaveBeenCalledTimes(1);
  });

  it("표시 필터(X4): 바깥 mousedown·Escape로 팝오버 닫힘", () => {
    render(<XViewPanel events={events} selection={null} domain={domain} onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "표시 필터" }));
    expect(screen.queryByRole("dialog", { name: "X-View 표시 필터" })).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "X-View 표시 필터" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "표시 필터" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "X-View 표시 필터" })).toBeNull();
  });

  it("휠 줌(X4): 휠 업=확대(창 좁아짐)·더블클릭=리셋 — 요약 구간·배지가 함께 바뀐다", () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel
        events={events} selection={null} domain={domain} pan={pan} onClose={noop}
      />,
    );
    const before = (container.querySelector(".xview__range") as HTMLElement).textContent;
    fireEvent.wheel(host(container), { deltaY: -100, clientX: 0 }); // 휠 업 = 확대
    const after = (container.querySelector(".xview__range") as HTMLElement).textContent;
    expect(after).not.toBe(before);
    expect(after).toContain("줌·팬"); // 수동 뷰 배지
    fireEvent.dblClick(host(container));
    expect((container.querySelector(".xview__range") as HTMLElement).textContent)
      .toContain("전체"); // 기본 창 복귀
  });

  it("줌 클램프(X4): 연속 축소는 3× 전체에서 멈춘다", () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    for (let i = 0; i < 12; i++) fireEvent.wheel(host(container), { deltaY: 100, clientX: 0 }); // 축소 반복
    const zoomedOut = (container.querySelector(".xview__range") as HTMLElement).textContent;
    fireEvent.wheel(host(container), { deltaY: 100, clientX: 0 });
    expect((container.querySelector(".xview__range") as HTMLElement).textContent).toBe(zoomedOut);
  });

  it("줌 클램프(X4): 연속 확대는 최소 창(60s)에서 멈춘다 — 앵커(뷰 중앙) 이벤트는 남는다", () => {
    // jsdom엔 레이아웃이 없어 호스트 상자가 (0,0) — clientX 243 = 플롯 중앙(36~450).
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    for (let i = 0; i < 40; i++) fireEvent.wheel(host(container), { deltaY: -100, clientX: 243 }); // 확대 반복
    const zoomedIn = (container.querySelector(".xview__range") as HTMLElement).textContent;
    fireEvent.wheel(host(container), { deltaY: -100, clientX: 243 });
    expect((container.querySelector(".xview__range") as HTMLElement).textContent).toBe(zoomedIn);
    // 최소 창에서도 중앙 이벤트(1.5M, Sales_Aggregation)는 표시된다
    expect(okData().length).toBeGreaterThanOrEqual(1);
  });

  it("선택 중 줌·팬은 선택을 해제하고 수동 뷰로 전환한다 (onClose 호출)", () => {
    const onClose = vi.fn();
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel
        events={events} selection={{ startMs: 1_100_000, endMs: 1_900_000 }}
        domain={domain} pan={pan} onClose={onClose}
      />,
    );
    fireEvent.wheel(host(container), { deltaY: -100, clientX: 0 });
    expect(onClose).toHaveBeenCalled();
  });

  it("스크롤 팬(X4): 과거로 이동하면 '줌·팬' 배지, 우측 끝 복귀 시 '전체'", () => {
    const sw = vi.spyOn(HTMLDivElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    const cw = vi.spyOn(HTMLDivElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const bar = container.querySelector(".pan-scroll") as HTMLElement;
    fireEvent.scroll(bar); // 마운트 동기화(프로그램적 이동)의 이벤트를 먼저 소화한다
    bar.scrollLeft = 100; // 중간 → 과거 고정
    fireEvent.scroll(bar);
    expect((container.querySelector(".xview__range") as HTMLElement).textContent).toContain("줌·팬");
    bar.scrollLeft = 200; // 우측 끝 → 기본 폭이므로 완전 추적 복귀
    fireEvent.scroll(bar);
    expect((container.querySelector(".xview__range") as HTMLElement).textContent).toContain("전체");
    sw.mockRestore();
    cw.mockRestore();
  });

  it("선택 중 줌은 수동 뷰를 **보존**한다 — controlled 재렌더에도 (CDX-X4-02)", () => {
    // 실제 부모처럼 selection을 state로 소유하고 onClose가 null 재렌더를 일으킨다
    function Controlled() {
      const [sel, setSel] = useState<{ startMs: number; endMs: number } | null>({
        startMs: 1_100_000, endMs: 1_900_000,
      });
      return (
        <XViewPanel
          events={events} selection={sel} domain={domain}
          pan={{ startMs: 0, endMs: 2_000_000 }} onClose={() => setSel(null)}
        />
      );
    }
    const { container } = render(<Controlled />);
    fireEvent.wheel(host(container), { deltaY: -100, clientX: 0 });
    // 선택 해제 재렌더 후에도 줌 뷰가 살아 있어야 한다 — '줌·팬' 배지 유지
    expect((container.querySelector(".xview__range") as HTMLElement).textContent)
      .toContain("줌·팬");
  });

  it("줌 폭으로 우측 끝에 붙으면 폴링 갱신을 **추적**한다 (CDX-X4-04)", () => {
    const sw = vi.spyOn(HTMLDivElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    const cw = vi.spyOn(HTMLDivElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const pan1 = { startMs: 0, endMs: 2_000_000 };
    const { container, rerender } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan1} onClose={noop} />,
    );
    // 줌인(폭 축소) 후 스크롤바 우측 끝으로 → 추적(anchor null) + 줌 폭 유지
    fireEvent.wheel(host(container), { deltaY: -100, clientX: 0 });
    const bar = container.querySelector(".pan-scroll") as HTMLElement;
    fireEvent.scroll(bar); // 동기화 이벤트 소화
    bar.scrollLeft = 200;
    fireEvent.scroll(bar);
    const before = (container.querySelector(".xview__range") as HTMLElement).textContent;
    expect(before).toContain("줌·팬");
    // 폴링 갱신 흉내: 5초 전진 — 뷰 끝이 함께 이동해야 한다(추적)
    rerender(
      <XViewPanel
        events={events} selection={null}
        domain={{ startMs: 1_005_000, endMs: 2_005_000 }}
        pan={{ startMs: 5_000, endMs: 2_005_000 }} onClose={noop}
      />,
    );
    const after = (container.querySelector(".xview__range") as HTMLElement).textContent;
    expect(after).not.toBe(before); // 끝 시각이 전진했다
    expect(after).toContain("줌·팬"); // 줌 폭은 유지
    sw.mockRestore();
    cw.mockRestore();
  });

  it("시간 범위(창 폭)가 바뀌면 수동 뷰를 리셋한다 (CDX-X4-05)", () => {
    const { container, rerender } = render(
      <XViewPanel
        events={events} selection={null} domain={domain}
        pan={{ startMs: 0, endMs: 2_000_000 }} onClose={noop}
      />,
    );
    fireEvent.wheel(host(container), { deltaY: -100, clientX: 0 });
    expect((container.querySelector(".xview__range") as HTMLElement).textContent)
      .toContain("줌·팬");
    // 시간 범위 축소(1000s→300s 창): 새 3× 조회와 무관한 이전 줌은 무효
    rerender(
      <XViewPanel
        events={events} selection={null}
        domain={{ startMs: 1_700_000, endMs: 2_000_000 }}
        pan={{ startMs: 1_100_000, endMs: 2_000_000 }} onClose={noop}
      />,
    );
    expect((container.querySelector(".xview__range") as HTMLElement).textContent)
      .toContain("전체");
  });

  it("드래그(X5-b): 드래그 중 영역 표시, 놓으면 구간 쿼리 목록 — 뷰는 불변", () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const h = host(container);
    const before = (container.querySelector(".xview__range") as HTMLElement).textContent;
    fireEvent.mouseDown(h, { clientX: 100 });
    fireEvent.mouseMove(h, { clientX: 300 });
    expect(container.querySelector(".xvo-zone")).not.toBeNull(); // 드래그 중 영역 표시(HTML 오버레이)
    fireEvent.mouseUp(h, { clientX: 300 });
    expect(container.querySelector(".xvo-zone")).toBeNull();
    // 확대가 아니라 목록이 열린다 (인간 정정) — 뷰·요약 구간은 그대로다
    expect(screen.getByRole("dialog", { name: "구간 쿼리 목록" })).toBeInTheDocument();
    expect((container.querySelector(".xview__range") as HTMLElement).textContent).toBe(before);
    expect(screen.queryByRole("button", { name: "줌·팬 초기화" })).toBeNull();
    // 구간(≈1.15M~1.64M ms)에는 성공 2건만 있다 — 목록·요약 일치
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    expect(within(modal).getAllByRole("option")).toHaveLength(2);
    expect(modal.textContent).toContain("완료 2건");
    expect(modal.textContent).toContain("에러 0건");
  });

  it("드래그(X5-b): 4px 미만은 클릭 취급 — 드래그 자체 click 1회만 삼키고 다음 클릭은 통과", async () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const h = host(container);
    fireEvent.mouseDown(h, { clientX: 100 });
    fireEvent.mouseUp(h, { clientX: 102 }); // 미세 이동
    expect(screen.queryByRole("dialog", { name: "구간 쿼리 목록" })).toBeNull();
    // 실제 드래그 → 목록 열림. mouseup에 **같은 태스크로 뒤따르는** click(브라우저가
    // 드래그 종점에 쏘는 것)만 문서 캡처 단계에서 삼켜져 canvas(ECharts)까지 내려가지 않는다
    // — 오고정 방지 (CDX-X5-01)
    const reached = vi.fn();
    h.addEventListener("click", reached);
    fireEvent.mouseDown(h, { clientX: 100 });
    fireEvent.mouseMove(h, { clientX: 300 });
    fireEvent.mouseUp(h, { clientX: 300 });
    fireEvent.click(h); // 드래그 상호작용이 만든 click
    expect(reached).not.toHaveBeenCalled(); // 삼켜짐
    fireEvent.keyDown(document, { key: "Escape" }); // 목록 닫기
    await new Promise((r) => setTimeout(r, 0)); // 상호작용 종료(다음 태스크) — 무장 해제
    fireEvent.click(h); // 사용자의 다음 실제 클릭은 삼키지 않는다 (CDX-X5-01 핵심)
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it("드래그(X5-b): 진행 중 폴링 갱신에도 드래그 유지, 차트 밖에서 놓아도 종료 (CDX-X5-02)", () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container, rerender } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const h = host(container);
    fireEvent.mouseDown(h, { clientX: 100 });
    fireEvent.mouseMove(h, { clientX: 200 });
    expect(container.querySelector(".xvo-zone")).not.toBeNull();
    // 5s 폴링 시뮬레이션 — 새 events 참조로 setOption(인스턴스 재생성 없음)
    rerender(
      <XViewPanel
        events={[...events]} selection={null} domain={domain} pan={pan} onClose={noop}
      />,
    );
    expect(container.querySelector(".xvo-zone")).not.toBeNull(); // 영역 유지
    expect(globalThis.__echartsMock.init).toHaveBeenCalledTimes(1);
    // 포인터가 차트를 벗어난 채 계속 — document 레벨 추적
    fireEvent.mouseMove(document, { clientX: 300 });
    fireEvent.mouseUp(document, { clientX: 300 });
    expect(container.querySelector(".xvo-zone")).toBeNull();
    expect(screen.getByRole("dialog", { name: "구간 쿼리 목록" })).toBeInTheDocument();
  });

  it("드래그 2D(인간 지시 2026-09-04): 세로로도 끌면 소요시간 범위까지 목록에 적용, 영역도 사각형", () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const h = host(container);
    // jsdom 은 레이아웃이 없어 client 좌표 = 플롯 픽셀. y 도메인 [0, 176](=160×1.1),
    // 플롯 y 범위 [180, 8] → clientY 160≈20.5s, 100≈81.9s. 가로는 전 구간.
    fireEvent.mouseDown(h, { clientX: 40, clientY: 100 });
    fireEvent.mouseMove(h, { clientX: 445, clientY: 160 });
    const zone = container.querySelector(".xvo-zone") as HTMLElement;
    expect(zone).not.toBeNull();
    expect(zone.style.top).toBe("100px");
    expect(zone.style.height).toBe("60px");
    // 드래그 중 라이브 표시(인간 지시 2026-09-04): 건수 라벨 + 영역 밖 점 dim(opacity)
    expect(container.querySelector(".xvo-count")?.textContent).toBe("2건");
    expect(okData().map((d) => d.itemStyle.opacity)).toEqual([0.85, 0.85]); // 안
    expect(failData()[0].itemStyle.opacity).toBe(0.22); // 160s 실패 ✕ 는 위쪽이라 밖
    fireEvent.mouseUp(h, { clientX: 445, clientY: 160 });
    // 놓으면 라벨·dim 해제 — 목록 모달이 이어받는다
    expect(container.querySelector(".xv-overlay")).toBeNull();
    expect(failData()[0].itemStyle.opacity).toBe(1);
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    // 40s·60s 만 범위 안 — 160s(실패)는 위쪽이라 제외
    expect(within(modal).getAllByRole("option")).toHaveLength(2);
    expect(modal.textContent).toContain("소요 20.5s ~ 81.9s");
    expect(modal.textContent).toContain("에러 0건");
  });

  it("드래그 2D: 세로 이동이 4px 미만이면 기존처럼 가로 전용 — y 전체·헤더에 소요 범위 없음", () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const h = host(container);
    fireEvent.mouseDown(h, { clientX: 40, clientY: 100 });
    fireEvent.mouseMove(h, { clientX: 445, clientY: 102 });
    const zone = container.querySelector(".xvo-zone") as HTMLElement;
    expect(zone.style.top).toBe("8px");
    expect(zone.style.height).toBe("172px");
    // 가로 전용이면 전 구간·전 소요 — 3건 전부 안, 실패 1건 표기, dim 없음
    expect(container.querySelector(".xvo-count")?.textContent).toBe("3건 · 실패 1");
    expect(okData().map((d) => d.itemStyle.opacity)).toEqual([0.85, 0.85]);
    expect(failData()[0].itemStyle.opacity).toBe(1);
    fireEvent.mouseUp(h, { clientX: 445, clientY: 102 });
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    expect(within(modal).getAllByRole("option")).toHaveLength(3);
    expect(modal.textContent).not.toContain("소요 ");
  });

  it("구간 목록(X5-b): 정렬·행 선택·↑↓/이전·다음 내비·상세 연동·닫기 3경로", async () => {
    const pan = { startMs: 0, endMs: 2_000_000 };
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} pan={pan} onClose={noop} />,
    );
    const h = host(container);
    // 전 구간 드래그 → 3건 전부 (실패 포함)
    fireEvent.mouseDown(h, { clientX: 40 });
    fireEvent.mouseMove(h, { clientX: 445 });
    fireEvent.mouseUp(h, { clientX: 445 });
    // 드래그가 무장한 1회성 click 삼킴을 지나 보낸다 (브라우저는 mouseup 직후의
    // 자동 click이 소비하지만 jsdom은 click을 쏘지 않는다)
    await new Promise((r) => setTimeout(r, 0));
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    expect(within(modal).getAllByRole("option")).toHaveLength(3);
    expect(modal.textContent).toContain("에러 1건");
    // 기본 정렬: 종료 오름차순 — 첫 행이 가장 이른 이벤트, 상세도 그 이벤트
    const detail = modal.querySelector(".xview-modal__detail") as HTMLElement;
    expect(within(modal).getAllByRole("option")[0].textContent).toContain("Customer_Join");
    expect(detail.textContent).toContain("Customer_Join");
    expect(detail.querySelectorAll(".xview__tip-seg")).toHaveLength(4); // 생애주기 막대 재사용
    // 소요 정렬 → 내림차순: 실패(160s)가 첫 행
    fireEvent.click(within(modal).getByRole("button", { name: /^소요/ }));
    expect(within(modal).getAllByRole("option")[0].textContent).toContain("160.0s");
    // 다음 → 두 번째 행 상세, ↑ 키로 되돌아감
    fireEvent.click(within(modal).getByRole("button", { name: "다음 →" }));
    expect(modal.textContent).toContain("2 / 3");
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(modal.textContent).toContain("1 / 3");
    expect(within(modal).getByRole("button", { name: "← 이전" })).toBeDisabled();
    // 행 클릭 선택 → 상세 전환
    fireEvent.click(within(modal).getAllByRole("option")[2]);
    expect(detail.textContent).toContain("3 / 3");
    // 닫기: × 버튼
    fireEvent.click(within(modal).getByRole("button", { name: "목록 닫기" }));
    expect(screen.queryByRole("dialog", { name: "구간 쿼리 목록" })).toBeNull();
  });

  it("하단 범례(X5): 유형 클릭 토글 — 팝오버 필터와 상태 공유, 도움말 표시", () => {
    const { container } = render(
      <XViewPanel events={events} selection={null} domain={domain} onClose={noop} />,
    );
    const legend = container.querySelector(".xview__legend") as HTMLElement;
    const legendBtns = within(legend).getAllByRole("button");
    expect(legendBtns).toHaveLength(6);
    expect(legend.textContent).toContain("드래그로 쿼리 목록");
    // 범례에서 JOIN 끄기 → 점 감소 + 취소선(aria-pressed=false)
    fireEvent.click(within(legend).getByRole("button", { name: /JOIN 쿼리/ }));
    expect(pointCount()).toBe(1);
    expect(
      within(legend).getByRole("button", { name: /JOIN 쿼리/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    // 팝오버를 열면 같은 상태 — JOIN 칩도 꺼져 있다
    fireEvent.click(screen.getByRole("button", { name: "표시 필터" }));
    const pop = screen.getByRole("dialog", { name: "X-View 표시 필터" });
    expect(
      within(pop).getByRole("button", { name: /JOIN 쿼리/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("고정 강조(X5): 클릭 고정된 점은 확대(symbolSize 12)+흰 테두리, 해제하면 복원", () => {
    render(<XViewPanel events={events} selection={null} domain={domain} onClose={noop} />);
    clickPoint(K_JOIN);
    const pinned = okData().find((d) => d.key === K_JOIN)!;
    expect(pinned.symbolSize).toBe(12);
    expect(pinned.itemStyle.borderColor).toBe("#ffffff");
    expect(okData().find((d) => d.key === K_AGG)?.symbolSize).toBeUndefined();
    fireEvent.keyDown(document, { key: "Escape" }); // 고정 해제
    const restored = okData().find((d) => d.key === K_JOIN)!;
    expect(restored.symbolSize).toBeUndefined();
    expect(restored.itemStyle.borderColor).toBeUndefined();
  });

  it("팬 스크롤바(X4): pan 지정 시 시간축 밑에 렌더, 미지정이면 없음", () => {
    const { container: plain } = render(
      <XViewPanel events={events} selection={null} domain={domain} onClose={noop} />,
    );
    expect(plain.querySelector(".pan-scroll")).toBeNull();
    const { container } = render(
      <XViewPanel
        events={events} selection={null} domain={domain}
        pan={{ startMs: 0, endMs: 2_000_000 }} onClose={noop}
      />,
    );
    expect(container.querySelector(".pan-scroll")).not.toBeNull();
    expect(
      container.querySelector(".xview__plot")?.nextElementSibling?.classList.contains("pan-scroll"),
    ).toBe(true); // 시간축(플롯) 바로 아래
  });

  it("이벤트 0건이면 빈 상태 문구 (기동 직후 — 백필 없음 준수)", () => {
    render(<XViewPanel events={[]} selection={null} domain={domain} onClose={noop} />);
    expect(screen.getByText(/완료 이벤트가 아직 없습니다/)).toBeInTheDocument();
  });

  it("emptyText로 첫 로드 문구를 구분한다 (R9 F7.2)", () => {
    render(
      <XViewPanel
        events={[]} selection={null} domain={domain} onClose={noop}
        emptyText="불러오는 중…"
      />,
    );
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
  });

  it("도메인 미확정(endMs=0)이면 그리지 않고 빈 상태 — 요약 구간도 '-'", () => {
    const { container } = render(
      <XViewPanel
        events={events} selection={null} domain={{ startMs: 0, endMs: 0 }} onClose={noop}
      />,
    );
    expect(container.querySelector(".xview__chart")).toBeNull();
    expect(globalThis.__echartsMock.init).not.toHaveBeenCalled();
    expect((container.querySelector(".xview__range") as HTMLElement).textContent).toBe("-");
  });

  it("disconnected면 끊김 안내가 우선한다 (R7 C-4)", () => {
    render(
      <XViewPanel
        events={events} selection={null} domain={domain} disconnected onClose={noop}
      />,
    );
    expect(screen.getByText("연결 끊김 — 데이터 없음")).toBeInTheDocument();
  });
});

describe("XViewListModal 단독 (X5-b) — 정렬 토글·단계 없음 표기·빈 목록·백드롭", () => {
  const noop = () => undefined;

  it("같은 정렬 헤더 재클릭은 방향 토글, 대기 정렬은 단계 없음(-)을 후순위로 둔다", () => {
    const withNull = [
      ev({ endMs: 1_100_000, durationSec: 30 }),
      ev({ endMs: 1_400_000, durationSec: 50, queryName: "Sales_Aggregation", phases: null }),
    ];
    render(
      <XViewListModal events={withNull} startMs={1_000_000} endMs={2_000_000} onClose={noop} />,
    );
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    // 종료 재클릭 → 내림차순: 늦게 끝난 것이 첫 행
    fireEvent.click(within(modal).getByRole("button", { name: /^종료/ }));
    expect(within(modal).getAllByRole("option")[0].textContent).toContain("Sales_Aggregation");
    // 대기 정렬(내림차순 기본) — 단계 정보 없는 행은 '-' 표기·후순위
    fireEvent.click(within(modal).getByRole("button", { name: /^대기/ }));
    const rows = within(modal).getAllByRole("option");
    expect(rows[0].textContent).toContain("0.5s"); // queuedSec 있는 행이 먼저
    expect(rows[1].textContent).toContain("-");
    // ArrowDown으로 다음 행 이동
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(modal.textContent).toContain("2 / 2");
  });

  it("빈 목록이면 안내 문구 2곳, 백드롭 클릭으로 닫힌다 (내부 클릭은 유지)", () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <XViewListModal events={[]} startMs={1_000_000} endMs={2_000_000} onClose={onClose} />,
    );
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    expect(modal.textContent).toContain("구간에 완료된 쿼리가 없습니다");
    expect(modal.textContent).toContain("선택된 쿼리가 없습니다");
    fireEvent.mouseDown(modal); // 내부 클릭 — 닫히지 않는다
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(baseElement.querySelector(".xview-modal__backdrop") as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("폴링으로 목록이 갱신돼 인덱스가 밀려도 선택한 쿼리를 따라간다 (키 기반 선택)", () => {
    const e1 = ev({ endMs: 1_200_000, durationSec: 40 });
    const e2 = ev({ endMs: 1_500_000, durationSec: 60, queryName: "Sales_Aggregation" });
    const { rerender } = render(
      <XViewListModal events={[e1, e2]} startMs={1_000_000} endMs={2_000_000} onClose={noop} />,
    );
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    const detail = modal.querySelector(".xview-modal__detail") as HTMLElement;
    fireEvent.click(within(modal).getAllByRole("option")[1]); // Sales_Aggregation 선택
    expect(detail.textContent).toContain("Sales_Aggregation");
    // 폴링: 더 이른 이벤트가 앞에 붙어 배열 인덱스가 밀린다 — 선택은 같은 쿼리 유지
    const e0 = ev({ endMs: 1_050_000, durationSec: 20, queryName: "Product_Filter" });
    rerender(
      <XViewListModal
        events={[e0, e1, e2]} startMs={1_000_000} endMs={2_000_000} onClose={noop}
      />,
    );
    expect(detail.textContent).toContain("Sales_Aggregation");
    expect(modal.textContent).toContain("3 / 3");
    // 선택 항목이 목록에서 사라지면 인접 위치로 보정한다 (빈 상세로 남지 않는다)
    rerender(
      <XViewListModal events={[e0, e1]} startMs={1_000_000} endMs={2_000_000} onClose={noop} />,
    );
    expect(detail.textContent).toContain("Customer_Join"); // 마지막 위치의 항목
    expect(modal.textContent).toContain("2 / 2");
  });

  it("목록이 자란 뒤에도 ↑↓ 키가 최신 길이 기준으로 움직인다 (stale closure 방지)", () => {
    const e1 = ev({ endMs: 1_200_000, durationSec: 40 });
    const e2 = ev({ endMs: 1_500_000, durationSec: 60, queryName: "Sales_Aggregation" });
    const { rerender } = render(
      <XViewListModal events={[e1, e2]} startMs={1_000_000} endMs={2_000_000} onClose={noop} />,
    );
    const modal = screen.getByRole("dialog", { name: "구간 쿼리 목록" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(modal.textContent).toContain("2 / 2"); // 기존 끝
    const e3 = ev({ endMs: 1_900_000, durationSec: 80, queryName: "Daily_ETL_Load" });
    rerender(
      <XViewListModal
        events={[e1, e2, e3]} startMs={1_000_000} endMs={2_000_000} onClose={noop}
      />,
    );
    fireEvent.keyDown(document, { key: "ArrowDown" }); // 자란 목록의 새 끝까지 간다
    expect(modal.textContent).toContain("3 / 3");
  });
});
