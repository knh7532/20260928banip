/**
 * 차트 색 대사 — src/lib/colors.ts ↔ src/styles/tokens.css
 *
 * C3는 색을 CSS 변수로 못 받아 colors.ts에 hex 상수를 둔다. tokens가 SoT이므로
 * 두 값이 어긋나면 실패시켜 드리프트를 막는다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GAUGE_LEVEL_COLORS,
  GPU_SERIES_COLORS,
  NODE_CLASSIC_COLORS,
  NODE_SERIES_COLORS,
  QUERY_TYPE_COLORS,
  gpuColor,
  queryTypeColor,
  seriesColor,
} from "../src/lib/colors";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function tokens(): Map<string, string> {
  const css = readFileSync(resolve(ROOT, "src/styles/tokens.css"), "utf-8");
  const map = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    map.set(name, value.trim().toLowerCase());
  }
  return map;
}

const css = tokens();

describe("차트 색 계약", () => {
  it("GPU 시리즈 4색이 tokens.css --gpu-N과 일치", () => {
    for (const gpu of ["0", "1", "2", "3"]) {
      expect(GPU_SERIES_COLORS[gpu], `gpu ${gpu}`).toBe(css.get(`gpu-${gpu}`));
    }
  });

  it("쿼리 유형 6색이 tokens.css --qt-*와 일치", () => {
    for (const t of ["select", "etl", "aggregation", "join", "fullscan", "other"]) {
      expect(QUERY_TYPE_COLORS[t], `type ${t}`).toBe(css.get(`qt-${t}`));
    }
  });

  it("알 수 없는 키는 --muted(#6b7280)로 폴백", () => {
    expect(gpuColor("99")).toBe("#6b7280");
    expect(queryTypeColor("nope")).toBe("#6b7280");
    expect(css.get("muted")).toBe("#6b7280");
  });

  it("노드 시리즈 3색이 tokens.css --node-N과 일치한다 (R9 All 뷰 평균 3선)", () => {
    const nodes = ["gpu-server-01", "gpu-server-02", "gpu-server-03"];
    nodes.forEach((node, i) => {
      expect(NODE_SERIES_COLORS[node], node).toBe(css.get(`node-${i + 1}`));
    });
    // E4(시안 인간 확정): 노드 3색 = 뮤티드 사다리 앞 3색 공용 — F4.1(비중복)은
    // 두 뷰가 동시에 안 보이므로 의도적으로 완화됐다. 사다리 정합을 잠근다.
    nodes.forEach((node, i) => {
      expect(NODE_SERIES_COLORS[node], `${node} = --gpu-${i}`).toBe(GPU_SERIES_COLORS[String(i)]);
    });
  });

  it("seriesColor는 GPU → 노드 팔레트 순으로 찾고 그 외엔 muted 폴백 (R9)", () => {
    expect(seriesColor("0")).toBe(GPU_SERIES_COLORS["0"]);
    expect(seriesColor("gpu-server-02")).toBe(NODE_SERIES_COLORS["gpu-server-02"]);
    expect(seriesColor("unknown")).toBe("#6b7280");
  });

  it("게이지 단계 색이 Grafana mockup 기본 팔레트와 일치", () => {
    expect(GAUGE_LEVEL_COLORS).toEqual({
      ok: "#73BF69",
      warn: "#FF9830",
      danger: "#F2495C",
      info: "#5794F2",
    });
  });

  it("classic 노드 팔레트(X13→E4)는 뮤티드 노드 3색과 동일 값·키 격리를 유지한다", () => {
    // E4: grafana classic 톤은 뮤티드 시안이 흡수 — Cluster Performance도 노드 3색.
    const nodes = ["gpu-server-01", "gpu-server-02", "gpu-server-03"];
    nodes.forEach((node) => {
      expect(NODE_CLASSIC_COLORS[`classic-${node}`], node).toBe(NODE_SERIES_COLORS[node]);
      expect(NODE_SERIES_COLORS[`classic-${node}`]).toBeUndefined(); // 키 격리 유지
    });
    // seriesColor가 classic 키를 해석한다 (opt-in 경로)
    expect(seriesColor("classic-gpu-server-01")).toBe("#8ab4f8");
    expect(seriesColor("classic-gpu-server-02")).toBe("#81c995");
    expect(seriesColor("classic-gpu-server-03")).toBe("#fdd663");
  });
});
