import { useEffect, useMemo, useState } from "react";
import { fetchMainInternalErrors, fetchMainTableChunks, type MainInternalErrorPointDto, type MainOverviewFilterParams, type MainTableChunkDto } from "../../api/aiReactEchartMainApi";

function bytes(v?:number){ const n=Number(v??0); if(n>=1024**3)return `${(n/1024**3).toFixed(1)} GB`; if(n>=1024**2)return `${(n/1024**2).toFixed(1)} MB`; if(n>=1024)return `${(n/1024).toFixed(1)} KB`; return `${n.toLocaleString()} B`; }
function n(v?:number){ return Number(v??0).toLocaleString(); }
function yn(v?:string){ return (v||"NO").toUpperCase(); }

// ===== 20260928 추가 시작 : Table Chunk 선택형 그래프 + 상세 + 목록 =====
export function OverviewBottomPanels({startMs,endMs,filters,refreshSec: _refreshSec}:{startMs:number;endMs:number;filters:MainOverviewFilterParams;refreshSec:number}){
  const [chunks,setChunks]=useState<MainTableChunkDto[]>([]); const [errors,setErrors]=useState<MainInternalErrorPointDto[]>([]);
  const [selectedTableId,setSelectedTableId]=useState<number|string|undefined>();
  useEffect(()=>{ let alive=true; const c=new AbortController(); Promise.all([fetchMainTableChunks(startMs,endMs,filters,c.signal),fetchMainInternalErrors(startMs,endMs,filters,c.signal)]).then(([a,b])=>{if(alive){setChunks(a);setErrors(b);setSelectedTableId(prev=>a.some(x=>String(x.tableId)===String(prev))?prev:a[0]?.tableId)}}).catch(()=>{}); return()=>{alive=false;c.abort()}; },[startMs,endMs,filters.instances?.join(',')]);
  const selected=useMemo(()=>chunks.find(x=>String(x.tableId)===String(selectedTableId))??chunks[0],[chunks,selectedTableId]);
  // ===== 20260925 추가 시작 : Internal Runtime Error 목록은 Error 전체 + Normal 최대 10건 =====
  // 차트는 errors 전체를 그대로 사용하고, 하단 목록에서만 일반 이벤트를 10건으로 제한한다.
  const runtimeList=useMemo(()=>{
    const errorRows=errors.filter(e=>!!e.errorType);
    const normalRows=errors.filter(e=>!e.errorType).slice(0,10);
    return [...errorRows,...normalRows];
  },[errors]);
  // ===== 20260925 추가 끝 : Internal Runtime Error 목록은 Error 전체 + Normal 최대 10건 =====
  const runtimeChart=useMemo(()=>{
    const w=520,h=185,p=28;
    const parsed=errors.map((e,i)=>({e,i,t:new Date(String(e.queryEndTime??"").replace(" ","T")).getTime(),mt:Number(e.messageTypeId??0)})).filter(x=>Number.isFinite(x.t));
    if(!parsed.length)return {w,h,p,series:[] as any[],minT:0,maxT:0,maxY:1};
    const minT=Math.min(...parsed.map(x=>x.t)), maxT=Math.max(...parsed.map(x=>x.t));
    const maxY=Math.max(1,...parsed.map(x=>x.mt));
    const nodes=Array.from(new Set(parsed.map(x=>x.e.hostname||"Unknown"))).sort();
    const red=["#ff4d5a","#ff6b73","#e53935","#ff8a80","#c62828","#ef5350"];
    const blue=["#4da3ff","#42c7ff","#5c6cff","#29b6f6","#7986cb","#26a6d1"];
    const series:any[]=[];
    nodes.forEach((node,ni)=>[true,false].forEach(isErr=>{
      const points=parsed.filter(x=>(x.e.hostname||"Unknown")===node && !!x.e.errorType===isErr).sort((a,b)=>a.t-b.t).map(x=>({
        x:p+(maxT===minT?(w-2*p)/2:(x.t-minT)*(w-2*p)/(maxT-minT)), y:h-p-(x.mt/maxY)*(h-2*p), ...x.e
      }));
      if(points.length)series.push({node,isErr,color:isErr?red[ni%red.length]:blue[ni%blue.length],points});
    }));
    return {w,h,p,series,minT,maxT,maxY};
  },[errors]);
  // 20260928 추가 : Table Chunk는 전체 눈금을 10,000 GB로 고정하고, Uncompressed/Compressed를 같은 좌하단 원점에서 각각 표시
  const outer=170;
  const FIXED_SCALE_BYTES=10_000*1024**3;
  const uncompressedBytes=Number(selected?.uncompressedTableSizeByte??0);
  const compressedBytes=Number(selected?.compressedTableSizeByte??0);
  const squareSide=(value:number)=>value<=0?0:Math.max(4,outer*Math.sqrt(Math.min(1,value/FIXED_SCALE_BYTES)));
  const uncompressedSide=squareSide(uncompressedBytes);
  const compressedSide=squareSide(compressedBytes);
  return <section className="overview-bottom-pair" aria-label="Table Chunk 및 Internal Runtime Error">
    <div className="panel overview-extra-panel chunk-panel"><div className="panel__head"><strong>Table Chunk</strong><span className="overview-extra-sub">Uncompressed Size DESC</span></div>
      {chunks.length===0?<div className="overview-extra-empty">데이터 없음</div>:<>
        <div className="chunk-selected-area">
          <div className="chunk-selected-graph">
            {/* 20260928 추가 : 바깥=10,000GB 고정 눈금 / 중간=Uncompressed / 안쪽=Compressed, 모두 좌하단 고정 */}
            <div className="chunk-square chunk-square--selected chunk-square--scale" style={{width:outer,height:outer}} title={`Scale 10,000 GB / Uncompressed ${bytes(selected?.uncompressedTableSizeByte)} / Compressed ${bytes(selected?.compressedTableSizeByte)}`}>
              <div className="chunk-square__uncompressed" style={{width:uncompressedSide,height:uncompressedSide}}/>
              <div className="chunk-square__compressed" style={{width:compressedSide,height:compressedSide}}/>
              <span className="chunk-square__origin">0</span>
            </div>
            <div className="chunk-square-legend"><span>Scale 10,000 GB</span><span>Uncompressed {bytes(selected?.uncompressedTableSizeByte)}</span><span>Compressed {bytes(selected?.compressedTableSizeByte)}</span></div>
            <div className="chunk-selected-caption"><strong>{selected?.tableName}</strong><span>{bytes(selected?.compressedTableSizeByte)} / {bytes(selected?.uncompressedTableSizeByte)}</span></div>
          </div>
          <div className="chunk-detail-scroll">
            <div className="chunk-detail-title">상세 정보</div>
            <dl className="chunk-detail-list">
              <dt>Table Name</dt><dd>{selected?.tableName ?? "-"}</dd><dt>DB Name</dt><dd>{selected?.databaseName ?? "-"}</dd><dt>Schema Name</dt><dd>{selected?.schemaName ?? "-"}</dd>
              <dt>Compressed Size</dt><dd>{bytes(selected?.compressedTableSizeByte)}</dd><dt>Uncompressed Size</dt><dd>{bytes(selected?.uncompressedTableSizeByte)}</dd><dt>Compression Ratio</dt><dd>{selected?.compressionRatio ?? 0}</dd>
              <dt>PCT 90~100</dt><dd>{n(selected?.pct90100)}</dd><dt>PCT 80~90</dt><dd>{n(selected?.pct8090)}</dd><dt>PCT 70~80</dt><dd>{n(selected?.pct7080)}</dd><dt>PCT 60~70</dt><dd>{n(selected?.pct6070)}</dd><dt>PCT 50~60</dt><dd>{n(selected?.pct5060)}</dd><dt>PCT 40~50</dt><dd>{n(selected?.pct4050)}</dd><dt>PCT 30~40</dt><dd>{n(selected?.pct3040)}</dd><dt>PCT 20~30</dt><dd>{n(selected?.pct2030)}</dd><dt>PCT 10~20</dt><dd>{n(selected?.pct1020)}</dd><dt>PCT 0~10</dt><dd>{n(selected?.pct010)}</dd>
              <dt>No Deletion Count</dt><dd>{n(selected?.noDeletionCnt)}</dd><dt>Some Deletion Count</dt><dd>{n(selected?.someDeletionCnt)}</dd><dt>All Deletion Count</dt><dd>{n(selected?.allDeletionCnt)}</dd>
              <dt>Deletion Count</dt><dd>{yn(selected?.deletionCount)}</dd><dt>Needs Rechunk</dt><dd>{yn(selected?.needsRechunk)}</dd>
            </dl>
          </div>
        </div>
        <div className="chunk-table-scroll"><table className="chunk-table"><thead><tr><th>Table Name</th><th>DB Name</th><th>Schema Name</th><th>Compressed Table Size</th><th>Uncompressed Table Size</th><th>Compression Ratio</th><th>PCT 90~100</th><th>PCT 0~90</th><th>Deletion Count</th><th>Rechunk</th></tr></thead><tbody>
          {chunks.map((c,i)=><tr key={`${c.tableId}-${i}`} className={String(c.tableId)===String(selected?.tableId)?"is-selected":""} onClick={()=>setSelectedTableId(c.tableId)}><td>{c.tableName}</td><td>{c.databaseName}</td><td>{c.schemaName}</td><td>{bytes(c.compressedTableSizeByte)}</td><td>{bytes(c.uncompressedTableSizeByte)}</td><td>{c.compressionRatio ?? 0}</td><td>{n(c.pct90100)}</td><td>{n(c.pct090)}</td><td>{yn(c.deletionCount)}</td><td>{yn(c.rechunk)}</td></tr>)}
        </tbody></table></div>
      </>}
    </div>
    <div className="panel overview-extra-panel runtime-panel"><div className="panel__head"><strong>Internal Runtime Error</strong><span className="overview-extra-sub">query_end_time · message_type_id · Node(hostname)</span></div>
      <div className="runtime-event-chart">
        {runtimeChart.series.length===0?<div className="overview-extra-empty">이벤트 데이터 없음</div>:<>
          <svg viewBox="0 0 520 185" preserveAspectRatio="none" role="img" aria-label="Internal Runtime Error worker log 이벤트">
            <line x1="28" y1="157" x2="492" y2="157" className="error-axis"/>
            {runtimeChart.series.map((s:any,si:number)=><g key={`${s.node}-${s.isErr}-${si}`}>
              {s.points.length>1&&<polyline points={s.points.map((p:any)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>}
              {s.points.map((p:any,pi:number)=><circle key={pi} cx={p.x} cy={p.y} r="3.2" fill={s.color} strokeWidth="1" vectorEffect="non-scaling-stroke"><title>{`${s.node} / ${s.isErr?'ERROR':'NORMAL'} / Type ${p.messageTypeId} / ${p.queryEndTime}`}</title></circle>)}
            </g>)}
          </svg>
          <div className="runtime-legend">{runtimeChart.series.map((s:any,i:number)=><span key={i}><i style={{background:s.color}}/>{s.node} {s.isErr?'ERROR':'NORMAL'}</span>)}</div>
        </>}
      </div>
      <div className="runtime-table-scroll"><table className="runtime-table"><thead><tr><th>Hostname</th><th>Worker</th><th>Statement ID</th><th>Connection ID</th><th>Query End Time</th><th>Statement</th><th>Message Type ID</th><th>Message</th></tr></thead><tbody>
        {runtimeList.map((e,i)=><tr key={`${e.hostname}-${e.queryEndTime}-${i}`} className={e.errorType?'is-error':''}><td>{e.hostname||'-'}</td><td>{e.instanceId||'-'}</td><td>{e.statementId??'-'}</td><td>{e.connectionId??'-'}</td><td>{e.queryEndTime||'-'}</td><td title={e.statement||''}>{(e.statement||'').slice(0,20)}</td><td>{e.messageTypeId||'-'}</td><td title={e.message||''}>{(e.message||'').slice(0,20)}</td></tr>)}
      </tbody></table></div>
    </div>
  </section>;
}
// ===== 20260928 추가 끝 : Table Chunk 선택형 그래프 + 상세 + 목록 =====
