import type { XViewPhases } from "../../lib/xview";
import { PHASE_META, phaseTotal } from "./phaseMeta";

/**
 * 생애주기 누적 막대(100%) + 단계별 소요 범례 (X3에서 도입, X6-f1에서 추출).
 *
 * X-View 툴팁·구간 목록 모달(`XViewEventDetail`)과 Query 상세 팝업 로그 탭이
 * **같은 컴포넌트**를 쓴다 — 화면마다 다시 그리면 색·순서·반올림이 어긋난다.
 * DOM·클래스는 추출 전(`xview__tip-*`)과 동일하다(기존 X-View 테스트가 잠근다).
 */
export function PhaseBar({ phases, failPhaseKey = null }: {
  phases: XViewPhases;
  /** 실패가 매핑된 단계 — 해당 세그먼트·범례 행을 강조한다. 실행 중이면 null. */
  failPhaseKey?: keyof XViewPhases | null;
}) {
  const total = phaseTotal(phases);
  return (
    <>
      <div className="xview__tip-bar" aria-label="생애주기 단계 비중(100%)">
        {PHASE_META.map((m) => {
          const sec = phases[m.key];
          const pct = total > 0 ? (sec / total) * 100 : 0;
          const failHere = failPhaseKey === m.key;
          return (
            <span
              key={m.key}
              className={`xview__tip-seg${failHere ? " xview__tip-seg--fail" : ""}`}
              data-phase={m.key}
              style={{ width: `${pct}%`, background: m.color }}
            />
          );
        })}
      </div>
      <dl className="xview__tip-phases">
        {PHASE_META.map((m) => {
          const failHere = failPhaseKey === m.key;
          return (
            <div
              key={m.key}
              className={`xview__tip-phase-row${failHere ? " xview__tip-phase-row--fail" : ""}`}
            >
              <dt>
                <span className="xview__tip-swatch" style={{ background: m.color }} />
                {m.label}
                {failHere && " ✕"}
              </dt>
              <dd>{phases[m.key].toFixed(1)} s</dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}
