import type { LlmRangeDetailData } from "../../hooks/useLlmRangeDetail";
import { formatGB, formatInt, formatSeconds, formatTps } from "../../lib/format";
import { Panel } from "../Panel";

/**
 * LLM 선택 구간 상세 — 시안 8항목 중 7행(활성 GPU·프로세스명·모델·TPS·P95·요청 수·
 * 메모리) + × 닫기. 시간 구간은 TimeRangePanel(공용)이 담당한다.
 */
export function LlmRangeDetail({
  detail,
  hasSelection,
  disconnected = false,
  gpuTotal,
  onClose,
}: {
  detail: LlmRangeDetailData | null;
  hasSelection: boolean;
  /** 연결 끊김(공란) 상태 — 로딩 문구 대신 끊김 안내. */
  disconnected?: boolean;
  /** 활성 GPU의 분모 (필터 기준 GPU 수 — All이면 12). 결측(NaN)이면 "-". */
  gpuTotal?: number;
  /** × 클릭 → 브러시 선택 해제. */
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
          {!hasSelection && (
            <div className="detail__scope-hint">
              전체 범위 기준 — 타임라인을 가로로 드래그하면 구간을 선택할 수 있습니다
            </div>
          )}
          <dl className="detail">
            <Item label="활성 GPU">
              {detail.gpuCount}
              {" / "}
              {gpuTotal !== undefined && Number.isFinite(gpuTotal) ? formatInt(gpuTotal) : "-"}
            </Item>
            <Item label="프로세스명">
              {detail.procNames.length ? detail.procNames.join(", ") : "-"}
            </Item>
            <Item label="모델">{detail.models.length ? detail.models.join(", ") : "-"}</Item>
            <Item label="토큰/초 (TPS)">{formatTps(detail.tps)}</Item>
            <Item label="지연시간 (P95)">{formatSeconds(detail.p95Seconds)}</Item>
            <Item label="요청 수(구간 완료)">{formatInt(detail.requestCount)}</Item>
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
