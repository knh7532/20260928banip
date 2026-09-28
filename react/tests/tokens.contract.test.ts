/**
 * 디자인 토큰 대사 — src/styles/tokens.css ↔ ../docs/design-tokens.md (통합 docs)
 *
 * 토큰 값은 원본 시안에서 추출한 실제 값이다. 한쪽만 바뀌면 실패한다.
 * 색상뿐 아니라 타이포·간격·레이아웃 토큰까지 대사한다(CDX-R1-02).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readTokensCss(): Map<string, string> {
  const css = readFileSync(resolve(ROOT, "src/styles/tokens.css"), "utf-8");
  const map = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    map.set(name, value.trim().toLowerCase().replace(/\s+/g, " "));
  }
  return map;
}

const DOC = readFileSync(resolve(ROOT, "docs/design-tokens.md")  /* transplant: react/docs */, "utf-8");

/** 문서 표에서 `--token` | `값` 쌍을 뽑는다 (값이 백틱으로 감싸인 행). */
function readDocTokens(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, name, value] of DOC.matchAll(/\|\s*`--([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|/g)) {
    map.set(name, value.trim().toLowerCase());
  }
  return map;
}

/** 문서 표에서 `--token` | 값(백틱 없음) 쌍 — 타이포 표처럼 값이 평문인 경우. */
function readDocPlainTokens(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, name, value] of DOC.matchAll(/\|\s*`--([a-z0-9-]+)`\s*\|\s*([^|`]+?)\s*\|/g)) {
    map.set(name, value.trim().toLowerCase());
  }
  return map;
}

const css = readTokensCss();
const doc = readDocTokens();
const docPlain = readDocPlainTokens();

describe("디자인 토큰 계약 — 색상", () => {
  const docColors = new Map([...doc].filter(([, v]) => /^#[0-9a-f]{6}$/.test(v)));

  it("문서의 모든 색 토큰이 CSS에 동일한 값으로 존재한다", () => {
    expect(docColors.size).toBeGreaterThan(15);
    for (const [name, value] of docColors) {
      expect(css.get(name), `--${name}`).toBe(value);
    }
  });

  it("CSS의 색 토큰이 문서에 빠짐없이 기재되어 있다", () => {
    const undocumented = [...css]
      .filter(([, v]) => /^#[0-9a-f]{6}$/.test(v))
      .map(([n]) => n)
      .filter((n) => !docColors.has(n));
    expect(undocumented, "문서 미기재 색 토큰").toEqual([]);
  });

  it("GPU 시리즈 4색과 쿼리 유형 6색이 모두 정의되어 있다", () => {
    for (const n of ["gpu-0", "gpu-1", "gpu-2", "gpu-3"]) {
      expect(css.has(n), `--${n}`).toBe(true);
    }
    for (const n of ["qt-select", "qt-etl", "qt-aggregation", "qt-join", "qt-fullscan", "qt-other"]) {
      expect(css.has(n), `--${n}`).toBe(true);
    }
  });

  it("쿼리 유형 6색은 서로 구별된다 (범례가 겹치지 않도록)", () => {
    const qt = ["qt-select", "qt-etl", "qt-aggregation", "qt-join", "qt-fullscan", "qt-other"].map(
      (n) => css.get(n),
    );
    expect(new Set(qt).size).toBe(6);
  });
});

describe("디자인 토큰 계약 — 타이포·레이아웃", () => {
  it("문서에 기재된 px 토큰이 CSS와 일치한다", () => {
    const pxTokens = [...docPlain].filter(([, v]) => /^\d+px$/.test(v));
    expect(pxTokens.length).toBeGreaterThanOrEqual(5); // fs-title/panel-title/body/label/kpi
    for (const [name, value] of pxTokens) {
      expect(css.get(name), `--${name}`).toBe(value);
    }
  });

  it("간격·모양 토큰이 문서(§4 표)와 일치한다", () => {
    // 문서에 값이 기재돼 있어야 하고(누락 시 undefined), CSS와 같아야 한다.
    for (const name of [
      "gap",
      "radius",
      "panel-radius",
      "sidebar-w",
      "sidebar-min-w",
      "sidebar-max-w",
      "sidebar-radius",
    ]) {
      const documented = docPlain.get(name);
      expect(documented, `문서에 --${name} 미기재`).toBeDefined();
      expect(css.get(name), `--${name}`).toBe(documented);
    }
  });

  it("사이드바 폭은 1600px 기준 12.5%이며 clamp 범위를 문서화한다", () => {
    const row = /\|\s*사이드바\s*\|[^|]*\|[^|]*\|\s*([\d.]+%)\s*\|/.exec(DOC);
    expect(row, "레이아웃 표에 사이드바 행 없음").not.toBeNull();
    expect(row?.[1]).toBe("12.5%");
    expect(css.get("sidebar-w")).toBe("clamp(176px, 12.5vw, 208px)");
    expect(docPlain.get("sidebar-w")).toBe(css.get("sidebar-w"));
  });

  it("폰트 스택이 정의되어 있다", () => {
    expect(css.get("font")).toContain("pretendard");
    expect(css.get("font-mono")).toContain("mono");
  });

  // R9.1: bottom 16→18 rows (시계열 y축 판독성 — 인간 지시), KPI 스트립 토큰 대사 포함
  it("dashboard 고정 그리드 토큰은 문서와 CSS에서 7:11:18로 대사된다", () => {
    const expected = new Map([
      ["dashboard-row-unit", "24px"],
      ["dashboard-kpi-h", "64px"],
      ["dashboard-top-h", "168px"],
      // X8: GPU 화면 전용 top override(14 rows) + 쿼리 요약 카드 행(2 rows)
      ["dashboard-queries-h", "336px"],
      ["dashboard-qsummary-h", "96px"],
      ["dashboard-middle-h", "264px"],
      ["dashboard-bottom-h", "432px"],
      ["dashboard-gap", "8px"],
      ["dashboard-min-w", "1120px"],
    ]);

    for (const [name, value] of expected) {
      expect(css.get(name), `CSS --${name}`).toBe(value);
      expect(docPlain.get(name) ?? doc.get(name), `문서 --${name}`).toBe(value);
    }

    const row = Number.parseInt(css.get("dashboard-row-unit") ?? "", 10);
    expect(Number.parseInt(css.get("dashboard-top-h") ?? "", 10) / row).toBe(7);
    expect(Number.parseInt(css.get("dashboard-middle-h") ?? "", 10) / row).toBe(11);
    expect(Number.parseInt(css.get("dashboard-bottom-h") ?? "", 10) / row).toBe(18);
  });
});
