/**
 * Worker Recovery 다이얼로그 (X11 → X14 → X14-f1 → X15, 인간 지시 2026-08-20).
 *
 * X14의 "정지 → 관찰 → 격상" 사다리는 X14-f1이 폐기했고(조치 = 운영자 판단),
 * X15(인간 현장 확인)가 실체를 확정했다: 현장은 **자동 기동 스크립트**가 상시
 * 실행 중이라 조치는 해당 워커 서버에서의 프로세스 kill 하나다 — 재기동은
 * 스크립트 몫이고, 목업의 자연 복구·restart API가 그 재현이다. 유형별 구성:
 *
 *  - **crash**(WorkerDown): 자동 기동 스크립트가 재기동한다(자연 복구 1~3분이
 *    그 재현) — 복구되지 않을 때의 수동 트리거로 [Recovery]를 유지한다. 실행
 *    중이던 쿼리는 connection_lost로 실패(재실행 필요), 쓰기 쿼리의 락은
 *    orphan으로 남아 REMOVE_LOCK 정리가 필요하다.
 *  - **hang**(WorkerUnresponsive, 화면 표기 "No response"): 조치 2종 병렬 —
 *    문장 정지(STOP_STATEMENT)·재기동(Recovery = 워커 서버에서 프로세스 kill,
 *    확인 다이얼로그가 kill 파이프라인 명령과 결과(문장 강제 종료)를 안내).
 *    구 "정상 종료(Graceful Shutdown)" 옵션은 X15에서 폐기 — 자동 기동
 *    스크립트 모델에서 의도적 정지가 성립하지 않는다(exporter shutdown API는
 *    존치, UI 미노출). 잠금은 사실 게이트만: CLE 실행 중은 전 조치 차단.
 *  - **stopped**(알람 부재): 방어 분기 — UI 경로는 사라졌지만 외부에서
 *    shutdown API를 부른 경우를 위해 [Recovery]만 남긴다.
 *
 * 상태는 저장하지 않는다 — 부모가 매 폴링 최신 스냅숏에서 info를 재파생한다
 * (X10F3-01 교훈). 진입 버튼·확정 어휘는 "Recovery"(인간 확정 X14 ⑤).
 */
import { useState, type ReactNode } from "react";

import { ExporterCmdError, killStatement } from "../../api/exporterCmd";
import { ActionDialog } from "../../components/drilldown/ActionDialog";
import { BarCell } from "../../components/drilldown/primitives";
import { qidHoldsLock } from "../../components/drilldown/qidSeries";
import {
  CRASH_RESTART_WARNING, RESTART_WARNING, requestRestart,
} from "./restartAction";

export interface RestartGuideQuery {
  id: string;
  qid: string;
  /** Kill 세대 토큰(X6-R1) — 결측(NaN)이면 정지 버튼이 비활성된다(fail-closed). */
  startEpoch: number;
  /** 진행도 0~1 — CLE 완료 대기 패널의 진행 막대. */
  prog?: number;
}

export interface RestartGuideInfo {
  worker: string;
  /** 워커가 속한 노드 — kill 명령의 실행 위치 표기(X15, 인간 현장 확인). */
  node: string;
  /** 이 워커에서 실행 중인 문장 — hang이면 정지 조치의 대상이다. */
  query?: RestartGuideQuery;
  /** 장애 유형(X14) — 알람 이름에서 파생: WorkerDown=crash /
      WorkerUnresponsive=hang / 부재=stopped. */
  kind: "crash" | "hang" | "stopped";
  /** 클러스터의 orphaned lock 수(실행 문장에 조인되지 않는 락) — 경고 배너. */
  orphanLocks: number;
}

const KIND_STATE: Record<RestartGuideInfo["kind"], string> = {
  crash: "Down (프로세스 다운·연결 끊김)",
  hang: "No response (프로세스 생존·응답 없음)",
  stopped: "Stopped (정지 완료 — 재기동 대기)",
};

