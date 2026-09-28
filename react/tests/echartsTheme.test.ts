import { afterEach, describe, expect, it } from "vitest";

import { FALLBACK_TOKENS, resetThemeTokensCache, themeTokens } from "../src/lib/echartsTheme";

/**
 * ECharts 테마 토큰 (E5) — canvas 는 CSS 변수를 못 읽어 런타임에 1회 읽는다.
 * 폴백은 tokens.css 와 글자 그대로 같아야 한다(신규 색 금지 규칙의 기계 검증).
 */
describe("echartsTheme — 토큰 읽기·폴백", () => {
  afterEach(() => {
    resetThemeTokensCache();
    document.documentElement.removeAttribute("style");
  });

  it("폴백은 tokens.css 의 값과 같다", () => {
    expect(FALLBACK_TOKENS.bg).toBe("#0e1420");
    expect(FALLBACK_TOKENS.panelAlt).toBe("#1a2338");
    expect(FALLBACK_TOKENS.text2).toBe("#9098ac");
    expect(FALLBACK_TOKENS.accent).toBe("#22d3ee");
    expect(FALLBACK_TOKENS.link).toBe("#5b9bff");
  });

  it("CSS 변수가 없으면(jsdom 기본) 폴백을 그대로 돌려준다", () => {
    expect(themeTokens()).toEqual(FALLBACK_TOKENS);
  });

  it("문서 루트에 변수가 있으면 그 값을 읽고, 결과는 캐시된다", () => {
    document.documentElement.style.setProperty("--accent", "#123456");
    const first = themeTokens();
    expect(first.accent).toBe("#123456");
    expect(first.panelAlt).toBe(FALLBACK_TOKENS.panelAlt); // 미정의 키는 폴백
    document.documentElement.style.setProperty("--accent", "#abcdef");
    expect(themeTokens()).toBe(first); // 같은 객체 — 재계산 없음
    resetThemeTokensCache();
    expect(themeTokens().accent).toBe("#abcdef");
  });
});
