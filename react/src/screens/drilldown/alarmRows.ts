/** Alarms 화면의 행 조립·정렬 (S3) — 컴포넌트와 분리(react-refresh 규칙). */
import type { PromSeries } from "../../api/prom";

export interface Alarm {
  alert: string;
  severity: string;
  node: string;
  /** 워커 단위 알람만 채워진다. 노드·클러스터 레벨은 빈 문자열(계약: db-schema §7). */
  worker: string;
  state: number;
  since: number;
}

/** 알람 하나를 가리키는 키.
 *
 * **worker가 빠지면 안 된다.** 같은 노드의 서로 다른 워커 알람이 한 키로 뭉개져
 * `since` 조인이 엉키고 한 건이 사라진다. */
function keyOf(m: Record<string, string>): string {
  return JSON.stringify([m.alertname, m.severity, m.node, m.worker ?? ""]);
}

/** 활성(firing/ack)이 위로, 그 안에서 critical 우선, 그 안에서 최신 순. */
function rank(a: Alarm): number {
  return a.state === 2 ? 0 : a.state === 3 ? 1 : 2;
}

export function buildAlarms(states: PromSeries[], since: PromSeries[]): Alarm[] {
  const sinceMap = new Map<string, number>();
  for (const row of since) sinceMap.set(keyOf(row.metric), Number(row.value?.[1]));

  const list = states.map((row) => ({
    alert: row.metric.alertname ?? "",
    severity: row.metric.severity ?? "",
    node: row.metric.node ?? "",
    worker: row.metric.worker ?? "",
    state: Math.round(Number(row.value?.[1])),
    since: sinceMap.get(keyOf(row.metric)) ?? NaN,
  }));

  list.sort((a, b) =>
    rank(a) - rank(b)
    || (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1)
    || ((b.since || 0) - (a.since || 0)));
  return list;
}
