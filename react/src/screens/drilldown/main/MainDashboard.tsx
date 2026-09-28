// 20260928 추가 - 화면별 폴더 분리
/**
 * Main Dashboard (`#/drilldown/main`) — 정적 `res/sqream/mockup/index.html`.
 *
 * 드릴다운 10화면 중 가장 크다 — KPI 4, 클러스터 성능 차트, 세션 통계 4박스,
 * Query Overview, Node Health, Top Queries.
 *
 * 정적본에서 그대로 지키는 것:
 *  - 무데이터 표기는 `--`로 통일한다(2026-08-08 표기 통일 — 예전엔 표마다 달랐다).
 *  - Service 열은 X17부터 **qid 파생 표시 축**(select_service/etl_service/sqream +
 *    실행 전 compile)이다 — etl_service는 배지 강조(ADR H-0003의 etl 강조 계승).
 *  - Node Health는 **기대 노드 3개를 항상** 그린다 — 데이터가 없으면 그렇게 말한다.
 *  - `Failed Queries (1h)`는 에러 **로그 건수**다(실제 실패 쿼리 수가 아님) — 원본 각주 유지.
 *  - Cluster Performance 아래 **현재값 스트립**(CPU·GPU·Disk I/O)을 유지한다.
 *  - Top Queries: `node`는 running 메타 → topk 라벨 순으로 되짚고, 결측 수치는 **0**으로
 *    보정한다(정적과 동일). CPU Time은 **초 반올림**, 두 자원은 **막대**로 낸다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { PageHead } from "../../../components/drilldown/PageHead";
import { SortReset } from "../../../components/drilldown/SortReset";
import { useToast } from "../../../components/drilldown/useToast";
import { useTableSort } from "../../../components/drilldown/useTableSort";
import { Card, Kpi, Pill, Table } from "../../../components/drilldown/primitives";
import { usePolling } from "../../../hooks/usePolling";
import {
  fetchMainDrilldown, fetchMainPerformance, fetchMainResourceHistory,
  type MainPerformancePointDto,
} from "../../../api/aiReactEchartDrilldownMainApi";
import type { DrilldownScreenProps } from "../../DrilldownDashboard";
import {
  WORKER_MEM_LIMIT_BYTES, WORKER_MEM_LIMIT_GB,
  displayNode, formatBytes, formatInt, formatPercent,
} from "../../../lib/format";
import { ClusterPerformanceBars } from "../ClusterPerformanceBars";
import { MainStatementDetailModal } from "../MainStatementDetailModal";
import { RestartGuideDialog, type RestartGuideInfo } from "../RestartGuideDialog";

/**
 * Kill(X6) 낙관적 억제 시간 — kill 반영(tick ≤1s) + scrape(5s) + 폴링 간격을 덮는다.
 * 이보다 짧으면 kill된 행이 한 주기 되살아나고, 만료를 지우지 않으면 재사용된
 * 신원(stmt_id 풀 3종/슬롯)의 **다음 쿼리**까지 잘못 숨긴다 — 둘 다 하면 안 된다.
 */
const KILL_SUPPRESS_MS = 15_000;

interface Kpis { sessions: number; queries: number; cpu: number; gpu: number }
interface Stats { users: number; failed: number; spool: number }
interface QueryRow {
  connectionId: string;
  id: string; user: string; node: string; worker: string; service: string; status: string;
  elapsed: number; prog: number;
  /** `JOI-14H` — exporter가 채번한다(QID 규칙 v2.10). X17에서 Q-Type 열은 빠졌지만
      데이터는 유지한다 — currentPhase 시드·mockSql/플랜 분기·CLE Kill 차단·서비스 파생이 쓴다. */
  qid: string;
  /** `JOIN:3,TXTKEY` — 점수의 근거. 점수만으로는 조치를 못 정한다(문서 §2.3). */
  qidTags: string;
  /** 시작 epoch(초) — Kill 세대 토큰(X6-R1). 결측이면 NaN — Kill이 비활성된다
      (fail-closed, X6-R4: 토큰 없는 kill은 exporter가 400으로 거부). */
  startEpoch: number;
}
interface TopRow {
  id: string; node: string; worker: string; cpuTime: number; gpu: number; scanned: number;
  /** 쿼리가 잡은 메모리(bytes). 한도(`WORKER_MEM_LIMIT_BYTES`) 대비로 보여 준다. */
  memory: number;
}
/** 차트의 마지막 유효 값 — Cluster Performance 아래 스트립. */
interface WorkerHealth {
  name: string; healthy: boolean;
  healthStatus: string;
  grEngineActivePercent: number;
  alert: string | null;
}

