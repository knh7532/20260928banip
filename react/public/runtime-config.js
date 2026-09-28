/* 런타임 설정 자리표 — vite build 가 dist/ 루트로 복사한다.
 * web-serve(.ps1/.sh)가 기동 시 web/.env 값으로 이 파일을 다시 생성한다.
 * 기본은 오버라이드 없음: VITE_ 빌드 값 → 페이지 호스트 기본값 순으로 동작한다. */
window.__TVM_CONFIG__ = {};
