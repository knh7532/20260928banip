/**
 * Query 상세 팝업 (X6) — Query Overview에서 Statement ID를 누르면 열린다.
 * X8부터 탑뷰(GpuDashboard) 쿼리 리스트에서도 같은 팝업을 연다(플랜 탭 기본).
 *
 * SQL(목업 원문·복사)·로그·플랜 3탭 + Kill. 탭 내용은 전부 행 데이터에서 만드는
 * 결정론 목업이다(`mockSql`·`mockQueryDetail.ts` — 메트릭에 원문·로그·계획을 실을
 * 수 없는 카디널리티 제약). Kill만 실제 요청이다: exporter 명령 API(X6, 인간 승인
 * 2026-08-18)에 POST 하면 **합성 데이터에** 반영된다 — 다음 tick에 running에서
 * 사라지고 실패 이력에 `killed_by_admin`으로 남는다. 실제 SQream은 없다.
 *
 * 라이브 갱신 (X8): `pollLive`를 받으면 팝업이 자체 주기(기본 5s, 설정 가능)로
 * elapsed·진행률을 재조회해 세 탭(로그·막대·플랜)이 함께 갱신된다. 팝업은 PromQL을
 * 만들지 않는다 — 각 화면이 자기 등재 exprs로 콜백을 구현한다(거버넌스).
 * lookup miss = 종료: 배너를 띄우고 Kill을 잠근 채 마지막 관측 값을 유지한다.
 *
 * 탭은 role=tablist/tab/tabpanel + aria-selected까지만 — 화살표 키 순회는 리포의
 * 실용적 aria 수준(`aria-pressed` 토글들)에 맞춰 넣지 않는다.
 */
import { useState, type ReactNode } from "react";

import { ExporterCmdError, killStatement } from "../../api/exporterCmd";
import { PhaseBar } from "../../components/detail/PhaseBar";
import { ActionDialog } from "../../components/drilldown/ActionDialog";
import { Pill } from "../../components/drilldown/primitives";
import { usePolling } from "../../hooks/usePolling";
import { copyText } from "../../lib/copyText";
import { mockSql } from "./cleanupCommands";
import { mockLogs, mockPhases, mockPlanSteps } from "./mockQueryDetail";
import { PlanSteps } from "./PlanSteps";
import {
  PLAN_REFRESH_DEFAULT_MS, PLAN_REFRESH_OPTIONS, type LiveStat, type PollLive,
} from "./queryDetailModel";

/** MainDashboard의 QueryRow가 구조적으로 만족한다 — 팝업이 쓰는 필드만 요구한다. */
export interface QueryDetailRow {
  id: string; qid: string; qidTags: string; user: string; node: string;
  worker: string; service: string; elapsed: number; prog: number;
  /** 시작 epoch(초) — Kill 세대 토큰(X6-R1). NaN이면 토큰 없이 요청한다. */
  startEpoch: number;
}

type Tab = "sql" | "logs" | "plan";
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "sql", label: "SQL" },
  { key: "logs", label: "로그" },
  { key: "plan", label: "플랜" },
];

