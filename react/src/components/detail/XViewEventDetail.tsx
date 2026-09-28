import { QUERY_TYPE_LABEL } from "../../api/queries";
import { queryTypeColor } from "../../lib/colors";
import { failureStageOf } from "../../lib/failureStages";
import { displayNode, formatClock, workerName } from "../../lib/format";
import { typeOfQuery, type XViewEvent } from "../../lib/xview";
import { PhaseBar } from "./PhaseBar";
import { phaseTotal } from "./phaseMeta";

/**
 * X-View 이벤트 상세 (X5-b에서 툴팁 본문을 추출 — 호버/고정 툴팁과 구간 목록
 * 모달이 **같은 컴포넌트**를 쓴다, 표기 단일화):
 * 생애주기 누적 막대(100%) → 단계별 소요 → Completed 시각/상태 → Node → 워커 →
 * Statement → 사용자 → (실패 시) 유형·발생 시점. 실패는 매핑 단계를 강조한다.
 */
export function XViewEventDetail({ ev }: { ev: XViewEvent }) {
  const fail = ev.status === "failed" ? failureStageOf(ev.reason) : null;
  const total = ev.phases ? phaseTotal(ev.phases) : ev.durationSec;
  return (
    <>
      <div className="xview__tip-title">
        <span
          className="xview__tip-swatch"
          style={{ background: queryTypeColor(typeOfQuery(ev.queryName)) }}
        />
        {ev.queryName}
        <span className="xview__tip-type">
          {QUERY_TYPE_LABEL[typeOfQuery(ev.queryName)] ?? "기타"}
        </span>
      </div>
      {ev.phases ? (
        <PhaseBar phases={ev.phases} failPhaseKey={fail?.phaseKey ?? null} />
      ) : (
        <div className="xview__tip-nophase">단계 정보 없음 (수집 전 이벤트)</div>
      )}
      <div className="xview__tip-completed">
        Completed {formatClock(ev.endMs / 1000)} · 총 {total.toFixed(1)}s ·{" "}
        {ev.status === "failed" ? (
          <span className="xview__tip-fail">실패</span>
        ) : (
          <span className="xview__tip-ok">성공</span>
        )}
      </div>
      <dl className="xview__tip-rows">
        <dt>Node(서버)</dt>
        <dd>{displayNode(ev.node)}</dd>
        <dt>워커</dt>
        <dd>{workerName(ev.node, ev.gpu, ev.mig)}</dd>
        <dt>Statement</dt>
        <dd>{ev.stmtId} · {ev.queryId}</dd>
        <dt>사용자</dt>
        <dd>{ev.user}</dd>
      </dl>
      {fail && (
        <div className="xview__tip-failinfo">
          <span className="xview__tip-fail">
            실패: {fail.typeLabel} — {fail.stage}
            {fail.phaseKey ? " 단계" : ""}
          </span>
          <br />
          {ev.reason} ({fail.friendly})
        </div>
      )}
    </>
  );
}
