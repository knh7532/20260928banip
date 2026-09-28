import { useState } from "react";

import { seriesColor } from "../../lib/colors";
import { axisLabel } from "../../lib/chartMeta";

// 20260916 추가: 소수점 첫째자리 + 정수부 3자리 콤마
const metricValue = (v: number): string => Number.isFinite(v) ? v.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "-";
import type { SeriesLine, TimeSeries } from "../../lib/series";
import { Panel } from "../Panel";
import { MetricChart } from "./MetricChart";
import { PanScrollbar } from "./PanScrollbar";

export interface TimeseriesBundle {
  utilization: TimeSeries;
  memory: TimeSeries;
  temperature: TimeSeries;
  power: TimeSeries;
}

/**
 * GPU 시계열 4종 — R7: Grafana판 미러.
 * 단일 패널(4서브차트)에서 **독립 카드 4개**(Grafana 제목 표기)로 분할하고,
 * 슬림 공유 범례를 마지막 카드 아래에 유지한다(Grafana는 범례 숨김 — 가독성 사유
 * 유지, ADR R-0006). 라인 = MIG 인스턴스(서버당 8선), 색은 물리 GPU 공유.
 */
/** 라인이 MIG 1번 인스턴스인지 — id는 "node/gpu/mig"(슬롯 라인) 또는 노드명(평균 라인). */
function isMig1(line: SeriesLine): boolean {
  return line.id.split("/")[2] === "1";
}

/** 차트를 그릴 데이터가 있는지 — MetricChart의 placeholder 분기와 동일 판정. */
function hasData(ts: TimeSeries): boolean {
  return ts.lines.length > 0 && ts.x.length > 0;
}

export function MetricStrip({
  series,
  emptyText,
  domain,
  pan,
  hint = "선택한 시간 범위의 GPU 지표 추이입니다. All 뷰는 서버(노드)별 평균 3선, 서버 선택 시 MIG 인스턴스별 라인입니다. 라인 색은 물리 GPU 번호, ·M0/M1은 MIG 인스턴스(M1은 점선)를 뜻합니다. 네 차트는 같은 시간축을 공유하며 시간 눈금은 맨 아래 차트에 표시됩니다. 상단 필터·시간 범위와 연동됩니다. 하단 스크롤바로 이전 시간대를 볼 수 있습니다.",
}: {
  series: TimeseriesBundle;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분 (R9 F7.2). */
  emptyText?: string;
  /** 요청 시간 구간 (R9.1 CDX) — 4장의 x도메인을 고정해 대표 축이 정확하게 한다. */
  domain?: { startMs: number; endMs: number };
  /** 시간 팬 (X4) — 3× 조회 전체와 표시 창 폭. 지정 시 하단 공유 스크롤바 1개가
   *  4카드를 **동기**로 움직인다(인간 지시). 미지정이면 현행과 동일(LLM 화면 회귀 0). */
  pan?: { panDomain: { startMs: number; endMs: number }; windowMs: number };
  /** 패널 도움말 (L3 — LLM 화면은 GPU 단위 문구로 교체, 기본값 = 현행). */
  hint?: string;
}) {
  // X4 팬 앵커 — null = 최신 추적(우측 끝), number = 과거 절대 시각 고정.
  const [anchorEndMs, setAnchorEndMs] = useState<number | null>(null);
  let effDomain = domain;
  if (pan && pan.panDomain.endMs > 0) {
    const end =
      anchorEndMs === null
        ? pan.panDomain.endMs
        : Math.min(
            Math.max(anchorEndMs, pan.panDomain.startMs + pan.windowMs),
            pan.panDomain.endMs,
          );
    effDomain = { startMs: end - pan.windowMs, endMs: end };
  }
  // 4개 번들의 라인 구성은 동일(같은 필터·같은 키)이므로 범례는 한 번만 그린다.
  const legendLines = series.utilization.lines;
  // R9.1(CDX): 시간축 대표는 "데이터가 있는 맨 아래 카드" — 전력 시리즈만 비어도
  // 위 차트들의 시간축까지 사라지지 않는다. 전부 비면 모두 placeholder라 축 자체가 없다.
  const stack = [series.utilization, series.memory, series.temperature, series.power];
  const axisIdx = stack.map(hasData).lastIndexOf(true);
  return (
    <div className="metric-stack">
      {/* R9.1: 축 대표가 아닌 카드는 시간축 숨김 — 같은 x도메인 스택이라 중복이고,
          숨기면 c3의 x축 세로 예약(30px)이 8px로 줄어 y 플롯이 그만큼 커진다. */}
      <Panel title="GPU사용률(%)" hint={hint} className="panel--metric">
        <div className="metric-chart-body">
          <MetricChart
            data={series.utilization}
            yMax={100}
            yFormat={metricValue}
            emptyText={emptyText}
            domain={effDomain}
            hideXAxis={axisIdx !== 0}
            syncGroup="metric-strip"
          />
        </div>
      </Panel>
      <Panel title="메모리사용률(%)" className="panel--metric">
        <div className="metric-chart-body">
          <MetricChart
            data={series.memory}
            yMax={100}
            yFormat={metricValue}
            emptyText={emptyText}
            domain={effDomain}
            hideXAxis={axisIdx !== 1}
            syncGroup="metric-strip"
          />
        </div>
      </Panel>
      <Panel title="온도(°C)" className="panel--metric">
        <div className="metric-chart-body">
          <MetricChart
            data={series.temperature}
            yFormat={metricValue}
            emptyText={emptyText}
            domain={effDomain}
            hideXAxis={axisIdx !== 2}
            syncGroup="metric-strip"
          />
        </div>
      </Panel>
      <Panel title="전력사용량(W)" className="panel--metric">
        <div className={`metric-chart-body ${legendLines.length > 0 ? "metric-chart-body--with-legend" : ""}`}>
          <MetricChart
            data={series.power}
            yFormat={metricValue}
            emptyText={emptyText}
            domain={effDomain}
            hideXAxis={axisIdx !== 3}
            syncGroup="metric-strip"
          />
          {legendLines.length > 0 && (
            <ul className="metric-strip__legend" aria-label="GPU 범례">
              {legendLines.map((l) => (
                <li key={l.id}>
                  {/* R9(F4.2): M1 스와치는 점선 — 차트의 stroke-dasharray와 짝 */}
                  <span
                    className={`metric-strip__line ${isMig1(l) ? "metric-strip__line--dashed" : ""}`.trimEnd()}
                    style={
                      isMig1(l)
                        ? { borderColor: seriesColor(l.colorKey) }
                        : { background: seriesColor(l.colorKey) }
                    }
                  />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      {pan && pan.panDomain.endMs > 0 && (
        <PanScrollbar
          panStartMs={pan.panDomain.startMs}
          panEndMs={pan.panDomain.endMs}
          windowMs={pan.windowMs}
          anchorEndMs={anchorEndMs}
          onPan={setAnchorEndMs}
          ariaLabel="GPU 시계열 과거 구간 스크롤 (4카드 동기)"
        />
      )}
    </div>
  );
}
