/**
 * 드릴다운 계약 대사 (S3) — codex CDX-S3C-12.
 *
 * 기존 계약 테스트들은 **탑뷰 것만** 지키고 있었다. S3에서 늘어난 축(y2 오른쪽 축, 토큰
 * 스코프, 드릴다운 의미색)은 어느 것도 보호하지 않아, 지워도 아무 테스트가 실패하지 않았다.
 * 여기서 그 셋을 잠근다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DrilldownDashboard } from "../src/screens/DrilldownDashboard";
import { mainDashboard } from "../src/api/queries";

import { chartAxisMax, chartNumber } from "../src/lib/format";
import { LEVEL_SERIES_COLORS, seriesColor } from "../src/lib/colors";

const HERE = dirname(fileURLToPath(import.meta.url));
/* 상단바 규칙은 2026-08-09에 `topbar.css`로 분리했다(탑뷰도 쓰기 때문).
   **둘을 이어 붙여** 검사한다 — 안 그러면 상단바 토큰이 조용히 검사에서 빠진다. */
const DRILLDOWN_CSS = ["drilldown", "topbar"]
  .map((n) => readFileSync(resolve(HERE, `../src/styles/${n}.css`), "utf-8"))
  .join("\n");

describe("차트 축 — 정적 원본 규칙 (2026-08-09 인간 지적으로 복원)", () => {
  /* 축 상한·눈금 표기 규칙(정적 SVG 원본). 눈금 수·y2·여백·툴팁은 ECharts 옵션 빌더 계약
     (tests/echartsOption.test.ts)이 잠근다 — C3 설정 빌더 계약은 E5 D5 에서 제거. */
  it("percent 축은 100 고정 — 데이터가 낮아도 축이 출렁이지 않는다", () => {
    expect(chartAxisMax([12, 31, 7], "percent")).toBe(100);
    expect(chartAxisMax([], "percent")).toBe(100);
  });

  it("그 밖의 축은 최댓값보다 10% 여유를 둔 깔끔한 수", () => {
    expect(chartAxisMax([65.0676], "number")).toBe(80);     // 10^1 단위로 올림
    expect(chartAxisMax([610_200_000], "bytesPerSec")).toBe(700_000_000);
    expect(chartAxisMax([0], "number"), "0 이하는 1").toBe(1);
    expect(chartAxisMax([-5], "number")).toBe(1);
  });

  it("눈금 숫자는 원시 실수가 아니라 단위 표기다", () => {
    expect(chartNumber(65.06763563699022, "percent")).toBe("65%");
    expect(chartNumber(7.5, "percent")).toBe("7.5%");
    expect(chartNumber(610_200_000, "bytesPerSec")).toBe("610.2 MB/s");
    expect(chartNumber(1_500, "bytesPerSec")).toBe("2 KB/s");
    expect(chartNumber(90, "seconds")).toBe("1.5 min");
    expect(chartNumber(12.34, "seconds")).toBe("12 s");
    expect(chartNumber(65.06763563699022, "number")).toBe("65.1");
    expect(chartNumber(Number.NaN, "percent")).toBe("--");
  });

  it("플롯 배경은 카드보다 어둡다 — 원본 #111922", () => {
    /* 원본 `.prom-chart`는 카드(#13233c)보다 어두운 #111922를 깔아 그래프 영역을
       카드와 구분했다. 이관에서 이 한 줄이 빠져 배경이 투명이 됐고 카드 네이비가
       그대로 비쳤다(인간 지적 2026-08-09). */
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(/(^|\})\s*\.sqm-chart\s*\{([^}]*)\}/);
    expect(rule, ".sqm-chart 규칙이 없다").toBeTruthy();
    expect(rule![2], "플롯 배경이 없다 — 카드 색이 비친다").toMatch(/background\s*:\s*#111922/i);
  });

});

