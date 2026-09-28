// @vitest-environment jsdom
/** useXViewEvents — NX-01(공통 평가 격자)·NX-02(폴링 상태 계약 승계) 행동 테스트. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useXViewEvents } from "../src/hooks/useXViewEvents";

const filters = { env: "production", instances: [], gpus: [], migs: [] };

const METRIC = {
  env: "production", node: "gpu-server-01", gpu: "0", mig: "1",
  stmt_id: "100411", query_id: "Q-88003", sqream_user: "analyst2",
  query_name: "Customer_Join", status: "success", reason: "",
};

function installFetch(calls: URL[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = new URL(url, "http://localhost");
      calls.push(u);
      const expr = u.searchParams.get("query") ?? "";
      // X3: phase 쿼리는 phase 라벨 4시리즈 matrix로 응답한다
      const result = expr.includes("completed_phase_seconds")
        ? ["compile", "queued", "initializing", "executing"].map((phase) => ({
            metric: { ...METRIC, phase },
            values: [[100, phase === "executing" ? "45" : "1.0"],
                     [160, phase === "executing" ? "45" : "1.0"],
                     [220, phase === "executing" ? "52" : "1.0"]],
          }))
        : [{
            metric: METRIC,
            values: expr.includes("completed_timestamp")
              ? [[100, "1000"], [160, "1000"], [220, "1090"]]
              : [[100, "45"], [160, "45"], [220, "52"]],
          }];
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { resultType: "matrix", result },
          }),
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useXViewEvents", () => {
  it("세 range 쿼리를 공통 start/end/step으로 부르고 이벤트+phases를 복원한다 (NX-01·X3)", async () => {
    const calls: URL[] = [];
    installFetch(calls);
    const { result } = renderHook(() => useXViewEvents(filters, 1800, 5));

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.events[0]).toMatchObject({ endMs: 1000_000, durationSec: 45 });
    expect(result.current.events[1]).toMatchObject({ endMs: 1090_000, durationSec: 52 });
    // X3: phase 결합 — 전환 시각의 phase 샘플이 붙는다
    expect(result.current.events[0].phases).toEqual({
      compileSec: 1.0, queuedSec: 1.0, initializingSec: 1.0, executingSec: 45,
    });
    expect(result.current.events[1].phases?.executingSec).toBe(52);
    expect(result.current.lastSuccessAt).not.toBeNull();

    const ranges = calls.filter((u) => u.pathname.includes("/query_range"));
    expect(ranges).toHaveLength(3);
    const grid = (u: URL) =>
      `${u.searchParams.get("start")}|${u.searchParams.get("end")}|${u.searchParams.get("step")}`;
    expect(new Set(ranges.map(grid)).size).toBe(1); // 공통 endMs·동일 stepSec (세 쿼리)
    const exprs = ranges.map((u) => u.searchParams.get("query") ?? "");
    expect(exprs.some((e) => e.includes("sqm_statement_completed_timestamp{"))).toBe(true);
    expect(exprs.some((e) => e.includes("sqm_statement_completed_duration_seconds{"))).toBe(true);
    expect(exprs.some((e) => e.includes("sqm_statement_completed_phase_seconds{"))).toBe(true);
  });

  it("step은 상한(60초) 아래로 잡힌다 — 링 체류(~5.6분)보다 촘촘해야 이벤트를 안 놓친다", async () => {
    const calls: URL[] = [];
    installFetch(calls);
    renderHook(() => useXViewEvents(filters, 21600, 5)); // 6시간 — 기본 step이면 360s

    await waitFor(() =>
      expect(calls.filter((u) => u.pathname.includes("/query_range"))).toHaveLength(3),
    );
    const step = Number(calls[0].searchParams.get("step"));
    expect(step).toBeLessThanOrEqual(60);
  });

  it("phase 쿼리 단독 실패는 산점도를 지우지 않는다 — phases=null·failStreak 0 (CDX-X3-01)", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const u = new URL(url, "http://localhost");
        calls.push(u);
        const expr = u.searchParams.get("query") ?? "";
        if (expr.includes("completed_phase_seconds")) {
          return Promise.reject(new Error("phase down")); // phase만 장애
        }
        const values = expr.includes("completed_timestamp")
          ? [[100, "1000"], [160, "1090"]]
          : [[100, "45"], [160, "52"]];
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: "success",
            data: { resultType: "matrix", result: [{ metric: METRIC, values }] },
          }),
        });
      }),
    );
    const { result } = renderHook(() => useXViewEvents(filters, 1800, 5));
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.events.every((e) => e.phases === null)).toBe(true);
    expect(result.current.failStreak).toBe(0); // 필수 2종이 성공했으므로 실패가 아니다
  });

  it("연속 3회 실패면 이벤트를 비운다 (NX-02 — 정지된 산점도 금지)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const calls: URL[] = [];
    installFetch(calls);
    const { result } = renderHook(() => useXViewEvents(filters, 1800, 1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.events).toHaveLength(2);

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.failStreak).toBeGreaterThanOrEqual(3);
    expect(result.current.events).toHaveLength(0);
  });
});
