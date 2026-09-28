// ===== 20260928 추가 시작 : /logs 시간대별 꺾은선 + 세로 KPI + 전체 페이징 =====
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { Card, Kpi, Pill, Table, type PillTone } from "../../../components/drilldown/primitives";
import { usePolling } from "../../../hooks/usePolling";
import { useEchart } from "../../../hooks/useEchart";
import type { DrilldownScreenProps } from "../../DrilldownDashboard";
import { formatInt } from "../../../lib/format";
import { PageHead } from "../../../components/drilldown/PageHead";
import { fetchLogMonitoring, type LogMonitoringResponse } from "./logMonitoringApi";

const ZERO:LogMonitoringResponse={totalEntries:0,errors:0,warnings:0,info:0,totalElements:0,page:0,size:20,totalPages:0,distribution:[],logs:[]};
const TONE:Record<string,PillTone>={ERROR:"red",WARNING:"yellow",INFO:"green"};

function LogLevelLineChart({data}:{data:LogMonitoringResponse["distribution"]}){
 const ref=useRef<HTMLDivElement>(null);
 const option=useMemo<echarts.EChartsOption>(()=>({
  animation:false, grid:{left:55,right:24,top:55,bottom:45},
  legend:{top:12,textStyle:{color:"#c8d5e6"}}, tooltip:{trigger:"axis"},
  xAxis:{type:"time",axisLabel:{color:"#8298b8"},splitLine:{show:false}},
  yAxis:{type:"value",min:0,minInterval:1,axisLabel:{color:"#8298b8"},splitLine:{lineStyle:{color:"rgba(130,152,184,.18)"}}},
  series:[
   {name:"ERROR",type:"line",smooth:true,showSymbol:true,symbolSize:6,data:data.map(x=>[new Date(x.time).getTime(),x.errors])},
   {name:"WARNING",type:"line",smooth:true,showSymbol:true,symbolSize:6,data:data.map(x=>[new Date(x.time).getTime(),x.warnings])},
   {name:"INFO",type:"line",smooth:true,showSymbol:true,symbolSize:6,data:data.map(x=>[new Date(x.time).getTime(),x.info])}
  ]
 }),[data]);
 const chart=useEchart(ref,{onInit:c=>c.setOption(option)});
 useEffect(()=>{chart.current?.setOption(option,true);chart.current?.resize()},[chart,option]);
 return <div ref={ref} className="sqm-log-line-chart-20260928"/>;
}

export function LogMonitoring({refreshMs,filters,title}:DrilldownScreenProps){
 const [data,setData]=useState<LogMonitoringResponse>(ZERO),[failed,setFailed]=useState(false);
 const [level,setLevel]=useState(""),[worker,setWorker]=useState(""),[search,setSearch]=useState("");
 const [page,setPage]=useState(0),[size,setSize]=useState(20);
 const end=filters.endMs??Date.now(), start=end-filters.rangeSec*1000;
 useEffect(()=>setPage(0),[filters.server,filters.rangeSec,filters.endMs,level,worker,search,size]);
 usePolling(async signal=>{try{setData(await fetchLogMonitoring(start,end,filters.server,worker,level,search,page,size,signal));setFailed(false)}catch(e){setFailed(true);throw e}},refreshMs,[refreshMs,filters.server,filters.rangeSec,filters.endMs,worker,level,search,page,size]);
 const dash=(n:number)=>failed?"--":formatInt(n);
 return <div className="sqm-page"><PageHead title={title}/>
  <div className="sqm-log-layout-20260928">
   <div className="sqm-log-kpis-20260928">
    <Kpi icon="📄" tone="blue" label="TOTAL LOG ENTRIES" value={dash(data.totalEntries)}/>
    <Kpi icon="⚠" tone="red" label="ERRORS" value={dash(data.errors)}/>
    <Kpi icon="⚠" tone="orange" label="WARNINGS" value={dash(data.warnings)}/>
    <Kpi icon="ℹ" tone="green" label="INFO" value={dash(data.info)}/>
   </div>
   <Card title="Log Level Distribution" aside={`조회구간 ${Math.round(filters.rangeSec/60)} min`}>
    {failed?<div className="sqm-empty">차트 조회 실패 — Spring API 연결을 확인하세요.</div>:<LogLevelLineChart data={data.distribution??[]}/>} 
   </Card>
  </div>
  <Card className="sqm-mt" title="Recent Logs" aside={`총 ${formatInt(data.totalElements)}건`} body={false}>
   <div className="sqm-card__body"><div className="sqm-filters">
    <select value={level} onChange={e=>setLevel(e.target.value)}><option value="">Error, Warning, Info</option><option value="ERROR">Error</option><option value="WARNING">Warning</option><option value="INFO">Info</option></select>
    <select value={worker} onChange={e=>setWorker(e.target.value)}><option value="">All Workers</option></select>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search logs..."/>
    <button className="sqm-btn" onClick={()=>{setLevel("");setWorker("");setSearch("")}}>CLEAR FILTERS</button>
   </div>
   <Table head={["Timestamp","Node","Worker","Type","Level","Statement ID","Connection ID","Message"]} error={failed?"로그 조회 실패 — Spring API 연결을 확인하세요.":undefined} empty={!failed&&data.logs.length===0?"조회 조건의 로그가 없습니다.":undefined}>
    {data.logs.map((r,i)=><tr key={`${r.timestamp}-${r.statementId}-${i}`}><td>{r.timestamp?.replace("T"," ")}</td><td>{r.hostname??"-"}</td><td>{r.worker??"-"}</td><td>{r.messageTypeId??"-"}</td><td><Pill tone={TONE[r.level]??"grey"}>{r.level}</Pill></td><td>{r.statementId??"-"}</td><td>{r.connectionId??"-"}</td><td>{r.message??"-"}</td></tr>)}
   </Table></div>
   <div className="sqm-log-pager-20260928"><span>총 {formatInt(data.totalElements)}건</span><select value={size} onChange={e=>setSize(Number(e.target.value))}>{[10,20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select><button disabled={page<=0} onClick={()=>setPage(p=>Math.max(0,p-1))}>이전</button><b>{data.totalPages===0?0:page+1} / {data.totalPages}</b><button disabled={page+1>=data.totalPages} onClick={()=>setPage(p=>p+1)}>다음</button></div>
  </Card>
 </div>
}
// ===== 20260928 추가 끝 =====
