import { useEffect, useState } from "react";
import { Sidebar, type SidebarRoute } from "../components/Sidebar";
import type { DrilldownView } from "../hooks/useRoute";
import { NODES } from "../api/queries";
import { fetchCommonStatus } from "../api/aiReactEchartCommonApi";
import { DrilldownToolbar } from "../components/drilldown/DrilldownToolbar";
import { DrilldownTopbar } from "../components/drilldown/DrilldownTopbar";
import { DEFAULT_FILTERS, type DrilldownFilters } from "../components/drilldown/toolbarModel";
import { Alarms } from "./drilldown/Alarms";
// 20260928 추가 - 화면별 폴더 분리
import { LogMonitoring } from "./drilldown/logs/LogMonitoring";
import { MainDashboard } from "./drilldown/main/MainDashboard";
import { QueryAnalytics } from "./drilldown/query/QueryAnalytics";
import { SessionMonitoring } from "./drilldown/SessionMonitoring";
import { SnapshotLock } from "./drilldown/SnapshotLock";
import { SystemInfo } from "./drilldown/SystemInfo";
import { TableActivity } from "./drilldown/TableActivity";
import { TableUsage } from "./drilldown/TableUsage";
import { WorkerMonitoring } from "./drilldown/worker/WorkerMonitoring";
import "../styles/drilldown.css";

/**
 * 모든 상세 화면이 받는 공통 prop.
 *
 * 툴바가 들고 있는 필터를 통째로 넘긴다 — 화면마다 쓰는 축이 달라서(테이블 화면은 서버·GPU를
 * 안 쓰고, Worker 화면은 구간을 안 쓴다) 골라 쓰게 하는 편이 배선이 단순하다.
 * `refreshMs`는 툴바의 자동 갱신에서 나온다. **0이면 Off**이고 `usePolling`이 첫 조회만 한다.
 */
export interface DrilldownScreenProps {
  refreshMs: number;
  filters: DrilldownFilters;
  /** 화면 이름. 진원지는 아래 `VIEWS` 하나다 — 화면이 각자 하드코딩하면
   *  사이드바와 본문이 어긋난다. */
  title: string;
  /** 고정 해제. 차트 카드(또는 `PageHead`)의 `PinChip`이 부른다. */
  onClearPin: () => void;
  /**
   * 고정된 시점(ms). `null`이면 현재를 본다.
   *
   * **셸이 들고 있다.** 화면이 각자 가지면 차트와 표가 다른 시각을 볼 수 있고,
   * 화면을 옮기면 고정이 풀린다. 시점은 화면과 독립이어야 한다.
   *
   * 화면은 instant 질의에만 넘긴다 — **range 질의(차트)는 고정하지 않는다.**
   * 맥락을 보려면 시계열은 계속 흘러야 한다.
   */
  pinnedMs: number | null;
  onPickTime: (ms: number) => void;
}

/**
 * SQream 상세 대시보드 — **10화면 전부 React 네이티브**다 (SPA 단계 S3, 2026-08-09).
 *
 * 이전 구조는 4단 중첩이었다: 포털 → React → `res/sqream/drilldown.html`(③) →
 * `res/sqream/mockup/*.html`(④). 이제 iframe이 없어 화면 전환에서 문서 로드가 0건이다.
 *
 * 정적 화면의 상단 UI 두 개를 여기로 이관했다. **둘 다 처음엔 빠뜨렸다가 되살렸다** —
 * 같은 실수를 두 번 했다는 뜻이고, 그래서 지금은 둘 다 테스트로 잠겨 있다.
 *  - `DrilldownToolbar` — ③ 셸의 툴바. 빠뜨려서 자동 갱신 Off·GPU/Worker 필터를
 *    잃었다 (codex CDX-S3C-01).
 *  - `DrilldownTopbar` — ④ 화면들의 `header.topbar`. 빠뜨려서 CLUSTER STATUS·NODES·
 *    VERSION 표시를 통째로 잃었다 (인간 지적 2026-08-09).
 *
 * 정적 문서(③④) 20개는 2026-08-09에 삭제했다 — ESC-H9·ESC-H11 해소.
 */
const VIEWS: Record<DrilldownView, { title: string; Screen: (p: DrilldownScreenProps) => JSX.Element }> = {
  main: { title: "Main Dashboard", Screen: MainDashboard },
  worker: { title: "Worker Monitoring", Screen: WorkerMonitoring },
  query: { title: "Query Analytics", Screen: QueryAnalytics },
  logs: { title: "Log Monitoring", Screen: LogMonitoring },
  session: { title: "Session Monitoring", Screen: SessionMonitoring },
  usage: { title: "Table Usage", Screen: TableUsage },
  activity: { title: "Table Activity", Screen: TableActivity },
  snapshot: { title: "Snapshot & Lock", Screen: SnapshotLock },
  alarms: { title: "Alarms", Screen: Alarms },
  metadata: { title: "System Info", Screen: SystemInfo },
};

