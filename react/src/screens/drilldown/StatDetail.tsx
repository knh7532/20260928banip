/**
 * Session Statistics 카드의 내역 (인간 지시 2026-08-10).
 *
 * 카드는 숫자 하나만 말한다 — "Failed Queries 8"을 보고 나면 **어느 쿼리인지**가 다음
 * 질문이다. 지금까지는 그 답이 화면에 없어 Grafana로 나가야 했다.
 *
 * 인간 추가 지시로 대기·실패 내역에 **Statement ID · Q-Type · Worker**를 넣고, 실패에는
 * **사유**까지 적는다. 그러려면 메트릭이 문장 단위여야 해서 계약을 v4.3으로 올렸다
 * (`sqm_statement_queued` 라벨 확장 + `sqm_statement_failed_timestamp` 신설).
 *
 * 고정 시점(`atMs`)을 그대로 물려받는다 — 표가 과거를 보는데 모달만 현재를 보면 어긋난다.
 */
import { useEffect, useState, type ReactNode } from "react";

import { promQuery, type PromSeries } from "../../api/prom";
import { mainDashboard } from "../../api/queries";
import { displayNode, formatBytes, formatInt } from "../../lib/format";
import { QidPill } from "../../components/drilldown/QidPill";

export type StatKind = "users" | "failed" | "spool";

/**
 * 실패 사유 코드 → 사람이 읽는 설명.
 *
 * 코드는 exporter가 **열거형**으로 낸다(`exporter/query_sim.py`의 `FAIL_REASONS`).
 * 자유 문자열을 라벨에 실으면 시계열이 무한히 늘어나므로, 문구는 화면이 붙인다.
 * 모르는 코드는 지어내지 않고 코드를 그대로 보여 준다 — exporter가 앞서갈 수 있다.
 */
const REASON_TEXT: Record<string, string> = {
  lock_timeout: "테이블 락 대기 초과 — 선행 Rechunk/Cleanup과 겹침",
  out_of_memory: "워커 메모리 한도 초과 (limitQueryMemoryGB)",
  spool_limit: "스풀(디스크) 한도 초과 — GPU 메모리 부족으로 과다 스필",
  connection_lost: "클라이언트 연결 끊김",
  killed_by_admin: "관리자 종료 (stop_statement)",
};

const META: Record<StatKind, { title: string; head: string[]; note?: string }> = {
  users: { title: "Connected Users", head: ["User", "Sessions"] },
  failed: {
    title: "Failed Queries (1h)",
    head: ["Statement ID", "Q-Type", "User", "Node", "Worker", "실패 사유", "경과"],
    note: "최근 12건까지 보관합니다. 그보다 오래된 실패는 보관 DB 소관입니다.",
  },
  /* "queued" 내역은 X14-f1(인간 지시)로 카드와 함께 삭제 — 실제 시스템은 1초
     이상 대기하는 쿼리를 정지·에러 처리해 큐 내역이 의미 없다. */
  spool: { title: "Disk Spill", head: ["Statement ID", "Worker", "Spilled"] },
};

interface Row { key: string; cells: ReactNode[] }

/** 워커가 없는 것은 "모른다"가 아니라 "아직 배정 전"이다 — 지어내지 않는다. */
const NONE = <span className="sqm-dim">—</span>;

function ago(fromSec: number, nowMs: number): string {
  if (!Number.isFinite(fromSec)) return "--";
  const s = Math.max(0, Math.round(nowMs / 1000 - fromSec));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

function toRows(kind: StatKind, series: PromSeries[], nowMs: number): Row[] {
  const num = (r: PromSeries) => Number(r.value?.[1]);

  if (kind === "users") {
    return series.map((r) => ({
      key: r.metric.sqream_user ?? "",
      cells: [r.metric.sqream_user || "--", formatInt(num(r))],
    }));
  }

  if (kind === "failed") {
    // 값이 실패 시각이라 최신순은 값 내림차순이다.
    return [...series].sort((a, b) => num(b) - num(a)).map((r) => {
      const code = r.metric.reason ?? "";
      return {
        key: `${r.metric.stmt_id}/${code}`,
        cells: [
          <b>{r.metric.stmt_id ?? "--"}</b>,
          <QidPill qid={r.metric.qid ?? ""} tags={r.metric.qid_tags} />,
          r.metric.sqream_user || "--",
          displayNode(r.metric.node ?? "") || "--",
          r.metric.worker || NONE,
          <span title={code}>{REASON_TEXT[code] ?? code ?? "--"}</span>,
          ago(num(r), nowMs),
        ],
      };
    });
  }

  // Disk Spill — 많이 샌 쿼리가 위로.
  return [...series]
    .sort((a, b) => num(b) - num(a))
    .map((r) => ({
      key: `${r.metric.stmt_id}/${r.metric.worker}`,
      cells: [`${r.metric.stmt_id ?? "--"}`, r.metric.worker || "--", formatBytes(num(r))],
    }));
}

export function StatDetail({ kind, atMs, onClose }: {
  kind: StatKind;
  /** 화면이 고정한 시점. 없으면 현재. */
  atMs: number | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const meta = META[kind];

  useEffect(() => {
    const ac = new AbortController();
    const q = mainDashboard();
    const expr = {
      users: q.detailUsers, failed: q.detailFailed, spool: q.detailSpool,
    }[kind];

    setRows(null);
    setFailed(false);
    promQuery(expr, ac.signal, atMs ?? undefined)
      .then((series) => setRows(toRows(kind, series, atMs ?? Date.now())))
      .catch((error: unknown) => {
        // 사용자가 모달을 닫아 취소된 것은 실패가 아니다.
        if (ac.signal.aborted) return;
        setFailed(true);
        /* 다시 던지지 않는다. `usePolling` 같은 수집기가 없는 자리라 재throw는
           그대로 unhandled rejection이 되어 콘솔만 더럽힌다. 실패는 화면이 말한다. */
        console.error("[StatDetail] 내역 조회 실패", error);
      });
    return () => ac.abort();
  }, [kind, atMs]);

  return (
    <div className="sqm-modal-backdrop" role="dialog" aria-modal="true" aria-label={meta.title}>
      <div className="sqm-modal sqm-modal--wide">
        <h3>
          📊 {meta.title}
          {atMs !== null && (
            <span className="sqm-dim" style={{ fontSize: 12, fontWeight: 400 }}>
              {" "}({new Date(atMs).toLocaleString("ko-KR", { hour12: false })} 시점)
            </span>
          )}
        </h3>

        <div className="sqm-scrollbox">
          <table className="sqm-table">
            <thead><tr>{meta.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {failed ? (
                <tr><td className="sqm-table__error" colSpan={meta.head.length}>
                  ⚠ 내역 조회 실패 — 데이터 소스에 연결할 수 없습니다.
                </td></tr>
              ) : rows === null ? (
                <tr><td className="sqm-table__empty" colSpan={meta.head.length}>로드 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="sqm-table__empty" colSpan={meta.head.length}>내역 없음</td></tr>
              ) : rows.map((r) => (
                <tr key={r.key}>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta.note && <p className="sqm-dim" style={{ fontSize: 11, marginTop: 10 }}>* {meta.note}</p>}

        <div className="sqm-modal__actions">
          <button type="button" className="sqm-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
