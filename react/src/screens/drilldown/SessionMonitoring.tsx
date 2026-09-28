/**
 * Session Monitoring (`#/drilldown/session`) — 정적 `res/sqream/mockup/session.html`.
 *
 * 정적본에서 그대로 지키는 것:
 *  - Worker 컬럼은 **실제 라벨**로만 채운다. 예전에 세션 ID 문자코드 합으로 워커를 지어내
 *    화면이 거짓말을 했고, 2026-08-08 표기 통일에서 걷어냈다. 라벨이 없으면 `--`.
 *  - Session Kill은 **다이얼로그까지만**이다(ADR-0004 UI 안전장치 재현). 사유 입력이
 *    필수이고, 확인해도 상태를 바꾸지 않는다 — 실제 종료는 receiver 경유 ADMIN 인가 후.
 */
import { useMemo, useState } from "react";

import { promQuery, scalarOf } from "../../api/prom";
import { sessionMonitoring } from "../../api/queries";
import { Card, Kpi, Pill, Table } from "../../components/drilldown/primitives";
import { useToast } from "../../components/drilldown/useToast";
import { usePolling } from "../../hooks/usePolling";
import { SortReset } from "../../components/drilldown/SortReset";
import { useTableSort } from "../../components/drilldown/useTableSort";
import { PinChip } from "../../components/drilldown/PinChip";
import type { DrilldownScreenProps } from "../DrilldownDashboard";
import { displayNode, formatInt, formatPercent } from "../../lib/format";
import { PageHead } from "../../components/drilldown/PageHead";

interface Session {
  id: string;
  user: string;
  node: string;
  worker: string;
  elapsed: number;
  running: number;
}

interface Kpis { sessions: number; running: number; cpu: number; gpu: number }
const ZERO: Kpis = { sessions: 0, running: 0, cpu: 0, gpu: 0 };

