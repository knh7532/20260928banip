import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * ECharts 전역 목 (E1) — 라인 차트가 ECharts로 이관되며 jsdom(canvas 없음)에서
 * 실 렌더가 불가하다. 옵션의 정합은 `echartsOption.test.ts`가 빌더 결과를 직접
 * 대사하고, 컴포넌트 테스트는 이 스텁으로 init/setOption/dispose 상호작용만 본다.
 * 개별 테스트는 `globalThis.__echartsMock`으로 인스턴스에 접근한다.
 */
export interface EchartsInstanceStub {
  setOption: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  convertFromPixel: ReturnType<typeof vi.fn>;
  convertToPixel: ReturnType<typeof vi.fn>;
  dispatchAction: ReturnType<typeof vi.fn>;
  group: string | undefined;
  /* E5: 이벤트 배선 검증 — 컴포넌트가 `on(type, handler)` 로 건 핸들러를 테스트가
     `emit(type, params)` 로 발화한다. zr(zrender) 레벨 리스너도 같은 통로. */
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit(type: string, params?: unknown): void;
  getZr: ReturnType<typeof vi.fn>;
  emitZr(type: string, params?: unknown): void;
  getWidth: ReturnType<typeof vi.fn>;
  getHeight: ReturnType<typeof vi.fn>;
  getDom: ReturnType<typeof vi.fn>;
  /** setOption 의 마지막 인자(옵션) — 단언 편의. */
  lastOption(): unknown;
}

interface EchartsMockRegistry {
  instances: EchartsInstanceStub[];
  init: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  reset(): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __echartsMock: EchartsMockRegistry;
}

const registry: EchartsMockRegistry = {
  instances: [],
  init: vi.fn(),
  connect: vi.fn(),
  reset() {
    registry.instances.length = 0;
    registry.init.mockClear();
    registry.connect.mockClear();
  },
};
globalThis.__echartsMock = registry;

vi.mock("echarts", () => {
  /* 그라디언트는 인자 보존 스텁 — 빌더 테스트가 색 스톱을 대사할 수 있게 한다. */
  class LinearGradient {
    args: unknown[];
    constructor(...args: unknown[]) { this.args = args; }
  }
  const init = registry.init.mockImplementation((dom?: unknown) => {
    const handlers = new Map<string, Array<(p: unknown) => void>>();
    const zrHandlers = new Map<string, Array<(p: unknown) => void>>();
    const add = (map: typeof handlers) => (type: string, a: unknown, b?: unknown) => {
      // echarts on(type, handler) | on(type, query, handler)
      const handler = (typeof a === "function" ? a : b) as (p: unknown) => void;
      map.set(type, [...(map.get(type) ?? []), handler]);
    };
    const remove = (map: typeof handlers) => (type: string, handler?: unknown) => {
      if (!handler) { map.delete(type); return; }
      map.set(type, (map.get(type) ?? []).filter((h) => h !== handler));
    };
    const zr = { on: vi.fn(add(zrHandlers)), off: vi.fn(remove(zrHandlers)) };
    const inst: EchartsInstanceStub = {
      setOption: vi.fn(),
      dispose: vi.fn(),
      resize: vi.fn(),
      /* 클릭 → 시각 역변환: 기본은 플롯 중앙쯤의 값. 테스트가 개별 재정의한다. */
      convertFromPixel: vi.fn(() => [0, 0]),
      convertToPixel: vi.fn(() => [0, 0]),
      dispatchAction: vi.fn(),
      group: undefined,
      on: vi.fn(add(handlers)),
      off: vi.fn(remove(handlers)),
      emit(type, params) { for (const h of handlers.get(type) ?? []) h(params); },
      getZr: vi.fn(() => zr),
      emitZr(type, params) { for (const h of zrHandlers.get(type) ?? []) h(params); },
      getWidth: vi.fn(() => 0),
      getHeight: vi.fn(() => 0),
      getDom: vi.fn(() => dom),
      lastOption() {
        const calls = inst.setOption.mock.calls as unknown[][];
        return calls.length ? calls[calls.length - 1][0] : undefined;
      },
    };
    registry.instances.push(inst);
    return inst;
  });
  const connect = registry.connect;
  const mod = { init, connect, graphic: { LinearGradient } };
  return { ...mod, default: mod };
});
