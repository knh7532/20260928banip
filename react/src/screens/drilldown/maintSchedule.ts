/**
 * 유지보수 수행 예정 상태 (E3) — 모달과 화면이 공유하는 순수 헬퍼.
 * 예정 변경·취소는 표시 계층 상태다(배치 판정·exporter 불변).
 */
export interface MaintSchedule {
  /** datetime-local 형식(YYYY-MM-DDTHH:mm)의 수행 예정 일시. */
  date: string;
  /** 이번 수행 취소 여부 — 취소면 일괄 실행 대상에서 빠진다. */
  cancelled: boolean;
  /** 사용자 요청으로 등록된 예약(E3-f1) — 배치 판정과 무관하게 배지를 띄우고,
      취소하면 항목째 사라진다(판정 기반 취소의 "취소됨" 표시와 구분). */
  requested?: boolean;
}

/** 다음 배치 회차(다가오는 01:00, X10 인간 확정)를 datetime-local 값으로. */
export function nextBatchLocal(now = new Date()): string {
  const d = new Date(now);
  d.setHours(1, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local 값 → 화면 표기 (예: 2026-08-26 01:00). */
export function scheduleText(local: string): string {
  return local.replace("T", " ");
}
