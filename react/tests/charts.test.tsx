// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";


import { Gauge } from "../src/components/charts/Gauge";
import { MetricChart } from "../src/components/charts/MetricChart";
import { MetricStrip, type TimeseriesBundle } from "../src/components/charts/MetricStrip";
import { ServerGauges } from "../src/components/charts/ServerGauges";
import type { ServerSummary } from "../src/hooks/useDashboardData";
import { GAUGE_METRICS, axisLabel } from "../src/lib/chartMeta";
import type { TimeSeries } from "../src/lib/series";

const ts = (lines: TimeSeries["lines"]): TimeSeries => ({ x: [1000, 2000], lines });

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  emit(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

/* ECharts 전역 목(tests/setup.ts) — 라인 차트(E1)는 이 레지스트리로 검증한다. */
const em = globalThis.__echartsMock;

beforeEach(() => {
  ResizeObserverMock.instances.length = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  em.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MetricChart — init 1회 + setOption 갱신 (재생성 금지, E1 ECharts)", () => {
  it("빈 데이터에서 첫 유효 데이터로 전환하면 1회 생성하고 이후에는 setOption만 한다", () => {
    const empty = ts([]);
    const data1 = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    const { rerender } = render(<MetricChart data={empty} />);
    expect(em.init).not.toHaveBeenCalled();

    rerender(<MetricChart data={data1} />);
    expect(em.init).toHaveBeenCalledTimes(1);

    const data2 = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [3, 4] }]);
    rerender(<MetricChart data={data2} />);
    expect(em.init).toHaveBeenCalledTimes(1);
    expect(em.instances[0].setOption.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("마운트 시 init 1회, 데이터 변경 시 setOption(재생성 아님)", () => {
    const data1 = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    const { rerender } = render(<MetricChart data={data1} />);
    expect(em.init).toHaveBeenCalledTimes(1);

    const data2 = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [3, 4] }]);
    rerender(<MetricChart data={data2} />);
    expect(em.init).toHaveBeenCalledTimes(1); // 재생성 없음
    const last = em.instances[0].setOption.mock.calls.at(-1)?.[0] as {
      series: Array<{ data: Array<[number, number | null]> }>;
    };
    expect(last.series[0].data.map((d) => d[1])).toEqual([3, 4]);
  });

  it("사라진 GPU 라인은 replaceMerge로 제거한다", () => {
    const two = ts([
      { id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] },
      { id: "n/1", label: "GPU-1", colorKey: "1", values: [3, 4] },
    ]);
    const { rerender } = render(<MetricChart data={two} />);
    const one = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [5, 6] }]);
    rerender(<MetricChart data={one} />);
    const call = em.instances[0].setOption.mock.calls.at(-1);
    const opt = call?.[0] as { series: Array<{ name: string }> };
    expect(opt.series.map((sr) => sr.name)).toEqual(["GPU-0"]); // GPU-1 제거
    expect(call?.[1]).toEqual({ replaceMerge: ["series"] });    // 잔존 시리즈 청소 경로
  });

  it("yMax·yFormat 옵션 경로도 초기 옵션에 반영된다", () => {
    const data = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    render(<MetricChart data={data} yMax={100} yFormat={(v) => `${v}%`} />);
    expect(em.init).toHaveBeenCalledTimes(1);
    const first = em.instances[0].setOption.mock.calls[0]?.[0] as {
      yAxis: Array<{ max?: number }>;
    };
    expect(first.yAxis[0].max).toBe(100);
  });

  it("마운트 시 컨테이너 실측 크기를 init 옵션에 넣는다 (R9-P0 — y축 뭉개짐 방지)", () => {
    const spyW = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
    const spyH = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(60);
    try {
      const data = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
      render(<MetricChart data={data} />);
      const initOpts = em.init.mock.calls.at(-1)?.[2] as { width?: number; height?: number };
      expect(initOpts).toMatchObject({ width: 300, height: 60 });
    } finally {
      spyW.mockRestore();
      spyH.mockRestore();
    }
  });

  it("여러 인스턴스를 함께 언마운트하면 각자 정확히 1회 dispose한다", () => {
    const { unmount } = render(
      <>
        <MetricChart data={ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1] }])} />
        <MetricChart data={ts([{ id: "n/1", label: "GPU-1", colorKey: "1", values: [2] }])} />
      </>,
    );
    expect(em.instances).toHaveLength(2);
    const [a, b] = em.instances;
    unmount();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it("syncGroup을 주면 그룹에 넣고 connect한다 (E1 — 스트립 crosshair 동기)", () => {
    const data = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    render(<MetricChart data={data} syncGroup="metric-strip" />);
    expect(em.instances[0].group).toBe("metric-strip");
    expect(em.connect).toHaveBeenCalledWith("metric-strip");
  });

  it("플롯 클릭은 가장 가까운 샘플 시각으로 스냅하고, 재클릭은 고정값을 유지한다", () => {
    const data = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    const onPick = vi.fn();
    const { container, rerender } = render(<MetricChart data={data} onPickTime={onPick} />);
    const inst = em.instances[0];

    inst.convertFromPixel.mockReturnValue([1400]);
    fireEvent.click(container.querySelector(".metric-chart")!);
    expect(onPick).toHaveBeenLastCalledWith(1000); // 1400 → 가장 가까운 샘플 1000

    /* 고정 상태에서 같은 지점(반 스텝 안) 재클릭 → 고정값을 그대로 올려
       셸의 동등 비교(토글 해제)가 성립한다. */
    rerender(<MetricChart data={data} onPickTime={onPick} pinnedMs={1000} />);
    inst.convertFromPixel.mockReturnValue([1300]);
    fireEvent.click(container.querySelector(".metric-chart")!);
    expect(onPick).toHaveBeenLastCalledWith(1000);

    // 역변환이 비정상(NaN)이면 아무것도 올리지 않는다 (방어)
    onPick.mockClear();
    inst.convertFromPixel.mockReturnValue([Number.NaN]);
    fireEvent.click(container.querySelector(".metric-chart")!);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("ResizeObserver width+height 변경만 resize하고 unmount 뒤 callback을 무시한다", () => {
    const data = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    const { unmount } = render(<MetricChart data={data} />);
    const observer = ResizeObserverMock.instances[0];
    expect(observer.observe).toHaveBeenCalledTimes(1);

    observer.emit(0, 80);
    observer.emit(320, 0);
    expect(em.instances[0].resize).not.toHaveBeenCalled();

    observer.emit(320, 80);
    observer.emit(320, 80);
    observer.emit(321, 80);
    observer.emit(321, 81);
    expect(em.instances[0].resize.mock.calls).toEqual([
      [{ width: 320, height: 80 }],
      [{ width: 321, height: 80 }],
      [{ width: 321, height: 81 }],
    ]);

    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    observer.emit(400, 100);
    expect(em.instances[0].resize).toHaveBeenCalledTimes(3);
  });
});

