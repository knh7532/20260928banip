/**
 * Table Activity (`#/drilldown/activity`) — 정적 `res/sqream/mockup/table-activity.html`.
 *
 * 정적본에서 그대로 지키는 것:
 *  - 구간은 **allowlist(30분/1시간/6시간/24시간)** 안의 값만 — 임의 값이 PromQL에 끼지 않는다
 *    (정적본 CDX-0.7-01).
 *  - 조인 키는 구조적 `[db, schema, table]` (CDX-0.7-02).
 *  - 상세 대시보드 툴바가 range를 넘기면 화면 선택도 거기 맞춘다 — 툴바 6시간인데 표가
 *    1시간을 보는 어긋남을 막는다.
 *  - Trend는 인라인 SVG 스파크라인(내부 생성 숫자만 사용).
 */
import { useMemo, useState } from "react";

import { promQuery, promQueryRange, scalarOf } from "../../api/prom";
import { ALLOWED_ACTIVITY_RANGES, tableActivity, tableActivityTrend } from "../../api/queries";
import { Card, Kpi, Table } from "../../components/drilldown/primitives";
import { usePolling } from "../../hooks/usePolling";
import { SortReset } from "../../components/drilldown/SortReset";
import { useTableSort } from "../../components/drilldown/useTableSort";
import { PinChip } from "../../components/drilldown/PinChip";
import type { DrilldownScreenProps } from "../DrilldownDashboard";
import { formatAgo, formatBytes, formatInt } from "../../lib/format";
import { DrilldownChart } from "./DrilldownChart";
import { useFocusContext } from "./useFocusContext";
import { TableJoin, tableKey, type TableRow } from "./tableRows";
import { PageHead } from "../../components/drilldown/PageHead";

const PAGE_SIZE = 10;
const RANGE_LABEL: Record<number, string> = {
  300: "Last 5 min", 1800: "Last 30 min",
  3600: "Last 1 hour", 21600: "Last 6 hours", 86400: "Last 24 hours",
};

interface Totals { sel: number; ins: number; cpy: number; del: number; recent: number }
const ZERO: Totals = { sel: 0, ins: 0, cpy: 0, del: 0, recent: NaN };

type Row = TableRow & { sel?: number; ins?: number; cpy?: number; del?: number; trend?: number[] };

/** 인라인 SVG 스파크라인. points는 내부에서 만든 숫자 배열뿐이다. */
function Sparkline({ points }: { points?: number[] }) {
  if (!points || points.length < 2) return <span className="sqm-dim">--</span>;
  const w = 110;
  const h = 26;
  const max = Math.max(1e-9, ...points);
  const step = w / (points.length - 1);
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - 2 - (p / max) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="sqm-spark" role="img" aria-label="접근 추이">
      <polyline points={coords} />
    </svg>
  );
}

