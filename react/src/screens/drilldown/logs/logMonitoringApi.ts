// ===== 20260928 추가 시작 : Log Monitoring 화면 전용 API =====
import { runtimeOverride } from "../../../runtimeConfig";
export interface LogRow { timestamp:string; hostname:string|null; worker:string|null; level:string; messageTypeId:number|null; message:string|null; statementId:number|null; connectionId:number|null; }
export interface LogDistributionPoint { time:string; errors:number; warnings:number; info:number; }
export interface LogMonitoringResponse { totalEntries:number; errors:number; warnings:number; info:number; totalElements:number; page:number; size:number; totalPages:number; distribution:LogDistributionPoint[]; logs:LogRow[]; }
const base=()=>((runtimeOverride("portalApiUrl")??import.meta.env.VITE_PORTAL_API_BASE??"") as string).trim().replace(/\/$/,"");
const fmt=(ms:number)=>{const d=new Date(ms),p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};
export async function fetchLogMonitoring(startMs:number,endMs:number,hostname:string,worker:string,level:string,search:string,page:number,size:number,signal?:AbortSignal){const q=new URLSearchParams({startTime:fmt(startMs),endTime:fmt(endMs),page:String(page),size:String(size)});if(hostname)q.set("hostname",hostname);if(worker)q.set("worker",worker);if(level)q.set("level",level);if(search)q.set("search",search);const r=await fetch(`${base()}/api/aireactechartdashboard/query/logs?${q}`,{signal,credentials:"include"});if(!r.ok)throw new Error(`Log Monitoring API HTTP ${r.status}`);return r.json() as Promise<LogMonitoringResponse>;}
// ===== 20260928 추가 끝 =====
