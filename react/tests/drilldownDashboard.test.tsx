/*
 * 상세 대시보드 셸 — **S3 완료 후의 계약**을 잠근다 (2026-08-09).
 *
 * 이 파일은 원래 iframe 브리지(캐시버스터 src·postMessage·remount 유지)를 검증했다.
 * S3에서 10화면이 전부 React 네이티브가 되면서 **iframe이 사라졌으므로**, 이제 잠글 것은
 * 정반대다: 어떤 화면에서도 iframe이 없어야 하고, 화면 전환에 문서 로드가 없어야 한다.
 *
 * 이전 계약(H-C5 캐시버스터 3단 체인, `sqream-drilldown-*` postMessage)은 React 쪽에서
 * **소멸**했다. 정적 문서 자체는 `files/src/.../res/sqream/`에 남아 있지만 앱이 참조하지
 * 않으므로 여기서 검증하지 않는다 — 그 파일들의 처분은 인간 판단(ESC-H9 계열)이다.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DrilldownDashboard } from "../src/screens/DrilldownDashboard";
import { DRILLDOWN_VIEWS, type DrilldownView } from "../src/hooks/useRoute";

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

/** 각 화면을 알아볼 수 있는 고유 제목. 잘못된 화면이 떠도 통과하지 않게 한다. */
const TITLE: Record<DrilldownView, RegExp> = {
  main: /Session Statistics/,
  worker: /Worker Monitoring/,
  query: /Query Analytics/,
  logs: /Log Monitoring/,
  session: /Session Monitoring/,
  usage: /Table Usage/,
  activity: /Table Activity/,
  snapshot: /Snapshot & Lock/,
  alarms: /Alarms/,
  metadata: /System Info/,
};

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  installEmptyFetch();
});

