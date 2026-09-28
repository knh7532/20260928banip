/**
 * 업무시간 판정 — 정리 작업 다이얼로그의 경고 기준 (2026-08-10).
 *
 * 회의록 §5.1과 QID 규칙 §2.2가 둘 다 Rechunk/Cleanup의 **새벽 수행**을 권한다.
 * 화면은 막지 않고 경고만 한다 — 판단은 사람이 한다.
 *
 * 컴포넌트 파일이 아니라 여기 두는 이유는 순수 함수라 시각을 주입해 검증할 수 있고,
 * 컴포넌트 파일이 컴포넌트 아닌 것을 export하면 Fast Refresh가 깨지기 때문이다.
 */

/** 09시 이상 18시 미만. 로컬 시간 기준 — 현장 운영자의 시계가 기준이다. */
export function isBusinessHours(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= 9 && h < 18;
}
