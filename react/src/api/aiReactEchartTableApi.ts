// ===== 20260908 추가 시작 : Table Usage - ax_metrics_sqream_table 직접 REST API =====
import { runtimeOverride } from "../runtimeConfig";
export interface TableUsageRowDto {
  databaseName:string; tableId:number|null; schemaName:string; tableName:string;
  rowCountValid:number|null; rowCount:number|null; rechunkerIgnore:number|null;
  deletedRowCount:number|null; deletedRowRatio:number|null; rowConsistent:boolean|null;
  needsRechunk:boolean|null; comment:string; fullTableName:string; collectTime:string|null; hostname:string;
}
export interface TableUsageResponseDto {
  totalTables:number; totalRows:number; totalDeletedRows:number; rechunkTargets:number; rows:TableUsageRowDto[];
}
function baseUrl():string { const c=(runtimeOverride("portalApiUrl")??import.meta.env.VITE_PORTAL_API_BASE??"").trim(); return c.replace(/\/$/,""); }
function fmt(ms:number):string { const d=new Date(ms); const p=(n:number)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
export async function fetchTableUsage(startMs:number,endMs:number,hostname:string,signal?:AbortSignal):Promise<TableUsageResponseDto>{
  const q=new URLSearchParams({startTime:fmt(startMs),endTime:fmt(endMs)}); if(hostname)q.set("hostname",hostname);
  const res=await fetch(`${baseUrl()}/api/aireactechartdashboard/table/usage?${q}`,{signal,credentials:"include"});
  if(!res.ok)throw new Error(`Table Usage API HTTP ${res.status}`); return res.json() as Promise<TableUsageResponseDto>;
}
// ===== 20260908 추가 끝 : Table Usage - ax_metrics_sqream_table 직접 REST API =====
