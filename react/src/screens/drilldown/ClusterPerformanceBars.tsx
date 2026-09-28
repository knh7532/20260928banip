// ===== 20260928 추가 시작 : /main Cluster Performance 막대 + Node Resource 실시간 꺾은선 단일 그래프 =====
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { MainPerformancePointDto } from "../../api/aiReactEchartDrilldownMainApi";
import { useEchart } from "../../hooks/useEchart";

interface Props {
  rows: MainPerformancePointDto[];
  resourceRows?: MainPerformancePointDto[];
  failed?: boolean;
  onPickTime?: (ms: number) => void;
}

const COLORS = { gpu: "#5b8def", cpu: "#82c65b", ram: "#a47df0", disk: "#39b8c8" } as const;

export function ClusterPerformanceBars({ rows, resourceRows = [], failed = false, onPickTime }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPickTime);
  pickRef.current = onPickTime;

  // 20260928 추가 : 실행중 Query 막대는 현재 polling 응답만 사용한다.
  const bars = useMemo(() => {
    const current = Array.isArray(rows) ? rows : [];
    const max = (key: keyof MainPerformancePointDto) => {
      const values = current.map((r) => Number(r[key])).filter(Number.isFinite);
      return values.length ? Math.max(...values) : 0;
    };
    if (!current.length) return null;
    const ms = Math.max(...current.map((r) => new Date(r.collectTime).getTime()).filter(Number.isFinite));
    return { ms, gpu: max("gpuUsagePercent"), cpu: max("cpuUsagePercent"), ram: max("ramUsagePercent"), disk: max("diskUsagePercent") };
  }, [rows]);

  // 20260928 추가 : Query와 무관한 Node Resource는 collect_time별 평균으로 최근 30분 시계열 표시.
  const lines = useMemo(() => {
    const buckets = new Map<number, MainPerformancePointDto[]>();
    for (const r of Array.isArray(resourceRows) ? resourceRows : []) {
      const ms = new Date(r.collectTime).getTime();
      if (!Number.isFinite(ms)) continue;
      buckets.set(ms, [...(buckets.get(ms) ?? []), r]);
    }
    const avg = (list: MainPerformancePointDto[], key: keyof MainPerformancePointDto) => {
      const v = list.map((r) => Number(r[key])).filter(Number.isFinite);
      return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null;
    };
    return [...buckets.entries()].sort((a,b) => a[0]-b[0]).map(([ms,list]) => ({
      ms, gpu: avg(list,"gpuUsagePercent"), cpu: avg(list,"cpuUsagePercent"),
      ram: avg(list,"ramUsagePercent"), disk: avg(list,"diskUsagePercent"),
    }));
  }, [resourceRows]);

  const option = useMemo<echarts.EChartsOption>(() => {
    const line = (name:string, key:"gpu"|"cpu"|"ram"|"disk") => ({
      name: `${name} 실시간`, type: "line" as const, showSymbol: false, smooth: false,
      lineStyle: { width: 2, color: COLORS[key] }, itemStyle: { color: COLORS[key] },
      data: lines.map((d) => [d.ms, d[key]]), connectNulls: true, z: 3,
    });
    const bar = (name:string, key:"gpu"|"cpu"|"ram"|"disk") => ({
      name: `${name} Query`, type: "bar" as const, barWidth: 13,
      itemStyle: { color: COLORS[key], opacity: .72 },
      data: bars ? [[bars.ms, bars[key]]] : [], z: 5,
    });
    const now = Date.now();
    const dataMin = lines.length ? lines[0].ms : now - 30*60*1000;
    const dataMax = lines.length ? lines[lines.length-1].ms : now;
    return {
      animation: false,
      grid: { left: 52, right: 20, top: 58, bottom: 48 },
      legend: { top: 8, type: "scroll", textStyle: { color: "#dbe6f5", fontSize: 11 } },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      xAxis: { type: "time", min: dataMin, max: Math.max(dataMax, bars?.ms ?? dataMax), axisLabel: { color: "#7e93b4" }, axisLine: { lineStyle: { color: "#22385c" } } },
      yAxis: { type: "value", min: 0, max: 100, interval: 25, axisLabel: { color: "#7e93b4", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(34,56,92,.55)" } } },
      series: [line("GPU","gpu"),line("CPU","cpu"),line("RAM","ram"),line("Disk","disk"),bar("GPU","gpu"),bar("CPU","cpu"),bar("RAM","ram"),bar("Disk","disk")],
    };
  }, [bars, lines]);

  const chart = useEchart(host, { onInit: (c) => c.setOption(option) });
  useEffect(() => { chart.current?.setOption(option, true); }, [chart, option]);
  useEffect(() => {
    const c = chart.current; if (!c) return;
    const handler = (p: echarts.ECElementEvent) => {
      if (typeof p.seriesName === "string" && p.seriesName.endsWith(" Query") && bars) pickRef.current?.(bars.ms);
    };
    c.on("click", handler); return () => { c.off("click", handler); };
  }, [chart, bars]);

  return (
    <div className="sqm-cluster-bars-wrap">
      <div ref={host} className="sqm-cluster-bars" role="img" aria-label="Cluster Performance 현재 Query 막대와 Node Resource 실시간 꺾은선" />
      {failed ? <div className="sqm-cluster-bars-overlay">⚠ Cluster Performance 조회 실패</div>
        : !bars && !lines.length ? <div className="sqm-cluster-bars-overlay">실행 중 Query / Node Resource 데이터 없음</div> : null}
    </div>
  );
}
// ===== 20260928 추가 끝 : /main Cluster Performance 막대 + Node Resource 실시간 꺾은선 단일 그래프 =====
