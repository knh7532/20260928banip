/**
 * 런타임 주입 설정 — `dist/runtime-config.js` 가 `window.__TVM_CONFIG__` 로 싣는다.
 *
 * VITE_* 는 빌드 시점에 번들로 인라인되므로(ADR R-0004 §전제) 주소를 바꾸려면
 * 재빌드가 필요했다. 이 파일은 그 예외를 없앤다: web-serve(.ps1/.sh)가 **기동할
 * 때마다** `web/.env` 를 읽어 runtime-config.js 를 다시 생성하므로, 주소 변경은
 * 재빌드가 아니라 **재기동**으로 반영된다. 우선순위: 런타임 > VITE_(빌드) > 기본값.
 *
 * runtime-config.js 가 없거나 빈 객체면 아무것도 오버라이드하지 않는다(기본 동작
 * 불변). 값은 문자열 URL만 신뢰한다 — 정적 파일이지만 방어적으로 검사한다.
 */
export interface RuntimeOverrides {
  portalApiUrl?: string;
  agentUrl?: string;
  exporterUrl?: string;
}

export function runtimeOverride(key: keyof RuntimeOverrides): string | undefined {
  if (typeof window === "undefined") return undefined;
  const cfg = (window as { __TVM_CONFIG__?: RuntimeOverrides }).__TVM_CONFIG__;
  const v = cfg?.[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
