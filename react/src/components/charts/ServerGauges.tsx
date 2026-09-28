import { GAUGE_METRICS } from "../../lib/chartMeta";
import { formatInt } from "../../lib/format";
import { Gauge } from "./Gauge";
import type { MetricServerSummary } from "../../hooks/useCharts";

// 20260916 추가: hostname별 평균 카드. All이면 hostname 수만큼 세로 카드가 생성된다.
export function ServerGauges({ servers }: { servers: MetricServerSummary[] }) {
  const one=(v:number)=>Number.isFinite(v)?v.toLocaleString("ko-KR",{minimumFractionDigits:1,maximumFractionDigits:1}):"-";
  if (!servers.length) return <div className="server-gauges"><div className="gauge-card"><div className="gauge-card__name">-</div><div className="gauge-card__sub">- GPU · - Worker</div></div></div>;
  return <div className="server-gauges">
    {servers.map(s=><div className="gauge-card" key={s.node}>
      <div className="gauge-card__name">{s.node}</div>
      <div className="gauge-card__sub">{formatInt(s.gpuTotal)} GPU · {formatInt(s.workerTotal)} Worker</div>
      <div className="gauge-card__stack">
        {GAUGE_METRICS.map(m=><Gauge key={m.key} label={m.key === "power" ? "전력사용(평균)" : m.label} value={s[m.key]} min={m.min} max={m.max} colors={m.colors} thresholds={m.thresholds} format={m.fmt}/>)}
      </div>
      <div className="gauge-card__sub">Memory {one(s.memoryUsedGb)} / {one(s.memoryTotalGb)} GB</div>
    </div>)}
  </div>;
}
