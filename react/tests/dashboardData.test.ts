import { renderHook } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import type { PromSeries } from "../src/api/prom";
import { buildPerformance, buildStatements } from "../src/hooks/useDashboardData";

const stmt = (labels: Record<string, string>): PromSeries => ({ metric: labels, value: [1, "1"] });
const val = (labels: Record<string, string>, v: string): PromSeries => ({ metric: labels, value: [1, v] });

afterEach(() => {
  vi.restoreAllMocks();
});

/** X8: duration/progress가 필수가 되면서 기존 케이스는 빈 배열 기본값으로 부른다. */
const build = (res: Partial<Parameters<typeof buildStatements>[0]>
  & Pick<Parameters<typeof buildStatements>[0], "identity">) =>
  buildStatements({
    memory: [], gpuPct: [], cpuPct: [], startTime: [], duration: [], progress: [],
    ...res,
  });

describe("buildStatements — stmt_id 조인", () => {
  it("신원과 수치를 stmt_id로 맞물려 행을 만든다", () => {
    const rows = build({
      identity: [
        stmt({
          node: "gpu-server-01", gpu: "0", stmt_id: "105234", query_id: "Q-88123",
          sqream_user: "dba1",
          // X8: identity by() 확장 라벨 4종
          worker: "sqream101", service: "etl_service", qid: "JOI-14H", qid_tags: "JOIN:3",
        }),
      ],
      memory: [val({ stmt_id: "105234" }, "22300000000")],
      gpuPct: [val({ stmt_id: "105234" }, "68")],
      cpuPct: [val({ stmt_id: "105234" }, "145")],
      startTime: [val({ stmt_id: "105234" }, "1800000000")],
      duration: [val({ stmt_id: "105234" }, "125")],
      progress: [val({ stmt_id: "105234" }, "0.4")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stmtId: "105234",
      queryId: "Q-88123",
      user: "dba1",
      gpu: "0",
      worker: "sqream101",
      service: "etl_service",
      qid: "JOI-14H",
      qidTags: "JOIN:3",
      memoryBytes: 22_300_000_000,
      gpuPct: 68,
      cpuPct: 145,
      startTimeSec: 1_800_000_000,
      elapsedSec: 125,
      progress: 0.4,
    });
  });

  it("수치가 없는 신원은 NaN으로 채운다 (조인 실패 방어) — X8 라벨 결측은 \"\"", () => {
    const rows = build({
      identity: [stmt({ stmt_id: "x", node: "n", gpu: "0", query_id: "q", sqream_user: "u" })],
    });
    expect(rows[0].memoryBytes).toBeNaN();
    expect(rows[0].elapsedSec).toBeNaN();
    expect(rows[0].progress).toBeNaN();
    expect(rows[0].qid).toBe("");
    expect(rows[0].worker).toBe("");
  });

  it("GPU 사용률 내림차순 정렬 (원본 정렬)", () => {
    const mk = (id: string) => stmt({ stmt_id: id, node: "n", gpu: "0", query_id: id, sqream_user: "u" });
    const rows = build({
      identity: [mk("a"), mk("b")],
      gpuPct: [val({ stmt_id: "a" }, "30"), val({ stmt_id: "b" }, "90")],
    });
    expect(rows.map((r) => r.stmtId)).toEqual(["b", "a"]);
  });

  it("결측(NaN) GPU%는 유한값보다 항상 아래로 정렬한다 (CDX-R3-02)", () => {
    const mk = (id: string) => stmt({ stmt_id: id, node: "n", gpu: "0", query_id: id, sqream_user: "u" });
    // 'a'는 GPU% 결측(NaN), 'b'는 90. NaN이 껴도 90이 위로 와야 한다.
    const rows = build({
      identity: [mk("a"), mk("b")],
      gpuPct: [val({ stmt_id: "b" }, "90")], // a는 없음 → NaN
    });
    expect(rows[0].stmtId).toBe("b");
    expect(rows[1].gpuPct).toBeNaN();
  });

  it("입력 순서를 뒤집어도 같은 정렬 결과 (안정 tie-break)", () => {
    const mk = (id: string) => stmt({ stmt_id: id, node: "n", gpu: "0", query_id: id, sqream_user: "u" });
    const gpuPct = [val({ stmt_id: "a" }, "50"), val({ stmt_id: "b" }, "50")]; // 동점
    const forward = build({ identity: [mk("a"), mk("b")], gpuPct });
    const reverse = build({ identity: [mk("b"), mk("a")], gpuPct });
    expect(forward.map((r) => r.stmtId)).toEqual(["a", "b"]);
    expect(reverse.map((r) => r.stmtId)).toEqual(["a", "b"]); // 순서 무관
  });

  it("stmt_id 충돌(계약 위반)은 경고로 드러내고 첫 시리즈를 유지한다 (CDX-R3-01)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // 계약 위반 상황: 같은 stmt_id의 memory 시리즈가 둘 — 조용히 덮어쓰지 않아야 함
    const rows = build({
      identity: [stmt({ stmt_id: "dup", node: "n1", gpu: "0", query_id: "q", sqream_user: "u" })],
      memory: [val({ stmt_id: "dup" }, "1000000000"), val({ stmt_id: "dup" }, "9000000000")],
    });
    expect(rows[0].memoryBytes).toBe(1_000_000_000); // 첫 시리즈 유지 (마지막 승자 아님)
    expect(warn).toHaveBeenCalled();
  });
});

