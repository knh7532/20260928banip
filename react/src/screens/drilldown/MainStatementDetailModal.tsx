import { useEffect, useState } from "react";
import {
  fetchMainStatementDetail,
  type MainStatementDetailDto,
} from "../../api/aiReactEchartDrilldownMainApi";

// ===== 20260908 추가 시작 : Main Dashboard Statement ID 상세 - Worker Log 차트와 동일한 SQL/실행계획 =====
export function MainStatementDetailModal({
  connectionId,
  statementId,
  onClose,
  initialTab = "sql",
}: {
  connectionId: string;
  statementId: string;
  onClose: () => void;
  initialTab?: "sql" | "plan";
}) {
  // ===== 20260908 추가 : 행 클릭=쿼리문, Statement ID 클릭=실행계획 기본 탭 =====
  const [tab, setTab] = useState<"sql" | "plan">(initialTab);
  const [data, setData] = useState<MainStatementDetailDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    setError("");
    void fetchMainStatementDetail(connectionId, statementId, ac.signal)
      .then(setData)
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "상세 조회 실패");
      });
    return () => ac.abort();
  }, [connectionId, statementId]);

  const copySql = async () => {
    if (!data?.sqlStatement) return;
    await navigator.clipboard?.writeText(data.sqlStatement);
  };

  return (
    <div className="sqm-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Statement ${statementId}`}>
      <div className="sqm-modal sqm-modal--wide">
        <h3>Statement <span style={{ color: "var(--accent)" }}>{statementId}</span></h3>

        <div className="sqm-tabs" role="tablist" aria-label="Statement 상세 탭">
          <button type="button" className="sqm-tab" aria-selected={tab === "sql"} onClick={() => setTab("sql")}>쿼리문</button>
          <button type="button" className="sqm-tab" aria-selected={tab === "plan"} onClick={() => setTab("plan")}>실행 계획</button>
        </div>

        {error ? <p className="sqm-bad">{error}</p> : !data ? <p className="sqm-dim">조회 중...</p> : null}

        {data && tab === "sql" && (
          <div>
            <div className="sqm-detail-head">
              <span className="sqm-dim">
                {(data.sqlType || "-")} · {(data.userId || "-")} · {(data.workerHostname || "-")} · {(data.queryTerminationStatus || "-")}
              </span>
              <button type="button" className="sqm-btn sqm-btn--tiny" onClick={() => void copySql()}>복사</button>
            </div>
            <pre className="sqm-main-statement-sql">{data.sqlStatement || "SQL Statement 데이터가 없습니다."}</pre>
          </div>
        )}

        {data && tab === "plan" && (
          <div className="sqm-main-plan-scroll">
            <table className="sqm-main-plan-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>연산자</th>
                  <th className="num">Rows</th>
                  <th className="num">Chunks</th>
                  <th className="num">Chunk Per Rows</th>
                  <th className="num">소요시간</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {(data.planSteps ?? []).length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center" }}>Query Plan 데이터가 없습니다.</td></tr>
                ) : (data.planSteps ?? []).map((step, i) => (
                  <tr key={`${step.step ?? i}-${i}`}>
                    <td>{step.step ?? "-"}</td>
                    <td>{step.planName || "-"}</td>
                    <td className="num">{step.rows ?? "-"}</td>
                    <td className="num">{step.chunks ?? "-"}</td>
                    <td className="num">{step.chunkPerRows ?? "-"}</td>
                    <td className="num">{step.planRuntime == null ? "-" : `${Number(step.planRuntime).toFixed(2)}s`}</td>
                    <td><span className="sqm-pill">{step.status || "-"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="sqm-modal__actions">
          <button type="button" className="sqm-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
// ===== 20260908 추가 끝 : Main Dashboard Statement ID 상세 - Worker Log 차트와 동일한 SQL/실행계획 =====
