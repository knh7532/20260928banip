// ===== 20260928 추가 시작 : Worker Log 완료 Query Analytics API =====
import { runtimeOverride } from "../runtimeConfig";
export interface QueryRow { hostname:string|null; worker:string|null; serviceName:string|null; databaseName:string|null; sqlType:string|null; userId:string|null; statement:string|null; queryStart:string; queryEnd:string; connectionId:number|null; statementId:number|null; durationMs:number|null; totalDataReadMb:number|null; totalProcessedRows:number|null; resultRowCount:number|null; cpuUsagePercent:number|null; gpuUsagePercent:number|null; memoryUsagePercent:number|null; diskUsagePercent:number|null; }
export interface QueryGroup { sqlType:string; databaseName:string; queryCount:number; avgDurationSec:number|null; maxGpuUsagePercent:number|null; maxCpuUsagePercent:number|null; avgMemoryUsagePercent:number|null; avgDiskUsagePercent:number|null; totalDataReadMb:number|null; }
export interface QueryAnalyticsResponse { totalQueries:number; gpuUsageMax:number|null; cpuUsageMax:number|null; heavyQueries:number; avgDurationSec:number|null; totalElements:number; page:number; size:number; totalPages:number; queries:QueryRow[]; groups:QueryGroup[]; }
const base=()=>((runtimeOverride("portalApiUrl")??import.meta.env.VITE_PORTAL_API_BASE??"") as string).trim().replace(/\/$/,"");
const fmt=(ms:number)=>{const d=new Date(ms),p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};
export async function fetchQueryAnalytics(startMs:number,endMs:number,hostname:string,worker:string,page:number,size:number,signal?:AbortSignal){const q=new URLSearchParams({startTime:fmt(startMs),endTime:fmt(endMs),page:String(page),size:String(size)});if(hostname)q.set("hostname",hostname);if(worker)q.set("worker",worker);const r=await fetch(`${base()}/api/aireactechartdashboard/query/analytics?${q}`,{signal,credentials:"include"});if(!r.ok)throw new Error(`Query Analytics API HTTP ${r.status}`);return r.json() as Promise<QueryAnalyticsResponse>;}
// ===== 20260928 추가 끝 : Worker Log 완료 Query Analytics API =====

// 20260928 추가 : Summary 선택 Query 상세/실행시점 리소스
export interface QueryResourcePoint { collectTime:string; gpuUsagePercent:number|null; cpuUsagePercent:number|null; memoryUsagePercent:number|null; diskUsagePercent:number|null; }
export interface QueryGroupDetail { sqlType:string; databaseName:string; resourceStart:string|null; resourceEnd:string|null; queries:QueryRow[]; resources:QueryResourcePoint[]; }
export async function fetchQueryGroupDetail(startMs:number,endMs:number,sqlType:string,databaseName:string,hostname:string,worker:string,signal?:AbortSignal){
 const q=new URLSearchParams({startTime:fmt(startMs),endTime:fmt(endMs),sqlType,databaseName});if(hostname)q.set("hostname",hostname);if(worker)q.set("worker",worker);
 const r=await fetch(`${base()}/api/aireactechartdashboard/query/group-detail?${q}`,{signal,credentials:"include"});if(!r.ok)throw new Error(`Query Group Detail API HTTP ${r.status}`);return r.json() as Promise<QueryGroupDetail>;
}
