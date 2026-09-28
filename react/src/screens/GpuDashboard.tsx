import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchMainLiveStats } from "../api/aiReactEchartMainApi";
import { FilterBar } from "../components/FilterBar";
import { QuerySummary } from "../components/QuerySummary";
import { DrilldownTopbar } from "../components/drilldown/DrilldownTopbar";
import { useToast } from "../components/drilldown/useToast";
import { Sidebar, type SidebarRoute } from "../components/Sidebar";
import { MetricStrip } from "../components/charts/MetricStrip";
import { PanScrollbar } from "../components/charts/PanScrollbar";
import { ServerGauges } from "../components/charts/ServerGauges";
import { Timeline } from "../components/charts/Timeline";
import { XViewPanel } from "../components/detail/XViewPanel";
import { OverviewBottomPanels } from "../components/overview/OverviewBottomPanels";
import { RunningQueries } from "../components/tables/RunningQueries";
import { useCharts } from "../hooks/useCharts";
import { useDashboardData, type StatementRow } from "../hooks/useDashboardData";
import { DEFAULT_STATE, useFilters } from "../hooks/useFilters";
import { useRangeSelection } from "../hooks/useRangeSelection";
import { useRealtimeQueries } from "../hooks/useRealtimeQueries";
import { useXViewEvents } from "../hooks/useXViewEvents";
import { DISCONNECT_THRESHOLD } from "../hooks/usePolling";
import { instanceSuffix, workerName } from "../lib/format";
import {
  QueryDetailModal, type QueryDetailRow,
} from "./drilldown/QueryDetailModal";
import { MainStatementDetailModal } from "./drilldown/MainStatementDetailModal";
import { KILL_SUPPRESS_MS, type LiveStatMap } from "./drilldown/queryDetailModel";

/** 탑뷰 행 → 팝업 행 (X8). startEpoch는 이미 조회 중인 시작 시각 — Kill 세대
    토큰(X6-R1 fail-closed)이 추가 조회 없이 충족된다. */
function toDetailRow(r: StatementRow): QueryDetailRow {
  return {
    id: r.stmtId,
    qid: r.qid,
    qidTags: r.qidTags,
    user: r.user,
    node: r.node,
    worker: r.worker || workerName(r.node, r.gpu, r.mig),
    service: r.service,
    elapsed: Number.isFinite(r.elapsedSec) ? r.elapsedSec : 0,
    prog: Number.isFinite(r.progress) ? r.progress : 0,
    startEpoch: r.startTimeSec,
  };
}