describe("카드 헤더 — 브라우저 기본 마진 리셋", () => {
  /* 원본 style.css 첫 줄은 `* { margin:0; padding:0 }` 전역 리셋이었다. 이관에서 빠져
     `<h3 class="sqm-card__head">`가 13.5px 밀려 내려가고 헤더 위에 카드 배경이
     14px 띠로 드러났다(인간 지적 2026-08-09). */
  it("드릴다운 트리 안 heading·p의 기본 마진을 지운다", () => {
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(/\.sqm-page\s+:where\(([^)]*)\)\s*\{([^}]*)\}/);
    expect(rule, ".sqm-page :where(...) 리셋 규칙이 없다").toBeTruthy();
    for (const tag of ["h1", "h2", "h3", "p"]) {
      expect(rule![1], `${tag}가 리셋 대상에서 빠졌다`).toContain(tag);
    }
    expect(rule![2]).toMatch(/margin\s*:\s*0/);
  });

  it("전역 `*` 리셋은 쓰지 않는다 — 탑뷰까지 리스킨된다", () => {
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/(^|\})\s*\*\s*\{/);
  });
});

describe("드릴다운 토큰 스코프", () => {
  /* 정적 화면과 React는 이 다섯을 **같은 이름 다른 값**으로 쓴다. `:root`로 새어 나가면
     탑뷰가 조용히 리스킨된다 — 그래서 `.sqm-page`/`.sqm-toolbar` 안에서만 선언해야 한다. */
  const COLLIDING = ["--bg", "--border", "--text", "--muted", "--accent"];
  /* 선언이 허용되는 블록. 드릴다운 트리의 **루트들**만 들어간다 — 자식 셀렉터가
     토큰을 재선언하기 시작하면 어디서 온 값인지 추적이 안 된다. */
  const SCOPES = [".sqm-page", ".sqm-toolbar", ".sqm-topbar"];

  it("drilldown.css에 :root 선언이 없다", () => {
    expect(DRILLDOWN_CSS).not.toMatch(/(^|\})\s*:root\s*\{/);
    expect(DRILLDOWN_CSS).not.toMatch(/(^|\})\s*html\s*\{/);
  });

  it("충돌 토큰 5개는 스코프 블록 안에서만 선언된다", () => {
    // 선언 위치를 셀렉터별로 모은다. 주석 안의 `{}`가 블록으로 오인되므로 먼저 지운다.
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    for (const token of COLLIDING) {
      const owners = blocks
        // 템플릿 리터럴에서 `\s`는 그냥 `s`가 된다 — 정규식으로 넘기려면 `\\s`여야 한다.
        .filter((b) => new RegExp(`(^|[;\\s])${token}\\s*:`).test(b[2]))
        .map((b) => b[1].trim().split("\n").pop()?.trim() ?? "");
      expect(owners.length, `${token} 선언이 없다`).toBeGreaterThan(0);
      for (const sel of owners) {
        expect(
          SCOPES.includes(sel),
          `${token}이 '${sel}'에서 선언됐다 — 스코프 밖이면 탑뷰가 리스킨된다`,
        ).toBe(true);
      }
    }
  });
});

