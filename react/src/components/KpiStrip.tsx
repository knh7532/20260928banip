import type { KpiData } from "../hooks/useDashboardData";
import { formatInt, formatRowsPerSec, formatSeconds } from "../lib/format";

/**
 * KPI 스트립 (R9 F1.1) — 운영자가 화면에 진입해 3초 안에 이상 유무를 판단할 요약 4타일.
 * 활성 MIG(n / 분모)·In Queue(>0이면 경고 강조)·총 처리행수·평균 P95.
 * 결측(연결 끊김·데이터 없음)은 "-" — 훅이 공란 리셋을 담당한다 (R7 C-4).
 */
export function KpiStrip({ kpi }: { kpi: KpiData }) {
  const queueAlert = Number.isFinite(kpi.inQueue) && kpi.inQueue > 0;
  return (
    <section className="dashboard-kpi" aria-label="요약 지표">
      <div className="kpi-tile">
        <div className="kpi-tile__label">활성 MIG</div>
        <div className="kpi-tile__value">
          {formatInt(kpi.migActive)}
          <span className="kpi-tile__denom"> / {formatInt(kpi.migTotal)}</span>
        </div>
      </div>
      {/* CDX-R9: sqm_query_state에 위치 라벨이 없어 인스턴스/GPU 필터 미적용 — 전역임을 명시 */}
      <div className={`kpi-tile ${queueAlert ? "kpi-tile--alert" : ""}`.trimEnd()}>
        <div className="kpi-tile__label">In Queue (환경 전체)</div>
        <div className="kpi-tile__value">{formatInt(kpi.inQueue)}</div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-tile__label">총 처리행수/초</div>
        <div className="kpi-tile__value">{formatRowsPerSec(kpi.rowsPerSecond)}</div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-tile__label">평균 P95 응답</div>
        <div className="kpi-tile__value">{formatSeconds(kpi.p95Seconds)}</div>
      </div>
    </section>
  );
}
