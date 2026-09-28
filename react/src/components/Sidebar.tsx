import { Fragment, useState } from "react";
import type { ServerSummary } from "../hooks/useDashboardData";
import { displayNode, formatInt } from "../lib/format";

export type SidebarRoute = "gpu" | "llm" | "rllm";

const SIDEBAR_COLLAPSED_KEY = "ax-portal.sidebar-collapsed";

const DRILLDOWN_ITEMS = [
  ["main", "Main Dashboard"], ["worker", "Worker Monitoring"],
  ["query", "Query Analytics"], ["logs", "Log Monitoring"],
  ["session", "Session Monitoring"], ["usage", "Table Usage"],
  ["activity", "Table Activity"], ["snapshot", "Snapshot & Lock"],
  ["alarms", "Alarms"], ["metadata", "System Info"],
] as const;

const LLM_DRILLDOWN_ITEMS = [
  ["process", "Process Monitoring"], ["services", "LLM Service Detail"],
  ["timeline", "Execution Timeline"], ["gpu", "GPU / Hardware Detail"],
  ["server", "Server Detail"],
] as const;

/**
 * AX Portal 메뉴 (구현된 화면만 활성, 나머지는 표시하되 비활성) — ADR R-0003.
 * R7: PPTX 계층 재현 — "GPU 모니터링"이 최상위 항목이고 나머지 화면은
 * 그 아래 **들여쓴 하위 항목**(sub)이다. "개요/알림"은 섹션 라벨.
 */
const MENU_GROUPS: Array<{
  id: string;
  title: string;
  items: Array<{
    label: string;
    active?: boolean;
    sub?: boolean;
    routeTo?: SidebarRoute;
  }>;
}> = [
  {
    id: "sidebar-overview-title",
    title: "개요 (Overview)",
    items: [
      { label: "GPU 모니터링", active: true, routeTo: "gpu" },
      { label: "GPU/SQream 모니터링", sub: true, routeTo: "gpu" },
      { label: "GPU/LLM 모니터링", sub: true, routeTo: "llm" },
      /* GPU/LLM REAL(#/rllm)은 요청에 따라 범위에서 제외 (2026-08-08) — App.tsx 주석 참조 */
      { label: "GPU 상세", sub: true },
      { label: "프로세스 모니터링", sub: true },
      { label: "LLM 모니터링", sub: true },
      { label: "Cost 분석", sub: true },
    ],
  },
  {
    id: "sidebar-alert-title",
    title: "알림 (Alert)",
    items: [{ label: "대시보드 설정" }],
  },
];

function ServerListCard({
  server,
  active,
  onSelect,
  usageUnit,
}: {
  server: ServerSummary;
  active: boolean;
  onSelect: (node: string) => void;
  /** 사용량 표기 단위 — GPU 화면은 MIG 슬롯, LLM 화면은 물리 GPU (L3). */
  usageUnit: "MIG" | "GPU";
}) {
  // v2.0(MIG): 사용량 분모는 MIG 슬롯 수(8) — busy도 슬롯 단위 카운트다.
  // L3(GPU 단위 화면): usageUnit="GPU"면 분모가 물리 GPU 수(4), busy도 GPU 카운트.
  const total = usageUnit === "GPU"
    ? (Number.isFinite(server.gpuTotal) ? server.gpuTotal : 0)
    : (Number.isFinite(server.migTotal) ? server.migTotal : 0);
  const busy = Number.isFinite(server.gpuBusy) ? server.gpuBusy : 0;
  // ===== 20260908 추가 시작 : 서버 정상/중단은 GPU 개수가 아니라 최신 수집 상태로 판정 =====
  // 0 / 4 GPU 사용 중이어도 서버 자체는 정상일 수 있다.
  const healthy = typeof server.online === "boolean" ? server.online : total > 0;
  // ===== 20260908 추가 끝 : 서버 정상/중단은 GPU 개수가 아니라 최신 수집 상태로 판정 =====
  return (
    <button
      type="button"
      className={`server-card ${active ? "server-card--active" : ""}`}
      aria-pressed={active}
      onClick={() => onSelect(server.node)}
    >
      <div className="server-card__head">
        <span className="server-card__name">{displayNode(server.node)}</span>
        <span className={`server-card__badge ${healthy ? "ok" : "down"}`}>
          {healthy ? "정상" : "중단"}
        </span>
      </div>
      <div className="server-card__usage">
        {formatInt(busy)} / {formatInt(total)}&nbsp;&nbsp;{usageUnit} 사용 중
      </div>
    </button>
  );
}