/** 사이드바 서버 카드가 쓰는 값. 사이드바는 `gpuBusy/gpuTotal`만 표시한다. */
type ServerCards = Array<{
  node: string; utilization: number; memoryPct: number; temperature: number; power: number;
  gpuBusy: number; gpuTotal: number; migTotal: number; online?: boolean;
}>;

/** 첫 응답 전 골격 — 숫자는 `NaN`이라 사이드바가 `--`가 아니라 0으로 접지 않는다. */
const EMPTY_SERVERS: ServerCards = NODES.map((node) => ({
  node, utilization: 0, memoryPct: 0, temperature: 0, power: 0,
  gpuBusy: NaN, gpuTotal: NaN, migTotal: NaN,
}));

export function DrilldownDashboard({ view, onNavigate }: {
  view: DrilldownView;
  onNavigate: (route: SidebarRoute) => void;
}) {
  const [filters, setFilters] = useState<DrilldownFilters>(DEFAULT_FILTERS);
  /* 고정 시점은 필터가 아니다 — `구간·필터 모두 초기화`로 풀리면 안 되고,
     화면을 옮겨도 유지된다. */
  const [pinnedMs, setPinnedMs] = useState<number | null>(null);
  /* 같은 지점을 다시 누르면 풀린다(인간 지시 2026-08-10). 차트가 실제 샘플 시각으로
     스냅해 주므로 같은 점을 누르면 값이 정확히 같다 — 그래서 토글이 성립한다. */
  const pickTime = (ms: number) => setPinnedMs((cur) => (cur === ms ? null : ms));
  const { title, Screen } = VIEWS[view];

  /* 사이드바 서버 카드 — PostgreSQL 직접 조회.
     서버 정상/중단과 GPU 사용 개수는 서로 다른 개념이다. */
  const [servers, setServers] = useState<ServerCards>(EMPTY_SERVERS);
  const serverRefreshMs = filters.refreshSec * 1000;

  // ===== 20260908 추가 시작 : GPU 서버 목록 Prometheus 제거 + NVIDIA 최신 스냅샷 직접 매핑 =====
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    const load = async () => {
      try {
        const endMs = filters.endMs ?? Date.now();
        const status = await fetchCommonStatus(endMs, ac.signal);
        const byNode = new Map((status.servers ?? []).map((r) => [r.hostname, r]));

        const rows: ServerCards = NODES.map((node) => {
          const r = byNode.get(node);
          return {
            node,
            utilization: 0, memoryPct: 0, temperature: 0, power: 0,
            gpuTotal: r?.gpu_total == null ? NaN : Number(r.gpu_total),
            migTotal: r?.mig_total == null ? NaN : Number(r.mig_total),
            gpuBusy: r?.gpu_busy == null ? NaN : Number(r.gpu_busy),
            online: Boolean(r?.online),
          };
        });

        if (alive) setServers(rows);
      } catch (e) {
        if (ac.signal.aborted) return;
        console.error("GPU server status API error", e);
        if (alive) setServers(EMPTY_SERVERS);
      }
    };

    void load();
    if (serverRefreshMs <= 0) return () => { alive = false; ac.abort(); };
    const timer = setInterval(() => { void load(); }, serverRefreshMs);
    return () => { alive = false; ac.abort(); clearInterval(timer); };
  }, [serverRefreshMs, filters.endMs]);
  // ===== 20260908 추가 끝 : GPU 서버 목록 Prometheus 제거 + NVIDIA 최신 스냅샷 직접 매핑 =====

  return (
    <div className="app-shell">
      <Sidebar servers={servers} selectedInstances={filters.server ? [filters.server] : []}
        onSelectInstance={(node) => {
          // 사이드바 카드와 툴바의 Node 셀렉트는 같은 상태를 본다 — 어긋나지 않게.
          setFilters((f) => (f.server === node
            ? { ...f, server: "", gpu: "", mig: "" }
            : { ...f, server: node, gpu: "", mig: "" }));
        }} route="gpu"
        onNavigate={onNavigate} usageUnit="GPU" />
      <main className="drilldown-content">
        {/* 정적 화면 11개가 전부 갖고 있던 헤더. S3에서 빠뜨렸다가 되살렸다(2026-08-09). */}
        <DrilldownTopbar refreshMs={filters.refreshSec * 1000} />
        <DrilldownToolbar filters={filters} onChange={setFilters} realtimeOnly={view === "main"} />
        <div className="drilldown-content__body">
          <Screen
            refreshMs={filters.refreshSec * 1000}
            filters={filters}
            title={title}
            pinnedMs={pinnedMs}
            onPickTime={pickTime}
            onClearPin={() => setPinnedMs(null)}
          />
        </div>
      </main>
    </div>
  );
}