export function TableActivity({ refreshMs, filters, title, pinnedMs, onPickTime, onClearPin }: DrilldownScreenProps) {
  /* 툴바가 고른 구간이 이 화면의 allowlist에 있으면 그것을 쓴다 — 툴바 6시간인데 표가
     1시간을 보는 어긋남을 막는다(정적본과 같은 규칙). 툴바의 5분은 여기 allowlist에
     없으므로 화면 기본값(1시간)을 유지한다. */
  const fromToolbar = ALLOWED_ACTIVITY_RANGES.includes(filters.rangeSec) ? filters.rangeSec : null;
  const [override, setOverride] = useState<number | null>(null);
  const rangeSec = override ?? fromToolbar ?? 3600;
  const setRangeSec = (v: number) => setOverride(v);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [rows, setRows] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);

  usePolling(async (signal) => {
    // 고정 시점이 있으면 그 시각의 값을 묻는다(instant 전용).
    const at = pinnedMs ?? undefined;
    const q = tableActivity(rangeSec);
    try {
      const [sel, ins, cpy, del, recent,
        pSel, pIns, pCpy, pDel, pLast, pSize, trend] = await Promise.all([
        promQuery(q.selects, signal, at), promQuery(q.inserts, signal, at),
        promQuery(q.copyfroms, signal, at), promQuery(q.deletes, signal, at),
        promQuery(q.lastAccess, signal, at),
        promQuery(q.perSelect, signal, at), promQuery(q.perInsert, signal, at),
        promQuery(q.perCopyfrom, signal, at), promQuery(q.perDelete, signal, at),
        promQuery(q.perTableLastAccess, signal, at), promQuery(q.perTableSize, signal, at),
        promQueryRange(tableActivityTrend().perTable, rangeSec,
          { stepSec: Math.max(15, Math.round(rangeSec / 40)), signal }),
      ]);
      setTotals({
        sel: scalarOf(sel), ins: scalarOf(ins), cpy: scalarOf(cpy), del: scalarOf(del),
        recent: scalarOf(recent, NaN),
      });

      const join = new TableJoin();
      join.assign(pSel, (r, v) => { (r as Row).sel = v; });
      join.assign(pIns, (r, v) => { (r as Row).ins = v; });
      join.assign(pCpy, (r, v) => { (r as Row).cpy = v; });
      join.assign(pDel, (r, v) => { (r as Row).del = v; });
      join.assign(pLast, (r, v) => { r.lastAccess = v; });
      join.assign(pSize, (r, v) => { r.sizeDelta = v; });
      for (const s of trend) {
        (join.entry(s.metric) as Row).trend = (s.values ?? []).map(([, v]) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        });
      }
      const list = join.values() as Row[];
      list.sort((a, b) =>
        (Number.isFinite(b.sel) ? (b.sel as number) : -Infinity)
        - (Number.isFinite(a.sel) ? (a.sel as number) : -Infinity));
      setRows(list);
      setFailed(false);
      setLoaded(true);
    } catch (error) {
      setFailed(true);
      throw error;
    }
  }, refreshMs, [refreshMs, rangeSec]);

  /* 차트는 **롤링 [5m]** 식을 쓴다. 선택 구간은 가로 범위일 뿐이다 — KPI용
     `[${range}s]` 식을 물리면 각 점의 의미가 바뀐다(codex CDX-S3C-02). */
  const trend = tableActivityTrend();
  const seriesQ = useFocusContext([
    { expr: trend.selects, label: "SELECT", colorKey: "info" },
    { expr: trend.inserts, label: "INSERT", colorKey: "warning" },
    { expr: trend.copyfroms, label: "COPYFROM", colorKey: "blue" },
    { expr: trend.deletes, label: "DELETE", colorKey: "error" },
  ], rangeSec, refreshMs, Math.max(15, Math.round(rangeSec / 80)));

  const sort = useTableSort<Row>({
    table: (t) => t.table, sel: (t) => t.sel, ins: (t) => t.ins, cpy: (t) => t.cpy,
    del: (t) => t.del, lastAccess: (t) => t.lastAccess, sizeDelta: (t) => t.sizeDelta,
  });
  const sorted = useMemo(() => sort.apply(rows), [rows, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = useMemo(
    () => sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), [sorted, current]);
  /* 테이블 이름이 겹칠 때만 스키마를 덧붙인다 — 정적본과 같다. 항상 붙이면 지저분하다. */
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.table, (seen.get(r.table) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([t]) => t));
  }, [rows]);
  const dash = (n: number) => (failed ? "--" : formatInt(n));

  return (
    <div className="sqm-page">
      <PageHead title={title}>
        <div className="sqm-filters" style={{ marginBottom: 0 }}>
          <select
            aria-label="구간"
            value={rangeSec}
            onChange={(e) => { setRangeSec(Number(e.target.value)); setPage(1); }}
          >
            {ALLOWED_ACTIVITY_RANGES.map((r) => (
              <option key={r} value={r}>{RANGE_LABEL[r]}</option>
            ))}
          </select>
          <a className="sqm-btn" href="/grafana/d/sqm-table-activity/" target="_blank" rel="noopener">
            Grafana 원본으로 열기 ↗
          </a>
        </div>
      </PageHead>

      <div className="sqm-grid sqm-grid--kpi5">
        <Kpi icon="▤" tone="green" label="TOTAL SELECTS" value={dash(totals.sel)} />
        <Kpi icon="✚" tone="orange" label="TOTAL INSERTS" value={dash(totals.ins)} />
        <Kpi icon="⇪" tone="blue" label="TOTAL COPYFROM" value={dash(totals.cpy)} />
        <Kpi icon="✖" tone="red" label="TOTAL DELETES" value={dash(totals.del)} />
        <Kpi icon="🕒" tone="blue" label="RECENT ACTIVITY"
          value={<span style={{ fontSize: 17 }}>{failed ? "--" : formatAgo(totals.recent)}</span>} />
      </div>

      <Card
        title="Table Query Frequency"
        aside={<>{`${RANGE_LABEL[rangeSec]} · access_type별`} <PinChip pinnedMs={pinnedMs} onClear={onClearPin} /></>}
        body={false}
      >
        <DrilldownChart onPickTime={onPickTime} pinnedMs={pinnedMs} series={seriesQ.focus} failed={seriesQ.failed}
          context={seriesQ.context} zoom={seriesQ.zoom} onZoom={seriesQ.setZoom} ariaLabel="Table Query Frequency" />
      </Card>

      <Card
        className="sqm-mt"
        title="Table Activity"
        aside={<>{failed ? "조회 실패" : `${rows.length} tables`} <SortReset sort={sort} /></>}
        body={false}
      >
        <div className="sqm-card__body">
          <Table
            head={[sort.th("table", "Table"), sort.th("sel", "SELECTs"),
              sort.th("ins", "INSERTs"), sort.th("cpy", "COPYFROMs"),
              sort.th("del", "DELETEs"), sort.th("lastAccess", "Last Access"),
              sort.th("sizeDelta", "Size Change"), "Trend"]}
            loading={!loaded && !failed}
            error={failed ? "테이블 활동 조회 실패 — Spring API에 연결할 수 없습니다." : undefined}
            empty={slice.length === 0 ? "활동 기록 없음" : undefined}
          >
            {slice.map((t) => (
              <tr key={tableKey({ db: t.db, schema: t.schema, table: t.table })}>
                <td>
                  <b>{t.table}</b>
                  {dupNames.has(t.table) && <span className="sqm-dim"> · {t.schema}</span>}
                </td>
                {/* 결측은 0 — 정적본은 "--"가 아니라 0을 그린다. */}
                <td>{formatInt(t.sel ?? 0)}</td>
                <td>{formatInt(t.ins ?? 0)}</td>
                <td>{formatInt(t.cpy ?? 0)}</td>
                <td>{formatInt(t.del ?? 0)}</td>
                <td>{formatAgo(t.lastAccess ?? NaN)}</td>
                <td>
                  {(() => {
                    const d = t.sizeDelta ?? 0;
                    return `${d >= 0 ? "+" : "−"}${formatBytes(Math.abs(d))}`;
                  })()}
                </td>
                <td><Sparkline points={t.trend} /></td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="sqm-pager">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p} type="button"
              className={`sqm-pager__btn ${p === current ? "sqm-pager__cur" : ""}`.trim()}
              aria-current={p === current ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          {current < pages && (
            <button type="button" className="sqm-pager__btn" onClick={() => setPage(current + 1)}>
              Next ›
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
