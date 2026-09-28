/**
 * 유지보수 수행 예정 모달 (E3, 2026-08-25 인간 지시) — "Cleanup 예정"/"Rechunk 예정"
 * 배지를 누르면 열린다: 수행 예정일자를 보여 주고, 일자를 바꾸거나 이번 수행을
 * 취소(취소면 복원)할 수 있다.
 *
 * 예정 변경·취소는 **표시 계층 상태**다 — exporter의 배치 판정(대상 여부)은 그대로
 * 두고, 화면의 일괄 실행 대상과 배지에만 반영한다(취소된 테이블은 일괄에서 빠진다).
 * 기본 예정일은 배치 규칙(매일 01:00, X10 인간 확정)의 다음 회차다.
 */
import { useState } from "react";

import type { TableRow } from "./tableRows";
import { qualifiedName, type CleanupKind } from "./cleanupCommands";
import type { MaintSchedule } from "./maintSchedule";

const KIND_LABEL: Record<string, string> = {
  CLEANUP_CHUNKS: "Cleanup Chunk",
  RECHUNK: "Rechunk",
};

export function MaintScheduleModal({ row, kind, schedule, onSave, onCancelRun, onRestore, onClose }: {
  row: TableRow;
  kind: CleanupKind;
  schedule: MaintSchedule;
  /** 예정일 변경 저장. */
  onSave: (date: string) => void;
  /** 이번 수행 취소. */
  onCancelRun: () => void;
  /** 취소 복원(다시 예정). */
  onRestore: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(schedule.date);
  const label = KIND_LABEL[kind] ?? kind;

  return (
    <div className="sqm-modal-backdrop" role="dialog" aria-modal="true"
      aria-label={`${row.table} ${label} 수행 예정`}>
      <div className="sqm-modal">
        <h3>
          {qualifiedName(row)}{" "}
          <span className="sqm-dim" style={{ fontSize: 12, fontWeight: 400 }}>
            {label} 수행 예정
          </span>
        </h3>

        {schedule.cancelled ? (
          <p>
            이번 <b>{label}</b> 수행이 <b>취소</b>되어 있습니다 — 일괄 실행 대상에서
            제외됩니다. 복원하면 아래 예정 일시로 되돌아갑니다.
          </p>
        ) : schedule.requested ? (
          <p>
            이 테이블에 <b>{label}</b> 수행이 예약되어 있습니다(사용자 요청).
          </p>
        ) : (
          <p>
            이 테이블은 <b>{label}</b> 대상이며 아래 일시에 수행될 예정입니다.
          </p>
        )}

        <div className="sqm-sched__row">
          <label htmlFor="maint-sched-date"><b>수행 예정일자</b></label>
          <input
            id="maint-sched-date" type="datetime-local" value={date}
            disabled={schedule.cancelled}
            onChange={(e) => setDate(e.target.value)}
            /* 직접 입력 외에 클릭만으로 달력이 열리게(E3-f1, 인간 지시) —
               showPicker는 사용자 제스처에서만 허용되므로 onClick이 맞다. */
            onClick={(e) => {
              try { e.currentTarget.showPicker?.(); } catch { /* 미지원 브라우저 */ }
            }}
          />
        </div>

        <div className="sqm-modal__actions">
          {schedule.cancelled ? (
            <button type="button" className="sqm-btn" onClick={onRestore}>예정 복원</button>
          ) : (
            <>
              <button type="button" className="sqm-btn"
                disabled={!date || date === schedule.date}
                onClick={() => onSave(date)}>
                예정일 변경
              </button>
              <button type="button" className="sqm-btn sqm-btn--orange" onClick={onCancelRun}>
                수행 취소
              </button>
            </>
          )}
          <button type="button" className="sqm-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