describe("고정 트랙 그리드 — 선언한 칸 수와 자식 수가 같은가", () => {
  /* 같은 함정에 **세 번** 빠졌다. 트랙을 N칸으로 선언해 둔 그리드에 자식을 N+1개로
     늘리면 넘친 자식이 암묵 트랙으로 밀려나고, 브라우저는 아무 말도 하지 않는다.
       · `.drilldown-content` — 상단바를 넣어 자식 3개 (2026-08-09)
       · `.drilldown-content` — 고정 띠를 넣어 자식 4개 (2026-08-10)
       · `.sqm-workerhealth` — Restart 버튼을 넣어 자식 4개, 워커마다 두 줄이 됐다
     그래서 렌더한 실제 자식 수와 CSS 선언을 대조한다. */
  function declaredColumns(selector: string): number {
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    // selector는 `.sqm-workerhealth`처럼 점을 포함하므로 정규식 문자를 이스케이프한다.
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = css.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`));
    expect(rule, `${selector} 규칙이 없다`).toBeTruthy();
    const decl = rule![1].match(/grid-template-columns\s*:\s*([^;]+)/);
    expect(decl, `${selector}에 grid-template-columns가 없다`).toBeTruthy();
    // `minmax(0, 1fr)`처럼 콤마를 품은 함수는 한 트랙이다 — 괄호 안을 지우고 센다.
    return decl![1].replace(/\([^)]*\)/g, "()").trim().split(/\s+/).filter(Boolean).length;
  }

  it("Node Health의 워커 행 — Restart까지 4칸이다", async () => {
    /* 워커 행은 `sqm_worker_up`이 와야 그려진다. 빈 응답이면 "Worker 데이터 없음"만
       나와 이 검사가 헛돈다 — 한 건이라도 실어 준다. */
    const workersExpr = mainDashboard().workers;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const expr = new URL(url, "http://x").searchParams.get("query") ?? "";
      const result = expr === workersExpr
        ? [{ metric: { node: "gpu-server-01", worker: "sqream101" }, value: [0, "1"] }]
        : [];
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result } }),
      });
    }));
    try {
      const { container } = render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
      await waitFor(() => expect(container.querySelector(".sqm-workerhealth")).toBeTruthy());
      const row = container.querySelector(".sqm-workerhealth")!;
      expect(
        declaredColumns(".sqm-workerhealth"),
        "트랙보다 자식이 많으면 버튼이 다음 줄로 밀려 카드 높이가 두 배가 된다",
      ).toBe(row.children.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("드릴다운 셸 그리드 — 행 수와 자식 수", () => {
  /* 상단바를 넣으면서 `.drilldown-content`를 2행으로 둔 채 자식을 3개로 만들었다.
     암묵 3행이 생기며 트랙이 한 칸 밀려, `1fr`을 본문이 아니라 **툴바가** 받았다:
       · 본문이 짧은 화면(worker) → 툴바가 281px로 늘어남
       · 본문이 긴 화면(main/query/logs) → 툴바가 0px로 찌부러지고 카드가 밖으로
     그리드는 조용히 실패한다 — 콘솔 에러도, 테스트 실패도 없었다. 그래서 센다. */
  it("grid-template-rows의 트랙 수가 실제 자식 수와 같다", () => {
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(/\.drilldown-content\s*\{([^}]*)\}/);
    expect(rule, ".drilldown-content 규칙이 없다").toBeTruthy();
    const decl = rule![1].match(/grid-template-rows\s*:\s*([^;]+)/);
    expect(decl, "grid-template-rows 선언이 없다").toBeTruthy();

    // `minmax(0, 1fr)`처럼 콤마를 품은 함수는 한 트랙이다 — 괄호 안을 지우고 센다.
    const tracks = decl![1].replace(/\([^)]*\)/g, "()").trim().split(/\s+/).filter(Boolean);

    const { container } = render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    const shell = container.querySelector(".drilldown-content");
    expect(shell, ".drilldown-content가 렌더되지 않았다").toBeTruthy();
    const children = shell!.children.length;

    expect(tracks.length,
      `트랙 ${tracks.length}개 [${tracks.join(" ")}] vs 자식 ${children}개 — `
      + "어긋나면 암묵 행이 생겨 1fr을 엉뚱한 요소가 받는다").toBe(children);
  });

  it("마지막 트랙만 유연하다 — 본문이 남는 높이를 갖는다", () => {
    const css = DRILLDOWN_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const decl = css.match(/\.drilldown-content\s*\{[^}]*grid-template-rows\s*:\s*([^;]+)/);
    const tracks = decl![1].replace(/\([^)]*\)/g, (m) => m.replace(/\s/g, "")).trim().split(/\s+/);
    for (const t of tracks.slice(0, -1)) {
      expect(t, `본문 앞 트랙 '${t}'이 유연하다 — 상단바·툴바는 내용 높이여야 한다`)
        .not.toMatch(/fr/);
    }
    expect(tracks.at(-1), "마지막 트랙(본문)이 유연하지 않다").toMatch(/fr/);
  });
});

describe("드릴다운 의미색 (E4 — 뮤티드 시맨틱 매핑)", () => {
  it("시안 확정 매핑과 같은 값이다 (정상=green·경고=yellow·오류=red·CPU=blue)", () => {
    expect(LEVEL_SERIES_COLORS).toEqual({
      info: "#81c995",
      warning: "#fdd663",
      error: "#f28b82",
      blue: "#8ab4f8",
      purple: "#d7aefb",    // RAM — 사다리 4색과 비중복
    });
  });

  it("seriesColor가 이 키들을 안다 (모르면 회색으로 떨어져 의미가 사라진다)", () => {
    for (const [key, hex] of Object.entries(LEVEL_SERIES_COLORS)) {
      expect(seriesColor(key), `${key}가 팔레트에서 빠졌다`).toBe(hex);
    }
    // GPU/노드 팔레트가 우선한다는 기존 규칙은 그대로 (E4 뮤티드 값)
    expect(seriesColor("0")).toBe("#8ab4f8");
    expect(seriesColor("gpu-server-01")).toBe("#8ab4f8");
  });
});
