import type { PerformanceRow } from "../../hooks/useDashboardData";
import { QUERY_STATE_LABEL, QUERY_TYPE_LABEL } from "../../api/queries";
import {
  displayNode,
  formatRowsPerSec,
  formatSeconds,
  workerName,
} from "../../lib/format";
import { Panel } from "../Panel";

const STATE_CLASS: Record<number, string> = {
  0: "state--init",
  1: "state--run",
  2: "state--queue",
};

/** ② SQL 쿼리 성능 정보 테이블. */
export function QueryPerformance({
  rows,
  titleSuffix,
  emptyText = "표시할 쿼리가 없습니다",
}: {
  rows: PerformanceRow[];
  /** 패널 제목 접미사 (R6 — "(선택 인스턴스: …)"). */
  titleSuffix?: string;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분 (R9 F7.2). */
  emptyText?: string;
}) {
  return (
    <Panel
      title={`SQL 쿼리 성능 정보 ${titleSuffix ?? ""}`.trimEnd()}
      hint="쿼리별 처리량(행/초)·응답시간·상태입니다. P95는 요청의 95%가 이 시간 안에 처리됨을 뜻합니다. 상태: Initializing(준비), In Queue(큐 대기), In Process(실행 중)."
      className="panel--performance"
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>쿼리명</th>
              <th>유형</th>
              <th>데이터베이스</th>
              <th>Node</th>
              {/* R9(F5.1): 어느 MIG 인스턴스인지 — Grafana판 테이블과 일관 */}
              <th>Worker</th>
              <th className="num">처리행수/초</th>
              <th className="num">응답(P95)</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                // 복합 key — 같은 query_name이 여러 GPU에 걸쳐도 행이 뒤섞이지 않도록 (CDX-R3-04)
                // R9(F5.2): In Queue 행 틴트 — rows/s 정렬 최하단에 밀려도 눈에 띄게
                <tr
                  key={`${r.node}/${r.gpu}/${r.mig}/${r.queryName}`}
                  className={r.state === 2 ? "row--queue" : undefined}
                >
                  <td>{r.queryName}</td>
                  <td>{QUERY_TYPE_LABEL[r.queryType] ?? r.queryType}</td>
                  <td className="mono">{r.database}</td>
                  <td>{displayNode(r.node)}</td>
                  {/* CDX-R9: 대기·유휴 행의 mig 라벨은 이전/기본 슬롯 잔재 — In Process만 표시 */}
                  <td>{r.state === 1 ? workerName(r.node, r.gpu, r.mig) : "-"}</td>
                  <td className="num">{formatRowsPerSec(r.rowsPerSecond)}</td>
                  <td className="num">{formatSeconds(r.p95Seconds)}</td>
                  <td>
                    <span className={`state-badge ${STATE_CLASS[r.state] ?? ""}`}>
                      {QUERY_STATE_LABEL[r.state] ?? "-"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
