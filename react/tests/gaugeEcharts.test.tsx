import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Gauge } from "../src/components/charts/Gauge";
import { GAUGE_LEVEL_COLORS } from "../src/lib/colors";

/** 게이지 컴포넌트 (ECharts, E5 D1) — init 1회·값 갱신 setOption·크기 재계산·DOM 골격. */
class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; ResizeObserverMock.instances.push(this); }
  observe() {}
  disconnect() {}
  unobserve() {}
  fire(width: number, height: number) {
    this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

type Opt = { series: Array<{ data: Array<{ value: number }>; progress: { itemStyle: { color: string } }; radius: unknown }> };
const base = {
  label: "GPU사용률(평균)", min: 0, max: 100,
  colors: [GAUGE_LEVEL_COLORS.ok, GAUGE_LEVEL_COLORS.warn, GAUGE_LEVEL_COLORS.danger],
  thresholds: [70, 85], format: (v: number) => `${Math.round(v)}%`,
};

describe("Gauge (ECharts, E5 D1)", () => {
  beforeEach(() => {
    globalThis.__echartsMock.reset();
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("Gauge 와 같은 DOM(.gauge > .gauge__chart + .gauge__label), init 1회 + 첫 옵션", () => {
    const { container, rerender } = render(<Gauge {...base} value={72} />);
    expect(container.querySelector(".gauge > .gauge__chart")).not.toBeNull();
    expect(container.querySelector(".gauge__label")?.textContent).toBe("GPU사용률(평균)");
    const em = globalThis.__echartsMock;
    expect(em.init).toHaveBeenCalledTimes(1);
    const first = em.instances[0].lastOption() as Opt;
    expect(first.series[0].data[0].value).toBe(72);
    expect(first.series[0].progress.itemStyle.color).toBe(GAUGE_LEVEL_COLORS.warn);
    // 값 갱신 → 재생성 없이 setOption, 구간색 전환
    rerender(<Gauge {...base} value={90} />);
    expect(em.init).toHaveBeenCalledTimes(1);
    const next = em.instances[0].lastOption() as Opt;
    expect(next.series[0].data[0].value).toBe(90);
    expect(next.series[0].progress.itemStyle.color).toBe(GAUGE_LEVEL_COLORS.danger);
  });

  it("컨테이너 크기가 잡히면 픽셀 반지름으로 다시 그린다", () => {
    render(<Gauge {...base} value={40} />);
    const inst = globalThis.__echartsMock.instances[0];
    expect((inst.lastOption() as Opt).series[0].radius).toBe("95%"); // 크기 미상
    ResizeObserverMock.instances[0].fire(84, 70);
    expect(inst.resize).toHaveBeenCalledWith({ width: 84, height: 70 });
    expect(typeof (inst.lastOption() as Opt).series[0].radius).toBe("number");
  });

  it("언마운트 시 dispose", () => {
    const { unmount } = render(<Gauge {...base} value={1} />);
    unmount();
    expect(globalThis.__echartsMock.instances[0].dispose).toHaveBeenCalledTimes(1);
  });
});
