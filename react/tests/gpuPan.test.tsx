// @vitest-environment jsdom
/** GPU 화면 팬 배선 (X4) — 타임라인 팬 시 브러시 선택 해제 (CDX-X4-03). */
import { fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../src/hooks/useFilters", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/hooks/useFilters")>();
  return {
    ...original,
    useFilters: () => ({
      state: { env: "production", instances: [], gpus: [], migs: [], rangeSec: 1800, refreshSec: 5 },
      setState: vi.fn(),
      selectGpu: vi.fn(),
      selectInstance: vi.fn(),
      reset: vi.fn(),
    }),
  };
});
vi.mock("../src/hooks/useDashboardData", () => ({
  useDashboardData: () => ({
    data: {
      statements: [], performance: [],
      servers: [],
      kpi: { migActive: 0, migTotal: 24, inQueue: 0, rowsPerSecond: 0, p95Seconds: 0 },
    },
    failStreak: 0,
    lastSuccessAt: null,
  }),
}));
const DOMAIN = { startMs: 8_200_000, endMs: 10_000_000 }; // 30분 창
const PAN_DOMAIN = { startMs: 4_600_000, endMs: 10_000_000 }; // 3×
vi.mock("../src/hooks/useCharts", () => ({
  PAN_FACTOR: 3,
  useCharts: () => ({
    data: {
      timelineRows: [],
      domain: DOMAIN,
      panDomain: PAN_DOMAIN,
      series: {
        utilization: { x: [], lines: [] }, memory: { x: [], lines: [] },
        temperature: { x: [], lines: [] }, power: { x: [], lines: [] },
      },
    },
    failStreak: 0,
    lastSuccessAt: null,
  }),
}));
vi.mock("../src/hooks/useXViewEvents", () => ({
  useXViewEvents: () => ({ events: [], failStreak: 0, lastSuccessAt: null }),
}));
const clearSpy = vi.fn();
vi.mock("../src/hooks/useRangeSelection", () => ({
  useRangeSelection: () => ({
    selection: { startMs: 8_500_000, endMs: 9_000_000 }, // 브러시 선택이 걸린 상태
    setSelection: vi.fn(),
    clear: clearSpy,
  }),
}));

import App from "../src/App";

describe("GPU 화면 — 타임라인 팬 (X4)", () => {
  it("타임라인 스크롤바로 팬하면 브러시 선택이 해제된다 (CDX-X4-03)", () => {
    const sw = vi.spyOn(HTMLDivElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    const cw = vi.spyOn(HTMLDivElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const { container } = render(<App />);
    const bar = container.querySelector(".panel--timeline .pan-scroll") as HTMLElement;
    expect(bar).not.toBeNull(); // 범례 아래 팬 스크롤바 존재 (panDomain 유효)
    fireEvent.scroll(bar); // 마운트 동기화 이벤트 소화
    bar.scrollLeft = 60; // 과거로 팬
    fireEvent.scroll(bar);
    expect(clearSpy).toHaveBeenCalled(); // 선택 해제 — 타임라인·X-View 시간대 불일치 방지
    sw.mockRestore();
    cw.mockRestore();
  });
});