describe("상세 대시보드 — iframe 없는 SPA (S3)", () => {
  it("10개 화면 전부 iframe 없이 React가 그린다", () => {
    for (const view of DRILLDOWN_VIEWS) {
      const { unmount } = render(<DrilldownDashboard view={view} onNavigate={() => {}} />);
      expect(document.querySelector("iframe"), `${view}: iframe이 남아 있다`).toBeNull();
      // 제목이 카드 헤더와 겹치는 화면이 있어(예: Table Usage) 첫 매치만 확인한다
      expect(
        screen.getAllByText(TITLE[view]).length,
        `${view}: 화면 고유 표식을 찾지 못했다`,
      ).toBeGreaterThan(0);
      unmount();
    }
  });

  it("화면을 전환해도 iframe이 생기지 않는다", () => {
    const { rerender } = render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    for (const view of DRILLDOWN_VIEWS) {
      rerender(<DrilldownDashboard view={view} onNavigate={() => {}} />);
      expect(document.querySelector("iframe")).toBeNull();
    }
  });

  it("정적 문서(res/sqream/**)를 더 이상 참조하지 않는다", () => {
    const { container } = render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    expect(container.innerHTML).not.toContain("/res/sqream/");
  });

  it("사이드바가 함께 뜨고, 서버 카드로 인스턴스를 고를 수 있다", () => {
    render(<DrilldownDashboard view="worker" onNavigate={() => {}} />);
    const bar = within(screen.getByRole("complementary", { name: "사이드바" }));
    const card = bar.getByRole("button", { name: /icspreamh2gpu01/ });
    expect(card).toHaveAttribute("aria-pressed", "false");

    act(() => { fireEvent.click(card); });
    expect(bar.getByRole("button", { name: /icspreamh2gpu01/ }))
      .toHaveAttribute("aria-pressed", "true");

    // 같은 카드를 다시 누르면 선택 해제 (탑뷰와 같은 규칙)
    act(() => { fireEvent.click(bar.getByRole("button", { name: /icspreamh2gpu01/ })); });
    expect(bar.getByRole("button", { name: /icspreamh2gpu01/ }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("메뉴 클릭은 onNavigate로 올라간다", () => {
    const onNavigate = vi.fn();
    render(<DrilldownDashboard view="main" onNavigate={onNavigate} />);
    const item = screen.getByText("GPU/LLM 모니터링").closest("[role='button']") as HTMLElement;
    act(() => { fireEvent.click(item); });
    expect(onNavigate).toHaveBeenCalledWith("llm");
  });
});

/*
 * codex CDX-S3C-01 회귀 — S3에서 ③의 툴바를 **이관하지 않고 없앴다.**
 * 자동 갱신 Off·GPU/Worker 필터·리셋이 통째로 사라졌다. 되살렸으므로 여기서 잠근다.
 */
describe("상세 대시보드 툴바 (③에서 이관)", () => {
  const sel = (label: string) => screen.getByLabelText<HTMLSelectElement>(label);

  it("정적본과 같은 컨트롤·옵션·기본값을 낸다", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    expect(sel("환경").value).toBe("production");
    expect(sel("Node(서버)").value).toBe("");
    expect(sel("GPU").value).toBe("");
    expect(sel("시간 범위").value).toBe("1800");   // Last 30 minutes
    expect(sel("자동 갱신").value).toBe("5");      // 5s
    // 자동 갱신 Off가 **선택 가능**해야 한다 — 이게 없어서 blocking이었다
    expect([...sel("자동 갱신").options].map((o) => o.value)).toEqual(["0", "5", "10", "30"]);
    expect([...sel("시간 범위").options].map((o) => o.value)).toEqual(["300", "1800", "3600", "21600"]);
  });

  /* 2026-08-09 인간 지시로 동작이 바뀌었다. 예전에는 Node를 먼저 고르지 않으면
     "Node 선택 필요"로 비활성이었다 — 이제 Node=All이면 세 노드의 워커를 전부 보여 준다. */
  it("Node가 All이면 세 노드의 워커 24개가 전부 보인다", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    expect(sel("Worker"), "더는 비활성이 아니다").toBeEnabled();

    // All + 3노드 × GPU4 × MIG2
    expect(within(sel("Worker")).getAllByRole("option")).toHaveLength(25);
    // 이름 = sqream{노드}{GPU}{MIG+1}. GPU는 0~3이므로 노드3의 마지막은 sqream332다.
    for (const name of ["sqream101", "sqream132", "sqream201", "sqream332"]) {
      expect(within(sel("Worker")).getByText(name), `${name}이 없다`).toBeInTheDocument();
    }
    expect(within(sel("Worker")).queryByText("Node 선택 필요")).toBeNull();
  });

  it("Node가 All이어도 GPU를 고르면 그 GPU만 남는다 — 세 노드 × 2슬롯", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    act(() => { fireEvent.change(sel("GPU"), { target: { value: "3" } }); });
    expect(within(sel("Worker")).getAllByRole("option")).toHaveLength(7); // All + 6
    for (const name of ["sqream131", "sqream232", "sqream331"]) {
      expect(within(sel("Worker")).getByText(name)).toBeInTheDocument();
    }
    expect(within(sel("Worker")).queryByText("sqream101")).toBeNull();
  });

  it("워커를 고르면 Node도 그 노드로 함께 이동한다", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    expect(sel("Node(서버)").value, "시작은 All").toBe("");

    // sqream232 = 노드2 · GPU3 · MIG1 → 슬롯 3*2+1 = 7
    act(() => { fireEvent.change(sel("Worker"), { target: { value: "gpu-server-02:7" } }); });
    expect(sel("Node(서버)").value, "노드가 따라오지 않으면 어느 노드인지 잃는다")
      .toBe("gpu-server-02");
    expect(sel("Worker").value).toBe("gpu-server-02:7");
    // 노드가 정해졌으므로 목록은 그 노드 8개로 줄어든다
    expect(within(sel("Worker")).getAllByRole("option")).toHaveLength(9);
  });

  it("Node를 먼저 고르면 그 노드 8개만 보인다 (기존 동작 유지)", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    act(() => { fireEvent.change(sel("Node(서버)"), { target: { value: "gpu-server-02" } }); });
    expect(within(sel("Worker")).getAllByRole("option")).toHaveLength(9);   // All + 8
    expect(within(sel("Worker")).getByText("sqream201")).toBeInTheDocument();
    expect(within(sel("Worker")).getByText("sqream232")).toBeInTheDocument();
    expect(within(sel("Worker")).queryByText("sqream101")).toBeNull();

    act(() => { fireEvent.change(sel("GPU"), { target: { value: "3" } }); });
    expect(within(sel("Worker")).getAllByRole("option")).toHaveLength(3);   // All + 2
    expect(within(sel("Worker")).getByText("sqream231")).toBeInTheDocument();
  });

  it("툴바는 필터만 담는다 — 화면 이름도 큰 제목도 없다", () => {
    /* 예전엔 툴바와 본문에 같은 이름이 **두 번** 나왔다(인간 지적 2026-08-10).
       이름은 본문 `h2` 하나가 맡는다. */
    const { container } = render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    const toolbar = container.querySelector(".sqm-toolbar") as HTMLElement;
    expect(toolbar.textContent).not.toContain("GPU/SQream Monitoring Dashboard");
    expect(toolbar.querySelector(".sqm-toolbar__title")).toBeNull();
    expect(toolbar.textContent).not.toContain("Main Dashboard");
  });

  it("10개 화면 전부 본문 제목이 정확히 하나이고 사이드바 이름과 같다", () => {
    /* 화면이 이름을 각자 하드코딩하면 사이드바·본문이 어긋난다 — 진원지는
       `DrilldownDashboard`의 `VIEWS[view].title` 하나여야 한다. */
    const EXPECTED: Record<DrilldownView, string> = {
      main: "Main Dashboard", worker: "Worker Monitoring", query: "Query Analytics",
      logs: "Log Monitoring", session: "Session Monitoring", usage: "Table Usage",
      activity: "Table Activity", snapshot: "Snapshot & Lock", alarms: "Alarms",
      metadata: "System Info",
    };
    for (const view of DRILLDOWN_VIEWS) {
      const { container, unmount } = render(<DrilldownDashboard view={view} onNavigate={() => {}} />);
      const titles = container.querySelectorAll(".sqm-page__title");
      expect(titles.length, `${view}: 본문 제목이 ${titles.length}개다`).toBe(1);

      // 부제는 `<span>`으로 분리돼 있어야 한다 — 제목 문자열에 이어 붙이면 안 된다
      const sub = titles[0].querySelector(".sqm-page__sub");
      const name = sub
        ? (titles[0].textContent ?? "").replace(sub.textContent ?? "", "").trim()
        : (titles[0].textContent ?? "").trim();
      expect(name, `${view}: 본문 제목이 사이드바 이름과 다르다`).toBe(EXPECTED[view]);
      expect(name).not.toContain("—");
      unmount();
    }
  });

  it("Node를 바꾸면 GPU·Worker 선택이 풀린다", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    act(() => { fireEvent.change(sel("Node(서버)"), { target: { value: "gpu-server-01" } }); });
    act(() => { fireEvent.change(sel("GPU"), { target: { value: "2" } }); });
    expect(sel("GPU").value).toBe("2");
    act(() => { fireEvent.change(sel("Node(서버)"), { target: { value: "gpu-server-03" } }); });
    expect(sel("GPU").value).toBe("");
    expect(sel("Worker").value).toBe("");
  });

  it("'전체 구간으로 리셋'은 구간만, '모두 초기화'는 전부 되돌린다", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    act(() => { fireEvent.change(sel("Node(서버)"), { target: { value: "gpu-server-01" } }); });
    act(() => { fireEvent.change(sel("시간 범위"), { target: { value: "21600" } }); });
    act(() => { fireEvent.change(sel("자동 갱신"), { target: { value: "0" } }); });

    act(() => { fireEvent.click(screen.getByRole("button", { name: "전체 구간(30분)으로 리셋" })); });
    expect(sel("시간 범위").value).toBe("1800");
    expect(sel("Node(서버)").value).toBe("gpu-server-01"); // 필터는 유지
    expect(sel("자동 갱신").value).toBe("0");              // 갱신도 유지

    act(() => { fireEvent.click(screen.getByRole("button", { name: "구간·필터 모두 초기화" })); });
    expect(sel("Node(서버)").value).toBe("");
    expect(sel("자동 갱신").value).toBe("5");
  });

  it("툴바 Node와 사이드바 카드가 같은 상태를 본다", () => {
    render(<DrilldownDashboard view="main" onNavigate={() => {}} />);
    const bar = within(screen.getByRole("complementary", { name: "사이드바" }));
    act(() => { fireEvent.click(bar.getByRole("button", { name: /icspreamh2gpu02/ })); });
    expect(sel("Node(서버)").value).toBe("gpu-server-02");

    act(() => { fireEvent.change(sel("Node(서버)"), { target: { value: "" } }); });
    expect(bar.getByRole("button", { name: /icspreamh2gpu02/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("자동 갱신 Off를 고르면 화면 폴링이 멈춘다", async () => {
    vi.useFakeTimers();
    try {
      render(<DrilldownDashboard view="metadata" onNavigate={() => {}} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      const spy = globalThis.fetch as ReturnType<typeof vi.fn>;

      const before = spy.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(spy.mock.calls.length).toBeGreaterThan(before); // 5초 주기로 돌고 있다

      act(() => { fireEvent.change(sel("자동 갱신"), { target: { value: "0" } }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      const afterOff = spy.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(spy.mock.calls.length).toBe(afterOff);
    } finally {
      vi.useRealTimers();
    }
  });
});
