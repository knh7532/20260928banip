/*
 * 라우팅·드릴다운 진입 경로 커버리지 (R3 잔여 / ESC-H6).
 *
 * 인수인계 오버레이가 App/Sidebar/useRoute에 드릴다운 두 계열(#/drilldown/*,
 * #/llm-drilldown/*)을 추가했는데 테스트가 따라오지 않아 perFile 임계값이 5개 파일에서
 * 깨져 있었다. 여기서 그 경로만 정면으로 덮는다 — 화면 내용이 아니라 **어떤 화면이
 * 어떤 해시로 뜨는가**가 대상이다.
 *
 * 2026-08-09 S3 완료 후: 상세 10화면이 전부 React 네이티브라 iframe이 없다.
 * 화면 내용 자체는 화면별 테스트가 맡고, 여기는 라우팅만 본다.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { Sidebar } from "../src/components/Sidebar";
import { LlmDrilldownDashboard } from "../src/screens/LlmDrilldownDashboard";
import {
  DRILLDOWN_VIEWS, LLM_DRILLDOWN_VIEWS,
  drilldownViewFromHash, hashForRoute, legacyDetailHash, llmDrilldownViewFromHash, routeFromHash,
} from "../src/hooks/useRoute";

/** 라우팅만 보는 테스트라 Prometheus 응답은 전부 빈 결과로 충분하다. */
function installEmptyFetch() {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    if (u.pathname.includes("/label/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "success", data: [] }) });
    }
    const resultType = u.pathname.includes("/query_range") ? "matrix" : "vector";
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: { resultType, result: [] } }),
    });
  }));
}

