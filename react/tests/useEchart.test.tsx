import { render } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEchart } from "../src/hooks/useEchart";

/**
 * useEchart (E5) — MetricChart 의 init-1회·dispose·resize 규약을 훅으로 일반화했다.
 * 렌더는 전역 echarts 스텁(tests/setup.ts)이 받는다.
 */
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

function Host({ onInit, onResize, fixedHeight }: {
  onInit: (c: unknown, size: unknown) => void;
  onResize?: (c: unknown, size: unknown) => void;
  fixedHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEchart(ref, { onInit, onResize, fixedHeight });
  return <div ref={ref} data-testid="host" />;
}

describe("useEchart", () => {
  beforeEach(() => {
    globalThis.__echartsMock.reset();
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("마운트 시 1회 init(canvas) → onInit(chart, size) · 언마운트 시 dispose", () => {
    const onInit = vi.fn();
    const { unmount, rerender } = render(<Host onInit={onInit} />);
    const em = globalThis.__echartsMock;
    expect(em.init).toHaveBeenCalledTimes(1);
    expect(em.init.mock.calls[0][2]).toMatchObject({ renderer: "canvas" });
    // jsdom 은 크기 0 → size undefined (실측 불가는 RO 에 맡긴다)
    expect(onInit).toHaveBeenCalledWith(em.instances[0], undefined);
    rerender(<Host onInit={onInit} />);
    expect(em.init).toHaveBeenCalledTimes(1); // 재렌더에 재생성 없음
    unmount();
    expect(em.instances[0].dispose).toHaveBeenCalledTimes(1);
  });

  it("컨테이너 크기 변화 → resize 뒤 onResize(size)", () => {
    const onResize = vi.fn();
    render(<Host onInit={() => {}} onResize={onResize} />);
    const inst = globalThis.__echartsMock.instances[0];
    ResizeObserverMock.instances[0].fire(640, 200);
    expect(inst.resize).toHaveBeenCalledWith({ width: 640, height: 200 });
    expect(onResize).toHaveBeenCalledWith(inst, { width: 640, height: 200 });
    // 같은 크기 재통지는 무시
    ResizeObserverMock.instances[0].fire(640, 200);
    expect(inst.resize).toHaveBeenCalledTimes(1);
  });

  it("fixedHeight 가 바뀌면 그 높이로 resize 한다 (폭이 실측될 때)", () => {
    const onResize = vi.fn();
    const { rerender, getByTestId } = render(<Host onInit={() => {}} onResize={onResize} fixedHeight={90} />);
    const inst = globalThis.__echartsMock.instances[0];
    Object.defineProperty(getByTestId("host"), "clientWidth", { value: 800, configurable: true });
    rerender(<Host onInit={() => {}} onResize={onResize} fixedHeight={318} />);
    expect(inst.resize).toHaveBeenLastCalledWith({ width: 800, height: 318 });
    expect(onResize).toHaveBeenLastCalledWith(inst, { width: 800, height: 318 });
  });
});