export function Sidebar({
  servers,
  selectedInstances,
  onSelectInstance,
  route = "gpu",
  onNavigate,
  usageUnit = "MIG",
}: {
  servers: ServerSummary[];
  /** 현재 선택된 인스턴스 목록 (단독 선택일 때 해당 카드가 active). */
  selectedInstances: string[];
  /** 서버 카드 클릭 → 인스턴스 선택 토글 (R6 — PPTX 단일 인스턴스 뷰 진입). */
  onSelectInstance: (node: string) => void;
  /** 현재 화면 (L3 — 메뉴 활성·aria-current 판정). */
  route?: SidebarRoute;
  /** 화면 전환 메뉴 클릭 (L3 — 해시 라우팅). */
  onNavigate?: (r: SidebarRoute) => void;
  /** 서버 카드 사용량 단위 (L3 — LLM 화면은 "GPU"). */
  usageUnit?: "MIG" | "GPU";
}) {
  const single = selectedInstances.length === 1;
  const [drilldownOpen, setDrilldownOpen] = useState(location.hash.startsWith("#/drilldown/"));
  const [llmDrilldownOpen, setLlmDrilldownOpen] = useState(location.hash.startsWith("#/llm-drilldown/"));
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [hoverExpanded, setHoverExpanded] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      setHoverExpanded(false);
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Storage can be unavailable in private or embedded browser contexts.
      }
      return next;
    });
  };

  return (
    <aside
      className={[
        "sidebar",
        collapsed ? "sidebar--collapsed" : "",
        collapsed && hoverExpanded ? "sidebar--hover-expanded" : "",
      ].filter(Boolean).join(" ")}
      aria-label="사이드바"
      onMouseEnter={() => {
        if (collapsed) setHoverExpanded(true);
      }}
      onMouseLeave={() => setHoverExpanded(false)}
    >
      <button
        type="button"
        className="sidebar__collapse-toggle"
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
        title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
      </button>
      <div className="sidebar__scroll">
        <div className="sidebar__logo">
          <span className="sidebar__logo-mark" aria-hidden="true" />
          AX Portal
        </div>

        <nav className="sidebar__nav" aria-label="대시보드 메뉴">
          {MENU_GROUPS.map((group) => (
            <section key={group.title} className="sidebar__group" aria-labelledby={group.id}>
              <h2 className="sidebar__group-title" id={group.id}>{group.title}</h2>
              {group.items.map((item) => {
                // L3: 라우트 항목은 클릭 가능. 활성 = 고정 active(상위 항목) 또는 현재 라우트.
                const isRouteItem = item.routeTo !== undefined;
                const isCurrent = isRouteItem && item.routeTo === route;
                const activeCls = item.active || isCurrent;
                const cls = [
                  "sidebar__item",
                  activeCls ? "active" : "",
                  item.sub ? "sidebar__item--sub" : "",
                  isRouteItem ? "sidebar__item--nav" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                if (isRouteItem) {
                  const isSqreamMenu = item.routeTo === "gpu" && item.sub;
                  const isLlmMenu = item.routeTo === "llm" && item.sub;
                  return (
                    <Fragment key={item.label}>
                    <div
                      className={cls}
                      role="button"
                      tabIndex={0}
                      // 현재 화면 표시는 화면 링크(sub)에만 — 상위 카테고리와 중복 방지
                      aria-current={isCurrent && item.sub ? "page" : undefined}
                      onClick={() => onNavigate?.(item.routeTo as SidebarRoute)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        onNavigate?.(item.routeTo as SidebarRoute);
                      }}
                    >
                      <span>{item.label}</span>
                      {isSqreamMenu && (
                        <button type="button" className="sidebar__drilldown-toggle"
                          aria-label={drilldownOpen ? "SQream 상세 메뉴 접기" : "SQream 상세 메뉴 펼치기"}
                          aria-expanded={drilldownOpen}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDrilldownOpen((open) => !open);
                          }}>
                          <span aria-hidden="true">{drilldownOpen ? "⌄" : "›"}</span>
                        </button>
                      )}
                      {isLlmMenu && (
                        <button type="button" className="sidebar__drilldown-toggle"
                          aria-label={llmDrilldownOpen ? "LLM 상세 메뉴 접기" : "LLM 상세 메뉴 펼치기"}
                          aria-expanded={llmDrilldownOpen}
                          onClick={(event) => {
                            event.stopPropagation();
                            setLlmDrilldownOpen((open) => !open);
                          }}>
                          <span aria-hidden="true">{llmDrilldownOpen ? "⌄" : "›"}</span>
                        </button>
                      )}
                    </div>
                    {isSqreamMenu && drilldownOpen && (
                      <nav className="sidebar__drilldown" aria-label="SQream 드릴다운 메뉴">
                        {DRILLDOWN_ITEMS.map(([view, label]) => (
                          <a key={view} href={`#/drilldown/${view}`}
                            className={location.hash === `#/drilldown/${view}` ? "active" : ""}>
                            {label}
                          </a>
                        ))}
                      </nav>
                    )}
                    {isLlmMenu && llmDrilldownOpen && (
                      <nav className="sidebar__drilldown sidebar__drilldown--llm" aria-label="LLM 드릴다운 메뉴">
                        {LLM_DRILLDOWN_ITEMS.map(([view, label]) => (
                          <a key={view} href={`#/llm-drilldown/${view}`}
                            className={location.hash === `#/llm-drilldown/${view}` ? "active" : ""}>
                            {label}
                          </a>
                        ))}
                      </nav>
                    )}
                    </Fragment>
                  );
                }
                return (
                  <div
                    key={item.label}
                    className={cls}
                    aria-disabled={!item.active}
                    aria-current={item.active ? "page" : undefined}
                  >
                    {item.label}
                  </div>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar__separator" role="separator" aria-orientation="horizontal" />

        <section className="sidebar__servers" aria-labelledby="sidebar-servers-title">
          <h2 className="sidebar__group-title" id="sidebar-servers-title">GPU 서버 목록</h2>
          {servers.map((s) => (
            <ServerListCard
              key={s.node}
              server={s}
              active={single && selectedInstances[0] === s.node}
              onSelect={onSelectInstance}
              usageUnit={usageUnit}
            />
          ))}
        </section>

        {/*
          * 2026-08-09 제거: 사이드바 하단의 레거시 `SQREAM DRILL-DOWN` <details> 블록.
          * 위쪽 서브메뉴와 같은 aria-label("SQream 드릴다운 메뉴")을 가진 nav와
          * #/drilldown/* 링크 10개를 한 벌 더 렌더하던 **죽은 마크업**이다.
          * `.sidebar__drilldown-legacy { display: none !important }`가 걸려 있어
          * 브라우저에서는 화면에도 접근성 트리에도 없었다 — 즉 사용자 영향은 없었고,
          * CSS가 없는 jsdom 테스트에서만 중복으로 잡혔다. 화면 변화 없이 걷어냈다.
          * 서브메뉴는 위 `isSqreamMenu && drilldownOpen` 블록 하나만 남는다.
          */}
      </div>
    </aside>
  );
}
