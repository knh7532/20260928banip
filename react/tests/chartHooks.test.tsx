// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useCharts } from "../src/hooks/useCharts";
import { useRangeDetail } from "../src/hooks/useRangeDetail";

const filters = { env: "production", instances: [], gpus: [], migs: [] };

/** range=matrix / instant=vector 응답을 쿼리 종류에 맞춰 돌려주는 fetch 목. */
function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = new URL(url, "http://localhost");
      const expr = u.searchParams.get("query") ?? "";
      if (u.pathname.includes("/query_range")) {
        const result = expr.includes("sqm_gpu_timeline_state")
          ? [
              { metric: { node: "gpu-server-01", gpu: "0", mig: "0" }, values: [[100, "1"], [110, "1"], [120, "4"]] },
              { metric: { node: "gpu-server-01", gpu: "0", mig: "1" }, values: [[100, "0"], [110, "2"]] },
            ]
          : expr.includes("avg by(node)")
            ? // All 뷰 노드 평균 (R9 F2.2) — avg by(node) 응답은 node 라벨만 남는다
              [
                { metric: { node: "gpu-server-01" }, values: [[100, "40"], [110, "55"]] },
                { metric: { node: "gpu-server-02" }, values: [[100, "20"], [110, "25"]] },
                { metric: { node: "gpu-server-03" }, values: [[100, "10"], [110, "15"]] },
              ]
            : [
                { metric: { node: "gpu-server-01", gpu: "0", mig: "0" }, values: [[100, "40"], [110, "55"]] },
                { metric: { node: "gpu-server-01", gpu: "0", mig: "1" }, values: [[100, "30"], [110, "35"]] },
              ];
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "success", data: { resultType: "matrix", result } }),
        });
      }
      // instant (rangeDetail)
      const result = expr.includes("database")
        ? [
            { metric: { database: "sales_db" }, value: [1, "1"] },
            { metric: { database: "crm_db" }, value: [1, "1"] },
          ]
        : expr.includes("by(node, gpu, mig)") || expr.includes("by(query_id)")
          ? [{ metric: { gpu: "0" }, value: [1, "1"] }, { metric: { gpu: "1" }, value: [1, "1"] }]
          : [{ metric: {}, value: [1, "1850000"] }];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result } }),
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  installFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCharts", () => {
  it("All 뷰(선택 0)는 노드 평균 3선으로 변환한다 (R9 F2.2)", async () => {
    const { result } = renderHook(() => useCharts(filters, 1800, 0));
    await waitFor(() => expect(result.current.data.series.utilization.lines.length).toBeGreaterThan(0));
    const util = result.current.data.series.utilization;
    expect(util.lines.map((l) => l.label)).toEqual([
      "icspreamh2gpu01",
      "icspreamh2gpu02",
      "icspreamh2gpu03",
    ]);
    // 색 키는 노드명(노드 팔레트) — GPU 번호가 아니다
    expect(util.lines.map((l) => l.colorKey)).toEqual([
      "gpu-server-01",
      "gpu-server-02",
      "gpu-server-03",
    ]);
    // 타임라인은 All 뷰에도 슬롯 단위 그대로: M0 은 1→4 두 세그먼트, M1 은 Idle 제외 1 세그먼트
    const rows = result.current.data.timelineRows;
    expect(rows).toHaveLength(2);
    expect(rows[0].segments.length).toBeGreaterThan(0);
    expect(result.current.data.domain.endMs).toBeGreaterThan(result.current.data.domain.startMs);
    // X4: 표시 창(domain)은 1×, 조회 전체(panDomain)는 3× — 과거 팬의 좌우 한계
    const { domain, panDomain } = result.current.data;
    expect(domain.endMs - domain.startMs).toBe(1800 * 1000);
    expect(panDomain.endMs - panDomain.startMs).toBe(3 * 1800 * 1000);
    expect(panDomain.endMs).toBe(domain.endMs);
  });

  it("단일 인스턴스는 MIG 슬롯 라인으로 변환한다", async () => {
    const single = { env: "production", instances: ["gpu-server-01"], gpus: [], migs: [] };
    const { result } = renderHook(() => useCharts(single, 1800, 0));
    await waitFor(() => expect(result.current.data.series.utilization.lines.length).toBeGreaterThan(0));
    const util = result.current.data.series.utilization;
    expect(util.lines.map((l) => l.label)).toEqual(["sqream101", "sqream102"]);
    expect(util.lines.map((l) => l.colorKey)).toEqual(["0", "0"]); // MIG 쌍 색 공유
  });
});

describe("useRangeDetail", () => {
  it("선택이 있으면 그 구간의 시각·집계를 만든다", async () => {
    const sel = { startMs: 1_000_000, endMs: 1_600_000 };
    const { result } = renderHook(() => useRangeDetail(filters, 1800, sel, 0));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const d = result.current.detail!;
    expect(d.startMs).toBe(sel.startMs);
    expect(d.endMs).toBe(sel.endMs);
    expect(d.gpuCount).toBe(2);
    expect(d.databases).toEqual(["crm_db", "sales_db"]); // 정렬됨
    expect(d.rowsPerSecond).toBe(1_850_000);
  });

  it("선택이 없으면 전체 범위 기준으로 구간을 잡는다", async () => {
    const { result } = renderHook(() => useRangeDetail(filters, 1800, null, 0));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const d = result.current.detail!;
    expect(d.endMs - d.startMs).toBe(1800 * 1000);
  });
});
