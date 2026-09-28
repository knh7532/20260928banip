import { useCallback, useEffect, useRef, useState } from "react";
import type { Filters } from "../api/queries";
import { fetchRealMetrics, type RealMetricPointDto, type RealMetricServerDto } from "../api/realMetricApi";
import { fetchMainCharts, type MainQueryTimelineDto } from "../api/aiReactEchartMainApi";
import type { TimeseriesBundle } from "../components/charts/MetricStrip";
import type { TimeSeries, SeriesLine } from "../lib/series";
import type { TimelineRow } from "../lib/timeline";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

const EMPTY_TS: TimeSeries = { x: [], lines: [] };
const EMPTY_BUNDLE: TimeseriesBundle = { utilization: EMPTY_TS, memory: EMPTY_TS, temperature: EMPTY_TS, power: EMPTY_TS };
export const PAN_FACTOR = 3;

// 20260916 추가: 우측 서버 카드용 실측 평균
export interface MetricServerSummary {
  node: string; gpuTotal: number; workerTotal: number;
  utilization: number; memoryPct: number; memoryUsedGb: number; memoryTotalGb: number;
  temperature: number; power: number;
}
export interface ChartsData {
  series: TimeseriesBundle; timelineRows: TimelineRow[]; servers: MetricServerSummary[];
  domain: { startMs:number; endMs:number }; panDomain:{startMs:number;endMs:number};
}

type Getter = (p: RealMetricPointDto) => number;
function nodeColorKey(host: string): string {
  // 20260916 추가: 같은 hostname의 실선/평균 점선은 같은 색 사용
  const m = /(\d+)$/.exec(host); return m ? String((Number(m[1]) - 1) % 4) : "0";
}
function buildSeries(points: RealMetricPointDto[], servers: RealMetricServerDto[], getter: Getter, serverGetter:(s:RealMetricServerDto)=>number): TimeSeries {
  const x = [...new Set(points.map(p => Date.parse(p.collectTime)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const xi = new Map(x.map((t,i)=>[t,i]));
  const groups = new Map<string, RealMetricPointDto[]>();
  for (const p of points) { const k=`${p.hostname}/${p.gpuId}`; const a=groups.get(k)??[]; a.push(p); groups.set(k,a); }
  const lines: SeriesLine[] = [];
  for (const [id, rows] of groups) {
    const values:Array<number|null>=Array(x.length).fill(null);
    for (const p of rows) { const i=xi.get(Date.parse(p.collectTime)); if(i!==undefined){const v=getter(p); values[i]=Number.isFinite(v)?v:null;} }
    const first=rows[0];
    // 20260916 추가: tooltip/범례 = Node(서버).Worker. GI 2개 평균이면 두 worker명을 '/'로 함께 표시
    lines.push({ id, label:`${first.hostname}.${first.worker}`, colorKey:nodeColorKey(first.hostname), values });
  }
  // 20260916 추가: hostname 조회구간 평균을 같은 색 점선으로 표시
  for (const s of servers) {
    const v=serverGetter(s); if(!Number.isFinite(v)) continue;
    lines.push({ id:`${s.hostname}/average`, label:`${s.hostname}.평균`, colorKey:nodeColorKey(s.hostname), values:x.map(()=>v), dashed:true, average:true });
  }
  return { x, lines: lines.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})) };
}