const ZERO_KPI: Kpis = { sessions: 0, queries: 0, cpu: NaN, gpu: NaN };
const ZERO_STATS: Stats = { users: 0, failed: 0, spool: NaN };

function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "--";
  const s = Math.max(0, Math.floor(seconds));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function MainDashboard({ refreshMs, filters, title }: DrilldownScreenProps) {
  const [kpis, setKpis] = useState<Kpis>(ZERO_KPI);
  const [, setStats] = useState<Stats>(ZERO_STATS);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [top, setTop] = useState<TopRow[]>([]);
  const [health, setHealth] = useState<Map<string, WorkerHealth[]>>(new Map());
  /** 실행 중 문장에 조인되지 않는 락 수(X11) — 재시작 다이얼로그의 orphan 경고. */
  const [orphanLocks, setOrphanLocks] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, showToast] = useToast();
  /** SQL을 펼친 Statement ID. 한 번에 하나만 연다 — 여러 개가 겹치면 읽을 수 없다. */
  const [openSql, setOpenSql] = useState<QueryRow | null>(null);
  /** 재시작 대상 워커. */
  const [restart, setRestart] = useState<string | null>(null);
  /** kill 접수된 stmt_id → 억제 만료 시각(ms). 폴링이 exporter 반영을 앞지르는
      한 주기 동안 행이 되살아나지 않게 한다 (X6). */
  const killedRef = useRef(new Map<string, number>());
  // ===== 20260908 추가 시작 : Main Dashboard 드릴다운 - 직접 REST 성능 시계열 상태 =====
  const [performanceRows, setPerformanceRows] = useState<MainPerformancePointDto[]>([]);
  const [performanceFailed, setPerformanceFailed] = useState(false);
  // 20260928 추가 : Query와 무관한 Node Resource 시계열
  const [resourceHistory, setResourceHistory] = useState<MainPerformancePointDto[]>([]);
  // 필터가 바뀌면 이전 Node/GPU/Worker의 실시간 히스토리를 섞지 않는다.
  useEffect(() => { setPerformanceRows([]); setSelectedPoint(null); }, [filters.server, filters.gpu, filters.mig]);
  // ===== 20260925 추가 : Cluster Performance 클릭 상세 =====
  const [selectedPoint, setSelectedPoint] = useState<MainPerformancePointDto | null>(null);
  // ===== 20260908 추가 끝 : Main Dashboard 드릴다운 - 직접 REST 성능 시계열 상태 =====

  // 20260928 추가 : /main만 refreshMs 주기로 Node Resource 실시간 갱신
  usePolling(async (signal) => {
    try { setResourceHistory(await fetchMainResourceHistory(filters.server || undefined, 30, signal)); }
    catch(e){ if(!signal.aborted) console.error(e); }
  }, refreshMs, [refreshMs, filters.server]);

  const handleKilled = (id: string) => {
    killedRef.current.set(id, Date.now() + KILL_SUPPRESS_MS);
    // 낙관적 제거 — 다음 폴링을 기다리지 않는다. Top Queries도 같은 문장이다.
    setQueries((cur) => cur.filter((r) => `${r.connectionId}/${r.id}` !== id));
    setTop((cur) => cur.filter((r) => r.id !== id));
  };

  // ===== 20260908 추가 시작 : Main Dashboard 드릴다운 - PromQL 제거 / 직접 REST 조회 =====
  // ===== 20260908 추가 시작 : Main Dashboard - Node/GPU/Worker 필터를 MQuery REST에 전달 =====
  const mainApiFilters = {
    hostname: filters.server || undefined,
    gpuId: filters.gpu || undefined,
    // 20260925 추가 : Worker 필터는 server_status.instance_id를 그대로 사용.
    instanceId: filters.mig || undefined,
  };
  // ===== 20260908 추가 끝 : Main Dashboard - Node/GPU/Worker 필터를 MQuery REST에 전달 =====

  usePolling(async (signal) => {
    try {
      const data = await fetchMainDrilldown(mainApiFilters, signal);
      setKpis({
        sessions: Number(data.activeSessions ?? 0),
        queries: Number(data.runningQueries ?? 0),
        cpu: data.cpuUsagePercent == null ? NaN : Number(data.cpuUsagePercent),
        gpu: data.gpuMemoryUsagePercent == null ? NaN : Number(data.gpuMemoryUsagePercent),
      });
      setStats({
        users: Number(data.connectedUsers ?? 0),
        failed: Number(data.failedQueries1h ?? 0),
        spool: data.diskSpillBytes == null ? NaN : Number(data.diskSpillBytes),
      });
      const killed = killedRef.current;
      const nowMs = Date.now();
      for (const [id, until] of killed) if (until <= nowMs) killed.delete(id);
      const mapped = (data.queries ?? []).filter((r) => !killed.has(r.statementId ?? "")).map((r) => ({
        connectionId: r.connectionId ?? "",
        id: r.statementId ?? "", user: r.user || "--", node: displayNode(r.node ?? "") || "--",
        worker: r.worker || "--", service: r.service || "--", status: r.status || "--",
        elapsed: Number(r.elapsed ?? 0), prog: Number(r.progress ?? 0), qid: r.qid ?? "", qidTags: r.qidTags ?? "",
        startEpoch: r.startEpoch == null ? NaN : Number(r.startEpoch),
      }));
      setQueries(mapped);
      setTop((data.topQueries ?? []).filter((r) => !killed.has(r.statementId ?? "")).map((r) => ({
        id: r.statementId ?? "", node: displayNode(r.node ?? "") || "--", worker: r.worker || "--",
        cpuTime: Number(r.elapsed ?? 0), gpu: Number(r.gpuUtilization ?? 0),
        scanned: Number(r.dataScannedBytes ?? 0), memory: r.memoryBytes == null ? NaN : Number(r.memoryBytes),
      })));
      const byNode = new Map<string, WorkerHealth[]>();
      for (const r of data.workers ?? []) {
        const node = displayNode(r.node ?? "");
        byNode.set(node, [...(byNode.get(node) ?? []), {
          name: r.worker || "--", healthy: Boolean(r.healthy), healthStatus: r.healthStatus || "UNHEALTHY",
          grEngineActivePercent: Number(r.grEngineActivePercent ?? 0), alert: r.alert ?? null,
        }]);
      }
      setHealth(byNode);
      setOrphanLocks(Number(data.orphanLocks ?? 0));
      setFailed(false); setLoaded(true);
    } catch (error) { setFailed(true); throw error; }
  }, refreshMs, [refreshMs, filters.server, filters.gpu, filters.mig]);

  usePolling(async (signal) => {
    try {
      const latest = await fetchMainPerformance(mainApiFilters, signal);
      // ===== 20260928 추가 시작 : Cluster Performance는 현재 server_status snapshot만 표시 =====
      // 같은 connection_id + statement_id Query의 값이 바뀌면 예전 막대를 남기지 않고 현재 값으로 교체한다.
      // 종료되어 server_status에서 사라진 Query도 다음 polling 응답에서 즉시 제거된다.
      const sampledAt = new Date().toISOString();
      const current = (Array.isArray(latest) ? latest : []).map((r) => ({ ...r, collectTime: sampledAt }));
      const dedup = new Map<string, MainPerformancePointDto>();
      for (const r of current) dedup.set(`${r.connectionId}/${r.statementId}`, r);
      setPerformanceRows([...dedup.values()]);
      // ===== 20260928 추가 끝 : 현재 실행 Query 막대 교체 =====
      setPerformanceFailed(false);
    } catch (error) { setPerformanceFailed(true); throw error; }
  }, refreshMs, [refreshMs, filters.server, filters.gpu, filters.mig]);
  // ===== 20260908 추가 끝 : Main Dashboard 드릴다운 - PromQL 제거 / 직접 REST 조회 =====

  /* 재시작 가이드 입력(X11) — 매 렌더 최신 상태에서 재파생한다(X10F3-01 교훈).
     복구되면(healthy) null → 다이얼로그가 저절로 닫힌다. 실행 문장은 Query
     Overview의 running 목록에서 워커로 역참조한다(qid·세대 토큰 포함). */
  const guideInfo: RestartGuideInfo | null = useMemo(() => {
    if (restart === null) return null;
    for (const [node, list] of health.entries()) {
      const w = list.find((i) => i.name === restart);
      if (w !== undefined && !w.healthy) {
        const query = queries.find((r) => r.worker === restart);
        return {
          worker: restart,
          node, // kill 명령의 실행 위치 표기(X15)
          query: query === undefined ? undefined : {
            id: query.id, qid: query.qid,
            startEpoch: query.startEpoch, prog: query.prog,
          },
          // 알람 이름 → 유형(X14): WorkerDown=crash / WorkerUnresponsive=hang / 부재=stopped
          kind: w.alert === "WorkerDown" ? "crash"
            : w.alert === "WorkerUnresponsive" ? "hang" : "stopped",
          orphanLocks,
        };
      }
    }
    return null;
  }, [restart, health, queries, orphanLocks]);
  useEffect(() => {
    if (restart !== null && guideInfo === null) setRestart(null);
  }, [restart, guideInfo]);

  // ===== 20260925 추가 시작 : Cluster Performance 시간대별 grouped bar =====
  // server_status에 현재 존재하는 실행 중 Query만 backend performance API가 내려준다.
  // 각 polling 시각마다 GPU/CPU/RAM/Disk 4개 막대를 표시한다.
  const pickPerformancePoint = (ms: number) => {
    const candidates = performanceRows.filter((r) => new Date(r.collectTime).getTime() === ms);
    if (!candidates.length) { setSelectedPoint(null); return; }
    const load = (r: MainPerformancePointDto) => Math.max(
      Number(r.gpuUsagePercent) || 0, Number(r.cpuUsagePercent) || 0,
      Number(r.ramUsagePercent) || 0, Number(r.diskUsagePercent) || 0);
    setSelectedPoint([...candidates].sort((a,b) => load(b)-load(a))[0]);
  };
  const maxCpu = performanceRows.reduce((m,r) => Math.max(m, Number(r.cpuUsagePercent) || 0), 0);
  const maxGpu = performanceRows.reduce((m,r) => Math.max(m, Number(r.gpuUsagePercent) || 0), 0);
  // ===== 20260925 추가 끝 : Worker별 Cluster Performance + Point 상세 =====
  // ===== 20260908 추가 끝 : Main Dashboard 드릴다운 - 직접 REST Cluster Performance 변환 =====

  /* 기본 정렬은 원래 화면이 쓰던 것 그대로다 — Query Overview는 경과 시간 내림차순,
     Top Queries는 GPU 사용률 내림차순(topk가 이미 그 순서로 준다). */

  const qSort = useTableSort<QueryRow>({
    id: (r) => r.id, user: (r) => r.user, node: (r) => r.node,
    // X17: Worker·Service는 **표시값 기준** 정렬 — In Queue 행의 Worker 공란("")과
    // 실행 전 "compile" 표기가 셀과 같은 순서로 잡히게 한다.
    worker: (r) => r.worker,
    service: (r) => r.service,
    // ===== 20260908 추가 : MQuery Worker Log의 실제 종료상태 기준 정렬 =====
    status: (r) => r.status,
    elapsed: (r) => r.elapsed, prog: (r) => r.prog,
  }, { key: "elapsed", desc: true });
  const topSort = useTableSort<TopRow>({
    id: (r) => r.id, node: (r) => r.node, worker: (r) => r.worker,
    cpuTime: (r) => r.cpuTime, gpu: (r) => r.gpu, memory: (r) => r.memory,
    scanned: (r) => r.scanned,
  }, { key: "gpu", desc: true });

  const dash = (n: number) => (failed ? "--" : formatInt(n));

  return (
    <div className="sqm-page">
      {/* 나머지 9화면과 같은 자리에 이름을 둔다. 예전엔 이 화면만 본문 제목이
          없어서 툴바에만 이름이 있었다(2026-08-10 통일). */}
      <PageHead title={title} />

      {/* ===== 20260925 추가 시작 : Main Dashboard 재배치 ===== */}
      <div className="sqm-main-top">
        <div className="sqm-main-kpis">
          <Kpi icon="🖥" tone="blue" label="ACTIVE SESSIONS" value={dash(kpis.sessions)} />
          <Kpi icon="⚡" tone="blue" label="RUNNING QUERIES" value={dash(kpis.queries)} />
          <Kpi icon="▦" tone="green" label="GPU USAGE (MAX)" value={performanceFailed ? "--" : formatPercent(maxGpu, 0)} />
          <Kpi icon="▣" tone="blue" label="CPU USAGE (MAX)" value={performanceFailed ? "--" : formatPercent(maxCpu, 0)} />
        </div>

        <div className="sqm-fillcell">
          <Card title="Top Queries by Resource Usage" body={false} aside={<SortReset sort={topSort} />}>
        <Table head={[topSort.th("id", "Statement ID"), topSort.th("node", "Node"), topSort.th("worker", "Worker"),
          topSort.th("cpuTime", "Elapsed Time"), topSort.th("gpu", "GPU Utilization"), topSort.th("memory", "RAM Memory Utilization"), topSort.th("scanned", "Data Scanned")]}
          loading={!loaded && !failed} error={failed ? "Top Query 조회 실패 — 데이터 소스에 연결할 수 없습니다." : undefined}
          empty={top.length === 0 ? "실행 중인 쿼리 없음" : undefined}>
          {topSort.apply(top).map((r) => (
            <tr key={`top-${r.node}/${r.worker}/${r.id}`}><td><b>{r.id}</b></td><td>{r.node}</td><td>{r.worker}</td>
              <td>{Math.round(r.cpuTime)}s</td><td>{Number.isFinite(r.gpu) ? `${Math.round(r.gpu)}%` : "--"}</td>
              <td><MemCell bytes={r.memory} /></td><td>{formatBytes(r.scanned)}</td></tr>
          ))}
        </Table>
          </Card>
        </div>
      </div>

      <div className="sqm-main-performance sqm-mt">
        <Card title="Cluster Performance" aside={<>실시간 · {Math.max(1, Math.round(refreshMs / 1000))}초 갱신</>} body={false}>
          <ClusterPerformanceBars rows={performanceRows} resourceRows={resourceHistory} failed={performanceFailed} onPickTime={pickPerformancePoint} />
        </Card>

        <Card title="Selected Performance Point">
          {selectedPoint === null ? <div className="sqm-point-empty">Cluster Performance의 점을 선택하세요.</div> : (
            <table className="sqm-point-detail"><tbody>
              <tr><th>Time</th><td>{selectedPoint.collectTime}</td></tr>
              <tr><th>Node</th><td>{displayNode(selectedPoint.node)}</td></tr>
              <tr><th>Worker</th><td>{selectedPoint.worker || "--"}</td></tr>
              <tr><th>Connection ID</th><td>{selectedPoint.connectionId || "--"}</td></tr>
              <tr><th>Statement ID</th><td>{selectedPoint.statementId || "--"}</td></tr>
              <tr><th>Status</th><td>{selectedPoint.status || "--"}</td></tr>
              <tr><th>GPU</th><td>{selectedPoint.gpuId ?? "--"}</td></tr>
              <tr><th>GI</th><td>{selectedPoint.giId ?? "--"}</td></tr>
              <tr><th>GPU Usage</th><td>{selectedPoint.gpuUsagePercent == null ? "--" : formatPercent(selectedPoint.gpuUsagePercent, 1)}</td></tr>
              <tr><th>GPU Memory</th><td>{selectedPoint.gpuMemoryUsagePercent == null ? "--" : formatPercent(selectedPoint.gpuMemoryUsagePercent, 1)}</td></tr>
              <tr><th>CPU Usage</th><td>{selectedPoint.cpuUsagePercent == null ? "--" : formatPercent(selectedPoint.cpuUsagePercent, 1)}</td></tr>
              <tr><th>RAM Usage</th><td>{selectedPoint.ramUsagePercent == null ? "--" : formatPercent(selectedPoint.ramUsagePercent, 1)}</td></tr>
              <tr><th>Disk Usage</th><td>{selectedPoint.diskUsagePercent == null ? "--" : formatPercent(selectedPoint.diskUsagePercent, 1)}</td></tr>
              <tr><th>Temperature</th><td>{selectedPoint.temperatureC == null ? "--" : `${selectedPoint.temperatureC.toFixed(1)} °C`}</td></tr>
              <tr><th>Power</th><td>{selectedPoint.powerUsageW == null ? "--" : `${selectedPoint.powerUsageW.toFixed(1)} W`}</td></tr>
            </tbody></table>
          )}
        </Card>
      </div>

      <Card className="sqm-mt" title="Query Overview" body={false} aside={<SortReset sort={qSort} />}>
            <div className="sqm-scrollbox">
              <Table
                head={[qSort.th("id", "Statement ID"), qSort.th("user", "User"), qSort.th("node", "Node"),
                  qSort.th("worker", "Worker"), qSort.th("service", "Service"), qSort.th("status", "Status"),
                  qSort.th("elapsed", "Elapsed"), qSort.th("prog", "Progress")]}
                loading={!loaded && !failed}
                error={failed ? "쿼리 조회 실패 — 데이터 소스에 연결할 수 없습니다." : undefined}
                empty={queries.length === 0 ? "실행 중인 쿼리 없음" : undefined}>
                {qSort.apply(queries).map((r) => (
                  <tr key={`${r.connectionId}/${r.id}/${r.worker}`}>
                    <td><button type="button" className="sqm-linkbtn" onClick={() => setOpenSql((cur) => (cur?.id === r.id ? null : r))}>{r.id}</button></td>
                    <td>{r.user}</td><td>{r.node}</td><td>{r.worker}</td><td>{r.service}</td>
                    <td><Pill tone={/fail|error|kill|terminated/i.test(r.status) ? "red" : "green"}>{r.status}</Pill></td>
                    <td>{clock(r.elapsed)}</td><td>{Math.round(r.prog * 100)}%</td>
                  </tr>
                ))}
              </Table>
            </div>
      </Card>
      {/* ===== 20260925 추가 끝 : Main Dashboard 재배치 ===== */}

      {/* ===== 20260908 추가 시작 : Statement ID 클릭 -> Worker Log 쿼리문/실행계획 ===== */}
      {openSql !== null && (
        <MainStatementDetailModal
          connectionId={openSql.connectionId}
          statementId={openSql.id}
          onClose={() => setOpenSql(null)}
        />
      )}
      {/* ===== 20260908 추가 끝 : Statement ID 클릭 -> Worker Log 쿼리문/실행계획 ===== */}

      {/* X9-f4 → X15: 유형별 Recovery 다이얼로그(hang=정지/kill 병렬·crash=자동
          기동 서사) — Worker Monitoring과 같은 다이얼로그(드리프트 방지). */}
      {guideInfo !== null && (
        <RestartGuideDialog
          info={guideInfo}
          onClose={() => setRestart(null)}
          onKilled={handleKilled}
          showToast={showToast}
        />
      )}
      {toast}
    </div>
  );
}

/**
 * 쿼리 메모리 사용률 — 분모는 워커당 한도 `limitQueryMemoryGB = 314GB`.
 *
 * 한도를 넘으면 빨강이다. 목업 값으로는 안 넘지만 현장 설정이 다를 수 있어
 * 눈에 바로 띄게 둔다.
 */
function MemCell({ bytes }: { bytes: number }) {
  const limit = `한도 ${WORKER_MEM_LIMIT_GB}GB/워커`;
  if (!Number.isFinite(bytes)) return <span className="sqm-dim" title={limit}>--</span>;

  const percent = (bytes / WORKER_MEM_LIMIT_BYTES) * 100;
  const over = percent > 100;
  return (
    <div className="sqm-barcell" title={limit}>
      <div className="sqm-barcell__track">
        <div
          className="sqm-barcell__fill"
          style={{
            width: `${Math.min(100, Math.max(0, percent))}%`,
            background: over ? "var(--red)" : "var(--purple)",
          }}
        />
      </div>
      <span className="sqm-barcell__text" style={over ? { color: "var(--red)" } : undefined}>
        {percent.toFixed(1)}% ({formatBytes(bytes)})
      </span>
    </div>
  );
}
