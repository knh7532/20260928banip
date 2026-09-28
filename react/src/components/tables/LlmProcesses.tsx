import type { LlmProcessRow } from "../../hooks/useLlmData";
import { formatClock, formatGB, formatGpu, formatPercent } from "../../lib/format";
import { Panel } from "../Panel";

/** ⑦ 실행 중인 프로세스 테이블 (LLM 화면 — pid 조인, RunningQueries 구조 미러). */
export function LlmProcesses({
  rows,
  titleSuffix,
  emptyText = "실행 중인 프로세스가 없습니다",
}: {
  rows: LlmProcessRow[];
  /** 패널 제목 접미사 ("(선택 인스턴스: …)"). */
  titleSuffix?: string;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분. */
  emptyText?: string;
}) {
  return (
    <Panel
      title={`실행 중인 프로세스 ${titleSuffix ?? ""}`.trimEnd()}
      hint="현재 GPU에서 실행 중인 LLM/AI 프로세스 목록입니다. CPU사용률은 멀티코어 합산이라 100%를 넘을 수 있습니다. 상단 필터의 인스턴스/GPU 선택과 연동됩니다."
      className="panel--running"
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>GPU</th>
              <th>PID</th>
              <th>프로세스명</th>
              <th className="num">사용메모리</th>
              <th className="num">GPU사용률</th>
              <th className="num">CPU사용률</th>
              <th>시작시간</th>
              <th>사용자</th>
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
                // 복합 key — pid는 (슬롯×워크로드) 고정이라 유일하지만 규칙을 통일한다
                <tr key={`${r.node}/${r.gpu}/${r.pid}`}>
                  <td>{formatGpu(r.gpu)}</td>
                  <td className="mono">{r.pid}</td>
                  <td className="mono">{r.procName}</td>
                  <td className="num">{formatGB(r.memoryBytes)}</td>
                  <td className="num">
                    <GaugeCell value={r.gpuPct} />
                  </td>
                  <td className="num">{formatPercent(r.cpuPct)}</td>
                  <td className="mono">{formatClock(r.startTimeSec)}</td>
                  <td>{r.user}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** GPU 사용률 셀 — 막대 + 값 (RunningQueries와 동일 표현). */
function GaugeCell({ value }: { value: number }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <span className="gauge-cell">
      <span className="gauge-cell__bar" style={{ width: `${pct}%` }} />
      <span className="gauge-cell__text">{formatPercent(value)}</span>
    </span>
  );
}
