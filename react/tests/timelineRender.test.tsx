// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import { Timeline } from "../src/components/charts/Timeline";
import type { TimelineRow } from "../src/lib/timeline";
import type { TlDatum } from "../src/lib/timelineOption";

/**
 * 타임라인 렌더 (E5 D4 — ECharts 판). 막대·행 라벨은 canvas 라 DOM 에 없다: 마지막 setOption 의
 * custom 시리즈 데이터와 renderItem 결과(도형)로 "무엇을 그리나"를 보고, 클릭은 스텁 `emit` 으로
 * 발화한다. 범례·빈 상태·panControl·제목은 그대로 DOM 이다. 캔버스 높이(viewBox×k, jsdom k=1)가
 * SVG 시절 viewBox 높이 단언을 잇는다.
 */
const rows: TimelineRow[] = [
  {
    node: "gpu-server-01",
    gpu: "0",
    mig: "0",
    key: "gpu-server-01/0/0",
    segments: [
      { node: "gpu-server-01", gpu: "0", mig: "0", startMs: 1000, endMs: 2000, value: 1, name: "Sales_Aggregation", type: "aggregation" },
      { node: "gpu-server-01", gpu: "0", mig: "0", startMs: 2000, endMs: 3000, value: 4, name: "Fraud_Detection_Scan", type: "fullscan" },
    ],
  },
  {
    node: "gpu-server-01",
    gpu: "1",
    mig: "1",
    key: "gpu-server-01/1/1",
    segments: [
      { node: "gpu-server-01", gpu: "1", mig: "1", startMs: 1500, endMs: 2500, value: 2, name: "Customer_Join", type: "join" },
    ],
  },
];

const noop = () => undefined;

type Shape = { type: string; style?: { fill?: string; text?: string }; children?: Shape[] };
type Opt = { series: Array<{ id: string; data: TlDatum[]; renderItem: (p: { dataIndex: number }) => Shape }> };
const inst = () => globalThis.__echartsMock.instances.at(-1)!;
const last = () => inst().lastOption() as Opt;
const segments = () => last().series[1];
const rowLabels = () => last().series[2];
/** 세그먼트 i 의 rect 와 라벨 텍스트(없으면 null) */
const segShape = (i: number) => {
  const el = segments().renderItem({ dataIndex: i });
  return el.type === "group"
    ? { rect: el.children![0], label: el.children![1].style?.text ?? null }
    : { rect: el, label: null };
};
const rowLabelTexts = () => rowLabels().data.map((_, i) => rowLabels().renderItem({ dataIndex: i }).style?.text);
const host = (c: HTMLElement) => c.querySelector(".timeline__chart") as HTMLElement;

function renderTimeline(props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  return render(
    <Timeline
      rows={rows}
      domainStart={1000}
      domainEnd={3000}
      selection={null}
      onSelectRange={noop}
      onSelectGpu={noop}
      {...props}
    />,
  );
}

beforeEach(() => {
  globalThis.__echartsMock.reset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
});

describe("Timeline (ECharts)", () => {
  it("세그먼트마다 막대를 그린다 (총 3개)", () => {
    renderTimeline();
    expect(segments().data).toHaveLength(3);
    expect(segShape(0).rect.type).toBe("rect");
  });

  it("세그먼트 색은 쿼리 유형색이다", () => {
    renderTimeline();
    const joinIdx = segments().data.findIndex((d) => d.gpu === "1");
    expect(segShape(joinIdx).rect.style?.fill).toBe("#22d3ee"); // join
  });

  it("막대 클릭 → onSelectGpu(node,gpu)", () => {
    const onGpu = vi.fn();
    renderTimeline({ onSelectGpu: onGpu });
    const join = segments().data.find((d) => d.gpu === "1");
    act(() => inst().emit("click", { seriesId: "segments", data: join }));
    expect(onGpu).toHaveBeenCalledWith("gpu-server-01", "1");
  });

  it("행 라벨 클릭 → onSelectGpu", () => {
    const onGpu = vi.fn();
    renderTimeline({ onSelectGpu: onGpu });
    expect(rowLabelTexts()[0]).toBe("sqream101");
    act(() => inst().emit("click", { seriesId: "rowlabels", data: rowLabels().data[0] }));
    expect(onGpu).toHaveBeenCalledWith("gpu-server-01", "0");
  });

  it("빈 rows면 안내 문구, 차트 없음", () => {
    const { container } = renderTimeline({ rows: [] });
    expect(screen.getByText("표시할 타임라인 데이터가 없습니다")).toBeInTheDocument();
    expect(container.querySelector(".timeline__chart")).toBeNull();
    expect(globalThis.__echartsMock.init).not.toHaveBeenCalled();
  });

  it("emptyText로 첫 로드 문구를 구분한다 (CDX-R9 2차 — MetricStrip과 동일 폴링 상태)", () => {
    renderTimeline({ rows: [], emptyText: "불러오는 중…" });
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
    expect(screen.queryByText("표시할 타임라인 데이터가 없습니다")).toBeNull();
  });

  it("범례는 쿼리 유형 6종", () => {
    renderTimeline();
    const legend = screen.getByLabelText("쿼리 유형 범례");
    expect(within(legend).getAllByRole("listitem")).toHaveLength(6);
  });

  it("외부 selection을 브러시에 반영하되 onSelectRange를 되돌려 부르지 않는다(루프 방지)", () => {
    const onRange = vi.fn();
    renderTimeline({
      selection: { startMs: 1500, endMs: 2500 },
      onSelectRange: onRange,
    });
    // 프로그램적 이동(dispatchAction brush)은 사용자 제스처가 아니므로 콜백을 다시 부르지 않는다
    expect(onRange).not.toHaveBeenCalled();
    const brushActs = inst().dispatchAction.mock.calls
      .map((c) => c[0] as { type: string; areas?: Array<{ coordRange: [number, number] }> })
      .filter((a) => a.type === "brush");
    expect(brushActs.at(-1)?.areas?.[0]?.coordRange).toEqual([1500, 2500]);
  });
});

