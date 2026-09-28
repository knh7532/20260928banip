/**
 * 생애주기 4단계 메타 — `PhaseBar`와 분리한 이유는 react-refresh 규칙이다:
 * 컴포넌트 파일이 상수·함수를 함께 내보내면 fast refresh가 꺼진다(`agentUrl.ts`,
 * `toolbarModel.ts`와 같은 이유).
 */
import type { XViewPhases } from "../../lib/xview";

/** 생애주기 막대 4단계 — 색은 기존 hex 재사용(신규 토큰 없음), 순서는 인간 지시. */
export const PHASE_META: Array<{ key: keyof XViewPhases; label: string; color: string }> = [
  { key: "compileSec", label: "Compile", color: "#6b7280" },
  { key: "queuedSec", label: "In Queue", color: "#f5a623" },
  { key: "initializingSec", label: "Initializing", color: "#22d3ee" },
  { key: "executingSec", label: "Executing", color: "#4ade80" },
];

export function phaseTotal(p: XViewPhases): number {
  return p.compileSec + p.queuedSec + p.initializingSec + p.executingSec;
}
