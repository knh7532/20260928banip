import { formatClock } from "../../lib/format";
import { Panel } from "../Panel";

/**
 * "시간 구간" 소패널 (R7 — Grafana판 미러).
 * Grafana판은 시간 구간을 상세 stat 위의 독립 text 패널로 둔다 — 동일 구조로 분리.
 * L3: 두 화면이 공용하므로 구조 타입(startMs/endMs)만 요구한다.
 */
export function TimeRangePanel({
  detail,
  hasSelection,
}: {
  detail: { startMs: number; endMs: number } | null;
  hasSelection: boolean;
}) {
  return (
    <Panel title="시간 구간" className="panel--timerange">
      <div className="timerange">
        {detail === null ? (
          <span className="timerange__value">-</span>
        ) : (
          <span className="timerange__value">
            {formatClock(detail.startMs / 1000)} ~ {formatClock(detail.endMs / 1000)}
            {!hasSelection && <span className="detail__badge">전체</span>}
          </span>
        )}
      </div>
    </Panel>
  );
}
