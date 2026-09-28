import { afterEach, vi } from "vitest";

import type { PromSeries } from "../src/api/prom";
import { cmpNumDesc, firstScalar, indexBy, valueOf } from "../src/lib/join";

const s = (labels: Record<string, string>, v: string): PromSeries => ({
  metric: labels,
  value: [1, v],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("join 유틸", () => {
  it("indexBy — 라벨 값으로 인덱싱", () => {
    const idx = indexBy([s({ stmt_id: "a" }, "1"), s({ stmt_id: "b" }, "2")], "stmt_id");
    expect(idx.size).toBe(2);
    expect(valueOf(idx.get("a"))).toBe(1);
    expect(valueOf(idx.get("b"))).toBe(2);
  });

  it("indexBy — 라벨 없는 시계열은 건너뛴다", () => {
    const idx = indexBy([s({ other: "x" }, "1")], "stmt_id");
    expect(idx.size).toBe(0);
  });

  it("indexBy — 중복 키는 첫 시리즈 유지 + 경고 (CDX-R3-01)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const idx = indexBy([s({ stmt_id: "dup" }, "1"), s({ stmt_id: "dup" }, "9")], "stmt_id");
    expect(idx.size).toBe(1);
    expect(valueOf(idx.get("dup"))).toBe(1); // 마지막 승자 아님
    expect(warn).toHaveBeenCalledOnce();
  });

  it("valueOf — 없으면 NaN", () => {
    expect(valueOf(undefined)).toBeNaN();
    expect(valueOf({ metric: {} })).toBeNaN();
    expect(valueOf(s({}, "3.5"))).toBe(3.5);
  });

  it("firstScalar — 첫 시리즈의 값", () => {
    expect(firstScalar([s({}, "72")])).toBe(72);
    expect(firstScalar([])).toBeNaN();
  });

  it("cmpNumDesc — 유한값 내림차순, 비유한값은 항상 최하위", () => {
    expect(cmpNumDesc(90, 30)).toBeLessThan(0); // 90이 앞
    expect(cmpNumDesc(30, 90)).toBeGreaterThan(0);
    expect(cmpNumDesc(50, 50)).toBe(0); // 동점
    expect(cmpNumDesc(90, Number.NaN)).toBeLessThan(0); // 유한이 앞
    expect(cmpNumDesc(Number.NaN, 90)).toBeGreaterThan(0);
    expect(cmpNumDesc(Number.NaN, Number.NaN)).toBe(0); // 둘 다 비유한 → 동순위
    // 정렬에 넣어도 NaN이 반드시 끝으로
    expect([30, Number.NaN, 90, 60].sort(cmpNumDesc).slice(0, 3)).toEqual([90, 60, 30]);
  });
});