const noSelect = { selectedInstances: [] as string[], onSelectInstance: () => {} };

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("useRoute — 해시 파싱", () => {
  it("routeFromHash는 5개 라우트를 구분하고 나머지는 gpu로 떨어진다", () => {
    expect(routeFromHash("")).toBe("gpu");
    expect(routeFromHash("#/")).toBe("gpu");
    expect(routeFromHash("#/llm")).toBe("llm");
    expect(routeFromHash("#/rllm")).toBe("rllm");
    expect(routeFromHash("#/drilldown/worker")).toBe("drilldown");
    expect(routeFromHash("#/llm-drilldown/gpu")).toBe("llm-drilldown");
    // 접미사 없는 카테고리 해시는 라우트가 아니다 — 슬래시가 있어야 한다
    expect(routeFromHash("#/drilldown")).toBe("gpu");
    expect(routeFromHash("#/nope")).toBe("gpu");
    // E5 시안 페이지는 전환 완료(D5)와 함께 제거됐다 — 이제 일반 해시처럼 gpu 로 떨어진다
    expect(routeFromHash("#/design/echarts")).toBe("gpu");
  });

  it("hashForRoute는 라우트별 진입 해시를 준다 (gpu만 빈 문자열)", () => {
    expect(hashForRoute("gpu")).toBe("");
    expect(hashForRoute("llm")).toBe("#/llm");
    expect(hashForRoute("rllm")).toBe("#/rllm");
    expect(hashForRoute("drilldown")).toBe("#/drilldown/main");
    expect(hashForRoute("llm-drilldown")).toBe("#/llm-drilldown/process");
  });

  it("drilldownViewFromHash는 10개 뷰를 통과시키고 그 밖은 main으로 막는다", () => {
    for (const view of DRILLDOWN_VIEWS) {
      expect(drilldownViewFromHash(`#/drilldown/${view}`)).toBe(view);
    }
    expect(drilldownViewFromHash("#/drilldown/WORKER")).toBe("worker"); // 대소문자 무시
    expect(drilldownViewFromHash("#/drilldown/session?range=3600")).toBe("session"); // 쿼리 절단
    expect(drilldownViewFromHash("#/drilldown/../../etc")).toBe("main"); // 미허용 값은 기본값
    expect(drilldownViewFromHash("")).toBe("main");
  });

  it("llmDrilldownViewFromHash는 5개 뷰를 통과시키고 그 밖은 process로 막는다", () => {
    for (const view of LLM_DRILLDOWN_VIEWS) {
      expect(llmDrilldownViewFromHash(`#/llm-drilldown/${view}`)).toBe(view);
    }
    expect(llmDrilldownViewFromHash("#/llm-drilldown/GPU")).toBe("gpu");
    expect(llmDrilldownViewFromHash("#/llm-drilldown/server?refresh=10")).toBe("server");
    expect(llmDrilldownViewFromHash("#/llm-drilldown/unknown")).toBe("process");
    // `drilldown`과 접두사가 겹치지만 서로를 오염시키지 않는다
    expect(llmDrilldownViewFromHash("#/drilldown/worker")).toBe("process");
    expect(drilldownViewFromHash("#/llm-drilldown/gpu")).toBe("main");
  });

  it("hashchange를 받으면 화면이 바뀐다 (useRoute 구독)", async () => {
    installEmptyFetch();
    render(<App />);
    // 사이드바 서브메뉴에도 같은 문구가 있으므로 **화면 제목(h2)** 으로 좁힌다
    const title = () => screen.queryByRole("heading", { level: 2, name: /Worker Monitoring/ });
    expect(title()).toBeNull(); // 초기엔 GPU 화면
    act(() => {
      location.hash = "#/drilldown/worker";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    // S3 이후 상세 화면은 iframe이 아니라 React가 직접 그린다
    await waitFor(() => expect(title()).toBeInTheDocument());
  });
});

describe("App — 라우트별 화면 선택", () => {
  it("#/drilldown/<view>는 SQream 상세 화면을 그 뷰로 연다 (iframe 없이)", async () => {
    installEmptyFetch();
    history.replaceState(null, "", "/#/drilldown/session");
    render(<App />);
    await waitFor(() => expect(
      screen.getByRole("heading", { level: 2, name: /Session Monitoring/ })).toBeInTheDocument());
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("#/llm-drilldown/<view>는 LLM 상세 화면을 그 뷰로 연다", () => {
    installEmptyFetch();
    history.replaceState(null, "", "/#/llm-drilldown/timeline");
    render(<App />);
    const frame = screen.getByTitle("LLM 상세 대시보드");
    expect(frame.getAttribute("src")).toBe("/res/llm/drilldown.html?v=20260803-1#/timeline");
  });

  it("#/llm은 LLM 대시보드, 그 밖은 GPU 대시보드", () => {
    installEmptyFetch();
    history.replaceState(null, "", "/#/llm");
    const { unmount } = render(<App />);
    expect(screen.getByText("GPU/LLM Monitoring Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /실행 중인 SQream DB 쿼리/ })).toBeNull();
    unmount();

    history.replaceState(null, "", "/#/rllm"); // 범위 밖 라우트 → GPU로 떨어진다
    render(<App />);
    expect(screen.getByRole("heading", { name: /실행 중인 SQream DB 쿼리/ })).toBeInTheDocument();
  });
});

describe("LlmDrilldownDashboard", () => {
  it("사이드바와 iframe을 렌더하고 뷰별로 src가 달라진다", () => {
    installEmptyFetch();
    const onNavigate = vi.fn();
    const { rerender } = render(<LlmDrilldownDashboard view="process" onNavigate={onNavigate} />);
    expect(screen.getByRole("complementary", { name: "사이드바" })).toBeInTheDocument();
    expect(screen.getByTitle("LLM 상세 대시보드").getAttribute("src")).toContain("#/process");

    rerender(<LlmDrilldownDashboard view="server" onNavigate={onNavigate} />);
    expect(screen.getByTitle("LLM 상세 대시보드").getAttribute("src")).toContain("#/server");
  });

  it("사이드바 서버 카드는 3노드를 모두 보여주고 선택은 비활성이다", () => {
    installEmptyFetch();
    render(<LlmDrilldownDashboard view="gpu" onNavigate={() => undefined} />);
    const bar = within(screen.getByRole("complementary", { name: "사이드바" }));
    expect(bar.getByText("icspreamh2gpu01")).toBeInTheDocument();
    expect(bar.getByText("icspreamh2gpu03")).toBeInTheDocument();
    // 선택 인스턴스가 없으므로 어떤 카드도 눌린 상태가 아니다
    const cards = bar.getAllByRole("button", { name: /icspreamh2gpu/ });
    for (const card of cards) {
      expect(card).toHaveAttribute("aria-pressed", "false");
    }
    /*
     * 이 화면은 인스턴스 선택을 지원하지 않는다 — 필터는 iframe 안(④계층)에 있고
     * 사이드바는 표시 전용이다. 카드를 눌러도 무동작이어야 하며, onSelectInstance가
     * noop이 아니면(예: 실수로 상태를 갈면) 여기서 aria-pressed가 흔들려 잡힌다.
     */
    fireEvent.click(cards[0]);
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Sidebar — 드릴다운 서브메뉴", () => {
  it("SQream 서브메뉴는 접혀 있다가 토글로 10개 항목을 펼친다", () => {
    render(<Sidebar servers={[]} {...noSelect} route="gpu" />);
    expect(screen.queryByRole("navigation", { name: "SQream 드릴다운 메뉴" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "SQream 상세 메뉴 펼치기" }));
    const nav = within(screen.getByRole("navigation", { name: "SQream 드릴다운 메뉴" }));
    const links = nav.getAllByRole("link");
    expect(links).toHaveLength(DRILLDOWN_VIEWS.length);
    expect(links[0]).toHaveAttribute("href", "#/drilldown/main");
    expect(links[7]).toHaveTextContent("Snapshot & Lock");

    fireEvent.click(screen.getByRole("button", { name: "SQream 상세 메뉴 접기" }));
    expect(screen.queryByRole("navigation", { name: "SQream 드릴다운 메뉴" })).toBeNull();
  });

  it("LLM 서브메뉴도 독립적으로 토글되고 5개 항목을 가진다", () => {
    render(<Sidebar servers={[]} {...noSelect} route="gpu" />);
    fireEvent.click(screen.getByRole("button", { name: "LLM 상세 메뉴 펼치기" }));
    const nav = within(screen.getByRole("navigation", { name: "LLM 드릴다운 메뉴" }));
    expect(nav.getAllByRole("link")).toHaveLength(LLM_DRILLDOWN_VIEWS.length);
    expect(nav.getAllByRole("link")[0]).toHaveAttribute("href", "#/llm-drilldown/process");
    // SQream 쪽은 여전히 접혀 있다 — 두 상태가 섞이지 않는다
    expect(screen.queryByRole("navigation", { name: "SQream 드릴다운 메뉴" })).toBeNull();
  });

  it("서브메뉴 토글은 상위 메뉴 이동을 일으키지 않는다 (stopPropagation)", () => {
    const onNavigate = vi.fn();
    render(<Sidebar servers={[]} {...noSelect} route="gpu" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "SQream 상세 메뉴 펼치기" }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("현재 해시와 같은 서브 링크에 active 클래스가 붙는다", () => {
    history.replaceState(null, "", "/#/drilldown/alarms");
    render(<Sidebar servers={[]} {...noSelect} route="gpu" />);
    // 해시가 #/drilldown/* 이면 처음부터 펼쳐진 상태로 마운트된다
    const nav = within(screen.getByRole("navigation", { name: "SQream 드릴다운 메뉴" }));
    expect(nav.getByRole("link", { name: "Alarms" })).toHaveClass("active");
    expect(nav.getByRole("link", { name: "Main Dashboard" })).not.toHaveClass("active");
  });

  it("#/llm-drilldown/* 해시면 LLM 서브메뉴가 펼쳐진 채로 마운트된다", () => {
    history.replaceState(null, "", "/#/llm-drilldown/services");
    render(<Sidebar servers={[]} {...noSelect} route="llm" />);
    const nav = within(screen.getByRole("navigation", { name: "LLM 드릴다운 메뉴" }));
    expect(nav.getByRole("link", { name: "LLM Service Detail" })).toHaveClass("active");
  });

  it("메뉴 항목은 Enter/Space 키로도 이동한다 (role=button 접근성)", () => {
    const onNavigate = vi.fn();
    render(<Sidebar servers={[]} {...noSelect} route="gpu" onNavigate={onNavigate} />);
    const item = screen.getByText("GPU/LLM 모니터링").closest("[role='button']") as HTMLElement;
    fireEvent.keyDown(item, { key: "Enter" });
    fireEvent.keyDown(item, { key: " " });
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenCalledWith("llm");

    onNavigate.mockClear();
    fireEvent.keyDown(item, { key: "Tab" }); // 그 밖의 키는 무시
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("localStorage를 읽을 수 없어도 펼친 상태로 마운트된다", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage is disabled");
    });
    try {
      render(<Sidebar servers={[]} {...noSelect} route="gpu" />);
      expect(screen.getByRole("complementary", { name: "사이드바" })).not.toHaveClass("sidebar--collapsed");
    } finally {
      getItem.mockRestore();
    }
  });
});

describe("FilterBar — 다중선택 위젯", () => {
  it("All 체크박스를 누르면 해당 필터의 선택이 비워진다", async () => {
    installEmptyFetch();
    history.replaceState(null, "", "/?gpu=0,2");
    render(<App />);
    const gpuGroup = () => within(screen.getByRole("group", { name: "GPU" }));
    await waitFor(() => expect(gpuGroup().getByRole("checkbox", { name: "0" })).toBeChecked());

    act(() => {
      fireEvent.click(gpuGroup().getByRole("checkbox", { name: "All" }));
    });
    await waitFor(() => expect(location.search).not.toContain("gpu="));
    expect(gpuGroup().getByRole("checkbox", { name: "All" })).toBeChecked();
  });

  it("summary의 aria-label이 현재 선택 요약을 담는다", async () => {
    installEmptyFetch();
    history.replaceState(null, "", "/?gpu=0,2");
    render(<App />);
    await waitFor(() =>
      expect(screen.getByLabelText(/^GPU: /)).toBeInTheDocument());
  });

  /* "비활성 다중선택은 열리지 않는다" 테스트는 2026-08-09에 삭제했다.
     유일한 비활성 대상이 Worker("Node 선택 필요")였는데 그 제약을 없애면서
     `disabled` 분기 자체가 사라졌다. 도달 불가능한 코드를 지키는 테스트는
     통과해도 아무것도 보장하지 않는다. */
  it("Worker는 더 이상 비활성이 아니다 — Node 없이도 열린다", () => {
    installEmptyFetch();
    render(<App />);
    const summary = screen.getByLabelText(/^Worker: /);
    expect(summary.closest("details")).not.toHaveAttribute("aria-disabled");
    expect(summary.textContent).toBe("All");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    summary.dispatchEvent(event);
    expect(event.defaultPrevented, "클릭이 막히면 안 된다").toBe(false);
  });
});

describe("transplant — 레거시 #/detail/* 호환 (SQream 상세 화면 → 드릴다운)", () => {
  it("legacyDetailHash는 6개 상세 페이지(+구 별칭)를 드릴다운 해시로 매핑한다", () => {
    expect(legacyDetailHash("#/detail/overview")).toBe("#/drilldown/main");
    expect(legacyDetailHash("#/detail/workers")).toBe("#/drilldown/worker");
    expect(legacyDetailHash("#/detail/logs")).toBe("#/drilldown/logs");
    expect(legacyDetailHash("#/detail/sessions")).toBe("#/drilldown/session");
    expect(legacyDetailHash("#/detail/table-usage")).toBe("#/drilldown/usage");
    expect(legacyDetailHash("#/detail/tables")).toBe("#/drilldown/usage");
    expect(legacyDetailHash("#/detail/table-activity")).toBe("#/drilldown/activity");
    expect(legacyDetailHash("#/details/activity/")).toBe("#/drilldown/activity");
    // 페이지 없음·미지원 페이지·쿼리 절단 → main
    expect(legacyDetailHash("#/detail")).toBe("#/drilldown/main");
    expect(legacyDetailHash("#/detail/nope")).toBe("#/drilldown/main");
    expect(legacyDetailHash("#/detail/workers?x=1")).toBe("#/drilldown/worker");
    // detail 계열이 아니면 null
    expect(legacyDetailHash("#/drilldown/worker")).toBeNull();
    expect(legacyDetailHash("#/llm")).toBeNull();
    expect(legacyDetailHash("")).toBeNull();
  });

  it("routeFromHash / drilldownViewFromHash 도 레거시 해시를 드릴다운으로 읽는다", () => {
    expect(routeFromHash("#/detail/workers")).toBe("drilldown");
    expect(routeFromHash("#/details")).toBe("drilldown");
    expect(drilldownViewFromHash("#/detail/sessions")).toBe("session");
    expect(drilldownViewFromHash("#/detail")).toBe("main");
  });

  it("App 은 #/detail/workers 로 열리면 주소창을 #/drilldown/worker 로 바꾸고 드릴다운을 띄운다", async () => {
    installEmptyFetch();
    history.replaceState(null, "", "/#/detail/workers");
    render(<App />);
    await waitFor(() => expect(location.hash).toBe("#/drilldown/worker"));
    expect(document.querySelector(".sidebar")).not.toBeNull();
  });

  it("실행 중 hashchange 로 레거시 해시가 오면 같은 방식으로 정규화한다", async () => {
    installEmptyFetch();
    render(<App />);
    act(() => {
      location.hash = "#/detail/table-usage";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(location.hash).toBe("#/drilldown/usage"));
  });
});