describe("Gauge (ECharts — E5 D1, C3 gauge 교체)", () => {
  const pct = { min: 0, max: 100, colors: ["#4ade80", "#fbbf24", "#f87171"], thresholds: [70, 85] };
  type Opt = { series: Array<{ data: Array<{ value: number }>; progress: { itemStyle: { color: string } } }> };
  const last = (i = 0) => em.instances[i].lastOption() as Opt;

  it("init 1회 + 값 변경 시 setOption(재생성 없음) — 구간색은 값으로 결정", () => {
    const { rerender } = render(
      <Gauge label="GPU사용률(평균)" value={50} {...pct} format={(v) => `${v}%`} />,
    );
    expect(em.init).toHaveBeenCalledTimes(1);
    expect(last().series[0].data[0].value).toBe(50);
    expect(last().series[0].progress.itemStyle.color).toBe("#4ade80");
    rerender(
      <Gauge label="GPU사용률(평균)" value={70} {...pct} format={(v) => `${v}%`} />,
    );
    expect(em.init).toHaveBeenCalledTimes(1);
    expect(last().series[0].data[0].value).toBe(70);
    expect(last().series[0].progress.itemStyle.color).toBe("#fbbf24");
  });

  it("언마운트 시 dispose로 누수 없이 정리한다", () => {
    const { unmount } = render(
      <Gauge label="온도(평균)" value={58} {...pct} format={(v) => `${v}`} />,
    );
    const inst = em.instances[0];
    unmount();
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it("비유한 값으로 갱신되면 호는 0 (방어) — 포맷터는 원값을 받아 '-' 등을 낼 수 있다", () => {
    const { rerender } = render(
      <Gauge label="전력사용(합계)" value={800} min={0} max={1600} colors={["#5b9bff"]} format={(v) => `${v}`} />,
    );
    rerender(
      <Gauge label="전력사용(합계)" value={Number.NaN} min={0} max={1600} colors={["#5b9bff"]} format={(v) => `${v}`} />,
    );
    expect(last().series[0].data[0].value).toBe(0);
  });

  it("마운트 시 컨테이너 실측 크기로 init 한다 (R9-P0 — arc 깨짐 방지)", () => {
    const spyW = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(90);
    const spyH = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(54);
    try {
      render(<Gauge label="온도(평균)" value={58} {...pct} format={(v) => `${v}`} />);
      expect(em.init.mock.calls.at(-1)?.[2]).toMatchObject({ renderer: "canvas", width: 90, height: 54 });
    } finally {
      spyW.mockRestore();
      spyH.mockRestore();
    }
  });

  it("게이지도 container width+height를 관찰해 resize 하고 기하를 다시 계산한다", () => {
    const { unmount } = render(
      <Gauge label="온도(평균)" value={58} {...pct} format={(v) => `${v}`} />,
    );
    const observer = ResizeObserverMock.instances[0];
    observer.emit(90, 54);
    expect(em.instances[0].resize).toHaveBeenCalledWith({ width: 90, height: 54 });
    expect(em.instances[0].setOption.mock.calls.length).toBeGreaterThanOrEqual(2);
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("MetricStrip — 하단 공유 범례 (R6)", () => {
  const bundle = (lines: TimeSeries["lines"]): TimeseriesBundle => ({
    utilization: ts(lines),
    memory: ts(lines),
    temperature: ts(lines),
    power: ts(lines),
  });

  it("범례는 utilization 라인에서 라벨·색을 한 번만 그린다 (MIG 쌍 색 공유)", () => {
    const lines: TimeSeries["lines"] = [
      { id: "n/0/0", label: "GPU-0·M0", colorKey: "0", values: [1, 2] },
      { id: "n/0/1", label: "GPU-0·M1", colorKey: "0", values: [3, 4] },
    ];
    const { container } = render(<MetricStrip series={bundle(lines)} />);
    const legend = container.querySelector(".metric-strip__legend") as HTMLElement;
    expect(legend).not.toBeNull();
    const items = [...legend.querySelectorAll("li")];
    expect(items.map((li) => li.textContent)).toEqual(["GPU-0·M0", "GPU-0·M1"]);
    const swatch = items[0].querySelector(".metric-strip__line") as HTMLElement;
    expect(swatch.style.background).toBeTruthy(); // gpuColor(colorKey) 주입
    expect(legend.closest(".panel")?.querySelector(".panel__title")).toHaveTextContent("전력사용량(W)");
    expect(container.querySelectorAll(".metric-stack > .panel")).toHaveLength(4);
  });

  it("라인이 없으면 범례를 그리지 않는다", () => {
    const { container } = render(<MetricStrip series={bundle([])} />);
    expect(container.querySelector(".metric-strip__legend")).toBeNull();
  });

  it("M1 라인의 범례 스와치는 점선(borderColor), M0는 실선(background) (R9 F4.2)", () => {
    const lines: TimeSeries["lines"] = [
      { id: "n/0/0", label: "GPU-0·M0", colorKey: "0", values: [1, 2] },
      { id: "n/0/1", label: "GPU-0·M1", colorKey: "0", values: [3, 4] },
    ];
    const { container } = render(<MetricStrip series={bundle(lines)} />);
    const swatches = [...container.querySelectorAll(".metric-strip__line")] as HTMLElement[];
    expect(swatches[0].className).not.toContain("metric-strip__line--dashed");
    expect(swatches[0].style.background).toBeTruthy();
    expect(swatches[1].className).toContain("metric-strip__line--dashed");
    expect(swatches[1].style.borderColor).toBeTruthy();
  });

  it("노드 평균 라인(All 뷰)은 점선 없이 노드 팔레트 색을 쓴다 (R9 F2.2)", () => {
    const lines: TimeSeries["lines"] = [
      { id: "gpu-server-01", label: "icspreamh2gpu01", colorKey: "gpu-server-01", values: [1, 2] },
    ];
    const { container } = render(<MetricStrip series={bundle(lines)} />);
    const swatch = container.querySelector(".metric-strip__line") as HTMLElement;
    expect(swatch.className).not.toContain("metric-strip__line--dashed");
    expect(swatch.style.background).toBe("rgb(138, 180, 248)"); // --node-1 #8ab4f8 (E4)
  });

  it("emptyText를 4개 차트 모두에 전파한다 (R9 F7.2)", () => {
    const { container } = render(<MetricStrip series={bundle([])} emptyText="불러오는 중…" />);
    const empties = [...container.querySelectorAll(".metric-chart--empty")];
    expect(empties).toHaveLength(4);
    for (const el of empties) expect(el.textContent).toBe("불러오는 중…");
  });

  it("R7: 독립 카드 4개(Grafana 제목 표기)로 분할된다", () => {
    const { container } = render(<MetricStrip series={bundle([])} />);
    const titles = [...container.querySelectorAll(".panel__title")].map((e) => e.textContent);
    expect(titles).toEqual(["GPU사용률(%)", "메모리사용률(%)", "온도(°C)", "전력사용량(W)"]);
    expect(container.querySelectorAll(".panel")).toHaveLength(4);
    expect(container.querySelector(".metric-stack")).not.toBeNull();
  });

  it("빈 초기 데이터에서는 차트 생성을 미뤄 NaN domain을 만들지 않는다", () => {
    render(<MetricStrip series={bundle([])} />);
    expect(em.init).not.toHaveBeenCalled();
  });

  it("온도·전력은 Grafana처럼 자동 y상한을 유지해 이상치를 숨기지 않는다", () => {
    const lines: TimeSeries["lines"] = [
      { id: "n/0", label: "GPU-0", colorKey: "0", values: [50, 800] },
    ];
    render(<MetricStrip series={bundle(lines)} />);
    const yMaxes = em.instances.map((c) =>
      (c.setOption.mock.calls[0]?.[0] as { yAxis: Array<{ max?: number }> }).yAxis[0].max);
    expect(yMaxes).toEqual([100, 100, undefined, undefined]);
  });

  it("시간축은 맨 아래(전력) 차트만 — 위 3장은 숨겨 플롯을 확보한다 (R9.1)", () => {
    const lines: TimeSeries["lines"] = [
      { id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] },
    ];
    render(<MetricStrip series={bundle(lines)} />);
    const xShows = em.instances.map((c) =>
      (c.setOption.mock.calls[0]?.[0] as { xAxis: { axisLabel: { show: boolean } } }).xAxis.axisLabel.show);
    expect(xShows).toEqual([false, false, false, true]);
  });

  it("전력 시리즈가 비면 데이터 있는 맨 아래 카드(온도)가 축을 대표한다 (R9.1 CDX)", () => {
    const lines: TimeSeries["lines"] = [
      { id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] },
    ];
    const partial = { ...bundle(lines), power: ts([]) };
    render(<MetricStrip series={partial} />);
    // 전력은 placeholder(생성 안 함) — 나머지 3장 중 온도만 축 표시
    expect(em.init).toHaveBeenCalledTimes(3);
    const xShows = em.instances.map((c) =>
      (c.setOption.mock.calls[0]?.[0] as { xAxis: { axisLabel: { show: boolean } } }).xAxis.axisLabel.show);
    expect(xShows).toEqual([false, false, true]);
  });

  it("축 대표가 옮겨가면 재마운트 없이 setOption으로 축 표시를 갱신한다 (E1)", () => {
    const data = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    const { rerender } = render(<MetricChart data={data} hideXAxis />);
    expect(em.init).toHaveBeenCalledTimes(1);
    const first = em.instances[0].setOption.mock.calls[0]?.[0] as {
      xAxis: { axisLabel: { show: boolean } };
    };
    expect(first.xAxis.axisLabel.show).toBe(false);
    rerender(<MetricChart data={data} hideXAxis={false} />);
    expect(em.init).toHaveBeenCalledTimes(1); // 재마운트 없음 — ECharts는 축을 제자리 갱신
    const last = em.instances[0].setOption.mock.calls.at(-1)?.[0] as {
      xAxis: { axisLabel: { show: boolean } };
    };
    expect(last.xAxis.axisLabel.show).toBe(true);
  });

  it("폴링으로 domain이 전진하면 setOption으로 x도메인을 갱신한다 (R9.1 CDX)", () => {
    const d1 = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [1, 2] }]);
    const { rerender } = render(
      <MetricChart data={d1} domain={{ startMs: 1_000, endMs: 2_000 }} />,
    );
    const d2 = ts([{ id: "n/0", label: "GPU-0", colorKey: "0", values: [3, 4] }]);
    rerender(<MetricChart data={d2} domain={{ startMs: 6_000, endMs: 7_000 }} />);
    expect(em.init).toHaveBeenCalledTimes(1); // 재생성 없이
    const last = em.instances[0].setOption.mock.calls.at(-1)?.[0] as {
      xAxis: { min: number; max: number };
    };
    expect(last.xAxis.min).toBe(6_000);
    expect(last.xAxis.max).toBe(7_000);
  });
});

describe("ServerGauges", () => {
  const server = (node: ServerSummary["node"]): ServerSummary => ({
    node,
    utilization: 60,
    memoryPct: 55,
    temperature: 58,
    power: 800,
    gpuTotal: 4,
    migTotal: 8,
    gpuBusy: 5,
  });

  it("서버 3개 × 지표 4개 = 게이지 12개를 init 한다 (ECharts)", () => {
    const { container } = render(
      <ServerGauges servers={[server("gpu-server-01"), server("gpu-server-02"), server("gpu-server-03")]} />,
    );
    expect(em.init).toHaveBeenCalledTimes(12);
    expect([...container.querySelectorAll(".gauge-card__name")].map((node) => node.textContent)).toEqual([
      "icspreamh2gpu01",
      "icspreamh2gpu02",
      "icspreamh2gpu03",
    ]);
  });

  it("카드마다 표시명 + '4 GPU · 8 MIG' 부제를 단다 (R7 — Grafana판 카드)", () => {
    const { container } = render(<ServerGauges servers={[server("gpu-server-01")]} />);
    expect(container.querySelector(".gauge-card__name")?.textContent).toBe("icspreamh2gpu01");
    expect(container.querySelector(".gauge-card__sub")?.textContent).toBe("4 GPU · 8 MIG");
    expect(container.querySelector(".gauge-card__stack")).not.toBeNull();
    expect(container.querySelector(".gauge-card__grid")).toBeNull();
  });

  it("결측 시 부제는 '- GPU · - MIG'", () => {
    const { container } = render(
      <ServerGauges servers={[{ ...server("gpu-server-02"), gpuTotal: Number.NaN, migTotal: Number.NaN }]} />,
    );
    expect(container.querySelector(".gauge-card__sub")?.textContent).toBe("- GPU · - MIG");
  });

  it("공란(빈 servers)에도 NODES 기반 자리표시 카드 3개로 골격을 유지한다 (R9 F3.5)", () => {
    const { container } = render(<ServerGauges servers={[]} />);
    expect(em.init).not.toHaveBeenCalled(); // arc 없이 자리표시만
    expect([...container.querySelectorAll(".gauge-card__name")].map((n) => n.textContent)).toEqual([
      "icspreamh2gpu01",
      "icspreamh2gpu02",
      "icspreamh2gpu03",
    ]);
    // 카드마다 4개 지표 라벨 + "—" 값
    expect(container.querySelectorAll(".gauge--placeholder")).toHaveLength(12);
    expect(container.querySelectorAll(".gauge__placeholder-value")).toHaveLength(12);
    expect(container.querySelector(".gauge__placeholder-value")?.textContent).toBe("—");
  });
});

describe("MetricChart — 공란 문구 (R9 F3.4)", () => {
  it("빈 데이터는 '데이터 없음', emptyText가 있으면 그 문구", () => {
    const empty = ts([]);
    const { container, rerender } = render(<MetricChart data={empty} />);
    expect(container.querySelector(".metric-chart--empty")?.textContent).toBe("데이터 없음");
    rerender(<MetricChart data={empty} emptyText="불러오는 중…" />);
    expect(container.querySelector(".metric-chart--empty")?.textContent).toBe("불러오는 중…");
  });
});

describe("차트 포맷터", () => {
  it("R8 chart wrappers에는 128/96 고정 높이 상수가 없다", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const metric = readFileSync(resolve(root, "src/components/charts/MetricStrip.tsx"), "utf8");
    const gauges = readFileSync(resolve(root, "src/components/charts/ServerGauges.tsx"), "utf8");
    expect(metric).not.toContain("CHART_H");
    expect(gauges).not.toContain("GAUGE_H");
  });

  it("axisLabel은 소수 눈금을 반올림해 겹치지 않는 숫자만 표기", () => {
    expect(axisLabel(72)).toBe("72");
    expect(axisLabel(67.64705882352942)).toBe("68");
    expect(axisLabel(Number.NaN)).toBe("-");
  });

  it("Grafana 사용량 그래프 레이아웃 시각값을 CSS로 유지한다 (선·면·게이지 값 글자는 ECharts 옵션이 담당 — E1/E5)", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const css = readFileSync(resolve(root, "src/styles/app.css"), "utf8");
    expect(css).toMatch(/\.metric-stack\s*\{[^}]*grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 1\.3fr\)/s);
    expect(css).toMatch(/\.metric-strip__legend\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/s);
    // C3 전용 규칙(.c3-*)은 남아 있으면 안 된다 — 단일 엔진(ECharts) 원칙
    expect(css).not.toMatch(/\.c3-/);
  });

  it("서버 게이지 지표별 단위 포맷 + PPTX 라벨 (R6)", () => {
    const [util, mem, temp, power] = GAUGE_METRICS;
    expect(util.label).toBe("GPU사용률(평균)");
    expect(mem.label).toBe("메모리사용률(평균)");
    expect(temp.label).toBe("온도(평균)");
    expect(power.label).toBe("전력사용(합계)");
    expect(util.fmt(72)).toBe("72%");
    expect(mem.fmt(55)).toBe("55%");
    expect(temp.fmt(58)).toBe("58°C");
    expect(power.fmt(800)).toBe("800 W");
  });

  it("임계·상한 — Grafana 재현판 v2 기준 (R7 — H200)", () => {
    const [util, mem, temp, power] = GAUGE_METRICS;
    expect(util.thresholds).toEqual([70, 85]);
    expect(mem.thresholds).toEqual([70, 85]);
    expect(temp.thresholds).toEqual([75, 85]);
    expect(power.thresholds).toBeUndefined();
    expect(power.max).toBe(2800);
    expect(util.colors).toHaveLength(3); // colors = thresholds + 1
    expect(power.colors).toHaveLength(1);
    expect(util.colors).toEqual(["#73BF69", "#FF9830", "#F2495C"]);
    expect(temp.colors).toEqual(["#73BF69", "#FF9830", "#F2495C"]);
    expect(power.colors).toEqual(["#5794F2"]);
  });
});
