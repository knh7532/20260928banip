// ===== 20260908 추가 시작 : Table Usage - ax_metrics_sqream_table 직접 매핑 =====
import { useMemo, useState } from "react";
import { fetchTableUsage, type TableUsageResponseDto } from "../../api/aiReactEchartTableApi";
import { Card, Kpi, Pill, Table } from "../../components/drilldown/primitives";
import { PageHead } from "../../components/drilldown/PageHead";
import { PinChip } from "../../components/drilldown/PinChip";
import { usePolling } from "../../hooks/usePolling";
import type { DrilldownScreenProps } from "../DrilldownDashboard";

const EMPTY:TableUsageResponseDto={totalTables:0,totalRows:0,totalDeletedRows:0,rechunkTargets:0,rows:[]};
const num=(v:number|null|undefined)=>v==null?"-":Number(v).toLocaleString("ko-KR");

export function TableUsage({refreshMs,filters,title,pinnedMs,onClearPin}:DrilldownScreenProps){
  const [data,setData]=useState<TableUsageResponseDto>(EMPTY); const [loaded,setLoaded]=useState(false); const [failed,setFailed]=useState(false); const [search,setSearch]=useState(""); const [schema,setSchema]=useState("");
  const endMs=filters.endMs??pinnedMs??Date.now(); const startMs=endMs-filters.rangeSec*1000;
  usePolling(async(signal)=>{try{setData(await fetchTableUsage(startMs,endMs,filters.server,signal));setFailed(false);setLoaded(true);}catch(e){if(signal.aborted)return;console.error(e);setFailed(true);setLoaded(true);}},refreshMs,[filters.server,filters.rangeSec,filters.endMs,pinnedMs]);
  const schemas=useMemo(()=>Array.from(new Set(data.rows.map(r=>r.schemaName).filter(Boolean))).sort(),[data.rows]);
  const rows=useMemo(()=>data.rows.filter(r=>(!schema||r.schemaName===schema)&&(!search||`${r.databaseName}.${r.schemaName}.${r.tableName}`.toLowerCase().includes(search.toLowerCase()))),[data.rows,schema,search]);
  return <>
    <PageHead title={title} sub="ax_metrics_sqream_table 직접 조회"><PinChip pinnedMs={pinnedMs} onClear={onClearPin}/></PageHead>
    <div className="sqm-grid sqm-grid--kpi4">
      <Kpi icon="▤" tone="blue" label="TOTAL TABLES" value={failed?"--":num(data.totalTables)}/>
      <Kpi icon="≣" tone="green" label="TOTAL ROWS" value={failed?"--":num(data.totalRows)}/>
      <Kpi icon="⌫" tone="orange" label="DELETED ROWS" value={failed?"--":num(data.totalDeletedRows)}/>
      <Kpi icon="↻" tone="purple" label="RECHUNK TARGETS" value={failed?"--":num(data.rechunkTargets)}/>
    </div>
    <Card title="Table Usage" aside={`${rows.length} tables`} body={false}>
      <div className="sqm-card__body"><div className="sqm-filters">
        <select aria-label="스키마" value={schema} onChange={e=>setSchema(e.target.value)}><option value="">All Schemas</option>{schemas.map(s=><option key={s}>{s}</option>)}</select>
        <input type="text" aria-label="테이블 검색" placeholder="Search tables..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <button type="button" className="sqm-btn" onClick={()=>{setSchema("");setSearch("");}}>CLEAR FILTERS</button>
      </div></div>
      <Table head={["Database","Schema","Table","Table ID","Rows","Valid Rows","Deleted Rows","Deleted Ratio","Consistent","Rechunk","Hostname","Collect Time"]}
        loading={!loaded} error={failed?"Table Usage 데이터를 불러오지 못했습니다.":undefined}
        empty={loaded&&!failed&&rows.length===0?"조회된 Table 데이터가 없습니다.":undefined}>
        {rows.map(r=><tr key={`${r.databaseName}.${r.schemaName}.${r.tableName}`}>
          <td>{r.databaseName||"-"}</td><td>{r.schemaName||"-"}</td><td>{r.tableName||"-"}</td><td>{r.tableId??"-"}</td><td className="num">{num(r.rowCount)}</td><td className="num">{num(r.rowCountValid)}</td><td className="num">{num(r.deletedRowCount)}</td><td>{r.deletedRowRatio==null?"-":`${r.deletedRowRatio.toFixed(2)}%`}</td>
          <td><Pill tone={r.rowConsistent===false?"red":"green"}>{r.rowConsistent===false?"NO":"YES"}</Pill></td><td><Pill tone={r.needsRechunk?"orange":"green"}>{r.needsRechunk?"YES":"NO"}</Pill></td><td>{r.hostname||"-"}</td><td>{r.collectTime?.replace("T"," ")??"-"}</td>
        </tr>)}
      </Table>
    </Card>
  </>;
}
// ===== 20260908 추가 끝 : Table Usage - ax_metrics_sqream_table 직접 매핑 =====
