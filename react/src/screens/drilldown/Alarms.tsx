/**
 * Alarms (`#/drilldown/alarms`) — 정적 `res/sqream/mockup/alarms.html`의 React 이관.
 *
 * 정적본의 규칙을 그대로 지킨다:
 *  - **조회 실패와 "활성 알람 없음(정상)"을 구분**한다. 성공한 빈 배열은 정상이다
 *    (정적본 codex 0.14 Major).
 *  - 정렬은 활성(firing → ack) → critical 우선 → 최신 순.
 *  - Acknowledge는 **목업 동작**이다. 실제 조치는 인간 승인 후 receiver 경유(ADR-0004).
 */
import { useState } from "react";

import { promQuery } from "../../api/prom";
import { alarms as alarmQueries } from "../../api/queries";
import { Card, Kpi, Pill, Table, type PillTone } from "../../components/drilldown/primitives";
import { useToast } from "../../components/drilldown/useToast";
import { usePolling } from "../../hooks/usePolling";
import { SortReset } from "../../components/drilldown/SortReset";
import { useTableSort } from "../../components/drilldown/useTableSort";
import { PinChip } from "../../components/drilldown/PinChip";
import type { DrilldownScreenProps } from "../DrilldownDashboard";
import { buildAlarms, type Alarm } from "./alarmRows";
import { displayNode, formatAgo, formatInt } from "../../lib/format";
import { PageHead } from "../../components/drilldown/PageHead";

/** `sqm_alert_state` 값 → 표기. 정적 `STATE` 표와 같다. */
const STATE: Record<number, { text: string; tone: PillTone }> = {
  0: { text: "OK", tone: "green" },
  1: { text: "Pending", tone: "blue" },
  2: { text: "Firing", tone: "red" },
  3: { text: "Acknowledged", tone: "yellow" },
  4: { text: "Resolved", tone: "green" },
};

export function Alarms({ refreshMs, title, pinnedMs, onClearPin }: DrilldownScreenProps) {
  const [rows, setRows] = useState<Alarm[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, showToast] = useToast();

  usePolling(async (signal) => {
    // 고정 시점이 있으면 그 시각의 값을 묻는다(instant 전용).
    const at = pinnedMs ?? undefined;
    const q = alarmQueries();
    try {
      const [states, since] = await Promise.all([
        promQuery(q.state, signal, at),
        promQuery(q.since, signal, at),
      ]);
      setRows(buildAlarms(states, since));
      setFailed(false);
      setLoaded(true);
    } catch (error) {
      setFailed(true);
      throw error;
    }
  }, pinnedMs === null ? refreshMs : 0, [refreshMs, pinnedMs]);

  const count = (state: number) => rows.filter((a) => a.state === state).length;
  const criticalActive = rows.filter(
    (a) => a.severity === "critical" && (a.state === 2 || a.state === 3)).length;
  const active = rows.filter((a) => a.state === 2 || a.state === 3).length;
  const dash = (n: number) => (failed ? "--" : formatInt(n));

  /* 기본 정렬은 `buildAlarms`가 이미 매긴 순서(활성 → critical → 최신)다.
     `key: null`이면 그 순서를 그대로 쓰고, 초기화하면 되돌아온다. */
  const aSort = useTableSort<Alarm>({
    severity: (r) => r.severity, alert: (r) => r.alert, node: (r) => r.node,
    worker: (r) => r.worker, state: (r) => r.state, since: (r) => r.since,
  });

  return (
    <div className="sqm-page">
      <PageHead title={title} sub="실시간 피드 · 조치 상태">
        <PinChip pinnedMs={pinnedMs} onClear={onClearPin} />
        <a className="sqm-btn" href="/grafana/alerting/list" target="_blank" rel="noopener">
          Grafana Alerting ↗
        </a>
      </PageHead>

      <div className="sqm-grid sqm-grid--kpi4">
        <Kpi icon="🔥" tone="red" label="FIRING" value={dash(count(2))} alert={!failed && count(2) > 0} />
        <Kpi icon="🛠" tone="orange" label="ACKNOWLEDGED (조치 중)" value={dash(count(3))} />
        <Kpi icon="⛔" tone="red" label="CRITICAL ACTIVE" value={dash(criticalActive)}
          alert={!failed && criticalActive > 0} />
        <Kpi icon="✔" tone="green" label="RESOLVED (표시 중)" value={dash(count(4))} />
      </div>

      <Card
        title="Alarm Feed"
        aside={<>{failed ? "조회 실패" : `${active} active`} <SortReset sort={aSort} /></>}
        body={false}
      >
        <Table
          head={[aSort.th("severity", "Severity"), aSort.th("alert", "Alert"),
          aSort.th("node", "Node"), aSort.th("worker", "Worker"),
          aSort.th("state", "State"), aSort.th("since", "Since"), ""]}
          loading={!loaded && !failed}
          error={failed
            ? "알람 조회 실패 — Spring API에 연결할 수 없습니다. 표시 값이 최신이 아닐 수 있습니다."
            : undefined}
          empty={rows.length === 0 ? "활성 알람 없음" : undefined}
        >
          {aSort.apply(rows).map((a) => {
            const st = STATE[a.state] ?? STATE[0];
            return (
              <tr key={`${a.alert}|${a.severity}|${a.node}|${a.worker}`}>
                <td><Pill tone={a.severity === "critical" ? "red" : "yellow"}>{a.severity}</Pill></td>
                <td><b>{a.alert}</b></td>
                <td>{displayNode(a.node)}</td>
                {/* 워커를 특정할 수 없는 알람(노드·클러스터 레벨)은 빈 문자열로 온다. */}
                <td>{a.worker || <span className="sqm-dim">—</span>}</td>
                <td><Pill tone={st.tone}>{st.text}</Pill></td>
                <td>{formatAgo(a.since)}</td>
                <td style={{ textAlign: "right" }}>
                  {a.state === 2 && (
                    <button
                      type="button"
                      className="sqm-btn"
                      onClick={() => showToast(
                        // Acknowledge는 기록 전용(상태 변경 예외 아님) — "처리했습니다"로
                        // 완료를 확정하면 과장이다(codex X12-01). 접수 사실만 말한다.
                        <>🛠 <b>{a.alert}</b> ({a.node}) — 확인(Acknowledge) 요청이
                          기록되었습니다.</>,
                        7000)}
                    >
                      Acknowledge
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {toast}
    </div>
  );
}
