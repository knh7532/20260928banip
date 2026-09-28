// ===== 20260908 추가 시작 : Prometheus 제거 - Query/Log/Session/TableActivity 직접 REST API =====
import { runtimeOverride } from "../runtimeConfig";

function baseUrl(): string {
  const configured = (runtimeOverride("portalApiUrl") ?? import.meta.env.VITE_PORTAL_API_BASE ?? "").trim();
  return configured.replace(/\/$/, "");
}
function fmt(ms: number): string {
  const d = new Date(ms); const p = (n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
async function get<T>(path:string,startMs:number,endMs:number,hostname:string,signal?:AbortSignal):Promise<T>{
  const q=new URLSearchParams({startTime:fmt(startMs),endTime:fmt(endMs)});
  if(hostname)q.set("hostname",hostname);
  const res=await fetch(`${baseUrl()}/api/aireactechartdashboard/${path}/overview?${q}`,{signal,credentials:"include"});
  if(!res.ok)throw new Error(`${path} Dashboard API HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface QueryOverviewDto {
  summary: Record<string, unknown>;
  queries: Array<Record<string, unknown>>;
}
export interface LogOverviewDto {
  summary: Record<string, unknown>;
  timeline: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
}
export interface SessionOverviewDto {
  summary: Record<string, unknown>;
  sessions: Array<Record<string, unknown>>;
}
export interface TableActivityOverviewDto {
  summary: Record<string, unknown>;
  timeline: Array<Record<string, unknown>>;
  tables: Array<Record<string, unknown>>;
}

export const fetchQueryOverview=(s:number,e:number,h:string,signal?:AbortSignal)=>get<QueryOverviewDto>("query",s,e,h,signal);
export const fetchLogOverview=(s:number,e:number,h:string,signal?:AbortSignal)=>get<LogOverviewDto>("log",s,e,h,signal);
export const fetchSessionOverview=(s:number,e:number,h:string,signal?:AbortSignal)=>get<SessionOverviewDto>("session",s,e,h,signal);
export const fetchTableActivityOverview=(s:number,e:number,h:string,signal?:AbortSignal)=>get<TableActivityOverviewDto>("activity",s,e,h,signal);
// ===== 20260908 추가 끝 : Prometheus 제거 - Query/Log/Session/TableActivity 직접 REST API =====
