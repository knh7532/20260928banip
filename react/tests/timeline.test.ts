import type { PromSeries } from "../src/api/prom";
import { brushRange, type CatalogEntry, fitLabel, normalizeSelection, segmentTimeline } from "../src/lib/timeline";

const CATALOG: Record<number, CatalogEntry> = {
  1: { name: "Sales_Aggregation", type: "aggregation", database: "sales_db" },
  4: { name: "Fraud_Detection_Scan", type: "fullscan", database: "risk_db" },
};

const m = (labels: Record<string, string>, values: Array<[number, string]>): PromSeries => ({
  metric: labels,
  values,
});

describe("segmentTimeline — 연속 동일값 병합", () => {
  it("연속 동일값을 한 막대로 묶고 다음 샘플 시각까지 채운다", () => {
    const rows = segmentTimeline(
      [m({ node: "n", gpu: "0" }, [
        [100, "1"],
        [110, "1"],
        [120, "1"],
        [130, "4"],
      ])],
      CATALOG,
    );
    expect(rows).toHaveLength(1);
    const segs = rows[0].segments;
    expect(segs).toHaveLength(2);
    // 1 구간: 100~130 (다음 값 시작), 4 구간: 130~130+step(10)=140
    expect(segs[0]).toMatchObject({ value: 1, type: "aggregation", startMs: 100_000, endMs: 130_000 });
    expect(segs[1]).toMatchObject({ value: 4, type: "fullscan", startMs: 130_000, endMs: 140_000 });
  });

  it("Idle(0)은 막대를 만들지 않고 구간을 끊는다", () => {
    const rows = segmentTimeline(
      [m({ node: "n", gpu: "0" }, [
        [100, "1"],
        [110, "0"],
        [120, "1"],
      ])],
      CATALOG,
      10,
    );
    const segs = rows[0].segments;
    // Idle을 사이에 두고 같은 값 1이 두 막대로 쪼개진다
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startMs: 100_000, endMs: 110_000 }); // 다음(Idle) 시각까지
    expect(segs[1]).toMatchObject({ startMs: 120_000, endMs: 130_000 }); // 마지막 → +step
  });

  it("카탈로그에 없는 값은 type=other, name=#v", () => {
    const rows = segmentTimeline([m({ node: "n", gpu: "0" }, [[100, "9"]])], CATALOG, 5);
    expect(rows[0].segments[0]).toMatchObject({ value: 9, type: "other", name: "#9" });
  });

  it("행은 node/gpu 키로 numeric 정렬한다", () => {
    const rows = segmentTimeline(
      [
        m({ node: "n", gpu: "10" }, [[100, "1"]]),
        m({ node: "n", gpu: "2" }, [[100, "1"]]),
      ],
      CATALOG,
      5,
    );
    expect(rows.map((r) => r.gpu)).toEqual(["2", "10"]);
  });

  it("모두 Idle이면 막대가 없다", () => {
    const rows = segmentTimeline([m({ node: "n", gpu: "0" }, [
      [100, "0"],
      [110, "0"],
    ])], CATALOG, 10);
    expect(rows[0].segments).toEqual([]);
  });
});

describe("normalizeSelection — 브러시 선택 정돈", () => {
  it("뒤집힌 선택을 바로잡는다", () => {
    expect(normalizeSelection(200, 100, 0, 1000)).toEqual({ startMs: 100, endMs: 200 });
  });

  it("도메인 밖은 clamp한다", () => {
    expect(normalizeSelection(-50, 5000, 0, 1000)).toEqual({ startMs: 0, endMs: 1000 });
  });

  it("폭이 0이면 null(선택 해제)", () => {
    expect(normalizeSelection(300, 300, 0, 1000)).toBeNull();
  });
});

describe("brushRange — 브러시 픽셀 선택 → 시간 범위", () => {
  const invert = (px: number) => px * 10; // 픽셀→ms 가짜 역스케일

  it("픽셀 선택을 역스케일해 시간 범위로 만든다", () => {
    expect(brushRange([20, 50], invert, 0, 1000)).toEqual({ startMs: 200, endMs: 500 });
  });

  it("도메인 밖은 clamp한다", () => {
    expect(brushRange([-5, 200], invert, 100, 1500)).toEqual({ startMs: 100, endMs: 1500 });
  });

  it("선택이 없으면(클릭·해제) null", () => {
    expect(brushRange(null, invert, 0, 1000)).toBeNull();
  });
});

describe("fitLabel — 세그먼트 라벨 피팅 (R6)", () => {
  // CHAR_W=6.2, PAD=8 → maxChars = floor((width-8)/6.2)
  it("폭이 충분하면 전체 이름", () => {
    // "Sales_Aggregation" 17자 → 17*6.2+8 ≈ 113.4px 이상이면 통짜
    expect(fitLabel("Sales_Aggregation", 400)).toBe("Sales_Aggregation");
  });

  it("maxChars < 4면 null (라벨 생략)", () => {
    // width 32 → maxChars = floor(24/6.2) = 3 → null
    expect(fitLabel("Customer_Join", 32)).toBeNull();
    expect(fitLabel("Customer_Join", 0)).toBeNull();
  });

  it("경계: maxChars == 4부터 라벨 시도", () => {
    // width 33.5 → floor(25.5/6.2)=4 → 4자 제한, 13자 이름은 3자+… 절단
    expect(fitLabel("Customer_Join", 33.5)).toBe("Cus…");
    // 이름이 4자 이하면 통짜
    expect(fitLabel("ETL", 33.5)).toBe("ETL");
  });

  it("초과하면 '…' 절단 (maxChars-1자 + …)", () => {
    // width 70 → maxChars = floor(62/6.2) = 10 → 9자 + …
    expect(fitLabel("Fraud_Detection_Scan", 70)).toBe("Fraud_Det…");
  });

  it("이름 길이 == maxChars면 절단 없이 통짜", () => {
    // width 70 → maxChars 10, 이름 10자
    expect(fitLabel("Group_By_R", 70)).toBe("Group_By_R");
  });
});
