/**
 * 실패 유형 ↔ 발생 시점 매핑 (X3 — SQream 가이드, db-schema.md §2b와 대사).
 *
 * 가이드 8유형 전체를 수록하되, 목업 시뮬레이터는 실행 단계 실패만 만들므로
 * 화면에서 실제로 조회되는 것은 기존 reason 5종 행뿐이다. 사전 단계 유형
 * (syntax/compile/init)은 실데이터 연동 시를 위한 참조 항목이다.
 */
import type { XViewPhases } from "./xview";

export interface FailureStageInfo {
  /** 발생 시점 표기 (가이드) */
  stage: string;
  /** 강조할 생애주기 막대 세그먼트 — 특정 단계로 못 박기 어려우면 null */
  phaseKey: keyof XViewPhases | null;
  /** 실패 유형 (가이드 표기) */
  typeLabel: string;
  /** 쉽게 말하면 */
  friendly: string;
}

export const FAILURE_STAGES: Record<string, FailureStageInfo> = {
  // ── 목업이 실제로 생성하는 reason 5종 ──────────────────────────────────
  lock_timeout: {
    stage: "Executing", phaseKey: "executingSec",
    typeLabel: "Execution Error", friendly: "실행하다 실패",
  },
  out_of_memory: {
    stage: "Executing", phaseKey: "executingSec",
    typeLabel: "Resource Error", friendly: "자원이 부족함",
  },
  spool_limit: {
    stage: "Executing", phaseKey: "executingSec",
    typeLabel: "I/O / Storage Error", friendly: "데이터를 못 읽거나 씀",
  },
  connection_lost: {
    stage: "실행 전후", phaseKey: null,
    typeLabel: "Connection Error", friendly: "연결이 끊김",
  },
  killed_by_admin: {
    stage: "Executing", phaseKey: "executingSec",
    typeLabel: "Stopped / Cancelled", friendly: "실패가 아니라 의도적 중단",
  },
  // ── 가이드 참조 항목 (목업 미생성 — 실데이터 연동 대비) ─────────────────
  syntax_error: {
    stage: "Compile", phaseKey: "compileSec",
    typeLabel: "Syntax / Parsing Error", friendly: "SQL 자체가 틀림",
  },
  compile_error: {
    stage: "Compile", phaseKey: "compileSec",
    typeLabel: "Compilation Error", friendly: "실행계획을 못 만듦",
  },
  init_error: {
    stage: "Initializing", phaseKey: "initializingSec",
    typeLabel: "Initialization Error", friendly: "실행 준비 실패",
  },
  execution_error: {
    stage: "Executing", phaseKey: "executingSec",
    typeLabel: "Execution Error", friendly: "실행하다 실패",
  },
};

/** reason 코드 → 매핑. 모르는 코드는 실행 단계 실패로 취급한다(보수적 기본값). */
export function failureStageOf(reason: string): FailureStageInfo {
  return (
    FAILURE_STAGES[reason] ?? {
      stage: "Executing", phaseKey: "executingSec",
      typeLabel: "Execution Error", friendly: "실행하다 실패",
    }
  );
}
