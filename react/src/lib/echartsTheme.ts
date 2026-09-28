/**
 * ECharts 테마 토큰 (Phase E5 — 차트 엔진 ECharts 통일, 2026-09-07).
 *
 * canvas 렌더러는 CSS 변수를 읽지 못한다. 그래서 `tokens.css`의 값을 **런타임에 1회**
 * `getComputedStyle`로 읽어 옵션 빌더에 넘긴다. 폴백은 `src/styles/tokens.css`·
 * `docs/design-tokens.md`의 값과 글자 그대로 같다 — 새 색을 만들지 않는다(§6.4 규칙).
 * 옵션 빌더는 이 객체를 **인자**로 받으므로 단위 테스트는 DOM 없이 `FALLBACK_TOKENS`로 돈다.
 */
export interface ThemeTokens {
  bg: string;
  panel: string;
  panelAlt: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  link: string;
  accent: string;
  muted: string;
  font: string;
  fontMono: string;
}

/** tokens.css 와 동일한 폴백 — 테스트·SSR·변수 미정의 환경용. */
export const FALLBACK_TOKENS: ThemeTokens = {
  bg: "#0e1420",
  panel: "#141b2e",
  panelAlt: "#1a2338",
  border: "#232d45",
  text: "#ffffff",
  text2: "#9098ac",
  text3: "#5c6579",
  link: "#5b9bff",
  accent: "#22d3ee",
  muted: "#6b7280",
  font: '"Pretendard", "Pretendard Variable", -apple-system, "Segoe UI", "Malgun Gothic", sans-serif',
  fontMono: '"JetBrains Mono", "Consolas", monospace',
};

const VAR_OF: Record<keyof ThemeTokens, string> = {
  bg: "--bg",
  panel: "--panel",
  panelAlt: "--panel-alt",
  border: "--border",
  text: "--text",
  text2: "--text-2",
  text3: "--text-3",
  link: "--link",
  accent: "--accent",
  muted: "--muted",
  font: "--font",
  fontMono: "--font-mono",
};

let cached: ThemeTokens | null = null;

/**
 * 문서 루트의 CSS 변수를 읽어 토큰 객체를 만든다. 값이 비면(변수 미정의·jsdom) 폴백.
 * 결과는 캐시한다 — 토큰은 정적이고 12개 게이지가 마운트마다 재계산할 이유가 없다.
 */
export function themeTokens(): ThemeTokens {
  if (cached) return cached;
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return FALLBACK_TOKENS;
  }
  const style = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK_TOKENS };
  for (const key of Object.keys(VAR_OF) as Array<keyof ThemeTokens>) {
    const v = style.getPropertyValue(VAR_OF[key]).trim();
    if (v) out[key] = v;
  }
  cached = out;
  return out;
}

/** 테스트용 — 캐시를 비운다(변수를 바꿔 재검증할 때). */
export function resetThemeTokensCache(): void {
  cached = null;
}
