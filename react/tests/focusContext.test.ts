// @vitest-environment jsdom
/** Focus+Context 줌 — 순수 계산과 훅 계약 (2026-08-10). */
import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { minZoomMs, useFocusContext, zoomStepSec } from "../src/screens/drilldown/useFocusContext";

describe("줌 창 계산", () => {
  it("step 은 60점 목표, scrape 주기(5s) 아래로 안 내려간다", () => {
    expect(zoomStepSec({ startMs: 0, endMs: 300_000 })).toBe(5);      // 5분 → 5s (floor)
    expect(zoomStepSec({ startMs: 0, endMs: 3_600_000 })).toBe(60);   // 1시간 → 60s
    expect(zoomStepSec({ startMs: 0, endMs: 60_000 })).toBe(5);       // 1분 → clamp 5s
  });

  it("최소 브러시 폭은 기존 step 2칸", () => {
    expect(minZoomMs(15)).toBe(30_000);
  });
});

function stubFetch() {
  const calls: string[] = [];
  const spy = vi.fn((url: string) => {
    calls.push(String(url));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        status: "success",
        data: { resultType: "matrix", result: [{ metric: {}, values: [[100, "1"], [115, "2"]] }] },
      }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const SPECS = [{ expr: "up", label: "Up", colorKey: "blue" }];

describe("useFocusContext", () => {
  it("줌이 없으면 focus === context — 추가 조회가 없다", async () => {
    const calls = stubFetch();
    const { result } = renderHook(() => useFocusContext(SPECS, 1800, 0));
    await waitFor(() => expect(result.current.context.x.length).toBeGreaterThan(0));
    expect(result.current.focus).toBe(result.current.context);
    expect(calls.filter((u) => u.includes("query_range"))).toHaveLength(1);
  });

  it("줌을 잡으면 그 창의 start/end 와 촘촘한 step 으로 재조회한다", async () => {
    const calls = stubFetch();
    const { result } = renderHook(() => useFocusContext(SPECS, 1800, 0));
    await waitFor(() => expect(result.current.context.x.length).toBeGreaterThan(0));

    const endMs = 1_000_000_000_000;
    act(() => result.current.setZoom({ startMs: endMs - 300_000, endMs }));
    await waitFor(() => {
      const zoomed = calls.find((u) => u.includes(`end=${endMs / 1000}`));
      expect(zoomed, "줌 창 재조회 없음").toBeTruthy();
      expect(zoomed).toContain("step=5");                       // 5분 창 → 5s
      expect(zoomed).toContain(`start=${(endMs - 300_000) / 1000}`);
    });
    expect(result.current.zoom?.endMs).toBe(endMs);
  });

  it("최소 폭 미만 브러시는 해제로 취급한다", async () => {
    stubFetch();
    const { result } = renderHook(() => useFocusContext(SPECS, 1800, 0));
    await waitFor(() => expect(result.current.context.x.length).toBeGreaterThan(0));
    act(() => result.current.setZoom({ startMs: 0, endMs: 29_999 })); // < 15s*2
    expect(result.current.zoom).toBeNull();
  });

  it("툴바 구간(rangeSec)이 바뀌면 줌이 풀린다", async () => {
    stubFetch();
    const { result, rerender } = renderHook(
      ({ range }) => useFocusContext(SPECS, range, 0),
      { initialProps: { range: 1800 } },
    );
    await waitFor(() => expect(result.current.context.x.length).toBeGreaterThan(0));
    act(() => result.current.setZoom({ startMs: 0, endMs: 600_000 }));
    expect(result.current.zoom).not.toBeNull();
    rerender({ range: 3600 });
    expect(result.current.zoom).toBeNull();
  });
});