export function QueryDetailModal({
  row, pinned = false, initialTab = "sql", pollLive, onClose, onKilled, showToast,
  openKillOnMount = false,
}: {
  row: QueryDetailRow;
  /** 고정 시점(pinnedMs) 화면이면 true — 과거 스냅숏의 행이라 Kill을 막는다 (X6-R1). */
  pinned?: boolean;
  /** 처음 열 탭 (X8) — 탑뷰는 "plan"(피드백 #1: 클릭 즉시 플랜). 기본 "sql". */
  initialTab?: Tab;
  /** 라이브 갱신 콜백 (X8) — 있으면 자체 주기로 elapsed·진행률을 재조회한다. */
  pollLive?: PollLive;
  onClose: () => void;
  /** kill 접수(또는 404 = 이미 종료) 시 — 호출자가 목록에서 낙관적으로 지운다. */
  onKilled: (id: string) => void;
  showToast: (message: ReactNode, ms?: number) => void;
  /** 2026-09-04: 표의 작업 열 Kill — 열자마자 Kill 확인 창까지 띄운다(killable 일 때만). */
  openKillOnMount?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [confirmKill, setConfirmKill] = useState(openKillOnMount);
  /** 요청 진행 중 — 확인을 연타해도 POST는 한 번만 나간다. */
  const [busy, setBusy] = useState(false);

  /* 라이브 갱신 (X8) — pollLive가 있을 때만. 주기는 팝업 로컬 설정(기본 5s). */
  const [refreshMs, setRefreshMs] = useState<number>(PLAN_REFRESH_DEFAULT_MS);
  const [live, setLive] = useState<LiveStat | null>(null);
  const [ended, setEnded] = useState(false);
  usePolling(async (signal) => {
    if (!pollLive) return;
    const map = await pollLive(signal);
    const hit = map.get(row.id);
    if (hit) {
      setLive(hit);
      setEnded(false);
    } else {
      setEnded(true); // 종료 — 마지막 관측 값(live)은 유지한 채 배너만 띄운다
    }
    /* deps에 pollLive 함수를 넣지 않는다 — usePolling은 deps를 JSON.stringify하는데
       함수는 null로 직렬화돼 무의미하다(codex X8-04). 콜백 최신화는 usePolling의
       fnRef(매 렌더 갱신)가 보장하므로, 재예약 트리거는 켜짐/꺼짐 전환만 잡는다. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, pollLive ? refreshMs : 0, [row.id, refreshMs, Boolean(pollLive)]);
  /** 탭 내용이 실제로 소비하는 행 — 라이브 값이 오면 elapsed·prog를 덮는다. */
  const liveRow: QueryDetailRow = live
    ? { ...row, elapsed: live.elapsed, prog: live.prog } : row;

  /* fail-closed(X6-R4): 세대 토큰(시작 epoch) 없이는 Kill을 열지 않는다 — 토큰
     없는 요청은 재사용된 stmt_id의 다른 문장을 죽일 수 있어 exporter도 400으로
     거부한다. 고정 시점(pin)·종료된 문장도 같은 이유로 막는다.
     CLE(cleanup류)는 중단 자체가 금지다(X11 — SQream 가이드 "Avoid interrupting
     or killing CLEANUP_EXTENTS…") — exporter도 409로 거부한다. qid 결측("")은
     막지 않는다 — 판별 불가 시 서버 409가 최종 방어다(이중화 원칙). */
  const cleBlocked = row.qid.startsWith("CLE");
  const killable = !pinned && !ended && !cleBlocked && Number.isFinite(row.startEpoch);
  const killBlockedTitle = pinned
    ? "고정 시점에서는 Kill할 수 없습니다 — 실시간 화면에서 실행하세요."
    : ended
      ? "이미 종료된 statement입니다."
      : cleBlocked
        ? "CLEANUP 계열은 중단 금지 — 완료를 기다리세요"
        : "시작 시각 메트릭이 아직 없어 Kill할 수 없습니다 — 다음 갱신 후 다시 여세요.";

  const doKill = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    try {
      // startEpoch = 세대 토큰 — 재사용된 stmt_id의 다른 문장을 죽이지 않게 (X6-R1)
      await killStatement(row.id, reason, row.startEpoch);
      showToast(
        <>
          ✅ <b>Statement {row.id}</b> Kill 요청이 접수되었습니다 — 다음 갱신에서 목록에서
          사라집니다
          <br />
          사유: {reason}
        </>, 9000);
      onKilled(row.id);
      onClose();
    } catch (e) {
      if (e instanceof ExporterCmdError && e.status === 404) {
        // 폴링 지연 사이에 자연 종료된 경우 — 실패가 아니라 "이미 끝났다"다.
        showToast(<>ℹ <b>Statement {row.id}</b>는 이미 종료된 statement입니다 — 목록을 갱신합니다.</>);
        onKilled(row.id);
        onClose();
      } else {
        showToast(
          <>⚠ Kill 요청 실패 — exporter(:9090)에 연결할 수 없습니다. 잠시 후 다시 시도하세요.</>);
        setConfirmKill(false); // 팝업은 남긴다 — 대상을 다시 고르게 하지 않는다
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sqm-modal-backdrop" role="dialog" aria-modal="true"
        aria-label={`Statement ${row.id}`}>
        <div className="sqm-modal sqm-modal--wide">
          <h3>
            📄 Statement <span style={{ color: "var(--accent)" }}>{row.id}</span>
          </h3>

          <div className="sqm-tabs" role="tablist" aria-label="Query 상세 탭">
            {TABS.map((t) => (
              <button
                key={t.key} type="button" role="tab" className="sqm-tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
            {/* 라이브 갱신 주기 (X8) — pollLive가 있을 때만. 하한 3s(과도 폴링 방지). */}
            {pollLive && (
              <select
                className="sqm-refresh-select" aria-label="자동 갱신 주기"
                value={refreshMs}
                onChange={(e) => setRefreshMs(Number(e.target.value))}
              >
                {PLAN_REFRESH_OPTIONS.map((ms) => (
                  <option key={ms} value={ms}>{ms / 1000}초</option>
                ))}
              </select>
            )}
          </div>

          {ended && (
            <p className="sqm-ended" role="status">
              ⏹ 종료된 statement — 마지막 관측 값을 표시 중입니다.
            </p>
          )}

          {tab === "sql" && (
            <div role="tabpanel" aria-label="SQL">
              <div className="sqm-cmd__head">
                <span className="sqm-dim">
                  {row.qid ? `${row.qid} · ` : ""}{row.user} · {row.worker}
                </span>
                <button
                  type="button" className="sqm-btn"
                  onClick={() => {
                    void copyText(mockSql(row)).then((ok) => showToast(ok
                      ? "📋 쿼리문을 클립보드에 복사했습니다."
                      : "⚠ 복사에 실패했습니다 — 아래 문장을 직접 선택해 복사하세요."));
                  }}
                >
                  복사
                </button>
              </div>
              <pre className="sqm-plan">{mockSql(row)}</pre>
            </div>
          )}

          {tab === "logs" && (
            <div role="tabpanel" aria-label="로그">
              {/* 각주("목업 로그 — 로그 저장소(F4) 소관")는 X12에서 제거 —
                  로그가 결정론 목업이라는 사실은 이 주석과 문서가 담는다. */}
              {/* 생애주기 누적 막대 (X6-f1) — X-View와 같은 컴포넌트·같은 수치
                  (mockPhases가 아래 로그 문장과 단일 원천). 실행 중이라 실패 강조 없음. */}
              <div className="sqm-phasebar">
                <PhaseBar phases={mockPhases(liveRow)} />
                <p className="sqm-dim">
                  생애주기 비중 — 실행 중이라 Executing은 현재까지 경과입니다.
                </p>
              </div>
              <div className="sqm-log">
                {mockLogs(liveRow).map((line, i) => (
                  <div key={i} className="sqm-log__row">
                    <span className="sqm-dim">{line.at}</span>
                    <Pill tone={line.level === "Warning" ? "yellow" : "green"}>
                      {line.level}
                    </Pill>
                    <span>{line.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "plan" && (
            <div role="tabpanel" aria-label="플랜">
              {/* X8: 텍스트 플랜 → 구조화 표. 단계별 소요시간이 라이브로 자라고
                  50s/100s 임계 색으로 병목이 드러난다(mockPlanSteps). */}
              <PlanSteps steps={mockPlanSteps(liveRow)} />
            </div>
          )}

          <div className="sqm-modal__actions">
            {/* Kill은 왼쪽에 격리 — 닫기 옆에 붙이면 손이 미끄러진다. */}
            <button
              type="button" className="sqm-btn sqm-btn--red"
              style={{ marginRight: "auto" }}
              disabled={!killable}
              title={killable ? undefined : killBlockedTitle}
              onClick={() => setConfirmKill(true)}
            >
              Kill
            </button>
            <button type="button" className="sqm-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>

      {confirmKill && killable && (
        <ActionDialog
          title="Kill Statement"
          target={`Statement ${row.id}`}
          warning={<>
            실행 중인 statement를 <b>중지</b>시킵니다. 진행 중이던 작업은 롤백되고
            재실행이 필요합니다. ADMIN 전용 명령입니다.
          </>}
          command={`SELECT STOP_STATEMENT('${row.id}');`}
          confirmLabel="Kill 실행"
          onCancel={() => setConfirmKill(false)}
          onConfirm={(reason) => { void doKill(reason); }}
          onCopyResult={(ok) => showToast(ok
            ? "📋 명령문을 클립보드에 복사했습니다."
            : "⚠ 복사에 실패했습니다 — 명령문을 직접 선택해 복사하세요.")}
        />
      )}
    </>
  );
}