export function RestartGuideDialog({ info, onClose, onKilled, showToast }: {
  info: RestartGuideInfo;
  onClose: () => void;
  /** 정지 접수 시 — 부모가 낙관적 제거 + TTL 억제를 한다(X6 규약). */
  onKilled: (id: string) => void;
  showToast: (message: ReactNode, ms?: number) => void;
}) {
  /** 열려 있는 하위 확인 다이얼로그 — 조치당 하나. */
  const [action, setAction] = useState<"stop" | "restart" | null>(null);
  /** 정지 POST 진행 중 — 연타 방지(X6 busy 규약). */
  const [busy, setBusy] = useState(false);

  const q = info.query;
  const cle = q !== undefined && q.qid.startsWith("CLE");
  /* 경고 수위는 계열이 아니라 **락 보유 여부**로 가른다(codex X11-02) — EXP는
     ingest 계열이지만 락이 없어(exporter LOCK_CODES 제외) 롤백 경고가 거짓이 된다. */
  const holdsLock = q !== undefined && qidHoldsLock(q.qid);

  /* 토큰 결측이면 정지를 열 수 없다(X6-R4 fail-closed) — exporter도 400으로 거부. */
  const stopTokenMissing = q !== undefined && !Number.isFinite(q.startEpoch);
  /* hang 재기동의 실행 전 안내(X14-f1 인간 지시 "실행하기 전에 안내를 해주고
     실행해") — 권고가 아니라 **결과**를 사실대로 말한다. X15(인간 현장 확인):
     실체는 해당 워커 서버에서의 프로세스 kill이고 재기동은 자동 기동 스크립트
     몫이다 — 아래 명령이 확인 다이얼로그의 미리보기로 실린다. 현장 원문에서
     두 곳을 정정했다(awk "kill " 공백 = 인간 확정, grep `-w` = codex X15-01:
     부분 일치로 다른 워커의 sqreamd까지 kill되는 것을 단어 경계로 차단.
     워커명은 exporter 채번 고정 집합이라 grep 메타문자 유입은 없다). */
  const hangKillCommand =
    `pgrep -a sqreamd | grep -w ${info.worker} | awk '{print "kill " $1}' | sh`;
  const hangRestartWarning: ReactNode = (
    <>
      응답 없는(Internal Error 등) 워커 프로세스를 kill합니다 — 해당 워커
      서버(<b>{info.node}</b>)에서 실행되며, <b>자동 기동 스크립트가 곧
      재기동</b>합니다.{" "}
      {q !== undefined && (
        <>
          실행 중인 <b>Statement {q.id}</b>는 <b>connection_lost로 강제 종료</b>되며{" "}
          {holdsLock
            ? "트랜잭션이 롤백되어 배치 재실행이 필요합니다"
            : "재실행이 필요합니다"}.{" "}
        </>
      )}
      ADMIN 전용 명령입니다.
    </>
  );
  /* crash 직후 1-tick 창 — 실패 처리(connection_lost)가 아직 반영되기 전이면
     재기동을 잠근다(서버 statement_running 409와 정합, 다음 폴링에 풀린다). */
  const crashSettling = info.kind === "crash" && q !== undefined;

  const doStop = async (reason: string) => {
    if (q === undefined || busy) return;
    setBusy(true);
    try {
      await killStatement(q.id, reason, q.startEpoch);
      showToast(
        <>
          ✅ <b>Statement {q.id}</b> 정지(STOP_STATEMENT) 접수 — 다음 갱신에
          반영됩니다<br />사유: {reason}
        </>, 8000);
      onKilled(q.id);
    } catch (e) {
      if (e instanceof ExporterCmdError && e.status === 404) {
        showToast(<>ℹ <b>Statement {q.id}</b>는 이미 종료된 statement입니다 — 목록을 갱신합니다.</>);
        onKilled(q.id);
      } else if (e instanceof ExporterCmdError && e.status === 409) {
        // UI 게이트를 지나쳐도 서버가 막는다(CLE 등) — 사유를 그대로 보인다.
        showToast(<>⚠ 정지 거부 — <code>{e.detail ?? e.message}</code></>, 8000);
      } else {
        showToast(<>⚠ 정지 요청 실패 — exporter(:9090)에 연결할 수 없습니다.</>);
      }
    } finally {
      setBusy(false);
      setAction(null);
    }
  };

  return (
    <>
      <div className="sqm-modal-backdrop" role="dialog" aria-modal="true"
        aria-label={`Recovery ${info.worker}`}>
        <div className="sqm-modal sqm-rguide">
          <h3>
            🔧 Worker Recovery{" "}
            <span style={{ color: "var(--accent)" }}>{info.worker}</span>
          </h3>
          <p className="sqm-dim">
            현재 상태: <b>{KIND_STATE[info.kind]}</b>
          </p>

          {info.orphanLocks > 0 && (
            <p className="sqm-warn" role="alert">
              🔒 실행 중 문장에 조인되지 않는 <b>잔존(orphan) 락 {info.orphanLocks}건</b>이
              있습니다 — 죽은 워커가 남긴 락은 재기동으로 풀리지 않습니다.{" "}
              <b>Snapshot &amp; Lock</b> 화면에서 REMOVE_LOCK으로 해제하세요.
            </p>
          )}

          {info.kind === "crash" && (
            /* crash — 자동 기동 서사(X15): 프로세스가 죽으면 스크립트가 되살린다.
               버튼은 스크립트가 못 살릴 때의 수동 트리거다. */
            <div className="sqm-rguide__single">
              <p>
                워커 프로세스가 다운됐습니다. 실행 중이던 쿼리는{" "}
                <b>connection_lost로 실패 처리</b>되어 재실행이 필요합니다.{" "}
                <b>자동 기동 스크립트가 재기동합니다(보통 1~3분)</b> — 복구되지
                않으면 Recovery로 수동 재기동하세요.
              </p>
              <button type="button" className="sqm-btn sqm-btn--tiny"
                disabled={crashSettling}
                title={crashSettling
                  ? "실패 처리 반영 중입니다 — 잠시 후 다시 시도하세요." : undefined}
                onClick={() => setAction("restart")}>
                Recovery
              </button>
            </div>
          )}

          {info.kind === "stopped" && (
            <div className="sqm-rguide__single">
              <p>정상 종료가 완료됐습니다(알람 해제) — 재기동만 남았습니다.</p>
              <button type="button" className="sqm-btn sqm-btn--tiny"
                onClick={() => setAction("restart")}>
                Recovery
              </button>
            </div>
          )}

          {info.kind === "hang" && (
            /* hang — 조치 2종 병렬(X14-f1 운영자 판단 → X15 kill 모델: 구
               "정상 종료" 옵션 폐기). 잠금은 사실 게이트만: CLE 실행 중은
               전 조치 차단(서버 cle_running 409와 일치). */
            <ol className="sqm-rguide__steps">
              {q !== undefined && (
                <li className={`sqm-rguide__step is-${cle ? "blocked" : "todo"}`}>
                  <span className="sqm-rguide__icon" aria-hidden="true">
                    {cle ? "⛔" : "▶"}
                  </span>
                  <div className="sqm-rguide__body">
                    <b>실행 중 statement 정지</b>
                    {cle ? (
                      /* CLE 차단 근거: SQream Deleting Data 가이드 "Avoid
                         interrupting or killing CLEANUP_EXTENTS operations that
                         are in progress." — X14-f1 개방에서도 CLE만은 유지(인간
                         재확인). 인용 원문은 화면에 싣지 않는다(X12). */
                      <div className="sqm-rguide__cle" role="alert">
                        <div>
                          <b>Statement {q.id}</b> ({q.qid}) — cleanup류는 <b>중단 금지</b>,
                          완료를 기다리세요.
                        </div>
                        {q.prog !== undefined && Number.isFinite(q.prog) && (
                          <BarCell percent={q.prog * 100} color="var(--blue)"
                            text={`${Math.round(q.prog * 100)}%`} />
                        )}
                      </div>
                    ) : (
                      <>
                        <div className={holdsLock ? "sqm-warn" : "sqm-dim"}>
                          <b>Statement {q.id}</b> ({q.qid}) —{" "}
                          {holdsLock
                            ? "쓰기 계열(락 보유): 정지 시 트랜잭션이 롤백되어 배치 재실행이 필요합니다."
                            : "락 없음 — 중단해도 안전하며 재실행만 필요합니다."}
                        </div>
                        <button type="button" className="sqm-btn sqm-btn--tiny"
                          disabled={busy || stopTokenMissing}
                          title={stopTokenMissing
                            ? "시작 시각 메트릭이 아직 없어 정지할 수 없습니다 — 다음 갱신 후 다시 여세요."
                            : undefined}
                          onClick={() => setAction("stop")}>
                          STOP_STATEMENT
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )}
              <li className={`sqm-rguide__step is-${cle ? "blocked" : "todo"}`}>
                <span className="sqm-rguide__icon" aria-hidden="true">
                  {cle ? "⛔" : "▶"}
                </span>
                <div className="sqm-rguide__body">
                  <b>재기동</b>
                  <div className="sqm-dim">
                    워커 서버에서 프로세스를 kill합니다 — 자동 기동 스크립트가
                    재기동합니다.
                  </div>
                  <button type="button" className="sqm-btn sqm-btn--tiny"
                    disabled={cle}
                    title={cle ? "cleanup류 실행 중 — 완료를 기다리세요." : undefined}
                    onClick={() => setAction("restart")}>
                    Recovery
                  </button>
                </div>
              </li>
            </ol>
          )}

          <div className="sqm-modal__actions">
            <button type="button" className="sqm-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>

      {action === "stop" && q !== undefined && (
        <ActionDialog
          title="Stop Statement"
          target={`Statement ${q.id}`}
          warning={<>
            실행 중 statement를 정지합니다. 정지된 문장은{" "}
            <b>killed_by_admin</b>으로 실패 처리되며,{" "}
            {holdsLock
              ? <>락 보유(쓰기) 유형이라 <b>트랜잭션 롤백 — 배치 재실행이 필요</b>합니다.</>
              : "락 없는 유형이라 안전하게 끝납니다(재실행만 필요)."}
          </>}
          command={`SELECT STOP_STATEMENT('${q.id}');`}
          confirmLabel="정지 실행"
          onCancel={() => setAction(null)}
          onConfirm={(reason) => { void doStop(reason); }}
        />
      )}
      {action === "restart" && (
        <ActionDialog
          title="Worker Recovery"
          target={info.worker}
          warning={info.kind === "crash" ? CRASH_RESTART_WARNING
            : info.kind === "hang" ? hangRestartWarning : RESTART_WARNING}
          /* X15 — hang의 실체는 워커 서버에서의 프로세스 kill(인간 현장 확인
             원문 명령; awk의 "kill " 공백은 원문 누락을 정정한 것). crash·
             stopped는 프로세스가 이미 없어 kill 대상이 없다 — 명령 미표기. */
          command={info.kind === "hang" ? hangKillCommand : undefined}
          confirmLabel="Recovery 실행"
          onCancel={() => setAction(null)}
          onConfirm={(reason) => {
            setAction(null);
            requestRestart(info.worker, reason, showToast);
          }}
        />
      )}
    </>
  );
}
