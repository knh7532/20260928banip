import { useMemo, useRef, useState, type ReactNode } from "react";

import type { StatementRow } from "../../hooks/useDashboardData";
import { displayNode, formatGB, formatPercent, workerName } from "../../lib/format";
import { Panel } from "../Panel";
import {
  LONG_RUNNING_SEC, MEM_LIMIT_GB, RUNNING_COLUMNS, VRAM_LIMIT_GB, formatElapsedKo, formatStampKST,
  loadColumnOrder, moveColumn, phaseOf, saveColumnOrder, sortRows, type ColType, type SortState,
} from "./runningColumns";

export type DetailTab = "sql" | "logs" | "plan";
const DEFAULT_ORDER: readonly ColType[] = RUNNING_COLUMNS.map((c) => c.key);
const COLUMN_BY_KEY = new Map(RUNNING_COLUMNS.map((c) => [c.key, c] as const));

/* 2026-09-04 (인간 지시): 탑뷰 상단의 두 표(① 실행 중인 쿼리 11열 · ② SQL 쿼리 성능)를
   `mockup/sqream_running_queries_mockup.html`(topview_table1 16열)으로 교체했다.
   열 순서·폭·표기(게이지·배지·틴트·정렬 규칙)는 그 목업을 그대로 따르고, 값은 계약
   TV-C1 메트릭에서 채운다(useDashboardData.buildStatements). 계약에 없는 것은 "-"다:
   Connection ID(v4.12 connection_id 라벨). Lock Type 은 `sqm_lock_held_seconds` 조인으로 보유 여부만.
   VRAM 은 슬롯(1 워커 = 1 쿼리)의 DCGM FB_USED / 71GB(계약 MIG VRAM, X9).
   상태 표기는 상태 축(statusMeta) 그대로다. */

