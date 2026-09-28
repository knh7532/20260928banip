import type { PromSeries } from "../src/api/prom";
import { gpuSeriesKey, nodeSeriesKey, shortNode, toC3Columns, toTimeSeries } from "../src/lib/series";

/** matrix 시리즈 헬퍼. */
const m = (labels: Record<string, string>, values: Array<[number, string]>): PromSeries => ({
  metric: labels,
  values,
});

/** GPU 라인 키 — id/label은 (node,gpu) 복합, 색은 gpu 번호. */
const GPU_KEY = {
  id: (mm: Record<string, string>) => `${mm.node}/${mm.gpu}`,
  label: (mm: Record<string, string>) => `${mm.node}·GPU${mm.gpu}`,
  colorKey: (mm: Record<string, string>) => mm.gpu,
};

describe("toTimeSeries — matrix → C3 라인", () => {
  it("라인을 x축 합집합에 정렬하고 id로 안정 정렬한다", () => {
    const ts = toTimeSeries(
      [
        m({ node: "n1", gpu: "1" }, [[100, "10"], [110, "20"]]),
        m({ node: "n1", gpu: "0" }, [[100, "50"], [110, "60"]]),
      ],
      GPU_KEY,
    );
    expect(ts.x).toEqual([100_000, 110_000]); // 초 → ms
    expect(ts.lines.map((l) => l.id)).toEqual(["n1/0", "n1/1"]); // numeric 안정 정렬
    expect(ts.lines[0].label).toBe("n1·GPU0");
    expect(ts.lines[0].colorKey).toBe("0");
    expect(ts.lines[0].values).toEqual([50, 60]);
  });

  it("여러 노드의 같은 GPU 번호는 서로 다른 라인이다 (CDX-R4-01 덮어쓰기 방지)", () => {
    const ts = toTimeSeries(
      [
        m({ node: "gpu-server-01", gpu: "0" }, [[100, "1"], [110, "2"]]),
        m({ node: "gpu-server-02", gpu: "0" }, [[100, "9"], [110, "8"]]),
      ],
      GPU_KEY,
    );
    // 두 라인이 유지된다 (뭉치지 않음)
    expect(ts.lines).toHaveLength(2);
    expect(new Set(ts.lines.map((l) => l.id)).size).toBe(2);
    expect(new Set(ts.lines.map((l) => l.label)).size).toBe(2); // 컬럼 ID 유일
    // 색은 둘 다 GPU-0 색을 공유(colorKey 동일)
    expect(ts.lines.every((l) => l.colorKey === "0")).toBe(true);
    // C3 컬럼도 라벨이 겹치지 않는다
    const cols = toC3Columns(ts);
    const labels = cols.slice(1).map((c) => c[0]);
    expect(new Set(labels).size).toBe(2);
  });

  it("시각이 어긋난 시리즈는 합집합 격자에서 빠진 지점을 null로 채운다", () => {
    const ts = toTimeSeries(
      [
        m({ node: "n", gpu: "0" }, [[100, "1"], [120, "3"]]),
        m({ node: "n", gpu: "1" }, [[110, "2"]]),
      ],
      GPU_KEY,
    );
    expect(ts.x).toEqual([100_000, 110_000, 120_000]);
    expect(ts.lines[0].values).toEqual([1, null, 3]); // gpu0: 110 없음
    expect(ts.lines[1].values).toEqual([null, 2, null]); // gpu1: 100·120 없음
  });

  it("NaN·비유한 값은 null로 처리한다", () => {
    const ts = toTimeSeries([m({ node: "n", gpu: "0" }, [[100, "NaN"], [110, "5"], [120, "Inf"]])], GPU_KEY);
    expect(ts.lines[0].values).toEqual([null, 5, null]);
  });

  it("toC3Columns — [['x',...],['n·GPU0',...]] 형태", () => {
    const ts = toTimeSeries([m({ node: "n", gpu: "0" }, [[100, "1"], [110, "2"]])], GPU_KEY);
    expect(toC3Columns(ts)).toEqual([
      ["x", 100_000, 110_000],
      ["n·GPU0", 1, 2],
    ]);
  });
});

describe("gpuSeriesKey — 인스턴스 중심 라벨 (R6·R7 MIG)", () => {
  const metric = { node: "gpu-server-02", gpu: "3", mig: "1" };

  it("단일 인스턴스: 라벨 'GPU-3·M1' (MIG 인스턴스 단위)", () => {
    const k = gpuSeriesKey(true);
    expect(k.id(metric)).toBe("gpu-server-02/3/1");
    expect(k.label?.(metric)).toBe("sqream232");
    expect(k.colorKey?.(metric)).toBe("3"); // 색은 물리 GPU 공유
  });

  it("복수/All: 복합 라벨 'S02·GPU3·M1' (CDX-R4-01 유일성)", () => {
    const k = gpuSeriesKey(false);
    expect(k.id(metric)).toBe("gpu-server-02/3/1");
    expect(k.label?.(metric)).toBe("sqream232");
    expect(k.colorKey?.(metric)).toBe("3");
  });

  it("shortNode: 숫자 접미사 추출, 없으면 원문", () => {
    expect(shortNode("gpu-server-01")).toBe("S01");
    expect(shortNode("nodename")).toBe("Snodename");
  });
});

describe("nodeSeriesKey — All 뷰 노드 평균 3선 (R9 F2.2)", () => {
  it("id는 노드명, 라벨은 시안 표기, 색 키는 노드 팔레트", () => {
    const k = nodeSeriesKey();
    const metric = { node: "gpu-server-02" };
    expect(k.id(metric)).toBe("gpu-server-02");
    expect(k.label?.(metric)).toBe("icspreamh2gpu02");
    expect(k.colorKey?.(metric)).toBe("gpu-server-02");
  });
});

describe("toTimeSeries — 키 폴백·결측 방어 (커버리지 경계)", () => {
  it("label/colorKey 미지정 시 id로 폴백한다", () => {
    const out = toTimeSeries([m({ node: "n1", gpu: "0" }, [[1, "5"]])], {
      id: (mm) => `${mm.node}/${mm.gpu}`,
    });
    expect(out.lines[0].label).toBe("n1/0");
    expect(out.lines[0].colorKey).toBe("n1/0");
  });

  it("'NaN' 값은 null로, values 필드 결측 시리즈는 빈 라인으로", () => {
    const out = toTimeSeries(
      [
        m({ node: "n1", gpu: "0" }, [[1, "NaN"], [2, "7"]]),
        { metric: { node: "n1", gpu: "1" } } as unknown as PromSeries, // values 없음
      ],
      { id: (mm) => `${mm.node}/${mm.gpu}` },
    );
    expect(out.lines[0].values).toEqual([null, 7]);
    expect(out.lines[1].values).toEqual([null, null]);
  });
});
