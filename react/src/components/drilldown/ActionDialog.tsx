/**
 * 상태를 바꾸는 작업의 공용 다이얼로그 (2026-08-10).
 *
 * 이 프로젝트의 목업은 **상태를 바꾸지 않는다**(ADR-0004). 대신 무엇을 하려 했는지·왜
 * 하려 했는지를 받아 감사 기록 문구를 낸다. Kill·Restart·Rechunk·Cleanup이 전부 같은
 * 규약을 따라야 하므로 여기 하나로 모은다 — 화면마다 다시 쓰면 "사유 없이도 눌리는"
 * 버튼이 하나쯤 생긴다.
 * (예외: Statement Kill(X6)·Worker Restart(X9-f3/f4)·Table Cleanup/Rechunk
 * (X10-f2)·Shutdown/Remove Lock(X11) — 인간 승인된 경로는 exporter **합성
 * 데이터에는** 반영된다. 실제 SQream에는 여전히 아무것도 하지 않는다.
 * 구 `mockNote`(제목 옆 "목업 — …" 괄호)는 X12에서 철거했다 — 메타 멘트를
 * 화면에 노출하지 않는다(인간 지시 2026-08-19). 이 사실은 문서가 담는다.)
 *
 * 다이얼로그가 반드시 보여 주는 것:
 *  1. **대상과 건수** — 무엇에 손대는지 모르고 누르면 안 된다.
 *  2. **사유 필수** — 비면 실행 버튼이 비활성이다.
 *  3. **업무시간 경고** — 회의록 §5.1과 QID 문서 §2.2가 둘 다 "새벽 권장"을 말한다.
 *     막지는 않는다. 판단은 사람이 한다.
 *  4. **생성될 명령문** — 회의록 §5.1의 "실행 명령어까지 자동 생성"이 이 화면의
 *     실제 산출물이다. 복사할 수 있어야 쓸모가 있다.
 */
import { useState, type ReactNode } from "react";

import { isBusinessHours } from "../../lib/businessHours";
import { copyText } from "../../lib/copyText";

export interface ActionDialogProps {
  title: string;
  /** 대상 설명 — "18개 테이블", "sqream231" 등. 건수를 반드시 포함한다. */
  target: string;
  /** 왜 위험한지 한 줄. 무엇이 일어나는지 모르고 누르지 않게. */
  warning: ReactNode;
  /** 생성될 명령문. 있으면 복사 버튼이 붙는다. */
  command?: string;
  /** 추가 경고(예: "열린 스냅샷 3건 — 회수가 막힐 수 있습니다"). */
  extraWarning?: ReactNode;
  /** 실행 버튼 문구. */
  confirmLabel: string;
  onCancel: () => void;
  /** 사유를 받아 처리한다. 기본 작업은 감사 기록 문구까지만이고, 승인된 예외
      (Kill X6 · Restart X9-f3/f4 · Table Cleanup/Rechunk X10-f2)의 콜백은
      exporter 합성 상태를 변경할 수 있다. */
  onConfirm: (reason: string) => void;
  /** 복사 결과를 사용자에게 알린다 — 조용히 실패하면 붙여넣기 할 때까지 모른다. */
  onCopyResult?: (ok: boolean) => void;
}

export function ActionDialog({
  title, target, warning, command, extraWarning, confirmLabel,
  onCancel, onConfirm, onCopyResult,
}: ActionDialogProps) {
  const [reason, setReason] = useState("");
  const busy = isBusinessHours();

  return (
    <div className="sqm-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sqm-modal${command ? " sqm-modal--wide" : ""}`}>
        <h3>
          ⚠ {title} <span style={{ color: "var(--accent)" }}>{target}</span>
        </h3>

        <p>{warning}</p>

        {busy && (
          /* 새벽 권장의 근거(회의록 §5.1·SQream 가이드)는 주석이 담는다 — X12. */
          <p className="sqm-warn" role="alert">
            🕘 지금은 업무시간(09~18시)입니다. 이 작업은 디스크 I/O가 크고 오래 걸려
            <b> 전체 성능이 떨어질 수 있습니다</b> — 새벽 수행을 권장합니다.
          </p>
        )}
        {extraWarning && <p className="sqm-warn" role="alert">{extraWarning}</p>}

        {command && (
          <>
            <div className="sqm-cmd__head">
              <span className="sqm-dim">생성될 명령문</span>
              <button
                type="button" className="sqm-btn"
                onClick={() => { void copyText(command).then((ok) => onCopyResult?.(ok)); }}
              >
                복사
              </button>
            </div>
            <pre className="sqm-plan">{command}</pre>
          </>
        )}

        <textarea
          aria-label="수행 사유"
          placeholder="수행 사유 (필수) — 예: 단편화 62% 누적, 운영 승인 티켓 #1234"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="sqm-modal__actions">
          <button type="button" className="sqm-btn" onClick={onCancel}>취소</button>
          <button
            type="button" className="sqm-btn sqm-btn--red"
            disabled={reason.trim().length === 0}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
