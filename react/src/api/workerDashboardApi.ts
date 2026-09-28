// 20260928 추가
import { runtimeOverride } from "../runtimeConfig";
export interface WorkerNode {hostname:string;hostip:string|null;latestCpu:number|null;latestMemory:number|null;latestDisk:number|null;latestGpu:number|null}
export interface WorkerMetric {collectTime:string;gpu:number|null;cpu:number|null;memory:number|null;disk:number|null}
const base=()=>((runtimeOverride("portalApiUrl")??import.meta.env.VITE_PORTAL_API_BASE??"") as string).trim().replace(/\/$/,"");
const fmt=(ms:number)=>{const d=new Date(ms),p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};
export async function fetchWorkerNodes(signal?:AbortSignal){const r=await fetch(`${base()}/api/aireactechartdashboard/worker/nodes`,{signal,credentials:"include"});if(!r.ok)throw new Error(`Worker nodes HTTP ${r.status}`);return r.json() as Promise<WorkerNode[]>}
export async function fetchWorkerMetrics(hostname:string,startMs:number,endMs:number,signal?:AbortSignal){const q=new URLSearchParams({hostname,startTime:fmt(startMs),endTime:fmt(endMs)});const r=await fetch(`${base()}/api/aireactechartdashboard/worker/metrics?${q}`,{signal,credentials:"include"});if(!r.ok)throw new Error(`Worker metrics HTTP ${r.status}`);return r.json() as Promise<WorkerMetric[]>}
