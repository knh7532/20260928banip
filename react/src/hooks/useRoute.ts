import { useCallback, useEffect, useState } from "react";

export type Route = "gpu" | "llm" | "rllm" | "drilldown" | "llm-drilldown";

export const DRILLDOWN_VIEWS = [
  "main", "worker", "query", "logs", "session", "usage",
  "activity", "snapshot", "alarms", "metadata",
] as const;
export type DrilldownView = typeof DRILLDOWN_VIEWS[number];

export const LLM_DRILLDOWN_VIEWS = ["process", "services", "timeline", "gpu", "server"] as const;
export type LlmDrilldownView = typeof LLM_DRILLDOWN_VIEWS[number];
export function llmDrilldownViewFromHash(hash: string): LlmDrilldownView {
  const view = hash.replace(/^#\/llm-drilldown\/?/, "").split("?")[0].toLowerCase();
  return LLM_DRILLDOWN_VIEWS.includes(view as LlmDrilldownView) ? view as LlmDrilldownView : "process";
}

export function drilldownViewFromHash(hash: string): DrilldownView {
  const legacy = legacyDetailHash(hash);
  if (legacy) hash = legacy;
  const view = hash.replace(/^#\/drilldown\/?/, "").split("?")[0].toLowerCase();
  return DRILLDOWN_VIEWS.includes(view as DrilldownView) ? view as DrilldownView : "main";
}

/**
 * transplant 이전 판(SQream 상세 세트)의 `#/detail/*` 해시 → 드릴다운 해시.
 * 그 화면(DetailDashboard)은 Prometheus 기반 드릴다운으로 대체됐다 — 북마크·Grafana 링크
 * 호환용 매핑만 남긴다. detail 계열이 아니면 null.
 */
const LEGACY_DETAIL_PAGES: Record<string, DrilldownView> = {
  overview: "main", workers: "worker", logs: "logs", sessions: "session",
  "table-usage": "usage", tables: "usage", "table-activity": "activity", activity: "activity",
};
export function legacyDetailHash(hash: string): string | null {
  const m = /^#\/?(?:detail|details)(?:\/([^?]*))?(?:\?.*)?$/i.exec(hash);
  if (!m) return null;
  const page = (m[1] ?? "").replace(/\/$/, "").toLowerCase();
  return `#/drilldown/${LEGACY_DETAIL_PAGES[page] ?? "main"}`;
}

export function routeFromHash(hash: string): Route {
  const legacy = legacyDetailHash(hash);
  if (legacy) return "drilldown";
  const route = hash
      .replace(/^#\/?/, "")
      .split("?")[0]
      .toLowerCase();

  if (route === "llm") {
    return "llm";
  }

  if (route === "rllm") {
    return "rllm";
  }

  // ===== 20260908 추가 시작 : Overview 명시 URL (#/overview) =====
  if (route === "overview") return "gpu";
  // ===== 20260908 추가 끝 : Overview 명시 URL (#/overview) =====

  if (route.startsWith("drilldown/")) return "drilldown";
  if (route.startsWith("llm-drilldown/")) return "llm-drilldown";

  return "gpu";
}

export function hashForRoute(route: Route): string {
  switch (route) {
    case "llm":
      return "#/llm";

    case "rllm":
      return "#/rllm";

    case "drilldown":
      return "#/drilldown/main";

    case "llm-drilldown":
      return "#/llm-drilldown/process";

    default:
      // ===== 20260908 추가 시작 : GPU Overview 기본 이동 URL을 #/overview로 통일 =====
      return "#/overview";
      // ===== 20260908 추가 끝 : GPU Overview 기본 이동 URL을 #/overview로 통일 =====
  }
}

/** 레거시 `#/detail/*` 면 주소창을 드릴다운 해시로 바꿔치기(replaceState)하고 그 해시를 돌려준다. */
function normalizeLegacyHash(): string {
  const legacy = legacyDetailHash(location.hash);
  if (legacy) {
    history.replaceState(null, "", `${location.pathname}${location.search}${legacy}`);
    return legacy;
  }
  return location.hash;
}

export function useRoute(): {
  route: Route;
  navigate: (route: Route) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
      routeFromHash(
          typeof location === "undefined"
              ? ""
              : normalizeLegacyHash(),
      ),
  );
  const [, setCurrentHash] = useState(() => typeof location === "undefined" ? "" : location.hash);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash(normalizeLegacyHash()));
      setCurrentHash(location.hash);
    };

    window.addEventListener(
        "hashchange",
        onHashChange,
    );

    return () => {
      window.removeEventListener(
          "hashchange",
          onHashChange,
      );
    };
  }, []);

  const navigate = useCallback(
      (nextRoute: Route) => {
        if (nextRoute === "gpu") {
          // ===== 20260908 추가 시작 : Overview 이동 시 #/overview 사용 =====
          location.hash = "#/overview";
          // ===== 20260908 추가 끝 : Overview 이동 시 #/overview 사용 =====
          return;
        }

        location.hash = hashForRoute(nextRoute);
      },
      [],
  );

  return {
    route,
    navigate,
  };
}