describe("buildPerformance — query_name 조인", () => {
  it("rows/p95/state를 query_name으로 맞물린다", () => {
    const rows = buildPerformance({
      rows: [
        val(
          { query_name: "Sales_Aggregation", query_type: "aggregation", database: "sales_db", node: "gpu-server-01", gpu: "0" },
          "1850000",
        ),
      ],
      p95: [val({ query_name: "Sales_Aggregation" }, "1.28")],
      state: [val({ query_name: "Sales_Aggregation" }, "1")],
    });
    expect(rows[0]).toMatchObject({
      queryName: "Sales_Aggregation",
      queryType: "aggregation",
      database: "sales_db",
      rowsPerSecond: 1_850_000,
      p95Seconds: 1.28,
      state: 1,
    });
  });

  it("rows/s 내림차순 정렬", () => {
    const mk = (name: string, rows: string) =>
      val({ query_name: name, query_type: "t", database: "d", node: "n", gpu: "0" }, rows);
    const result = buildPerformance({
      rows: [mk("Low", "100"), mk("High", "900")],
      p95: [],
      state: [],
    });
    expect(result.map((r) => r.queryName)).toEqual(["High", "Low"]);
  });

  it("결측(NaN) rows/s는 유한값보다 아래로 정렬한다 (CDX-R3-02)", () => {
    const mk = (name: string, rows: string) =>
      val({ query_name: name, query_type: "t", database: "d", node: "n", gpu: "0" }, rows);
    const result = buildPerformance({
      rows: [mk("Missing", "NaN"), mk("Real", "500")],
      p95: [],
      state: [],
    });
    expect(result[0].queryName).toBe("Real");
    expect(result[1].rowsPerSecond).toBeNaN();
  });
});

/* 최초 로드 전·연결 끊김 상태 (CDX-H-04).
   예전에는 노드 3개를 0으로 채운 레코드를 내보내 게이지가 0%를, 사이드바가
   "0 / 0 MiG · 정상"을 측정값처럼 표시했다. 빈 배열이어야 ServerGauges가
   자리표시 분기(R9 F3.5)를 탄다 — 그 분기는 이미 있었지만 도달 불가능했다. */
describe("무데이터 상태 표현 (CDX-H-04)", () => {
  it("최초 상태의 servers는 빈 배열이고 KPI는 NaN이다", async () => {
    const { useDashboardData } = await import("../src/hooks/useDashboardData");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {/* 영원히 미해결 — 최초 로드 전 상태 유지 */}),
    );
    try {
      const { result } = renderHook(() =>
        useDashboardData({ env: "production", instances: [], gpus: [], migs: [] }, 5),
      );
      expect(result.current.data.servers).toEqual([]);
      expect(result.current.data.statements).toEqual([]);
      expect(Number.isNaN(result.current.data.kpi.p95Seconds)).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
