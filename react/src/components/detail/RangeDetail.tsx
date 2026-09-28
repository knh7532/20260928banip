import type { RangeDetailData } from "../../hooks/useRangeDetail";
import { formatGB, formatInt, formatRowsPerSec, formatSeconds } from "../../lib/format";
import { Panel } from "../Panel";

/**
 * 선택 구간 상세 — 7항목(활성 MIG·쿼리ID·DB·행수/초·P95·쿼리수·메모리) + × 닫기.
 * 시간 구간은 R7에서 독립 소패널(TimeRangePanel)로 분리(Grafana판 구조).
 */
export function RangeDetail({
  detail,
  hasSelection,
  disconnected = false,
  migTotal,
  onClose,
}: {
  detail: RangeDetailData | null;
  hasSelection: boolean;
  /** 연결 끊김(공란) 상태 — 로딩 문구 대신 끊김 안내 (R7 C-4). */
  disconnected?: boolean;
  /** 활성 MIG의 분모(필터 기준 슬롯 수 — All이면 24). 결측(NaN)이면 "-" (R9 F8.2). */
  migTotal?: number;
  /** × 클릭 → 브러시 선택 해제 (PPTX 상세 패널의 × 재현). */
  onClose: () => void;
}) {
  return (
    <Panel
      title="선택 구간 상세 정보"
      hint="타임라인에서 가로로 드래그해 구간을 선택하면 그 구간의 집계가 표시됩니다. 선택이 없으면 전체 시간 범위 기준입니다."
      className="panel--detail"
      actions={
        <button
          type="button"
          className="panel__close"
          aria-label="선택 구간 해제"
          disabled={!hasSelection}
          onClick={onClose}
        >
          ×
        </button>
      }
    >
      {detail === null ? (
        <div className="detail__empty">
          {disconnected ? "연결 끊김 — 데이터 없음" : "데이터를 불러오는 중…"}
        </div>
      ) : (
        <>
          {/* R9(F6.1): 브러시 발견성 — "전체" 상태에서 구간 선택 방법을 인라인으로 안내 */}
          {!hasSelection && (
            <div className="detail__scope-hint">
              전체 범위 기준 — 타임라인을 가로로 드래그하면 구간을 선택할 수 있습니다
            </div>
          )}
          <dl className="detail">
            {/* R9(F8.2): 분모 없는 "12개"는 판단 불가 — "12 / 24"로 */}
            <Item label="활성 MIG">
              {detail.gpuCount}
              {" / "}
              {migTotal !== undefined && Number.isFinite(migTotal) ? formatInt(migTotal) : "-"}
            </Item>
            <Item label="쿼리 ID">{detail.queryIdCount}개</Item>
            <Item label="데이터베이스">{detail.databases.length ? detail.databases.join(", ") : "-"}</Item>
            <Item label="처리행수/초">{formatRowsPerSec(detail.rowsPerSecond)}</Item>
            <Item label="응답시간 (P95)">{formatSeconds(detail.p95Seconds)}</Item>
            {/* R9(F8.3): 어떤 수인지 명시 — Grafana판 표기와 통일 */}
            <Item label="쿼리 수(구간 완료)">{formatInt(detail.queryCount)}</Item>
            <Item label="사용 메모리">{formatGB(detail.memoryBytes)}</Item>
          </dl>
        </>
      )}
    </Panel>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail__row">
      <dt className="detail__key">{label}</dt>
      <dd className="detail__val">{children}</dd>
    </div>
  );
}