/** 초 → "01:23:45". 정적 `fmtClock`과 같다. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "--";
  const s = Math.max(0, Math.floor(seconds));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function SessionMonitoring({ refreshMs, filters, title, pinnedMs, onClearPin }: DrilldownScreenProps) {
  const [kpis, setKpis] = useState<Kpis>(ZERO);
  const [rows, setRows] = useState<Session[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, showToast] = useToast();

  const [user, setUser] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  /* 노드 필터는 상단 툴바(filters.server)를 그대로 쓴다 — 화면 안에 All Nodes
     셀렉트를 따로 두면 두 필터가 따로 놀아 어느 쪽이 진실인지 알 수 없다
     (인간 지시 2026-08-10 — 로컬 드롭다운 제거, 툴바 적용). */
  const nodeFilter = filters.server ? displayNode(filters.server) : "";

  /** Kill 다이얼로그 — 열려 있으면 대상 세션 ID. */
  const [killTarget, setKillTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  usePolling(async (signal) => {
    // 고정 시점이 있으면 그 시각의 값을 묻는다(instant 전용).
    const at = pinnedMs ?? undefined;
    const q = sessionMonitoring();
    try {
      const [nSess, nRun, cpu, gpu, active, starts, runq] = await Promise.all([
        promQuery(q.active, signal, at), promQuery(q.running, signal, at),
        promQuery(q.avgCpu, signal, at), promQuery(q.avgGpu, signal, at),
        promQuery(q.sessions, signal, at), promQuery(q.started, signal, at),
        promQuery(q.queries, signal, at),
      ]);
      setKpis({
        sessions: scalarOf(nSess), running: scalarOf(nRun),
        cpu: scalarOf(cpu), gpu: scalarOf(gpu),
      });

      const startMap = new Map<string, number>();
      for (const r of starts) startMap.set(r.metric.session_id ?? "", Number(r.value?.[1]));
      const runMap = new Map<string, number>();
      for (const r of runq) runMap.set(r.metric.session_id ?? "", Number(r.value?.[1]));

      const nowSec = Date.now() / 1000;
      const list = active.map((r) => {
        const id = r.metric.session_id ?? "";
        return {
          id,
          user: r.metric.sqream_user ?? "",
          node: displayNode(r.metric.node ?? ""),
          // 라벨이 없으면 지어내지 않는다 — "--"로 둔다.
          worker: r.metric.worker ?? "--",
          elapsed: nowSec - (startMap.get(id) ?? nowSec),
          running: runMap.get(id) ?? 0,
        };
      }).sort((a, b) => b.elapsed - a.elapsed);
      setRows(list);
      setFailed(false);
      setLoaded(true);
    } catch (error) {
      setFailed(true);
      throw error;
    }
  }, pinnedMs === null ? refreshMs : 0, [refreshMs, pinnedMs]);

  const users = useMemo(() => [...new Set(rows.map((s) => s.user))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((s) => {
      const st = s.running > 0 ? "Running" : "Active";
      return (!user || s.user === user)
        && (!nodeFilter || s.node === nodeFilter)
        && (!status || st === status)
        && (!needle || (s.id + s.user + s.node + s.worker).toLowerCase().includes(needle));
    });
  }, [rows, user, nodeFilter, status, search]);

  const dash = (n: number, fmt: (v: number) => string) => (failed ? "--" : fmt(n));

  const sSort = useTableSort<Session>({
    id: (r) => r.id, user: (r) => r.user, node: (r) => r.node, worker: (r) => r.worker,
    elapsed: (r) => r.elapsed, running: (r) => r.running,
  }, { key: "elapsed", desc: true });

  return (
    <div className="sqm-page">
      <PageHead title={title}><PinChip pinnedMs={pinnedMs} onClear={onClearPin} /></PageHead>

      <div className="sqm-grid sqm-grid--kpi4">
        <Kpi icon="🖥" tone="blue" label="ACTIVE SESSIONS" value={dash(kpis.sessions, formatInt)} />
        <Kpi icon="⚡" tone="blue" label="RUNNING QUERIES" value={dash(kpis.running, formatInt)} />
        <Kpi icon="▣" tone="blue" label="AVG CPU LOAD" value={dash(kpis.cpu, (v) => formatPercent(v, 0))} />
        <Kpi icon="▦" tone="green" label="AVG GPU LOAD" value={dash(kpis.gpu, (v) => formatPercent(v, 0))}
          alert={!failed && kpis.gpu > 0} />
      </div>

      <Card
        title="Active Sessions"
        aside={failed ? "조회 실패" : `Showing ${filtered.length} of ${rows.length} sessions`}
        body={false}
      >
        <div className="sqm-card__body">
          <div className="sqm-filters">
            <select aria-label="사용자" value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">All Users</option>
              {users.map((u) => <option key={u}>{u}</option>)}
            </select>
            <select aria-label="상태" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option>Active</option><option>Running</option>
            </select>
            <input type="text" aria-label="세션 검색" placeholder="Search sessions..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" className="sqm-btn"
              onClick={() => { setUser(""); setStatus(""); setSearch(""); }}>
              CLEAR FILTERS
            </button>
            <SortReset sort={sSort} />
          </div>

          <Table
            head={[sSort.th("id", "Session ID"), sSort.th("user", "User"),
              sSort.th("node", "Node"), sSort.th("worker", "Worker"), "Status",
              sSort.th("elapsed", "Elapsed Time"),
              sSort.th("running", "Running Queries"), ""]}
            loading={!loaded && !failed}
            error={failed ? "세션 조회 실패 — Spring API에 연결할 수 없습니다." : undefined}
            empty={filtered.length === 0 ? "조건에 맞는 세션 없음" : undefined}
          >
            {sSort.apply(filtered).map((s) => (
              <tr key={s.id}>
                <td><b>{s.id}</b></td>
                <td>{s.user}</td>
                <td>{s.node}</td>
                <td>{s.worker}</td>
                <td><Pill tone="green">{s.running > 0 ? "Running" : "Active"}</Pill></td>
                <td>{clock(s.elapsed)}</td>
                <td>{s.running}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button" className="sqm-btn sqm-btn--red"
                    onClick={() => { setKillTarget(s.id); setReason(""); }}
                  >
                    Terminate
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      {killTarget !== null && (
        <div className="sqm-modal-backdrop" role="dialog" aria-modal="true"
          aria-label={`Terminate Session ${killTarget}`}>
          <div className="sqm-modal">
            <h3>
              ⚠ Terminate Session <span style={{ color: "var(--accent)" }}>{killTarget}</span>
            </h3>
            <p>
              이 작업은 실행 중인 statement를 중지시킵니다. ADMIN 전용 명령입니다.
              계속하려면 <b>사유를 반드시 입력</b>하세요.
            </p>
            <textarea
              aria-label="Kill 사유"
              placeholder="Kill 사유 (필수) — 예: Long Query로 인한 워커 점유, 운영 승인 티켓 #1234"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="sqm-modal__actions">
              <button type="button" className="sqm-btn" onClick={() => setKillTarget(null)}>취소</button>
              <button
                type="button" className="sqm-btn sqm-btn--red"
                disabled={reason.trim().length === 0}
                onClick={() => {
                  const id = killTarget;
                  setKillTarget(null);
                  // 세션 종료는 기록 전용이다(상태 변경 예외 아님) — 그 사실은
                  // 주석·문서가 담고, 토스트는 접수 사실·사유만 말한다(X12).
                  showToast(
                    <>
                      ✅ <b>{id}</b> 종료 요청이 기록되었습니다
                      <br />사유: {reason.trim()}
                    </>, 8000);
                }}
              >
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}