/** ① 실행 중인 SQream DB 쿼리 테이블 (16열, 목업 이식). */
export function RunningQueries({
  rows,
  titleSuffix,
  emptyText = "실행 중인 쿼리가 없습니다",
  onOpen,
  onKill,
  actions,
}: {
  rows: StatementRow[];
  /** 패널 제목 접미사 (R6 — "(선택 인스턴스: …)"). */
  titleSuffix?: string;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분 (R9 F7.2). */
  emptyText?: string;
  /** 행 클릭 → 상세(쿼리문 탭), Statement ID 링크 → 실행 계획 탭, 작업 열 "로그" → 로그 탭.
   *  미제공이면 표기만. */
  onOpen?: (row: StatementRow, tab: DetailTab) => void;
  /** 작업 열 Kill — 호출자가 상세를 열고 Kill 확인 다이얼로그를 바로 띄운다. 미제공이면 버튼 없음. */
  onKill?: (row: StatementRow) => void;
  /** 헤더 우측 액션 슬롯 (X8-f1 — 목록 펼치기/접기 토글). */
  actions?: ReactNode;
}) {
  const [sort, setSort] = useState<SortState | null>(null);
  const shown = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const toggleSort = (key: ColType) => {
    if (key === "actions") return; // 값이 없는 열은 정렬 대상이 아니다
    setSort((cur) => (cur && cur.key === key ? { key, desc: !cur.desc } : { key, desc: true }));
  };
  /* 열 순서 — 헤더를 드래그해 바꾼다(2026-09-04 인간 지시). 저장은 브라우저 로컬. */
  const [order, setOrder] = useState<ColType[]>(() => loadColumnOrder(DEFAULT_ORDER));
  const columns = useMemo(() => order.map((k) => COLUMN_BY_KEY.get(k)!), [order]);
  const orderDirty = order.some((k, i) => k !== DEFAULT_ORDER[i]);
  const dragKey = useRef<ColType | null>(null);
  const [dragOver, setDragOver] = useState<ColType | null>(null);
  const dropOn = (to: ColType) => {
    const from = dragKey.current;
    dragKey.current = null;
    setDragOver(null);
    if (!from || from === to) return;
    setOrder((cur) => {
      const next = moveColumn(cur, from, to);
      saveColumnOrder(next);
      return next;
    });
  };
  const resetOrder = () => {
    setOrder([...DEFAULT_ORDER]);
    saveColumnOrder(DEFAULT_ORDER);
  };

  return (
    <Panel
      title={`실행 중인 SQream DB 쿼리 ${titleSuffix ?? ""}`.trimEnd()}
      hint={"현재 실행 중인 쿼리(statement) 목록입니다. 상단 필터의 인스턴스/GPU 선택과 "
        + "연동됩니다. 행을 누르면 쿼리문, Statement ID를 누르면 실행 계획·로그·Kill 상세가 "
        + "열립니다. 헤더 클릭은 정렬(내림차순 우선, 결측은 항상 뒤), 헤더 드래그는 열 순서 변경입니다. "
        + "작업 열의 로그는 로그 탭, Kill은 중지 확인 창을 엽니다. "
        + "Connection ID는 문장이 실행되는 세션의 연결 번호입니다."}
      className="panel--running"
      actions={
        <>
          {orderDirty && (
            <button
              type="button" className="panel__expand" title="드래그로 바꾼 열 순서를 기본으로 되돌립니다."
              onClick={resetOrder}
            >
              열 순서 초기화
            </button>
          )}
          {actions}
        </>
      }
    >
      <div className="table-scroll">
        <table className="data-table data-table--wide">
          <colgroup>
            {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    data-col={c.key}
                    className={[active ? "is-sorted" : "", dragOver === c.key ? "is-dragover" : ""]
                      .filter(Boolean).join(" ") || undefined}
                    aria-sort={active ? (sort?.desc ? "descending" : "ascending") : "none"}
                    draggable
                    title="클릭: 정렬 · 드래그: 열 순서 변경"
                    onClick={() => toggleSort(c.key)}
                    onDragStart={(e) => {
                      dragKey.current = c.key;
                      e.dataTransfer?.setData("text/plain", c.key);
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (!dragKey.current) return;
                      e.preventDefault();
                      if (dragOver !== c.key) setDragOver(c.key);
                    }}
                    onDragLeave={() => { if (dragOver === c.key) setDragOver(null); }}
                    onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                    onDragEnd={() => { dragKey.current = null; setDragOver(null); }}
                  >
                    {c.label}{active ? (sort?.desc ? " ▼" : " ▲") : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {emptyText}
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const tint = Number.isFinite(r.spoolBytes) && r.spoolBytes > 0 ? "row--spool"
                  : Number.isFinite(r.elapsedSec) && r.elapsedSec >= LONG_RUNNING_SEC ? "row--long" : "";
                return (
                  // 복합 key — stmt_id가 노드 간 충돌해도 React 행이 뒤섞이지 않도록 (CDX-R3-04)
                  <tr
                    key={`${r.node}/${r.gpu}/${r.mig}/${r.connectionId}/${r.stmtId}`}
                    className={tint || undefined}
                    onClick={onOpen ? () => onOpen(r, "sql") : undefined}
                    style={onOpen ? { cursor: "pointer" } : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={c.num ? "num" : undefined}>
                        <Cell row={r} col={c.key} onOpen={onOpen} onKill={onKill} />
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Cell({ row: r, col, onOpen, onKill }: {
  row: StatementRow; col: ColType;
  onOpen?: (row: StatementRow, tab: DetailTab) => void;
  onKill?: (row: StatementRow) => void;
}) {
  switch (col) {
    case "actions": {
      // Kill 은 세대 토큰(시작 epoch)이 있어야 열린다 — 상세 팝업과 같은 fail-closed 규칙(X6-R4)
      const killable = Number.isFinite(r.startTimeSec);
      return (
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {onOpen && (
            <button type="button" className="rq-btn" title="로그 탭 열기"
              onClick={() => onOpen(r, "logs")}>로그</button>
          )}
          {onKill && (
            <button type="button" className="rq-btn rq-btn--red"
              disabled={!killable}
              title={killable ? "이 statement 를 중지합니다 (확인 창)" : "시작 시각 메트릭이 아직 없어 Kill할 수 없습니다"}
              onClick={() => onKill(r)}>Kill</button>
          )}
        </span>
      );
    }
    case "stamp": return <span className="mono">{formatStampKST(r.startTimeSec)}</span>;
    case "node": return <>{displayNode(r.node)}</>;
    case "worker": return <>{r.worker || workerName(r.node, r.gpu, r.mig)}</>;
    case "conn": return <span className="mono">{r.connectionId || "-"}</span>;
    case "link":
      return onOpen ? (
        <button
          type="button" className="query-linkbtn mono"
          title="실행 계획·로그·Kill 상세 열기"
          onClick={(e) => { e.stopPropagation(); onOpen(r, "plan"); }}
        >
          {r.stmtId}
        </button>
      ) : <span className="mono">{r.stmtId}</span>;
    case "svc":
      if (r.service === "etl_service") return <span className="svc-badge">etl_service</span>;
      if (r.service === "compile") return <span className="svc-dim">compile</span>;
      return <>{r.service || "-"}</>;
    case "lock":
      return Number.isFinite(r.lockHeldSec)
        ? <span title={`락 보유 ${Math.round(r.lockHeldSec)}초`}>Held</span>
        : <>-</>;
    case "user": return <>{r.user}</>;
    case "status": {
      const { st } = phaseOf(r);
      return <span className={`state-badge ${st.badgeClass}`}>{st.label}</span>;
    }
    case "elapsed": return <>{formatElapsedKo(r.elapsedSec)}</>;
    case "prog": return <GaugeCell value={Number.isFinite(r.progress) ? r.progress * 100 : Number.NaN} />;
    case "mem": return <PairCell bytes={r.memoryBytes} limitGb={MEM_LIMIT_GB} />;
    case "spool":
      return Number.isFinite(r.spoolBytes) && r.spoolBytes > 0 ? <>{formatGB(r.spoolBytes)}</> : <>-</>;
    case "vram": return <PairCell bytes={r.vramBytes} limitGb={VRAM_LIMIT_GB} />;
    case "gpu": return <GaugeCell value={r.gpuPct} />;
    case "cpu": return <GaugeCell value={r.cpuPct} />;
  }
}

/** 게이지 셀 — 막대 + 값. 결측은 막대 없이 "-". */
function GaugeCell({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="gauge-cell" aria-label="결측"><span className="gauge-cell__text">-</span></span>;
  }
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className="gauge-cell">
      <span className="gauge-cell__bar" style={{ width: `${pct}%` }} />
      <span className="gauge-cell__text">{formatPercent(value)}</span>
    </span>
  );
}

/** 게이지 + "x GB / 상한 GB" 짝 셀 (GRAM·VRAM). */
function PairCell({ bytes, limitGb }: { bytes: number; limitGb: number }) {
  if (!Number.isFinite(bytes)) {
    return <span className="gauge-pair"><GaugeCell value={Number.NaN} /><span className="gauge-pair__text">-</span></span>;
  }
  const gb = bytes / 1e9;
  return (
    <span className="gauge-pair">
      <GaugeCell value={(gb / limitGb) * 100} />
      <span className="gauge-pair__text">{formatGB(bytes)} / {limitGb} GB</span>
    </span>
  );
}
