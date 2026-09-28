/**
 * 테이블 유지보수 상태 설명 모달 (X10-f2, 인간 지시) — 표의 "n/4" 압축 표기를
 * 대체한다: 테이블 이름을 누르면 현재 상태가 **왜** 그런지 문장으로 설명한다.
 *
 * 판정은 tableRows의 단일 원천(rechunkChecks·isCleanupTarget)을 그대로 쓴다 —
 * 여기서 다시 계산하면 표의 배지와 어긋나는 날이 온다.
 */
import {
  CHUNK_ROW_CAP, STAGE_LABELS, avgChunkRows, isCleanupTarget, isRechunkTarget,
  rechunkChecks, type TableRow,
} from "./tableRows";
import { qualifiedName } from "./cleanupCommands";
import { formatBig } from "../../lib/format";

export function TableStatusModal({ row, onClose }: {
  row: TableRow;
  onClose: () => void;
}) {
  const checks = rechunkChecks(row);
  const cleanup = isCleanupTarget(row);
  const rechunk = isRechunkTarget(row);
  const avg = avgChunkRows(row);
  const n = (v: number | undefined) => (v === undefined ? "--" : formatBig(v, 1));

  /* "Cleanup 선행 필요"는 ③(NoDel_Cnt)만 실패하고 나머지 3개는 통과할 때만이다
     (codex X10F2-01) — 다른 임계도 실패한 테이블은 Cleanup을 해도 Rechunk 대상이
     되지 않으므로 그 약속을 하면 안 된다. */
  const onlyNodelFails = checks !== undefined && !checks[2].pass
    && checks.every((c, i) => i === 2 || c.pass);

  /* 결론 — 배치(매일 01:00)가 이 테이블에 무엇을 할지, 왜 못 하는지.
     결측 분기가 **최우선**이다(codex X10F2-03 회차 2): deleted 결측인데 청크
     통계가 4/4면 "Rechunk 대상"으로 새어 나갔다 — 관측이 불완전하면 결론을
     유보한다(예외: deleted만 관측된 Cleanup 대상은 아래에서 정밀 분기). */
  const verdict = row.deleted === undefined && checks === undefined ? (
    <>
      <b>판정 불가</b> — 청크 통계·삭제 레코드 관측이 없어 유지보수 대상 여부를
      결론낼 수 없습니다. exporter 수집을 확인하세요.
    </>
  ) : row.deleted === undefined ? (
    <>
      <b>판정 불가</b> — 삭제 레코드 관측이 없어 Cleanup 대상 여부를 결론낼 수
      없습니다(청크 통계 판정은 위 4임계 참조). exporter 수집을 확인하세요.
    </>
  ) : rechunk ? (
    <>
      <b>Rechunk 대상</b> — 새벽 1시 배치에서 Rechunk가 수행되고 <b>Cleanup
      Extent가 동반</b>됩니다(extent 메타데이터 정리). 말미에는 clustering key
      테이블 전체의 chunk index가 재생성됩니다(recalculate chunks indexes).
    </>
  ) : cleanup && onlyNodelFails ? (
    <>
      <b>Cleanup 선행 필요</b> — 삭제 레코드가 청크 전반에 남아 Rechunk 임계
      ③(NoDel_Cnt ≥ 2)이 닫혀 있습니다. 새벽 1시 배치의 <b>Cleanup Chunk</b>가
      잔재를 걷어내면(NoDel_Cnt 상승) 다음 판정에서 Rechunk 대상이 될 수 있습니다.
    </>
  ) : cleanup ? (
    <>
      <b>Cleanup Chunk 대상</b> — delete/update 레코드가 있어 새벽 1시 배치에서
      잔재를 회수합니다.{" "}
      {checks !== undefined
        ? "Rechunk 임계는 미충족이라 청크 재구성은 하지 않습니다."
        : "Rechunk 판정은 청크 통계 결측으로 불가합니다."}
    </>
  ) : checks === undefined ? (
    /* deleted=0 관측 + 청크 통계 결측 — Cleanup 비대상은 확정이나 Rechunk는 유보. */
    <>
      <b>판정 불가</b> — 청크 통계 관측이 없어 Rechunk 대상 여부를 결론낼 수
      없습니다(delete/update 레코드는 없음). exporter 수집을 확인하세요.
    </>
  ) : (
    <>
      <b>조치 없음</b> — delete/update 레코드가 없고 Rechunk 임계도 미충족입니다
      (건강한 상태).
    </>
  );

  return (
    <div className="sqm-modal-backdrop" role="dialog" aria-modal="true"
      aria-label={`${row.table} 유지보수 상태`}>
      <div className="sqm-modal">
        <h3>
          {qualifiedName(row)}{" "}
          <span className="sqm-dim" style={{ fontSize: 12, fontWeight: 400 }}>
            유지보수 상태
          </span>
        </h3>

        {/* 실행 중이면 지금 무엇이 어디까지 진행됐는지 먼저 말한다 (X10-f3). */}
        {row.maintStage !== undefined && (
          <div className="sqm-tstatus__running">
            ▶ 유지보수 진행 중 — <b>{STAGE_LABELS[row.maintStage] ?? row.maintStage}</b>
            {row.maintProgress !== undefined && (
              <> ({Math.round(row.maintProgress * 100)}%)</>
            )}
          </div>
        )}

        <div className="sqm-tstatus__stats sqm-dim">
          행 {n(row.rows)} · 청크 {n(row.chunks)} · 평균 청크 행{" "}
          {avg === undefined ? "--"
            : `${Math.round(avg).toLocaleString("en-US")}
               (상한 ${CHUNK_ROW_CAP.toLocaleString("en-US")}의 ${Math.round((avg / CHUNK_ROW_CAP) * 100)}%)`}
          {" "}· 단편화 {row.frag === undefined ? "--" : `${Math.round(row.frag * 100)}%`}
          {" "}· 삭제 대기 {n(row.deleted)}
        </div>

        <div className="sqm-tstatus__section">
          <b>Cleanup Chunk</b> (delete/update 레코드 존재 시):{" "}
          {cleanup ? "✓ 대상" : "— 비대상"}
          <span className="sqm-dim">
            {" "}— 삭제 대기 {row.deleted === undefined ? "관측 없음"
              : row.deleted > 0 ? `${formatBig(row.deleted, 1)}건 존재` : "없음"}
          </span>
        </div>

        <div className="sqm-tstatus__section">
          <b>Rechunk 4임계</b> (동시 충족 시 대상):
          {checks === undefined ? (
            <div className="sqm-dim">청크 통계 결측 — 판정 불가</div>
          ) : (
            <ul className="sqm-tstatus__checks">
              {checks.map((c) => (
                <li key={c.text} className={c.pass ? "" : "sqm-tstatus__fail"}>
                  {c.pass ? "✓" : "✕"} {c.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sqm-tstatus__verdict">{verdict}</div>

        <div className="sqm-modal__actions">
          <button type="button" className="sqm-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