// ===== 20260916 추가 시작 : Worker Log service_name -> 기존 6종 범례 매핑 =====
function serviceType(serviceName: string | undefined): string {
  const v=(serviceName??"").trim().toLowerCase();
  if(v.includes("full") && v.includes("scan")) return "fullscan";
  if(v.includes("join")) return "join";
  if(v.includes("etl") || v.includes("load") || v.includes("insert") || v.includes("update") || v.includes("delete")) return "etl";
  if(v.includes("agg") || v.includes("group") || v.includes("aggregation")) return "aggregation";
  if(v.includes("select") || v.includes("query") || v.includes("read")) return "select";
  return "other";
}
function buildTimeline(rows: MainQueryTimelineDto[]): TimelineRow[] {
  const map=new Map<string,TimelineRow>();
  for(const r of rows){
    // ===== 20260925 추가 시작 : Worker Log Timeline은 hostname 기준 =====
    // worker_log의 gpu_id/gi_id 유무와 무관하게 hostname만으로 행을 구성한다.
    const node=r.hostname??""; const gpu=""; const mig="";
    const a=Date.parse(r.queryStart??""); const b=Date.parse(r.queryEnd??"");
    if(!node || !Number.isFinite(a) || !Number.isFinite(b) || b<=a) continue;
    const key=node;
    const row=map.get(key)??{node,gpu,mig,key,segments:[]};
    // ===== 20260925 추가 끝 : Worker Log Timeline은 hostname 기준 =====
    const service=(r.serviceName??"기타").trim()||"기타";
    const execMs = r.queryExecutionTimeMs != null ? Number(r.queryExecutionTimeMs) : (r.executionTimeSec != null ? Number(r.executionTimeSec) * 1000 : 0);
    row.segments.push({node,gpu,mig,startMs:a,endMs:b,value:0,name:service,type:serviceType(service),serviceName:service,executionTimeMs:Number.isFinite(execMs)?execMs:0});
    map.set(key,row);
  }
  return [...map.values()].map(r=>({...r,segments:r.segments.sort((a,b)=>a.startMs-b.startMs)})).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
}
// ===== 20260916 추가 끝 : Worker Log service_name -> 기존 6종 범례 매핑 =====
export function useCharts(filters:Filters, rangeSec:number, _refreshSec:number, selectedStartMs:number|null, selectedEndMs:number|null) {
  const [data,setData]=useState<ChartsData>({series:EMPTY_BUNDLE,timelineRows:[],servers:[],domain:{startMs:0,endMs:0},panDomain:{startMs:0,endMs:0}});
  const ref=useRef({filters,rangeSec,selectedStartMs,selectedEndMs}); ref.current={filters,rangeSec,selectedStartMs,selectedEndMs};
  const tick=useCallback(async(signal:AbortSignal)=>{
    const {filters:f,rangeSec:rs,selectedStartMs:ss,selectedEndMs:se}=ref.current;
    // 20260916 추가: 현재시간 - 시간범위. GPU 테이블 snapshot_time(수집시각) 기준
    const endMs=se ?? Math.floor(Date.now()/1000)*1000; const visibleStartMs=ss ?? endMs-rs*1000;
    const startMs=ss ?? endMs-rs*PAN_FACTOR*1000;
    // ===== 20260916 추가 시작 : GPU 실측 + Worker Log 타임라인 동시 조회 =====
    const [body, mainCharts]=await Promise.all([
      fetchRealMetrics(startMs,endMs,{instances:f.instances,gpus:f.gpus,migs:f.migs},signal),
      fetchMainCharts(startMs,endMs,{instances:f.instances,gpus:f.gpus,migs:f.migs},signal),
    ]);
    const pts=body.points??[], sv=body.servers??[];
    // ===== 20260916 추가 끝 : GPU 실측 + Worker Log 타임라인 동시 조회 =====
    const n=(v:number|null|undefined)=>v==null?Number.NaN:Number(v);
    setData({
      series:{
        utilization:buildSeries(pts,sv,p=>n(p.gpuUtilPercent),s=>n(s.gpuUtilPercent)),
        memory:buildSeries(pts,sv,p=>n(p.memoryPct),s=>n(s.memoryPct)),
        temperature:buildSeries(pts,sv,p=>n(p.temperatureC),s=>n(s.temperatureC)),
        power:buildSeries(pts,sv,p=>n(p.powerUsageW),s=>n(s.powerUsageW)),
      }, timelineRows:buildTimeline(mainCharts.queryTimeline??[]),
      servers:sv.map(s=>({node:s.hostname,gpuTotal:s.gpuCount,workerTotal:s.workerCount,utilization:n(s.gpuUtilPercent),memoryPct:n(s.memoryPct),memoryUsedGb:n(s.memoryUsedGb),memoryTotalGb:n(s.memoryTotalGb),temperature:n(s.temperatureC),power:n(s.powerUsageW)})),
      domain:{startMs:visibleStartMs,endMs},panDomain:{startMs,endMs}
    });
  },[]);
  const {failStreak,lastSuccessAt}=usePolling(tick,0,[filters.env,filters.instances.join(","),filters.gpus.join(","),filters.migs.join(","),rangeSec,selectedStartMs,selectedEndMs]);
  useEffect(()=>{if(failStreak>=DISCONNECT_THRESHOLD)setData({series:EMPTY_BUNDLE,timelineRows:[],servers:[],domain:{startMs:0,endMs:0},panDomain:{startMs:0,endMs:0}})},[failStreak]);
  return {data,failStreak,lastSuccessAt};
}
