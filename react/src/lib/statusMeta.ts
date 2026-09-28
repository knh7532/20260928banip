/**
 * X16: 문장 상태(Status) 축 — 누적 그래프 축(PHASE_META, v4.7 Compile 어휘)과
 * **별개의 축**이다. PHASE_META는 단계별 소요 분해(PhaseBar·X-View 툴팁)의 어휘이고,
 * 여기는 카드·표의 "현재 상태" 표기 어휘다. 같은 compileSec 단계가 그래프에서는
 * Compile, 상태 표시에서는 Preparing으로 읽힌다 — X8 ③(Preparing 불채택)의 부분
 * 변경으로, 누적 그래프 축은 그대로 두고 상태 축에서만 채택한다(인간 지시,
 * docs/plan.md X16).
 *
 * 배열 순서 = 카드 배치 순서이자 표 Status 정렬 서수다 (In Queue가 Preparing보다 앞).
 */
import type { XViewEvent, XViewPhases } from "./xview";

export interface StatusInfo {
  key: keyof XViewPhases;
  label: string;
  /** 기존 배지 클래스 재사용 — 클래스명은 내부 식별자라 화면 표기와 무관(state--compile 유지). */
  badgeClass: string;
  /** Pill 톤 — Initializing의 시안색 Pill이 없어 blue로 근사(신규 색 토큰 금지, X7-a). */
  tone: "grey" | "orange" | "blue" | "green";
}

export const STATUS_META: readonly StatusInfo[] = [
  { key: "queuedSec", label: "In Queue", badgeClass: "state--queue", tone: "orange" },
  { key: "compileSec", label: "Preparing", badgeClass: "state--compile", tone: "grey" },
  { key: "initializingSec", label: "Initializing", badgeClass: "state--init", tone: "blue" },
  { key: "executingSec", label: "Executing", badgeClass: "state--run", tone: "green" },
];

export function statusOf(phase: keyof XViewPhases): StatusInfo {
  return STATUS_META.find((s) => s.key === phase)!;
}

/** 표 Status 정렬 서수(0..3) — 라벨 문자열 정렬이면 알파벳 순이 되는 문제 회피 (X7-a). */
export function statusOrdinal(phase: keyof XViewPhases): number {
  return STATUS_META.findIndex((s) => s.key === phase);
}

/**
 * Stopped = 의도적 중단만 — failureStages의 typeLabel "Stopped / Cancelled"인 reason
 * 집합과 일치해야 한다(테스트로 대사). 결정론 실패로 섞여 오는 killed_by_admin도
 * 의미상 중단이므로 함께 센다.
 */
export const STOPPED_REASONS: ReadonlySet<string> = new Set(["killed_by_admin"]);

/**
 * X16-01(codex): Stopped 집계 준비 판정 — 마지막 성공이 조건(필터·범위) 변경 시각보다
 * **뒤(strict >)** 여야 한다. 경계(같은 밀리초)를 포함하면 변경 직전 이전 세대의 성공이
 * fresh로 오인돼 이전 조건의 집계가 새 창에 표시된다. strict라서 같은 밀리초의 진짜
 * 새 성공은 한 주기 늦게 반영되지만 그쪽이 안전한 방향이다(다음 폴링에 자연 회복).
 */
export function stoppedCountReady(lastSuccessAt: number | null, freshSince: number): boolean {
  return lastSuccessAt !== null && lastSuccessAt > freshSince;
}

/** 표시 구간 내 중단(Stopped) 문장 수 — X-View 완료 이벤트에서 파생(신규 폴링 없음). */
export function countStopped(events: readonly XViewEvent[], sinceMs: number): number {
  let n = 0;
  for (const e of events) {
    if (e.endMs >= sinceMs && STOPPED_REASONS.has(e.reason)) n += 1;
  }
  return n;
}
