import { LLM_SERVICE_STATE_LABEL } from "../../api/queries";
import type { LlmServiceRow } from "../../hooks/useLlmData";
import { formatGpu, formatSeconds, formatTps } from "../../lib/format";
import { Panel } from "../Panel";

/** llm_service_state 값 → 배지 클래스 (RUNNING 초록 / STARTING 주황 / STOPPED 빨강). */
function stateClass(state: number): string {
  if (state === 1) return "state--run";
  if (state === 2) return "state--queue";
  return "state--down";
}

/** ⑧ LLM / AI 서비스 정보 테이블 (service 조인). */
export function LlmServices({
  rows,
  titleSuffix,
  emptyText = "표시할 서비스가 없습니다",
}: {
  rows: LlmServiceRow[];
  /** 패널 제목 접미사 ("(선택 인스턴스: …)"). */
  titleSuffix?: string;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분. */
  emptyText?: string;
}) {
  return (
    <Panel
      title={`LLM / AI 서비스 정보 ${titleSuffix ?? ""}`.trimEnd()}
      hint="LLM/AI 서비스별 처리량(토큰/초)·지연·상태입니다. STARTING은 서비스 재시작 창으로, 이 동안 TPS는 0입니다."
      className="panel--perf"
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>서비스명</th>
              <th>모델</th>
              <th>엔진</th>
              <th>GPU</th>
              <th className="num">TPS</th>
              <th className="num">지연(P95)</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.service}>
                  <td className="mono">{r.service}</td>
                  <td className="mono">{r.model}</td>
                  <td>{r.engine}</td>
                  <td>{formatGpu(r.gpu)}</td>
                  <td className="num">{formatTps(r.tps)}</td>
                  <td className="num">{formatSeconds(r.p95Seconds)}</td>
                  <td>
                    <span className={`state-badge ${stateClass(r.state)}`}>
                      {LLM_SERVICE_STATE_LABEL[r.state] ?? "-"}
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
