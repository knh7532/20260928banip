import { afterEach, describe, expect, it, vi } from "vitest";

import type { StatementRow } from "../src/hooks/useDashboardData";
import {
  COLUMN_ORDER_KEY, RUNNING_COLUMNS, formatElapsedKo, formatStampKST, loadColumnOrder, moveColumn,
  saveColumnOrder, sortRows, sortValueOf, type ColType,
} from "../src/components/tables/runningColumns";

/** 실행 쿼리 표(16열 + 작업열) 헬퍼 — 순수 함수 단위 검증. */
const DEFAULTS = RUNNING_COLUMNS.map((c) => c.key);

const row: StatementRow = {
  stmtId: "105234", queryId: "Q-88123", user: "dba1", node: "gpu-server-01", gpu: "0", mig: "1",
  worker: "", service: "select_service", qid: "SEL-04H", qidTags: "", connectionId: "5012",
  memoryBytes: 2e9, gpuPct: 61, cpuPct: 140, startTimeSec: Date.UTC(2026, 6, 15, 5, 32, 1) / 1000,
  elapsedSec: 3725, progress: 0.4, spoolBytes: 0, vramBytes: Number.NaN, lockHeldSec: 12,
};

describe("runningColumns — 표기 헬퍼", () => {
  it("formatStampKST: KST 날짜 + formatClock 시각, 결측은 '-'", () => {
    expect(formatStampKST(row.startTimeSec)).toBe("2026-07-15 14:32:01");
    expect(formatStampKST(Number.NaN)).toBe("-");
  });

  it("formatElapsedKo: 시·분·초 조합(0 단위는 상위가 있을 때만), 결측·음수 처리", () => {
    expect(formatElapsedKo(3725)).toBe("1시간 2분 5초");
    expect(formatElapsedKo(125)).toBe("2분 5초");
    expect(formatElapsedKo(7)).toBe("7초");
    expect(formatElapsedKo(3600)).toBe("1시간 0분 0초");
    expect(formatElapsedKo(-3)).toBe("0초");
    expect(formatElapsedKo(Number.NaN)).toBe("-");
  });
});

describe("runningColumns — 정렬 값·정렬", () => {
  it("sortValueOf: 열별 값과 결측(null) 규칙", () => {
    expect(sortValueOf(row, "stamp")).toBe(row.startTimeSec);
    expect(sortValueOf(row, "node")).toBe("gpu-server-01");
    expect(sortValueOf(row, "worker")).toBe("sqream102"); // worker 결측 → workerName(node,gpu,mig)
    expect(sortValueOf(row, "conn")).toBe("5012"); // v4.12 connection_id
    expect(sortValueOf({ ...row, connectionId: "" }, "conn")).toBeNull();
    expect(sortValueOf(row, "link")).toBe(105234);
    expect(sortValueOf(row, "svc")).toBe("select_service");
    expect(sortValueOf(row, "lock")).toBe("Held");
    expect(sortValueOf({ ...row, lockHeldSec: Number.NaN }, "lock")).toBeNull();
    expect(sortValueOf(row, "user")).toBe("dba1");
    expect(sortValueOf(row, "status")).toBe(3); // 3725s → Executing
    expect(sortValueOf({ ...row, elapsedSec: Number.NaN }, "status")).toBe(1); // Preparing 폴백
    expect(sortValueOf(row, "elapsed")).toBe(3725);
    expect(sortValueOf(row, "prog")).toBe(0.4);
    expect(sortValueOf(row, "mem")).toBe(2e9);
    expect(sortValueOf(row, "spool")).toBeNull(); // 0 은 없음
    expect(sortValueOf({ ...row, spoolBytes: 5 }, "spool")).toBe(5);
    expect(sortValueOf(row, "vram")).toBeNull();
    expect(sortValueOf(row, "gpu")).toBe(61);
    expect(sortValueOf(row, "cpu")).toBe(140);
    expect(sortValueOf(row, "actions")).toBeNull();
    expect(sortValueOf({ ...row, node: "", service: "", user: "" }, "node")).toBeNull();
    expect(sortValueOf({ ...row, service: "" }, "svc")).toBeNull();
    expect(sortValueOf({ ...row, user: "" }, "user")).toBeNull();
  });

  it("sortRows: 숫자·문자열 비교, 결측은 방향과 무관하게 뒤, sort 없음이면 원본 참조", () => {
    const a = { ...row, stmtId: "1", gpuPct: 10, user: "b" };
    const b = { ...row, stmtId: "2", gpuPct: Number.NaN, user: "a" };
    const c = { ...row, stmtId: "3", gpuPct: 90, user: "c" };
    const rows = [a, b, c];
    expect(sortRows(rows, null)).toBe(rows);
    expect(sortRows(rows, { key: "gpu", desc: true }).map((r) => r.stmtId)).toEqual(["3", "1", "2"]);
    expect(sortRows(rows, { key: "gpu", desc: false }).map((r) => r.stmtId)).toEqual(["1", "3", "2"]);
    expect(sortRows(rows, { key: "user", desc: false }).map((r) => r.stmtId)).toEqual(["2", "1", "3"]);
    // 둘 다 결측이면 순서 유지
    expect(sortRows([b, { ...b, stmtId: "4" }], { key: "gpu", desc: true }).map((r) => r.stmtId)).toEqual(["2", "4"]);
  });
});

describe("runningColumns — 열 순서 저장·이동", () => {
  afterEach(() => localStorage.removeItem(COLUMN_ORDER_KEY));

  it("moveColumn: from 을 to 앞에 끼워 넣는다, 같은 열이면 복사본 그대로", () => {
    const order: ColType[] = ["stamp", "node", "worker"];
    expect(moveColumn(order, "worker", "stamp")).toEqual(["worker", "stamp", "node"]);
    expect(moveColumn(order, "stamp", "worker")).toEqual(["node", "stamp", "worker"]);
    expect(moveColumn(order, "node", "node")).toEqual(order);
    expect(moveColumn(order, "node", "node")).not.toBe(order);
    // to 가 목록에 없으면 끝으로
    expect(moveColumn(order, "stamp", "cpu")).toEqual(["node", "worker", "stamp"]);
  });

  it("loadColumnOrder: 저장 없음·손상·열 집합 불일치·중복은 기본 순서, 정상은 그대로", () => {
    expect(loadColumnOrder(DEFAULTS)).toEqual(DEFAULTS);
    localStorage.setItem(COLUMN_ORDER_KEY, "{not json");
    expect(loadColumnOrder(DEFAULTS)).toEqual(DEFAULTS);
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify({ a: 1 }));
    expect(loadColumnOrder(DEFAULTS)).toEqual(DEFAULTS);
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(DEFAULTS.slice(1)));
    expect(loadColumnOrder(DEFAULTS)).toEqual(DEFAULTS);
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify([...DEFAULTS.slice(1), "bogus"]));
    expect(loadColumnOrder(DEFAULTS)).toEqual(DEFAULTS);
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify([...DEFAULTS.slice(1), DEFAULTS[1]]));
    expect(loadColumnOrder(DEFAULTS)).toEqual(DEFAULTS);
    const moved = moveColumn(DEFAULTS, "worker", "stamp");
    saveColumnOrder(moved);
    expect(loadColumnOrder(DEFAULTS)).toEqual(moved);
  });

  it("saveColumnOrder: 저장 실패(프라이빗 모드 등)를 삼킨다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      expect(() => saveColumnOrder(DEFAULTS)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