/** GPU/SQream 화면 (기본 라우트) — L3에서 App 본문을 무변경 추출했다. */
export function GpuDashboard({ onNavigate }: { onNavigate?: (r: SidebarRoute) => void }) {
  const { state, setState, selectGpu, selectInstance, reset } = useFilters();
  const filters = { env: state.env, instances: state.instances, gpus: state.gpus, migs: state.migs };
  const { selection, setSelection, clear: clearSelection } = useRangeSelection();
  // R6 — PPTX "(선택 인스턴스: …)" 재현: 패널 제목 접미사·단일 인스턴스 뷰 판정.
  const suffix = instanceSuffix(state.instances);
  const single = state.instances.length === 1;

  const { data, failStreak: tableFail, lastSuccessAt: tableAt } = useDashboardData(
    filters, state.refreshSec, state.rangeSec, state.startMs, state.endMs,
  );

  // ===== 20260925 추가 : 상단 5/10/30초 갱신은 실행 중 SQL에만 적용 =====
  const { rows: realtimeRows, failStreak: realtimeFail, lastSuccessAt: realtimeAt } = useRealtimeQueries(
    filters, state.refreshSec,
  );
  // ===== 20260925 추가 끝 =====

  /* X8-f1 (인간 지시 2026-08-18): 쿼리 리스트 세로 확장은 **토글**이다 — 기본은
     원래 높이(168px)라 리스트가 길어도 아래 카드(타임라인·리소스·서버)가 밀리지
     않고, 필요할 때만 펼친다(그때만 아래가 내려간다 — 사용자의 의도적 행위).
     행 자체는 어느 상태든 패널 안에서 스크롤된다. */
  const [queriesTall, setQueriesTall] = useState(false);

  /* X8: 쿼리 상세 팝업 + Kill 통합. */
  /* 2026-09-04: 행 클릭은 쿼리문 탭, Statement ID 링크는 실행 계획 탭(목업 규칙). */
  const [openQuery, setOpenQuery] = useState<{
    row: StatementRow; tab: "sql" | "logs" | "plan"; kill?: boolean;
  } | null>(null);
  // ===== 20260908 추가 시작 : Overview Statement ID - Worker Log와 동일한 쿼리문/실행계획 팝업 =====
  const [statementDetail, setStatementDetail] = useState<{ connectionId: string; statementId: string; tab: "sql" | "plan" } | null>(null);
  // ===== 20260908 추가 끝 : Overview Statement ID 상세 =====
  const [toast, showToast] = useToast();
  /* kill 접수된 stmt_id → 억제 만료(ms). 폴링이 exporter 반영(다음 tick)을
     앞지르는 한 주기 동안 행이 되살아나지 않게 한다 — 드릴다운과 같은 패턴·TTL. */
  const [killed, setKilled] = useState<ReadonlyMap<string, number>>(new Map());
  const handleKilled = (id: string) => {
    setKilled((cur) => new Map(cur).set(id, Date.now() + KILL_SUPPRESS_MS));
    setOpenQuery(null);
  };
  const rowsShown = useMemo(() => {
    const now = Date.now();
    // TTL 만료 항목은 자연히 다시 보인다 — 재사용 신원의 다음 쿼리를 숨기면 안 된다.
    return realtimeRows.filter((r) => (killed.get(r.stmtId) ?? 0) <= now);
  }, [realtimeRows, killed]);

  // ===== 20260908 추가 시작 : 상세 팝업 라이브 조회 PromQL 제거 =====
  const pollLive = useCallback(async (signal: AbortSignal): Promise<LiveStatMap> => {
    // ===== 20260908 추가 시작 : Overview 상세 팝업도 선택 조회기간 사용 =====
    const endMs = state.endMs ?? Date.now();
    const startMs = state.startMs ?? (endMs - state.rangeSec * 1000);
    const rows = await fetchMainLiveStats(startMs, endMs, signal);
    // ===== 20260908 추가 끝 : Overview 상세 팝업도 선택 조회기간 사용 =====
    const map: Map<string, { elapsed: number; prog: number }> = new Map();
    for (const r of rows) {
      map.set(String(r.stmtId ?? ""), { elapsed: Number(r.elapsed ?? 0), prog: Number(r.prog ?? 0) });
    }
    return map;
  }, [state.startMs, state.endMs, state.rangeSec]);
  // ===== 20260908 추가 끝 : 상세 팝업 라이브 조회 PromQL 제거 =====
  const { data: charts, failStreak: chartFail, lastSuccessAt: chartAt } = useCharts(
    filters, state.rangeSec, state.refreshSec, state.startMs, state.endMs,
  );
  // X2: 구 useRangeDetail 폴링은 X-View 교체로 중단(XR-04) — 완료 이벤트 폴링이 대신한다.
  const { events, failStreak: xviewFail, lastSuccessAt: xviewAt } = useXViewEvents(
    filters, state.rangeSec, state.refreshSec, state.startMs, state.endMs,
  );

  // X4: 타임라인 팬 앵커 — null = 최신 추적. 시간 범위를 바꾸면 추적으로 복귀한다.
  const [tlAnchor, setTlAnchor] = useState<number | null>(null);
  // ===== 20260916 추가 시작 : 타임라인 조회기간 + 실행시간(초) 이상 강조 =====
  const [executionThresholdSec, setExecutionThresholdSec] = useState<string>("");
  const toLocalInput = (ms: number) => {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };
  const timelineEndMs = state.endMs ?? Date.now();
  const timelineStartMs = state.startMs ?? (timelineEndMs - state.rangeSec * 1000);
  // ===== 20260916 추가 끝 : 타임라인 조회기간 + 실행시간(초) 이상 강조 =====
  useEffect(() => {
    setTlAnchor(null);
  }, [state.rangeSec, state.startMs, state.endMs]);
  const windowMs = state.rangeSec * 1000;
  const pd = charts.panDomain;
  const tlEnd =
    tlAnchor === null || pd.endMs === 0
      ? charts.domain.endMs
      : Math.min(Math.max(tlAnchor, pd.startMs + windowMs), pd.endMs);
  const tlStart = tlEnd - windowMs;

  const disconnected = Math.max(tableFail, chartFail, xviewFail, realtimeFail) >= DISCONNECT_THRESHOLD;

  // ===== 20260908 추가 : 중단 카드 값은 server_status.statement_status=stopping 직접 집계 =====
  const stoppedWindow = state.rangeSec % 3600 === 0
    ? `${state.rangeSec / 3600}시간`
    : `${Math.round(state.rangeSec / 60)}분`;
  // R9(F7.1): 세 폴링 중 가장 최근 성공 시각 — 헤더 "갱신 HH:MM:SS".
  const successTimes = [tableAt, chartAt, xviewAt, realtimeAt].filter((t): t is number => t !== null);
  const lastUpdatedMs = successTimes.length > 0 ? Math.max(...successTimes) : null;
  // R9(F7.2): 첫 성공 전(끊김 아님)은 "없음"이 아니라 "로딩" — 빈 상태 문구를 구분한다.
  // 폴링 계열별로 판정한다 (CDX-R9): detail이 먼저 성공해도 테이블·차트는 각자의
  // 첫 성공 전까지 "불러오는 중…"을 유지해야 한다.
  const loadingText = (at: number | null) =>
    !disconnected && at === null ? "불러오는 중…" : undefined;

  // R7: Grafana판 리셋 링크 2종 미러
  const resetRange = () => {
    // ===== 20260908 추가 시작 : Overview 조회기간 최근 30분으로 리셋 =====
    setState({ rangeSec: DEFAULT_STATE.rangeSec, startMs: null, endMs: null });
    // ===== 20260908 추가 끝 : Overview 조회기간 최근 30분으로 리셋 =====
    clearSelection();
  };
  const resetAll = () => {
    reset();
    clearSelection();
  };

  return (
    <div className="app-shell">
      <Sidebar
        servers={data.servers}
        selectedInstances={state.instances}
        onSelectInstance={selectInstance}
        route="gpu"
        onNavigate={onNavigate}
      />

      <main className="content content--overview">
        {/* 상세 대시보드와 같은 상단바(인간 지시 2026-08-09). 기존 `Header`(h1 + KST 시계)는
            제목이 중복돼 제거했고, 그것이 보여 주던 데이터 갱신 시각은 `dataUpdatedMs`로 넘긴다.
            `.app-shell`은 2열 그리드라 자식을 늘리면 암묵 열이 생긴다(§4-16) — 그래서
            `.content`(flex column) 안에 둔다. */}
        <DrilldownTopbar
          refreshMs={state.refreshSec * 1000}
          dataUpdatedMs={lastUpdatedMs}
          statusPollMs={0}
          sticky
        />
        <div className="dashboard-canvas">
          <FilterBar state={state} setState={setState} onResetRange={resetRange} onResetAll={resetAll} />

          {disconnected && (
            <div className="conn-banner" role="alert">
              ⚠ Spring API에 연결할 수 없습니다 — 데이터가 없어 화면을 비웠습니다.
            </div>
          )}

          {/* ===== 20260916 추가 시작 : 상태 5카드를 실시간 쿼리 왼쪽에 세로 배치 ===== */}
          <section className={`dashboard-realtime-row${queriesTall ? " dashboard-realtime-row--tall" : ""}`} aria-label="실시간 쿼리 및 상태 요약">
            <QuerySummary
              queued={data.kpi.queuedStatements}
              preparing={data.kpi.preparingStatements}
              initializing={data.kpi.initializingStatements}
              running={data.kpi.executingStatements}
              stopped={data.kpi.stoppingStatements}
              stoppedWindow={stoppedWindow}
            />

            <div id="dashboard-queries" className="dashboard-realtime-table">
              <RunningQueries
                rows={rowsShown} titleSuffix={suffix} emptyText={loadingText(tableAt)}
                onOpen={(row, tab) => {
                  // ===== 20260908 추가 시작 : Overview Statement ID/행 -> Worker Log 상세 API =====
                  if ((tab === "plan" || tab === "sql") && row.connectionId && row.stmtId) {
                    setStatementDetail({ connectionId: row.connectionId, statementId: row.stmtId, tab: tab === "plan" ? "plan" : "sql" });
                  } else {
                    setOpenQuery({ row, tab });
                  }
                  // ===== 20260908 추가 끝 : Overview Statement 상세 API =====
                }}
                onKill={(row) => setOpenQuery({ row, tab: "plan", kill: true })}
                actions={
                  <button
                    type="button" className="panel__expand"
                    aria-expanded={queriesTall}
                    aria-controls="dashboard-queries"
                    title={queriesTall ? "목록을 원래 높이로 접습니다." : "실시간 목록을 더 크게 펼칩니다."}
                    onClick={() => setQueriesTall((v) => !v)}
                  >
                    {queriesTall ? "접기 ▴" : "펼치기 ▾"}
                  </button>
                }
              />
            </div>
          </section>
          {/* ===== 20260916 추가 끝 : 상태 5카드 세로 배치 + 실시간 쿼리 높이 확대 ===== */}

          {/* ===== 20260916 추가 시작 : 상태카드 바로 아래 전체 가로 조회조건 ===== */}
          <section className="timeline-filter-row" aria-label="타임라인 조회 조건">
            <div className="timeline-filterbar">
              <label className="filter"><span className="filter__label">조회기간</span>
                <input className="filter__select" type="datetime-local" value={toLocalInput(timelineStartMs)}
                  onChange={(e) => { const v=Date.parse(e.target.value); if(Number.isFinite(v) && v < timelineEndMs) setState({startMs:v,endMs:timelineEndMs,rangeSec:Math.max(1,Math.floor((timelineEndMs-v)/1000))}); }} />
              </label>
              <span className="timeline-filterbar__sep">~</span>
              <label className="filter"><span className="filter__label">종료</span>
                <input className="filter__select" type="datetime-local" value={toLocalInput(timelineEndMs)}
                  onChange={(e) => { const v=Date.parse(e.target.value); if(Number.isFinite(v) && v > timelineStartMs) setState({startMs:timelineStartMs,endMs:v,rangeSec:Math.max(1,Math.floor((v-timelineStartMs)/1000))}); }} />
              </label>
              <label className="filter"><span className="filter__label">실행시간</span>
                <input className="filter__select timeline-filterbar__duration" type="number" min="0" step="1" placeholder="예: 10" value={executionThresholdSec}
                  onChange={(e)=>setExecutionThresholdSec(e.target.value)} />
                <span className="timeline-filterbar__unit">(초) 이상</span>
              </label>
            </div>
          </section>
          {/* ===== 20260916 추가 끝 : 상태카드 바로 아래 전체 가로 조회조건 ===== */}

          <section className="dashboard-middle" aria-label="타임라인 및 선택 구간">
            <Timeline
              rows={charts.timelineRows}
              domainStart={tlStart}
              domainEnd={tlEnd}
              selection={selection}
              onSelectRange={setSelection}
              onSelectGpu={selectGpu}
              titleSuffix={suffix}
              singleInstance={single}
              emptyText={loadingText(chartAt)}
              executionThresholdSec={executionThresholdSec === "" ? null : Number(executionThresholdSec)}
              panControl={
                pd.endMs > 0 ? (
                  <PanScrollbar
                    panStartMs={pd.startMs}
                    panEndMs={pd.endMs}
                    windowMs={windowMs}
                    anchorEndMs={tlAnchor}
                    onPan={(a) => {
                      // 팬하면 브러시 선택 해제 (CDX-X4-03) — 남겨 두면 타임라인과
                      // X-View가 서로 다른 시간대를 가리킨다
                      clearSelection();
                      setTlAnchor(a);
                    }}
                    ariaLabel="타임라인 과거 구간 스크롤"
                  />
                ) : undefined
              }
            />
            {/* X2: "시간 구간"+"선택 구간 상세" → X-View 패널 1개. GPU 전용 1행
                modifier(NX-03) — LLM 화면의 .detail-col 2행 규칙은 그대로 둔다. */}
            <div className="detail-col detail-col--xview">
              <XViewPanel
                events={events}
                selection={selection}
                domain={charts.domain}
                pan={pd}
                disconnected={disconnected}
                onClose={clearSelection}
                emptyText={loadingText(xviewAt)}
              />
            </div>
          </section>

          <section className="dashboard-bottom" aria-label="GPU 지표 및 서버 게이지">
            <MetricStrip
              series={charts.series}
              emptyText={loadingText(chartAt)}
              domain={charts.domain}
              pan={{ panDomain: pd, windowMs }}
            />
            {/* 20260916 추가: nvidia_smi + dcgmi 실측 hostname 평균 카드 */}
            <ServerGauges servers={charts.servers} />
          </section>

          {/* ===== 20260916 추가 시작 : Overview 맨 아래 Table Chunk / Internal Runtime Error ===== */}
          <OverviewBottomPanels startMs={timelineStartMs} endMs={timelineEndMs} filters={filters} refreshSec={state.refreshSec} />
          {/* ===== 20260916 추가 끝 : Overview 맨 아래 Table Chunk / Internal Runtime Error ===== */}
        </div>

        {/* X8: 쿼리 상세 팝업(플랜 탭 기본) + Kill + 토스트 — 드릴다운 팝업 재사용.
            sqm-* 스타일의 CSS 변수는 .sqm-page 스코프에만 선언돼 있어 래퍼가 필수인데,
            display:contents 면 변수는 상속되고 박스는 생성되지 않아 .sqm-page 의
            gradient·padding 이 이 화면으로 새지 않는다. 모달·토스트는 position:fixed. */}
        <div className="sqm-page" style={{ display: "contents" }}>
          {openQuery !== null && (
            <QueryDetailModal
              row={toDetailRow(openQuery.row)}
              initialTab={openQuery.tab}
              openKillOnMount={openQuery.kill === true}
              pollLive={pollLive}
              onClose={() => setOpenQuery(null)}
              onKilled={handleKilled}
              showToast={showToast}
            />
          )}
          {toast}
        </div>
      </main>

      {statementDetail && (
        <MainStatementDetailModal
          connectionId={statementDetail.connectionId}
          statementId={statementDetail.statementId}
          initialTab={statementDetail.tab}
          onClose={() => setStatementDetail(null)}
        />
      )}
    </div>
  );
}