describe("Timeline — R6 (인스턴스 중심 뷰·세그먼트 라벨)", () => {
  /*
   * 2026-08-08 표기 통일: 타임라인 한 행 = MIG 인스턴스 = SQream 워커 하나이므로
   * 행 라벨은 워커 이름(sqreamNGM)으로 고정한다. 선택 상태와 무관하게 한 표기다.
   */
  it("행 라벨은 워커 이름이다 — singleInstance 여부와 무관", () => {
    renderTimeline({ singleInstance: true });
    expect(rowLabelTexts()).toEqual(["sqream101", "sqream112"]);
  });

  it("기본(multi)도 같은 워커 이름 표기다", () => {
    renderTimeline();
    expect(rowLabelTexts()).toEqual(["sqream101", "sqream112"]);
  });

  it("넓은 세그먼트에는 쿼리명 라벨을 그린다", () => {
    renderTimeline();
    const labels = segments().data.map((_, i) => segShape(i).label);
    // 3개 세그먼트 모두 폭이 충분(각 ~447px)해 전체 이름이 들어간다
    expect(labels).toContain("Sales_Aggregation");
    expect(labels).toContain("Fraud_Detection_Scan");
    expect(labels).toContain("Customer_Join");
  });

  it("아주 좁은 세그먼트에는 라벨을 그리지 않는다", () => {
    const narrow: TimelineRow[] = [
      {
        node: "gpu-server-01",
        gpu: "0",
        mig: "0",
        key: "gpu-server-01/0/0",
        segments: [
          // 2000ms 도메인에서 20ms ≈ 9px → maxChars < 4 → 라벨 생략
          { node: "gpu-server-01", gpu: "0", mig: "0", startMs: 1000, endMs: 1020, value: 1, name: "Sales_Aggregation", type: "aggregation" },
        ],
      },
    ];
    renderTimeline({ rows: narrow });
    expect(segments().data).toHaveLength(1);
    expect(segShape(0).label).toBeNull();
    expect(segShape(0).rect.type).toBe("rect");
  });

  it("라벨이 있어도 막대 클릭은 막대가 받는다 (라벨 text 는 silent)", () => {
    const onGpu = vi.fn();
    renderTimeline({ onSelectGpu: onGpu });
    const el = segments().renderItem({ dataIndex: 0 }) as Shape & { children: Array<{ silent?: boolean }> };
    expect(el.children[1].silent).toBe(true);
    act(() => inst().emit("click", { seriesId: "segments", data: segments().data[0] }));
    expect(onGpu).toHaveBeenCalledWith("gpu-server-01", "0");
  });

  it("행 수 ≤ 8(단일 서버 8 MIG)이면 행 높이 30px (캔버스 높이로 검증)", () => {
    const { container } = renderTimeline();
    // H = top(8) + 2행*30 + bottom(22) = 90 (jsdom 은 폭 미상 → k=1)
    expect(host(container).style.height).toBe("90px");
  });

  it("막대 호버는 네이티브 title 툴팁 '{워커} · {쿼리명}'", () => {
    const { container } = renderTimeline();
    act(() => inst().emit("mouseover", { seriesId: "segments", data: segments().data[2] }));
    expect(host(container).title).toBe("sqream112 · Customer_Join");
    act(() => inst().emit("mouseout", {}));
    expect(host(container).hasAttribute("title")).toBe(false);
  });

  it("panControl 슬롯(X4): 지정 시 범례 아래 렌더, 미지정이면 없음 (LLM 회귀 0)", () => {
    // 미지정 — 기본 렌더에는 팬 컨트롤이 없다 (기존 화면·LLM 무변경)
    const { container: plain } = renderTimeline();
    expect(plain.querySelector(".pan-scroll")).toBeNull();
    // 지정 — 범례(ul) 다음 형제로 렌더된다 (인간 지시: "쿼리 분류 밑")
    const { container } = renderTimeline({
      panControl: <div className="pan-scroll" data-testid="tl-pan" />,
    });
    const legend = container.querySelector(".timeline__legend") as HTMLElement;
    expect(legend.nextElementSibling?.classList.contains("pan-scroll")).toBe(true);
  });

  it("행 수 > 8(All 24행)는 행 높이 12px 콤팩트 유지 (2026-09-04 축소)", () => {
    const many: TimelineRow[] = Array.from({ length: 24 }, (_, i) => ({
      node: `gpu-server-0${Math.floor(i / 8) + 1}`,
      gpu: String(Math.floor((i % 8) / 2)),
      mig: String(i % 2),
      key: `gpu-server-0${Math.floor(i / 8) + 1}/${Math.floor((i % 8) / 2)}/${i % 2}`,
      segments: [],
    }));
    const { container } = renderTimeline({ rows: many });
    // H = top(8) + 24행*12 + bottom(22) = 318 (All 행 높이 12 — 2026-09-04)
    expect(host(container).style.height).toBe("318px");
  });
});
