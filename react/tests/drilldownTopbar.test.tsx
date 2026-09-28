/*
 * 공통 상단바 (2026-08-09) — S3 이관에서 **빠뜨렸던 것**을 되살린 뒤 잠근다.
 *
 * 왜 테스트가 필요한가: 툴바(CDX-S3C-01)에 이어 두 번째 누락이었다. 두 번 다
 * "정적 화면에 있던 UI가 React에는 없다"는 같은 모양이었고, 두 번 다 어떤 테스트도
 * 실패하지 않았다. 존재하지 않는 것은 아무도 검증하지 않기 때문이다.
 * 그래서 여기서는 **모든 드릴다운 화면에 상단바가 있다**를 명시적으로 잠근다.
 *
 * CLUSTER STATUS는 실데이터다. 조회가 실패했는데 HEALTHY로 보이면 거짓 안심을 주므로
 * 실패·빈 응답이 `--`로 떨어지는지도 함께 잠근다.
 */
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DrilldownTopbar } from "../src/components/drilldown/DrilldownTopbar";
import { DrilldownDashboard } from "../src/screens/DrilldownDashboard";
import { DRILLDOWN_VIEWS, type DrilldownView } from "../src/hooks/useRoute";
import { drilldownTopbar } from "../src/api/queries";

/** 스칼라 하나를 담은 vector 응답. */
function vector(value: number) {
  return { status: "success", data: { resultType: "vector", result: [{ metric: {}, value: [0, String(value)] }] } };
}
const EMPTY_VECTOR = { status: "success", data: { resultType: "vector", result: [] } };

/**
 * 상단바의 두 식에만 값을 주고 나머지는 빈 응답. **실제 식으로 매칭**하므로
 * 쿼리가 바뀌면 이 테스트가 먼저 깨진다 — 그게 의도다.
 */
interface FetchPlan {
  up?: number; nodes?: number; alerts?: number;
  /** 이 식들만 네트워크 오류로 만든다 — 지표별 독립 판정을 검증하기 위함. */
  reject?: ("up" | "nodes" | "alerts")[];
}
function installFetch({ up, nodes, alerts, reject = [] }: FetchPlan = {}) {
  const Q = drilldownTopbar();
  const rejected = new Set(reject.map((k) => Q[k]));
  return vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    const expr = u.searchParams.get("query") ?? "";
    if (rejected.has(expr)) return Promise.reject(new Error("network down"));
    let body: unknown = u.pathname.includes("/query_range")
      ? { status: "success", data: { resultType: "matrix", result: [] } }
      : EMPTY_VECTOR;
    if (u.pathname.includes("/label/")) body = { status: "success", data: [] };
    else if (expr === Q.up && up !== undefined) body = vector(up);
    else if (expr === Q.nodes && nodes !== undefined) body = vector(nodes);
    else if (expr === Q.alerts && alerts !== undefined) body = vector(alerts);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
}

/** 폴링이 한 바퀴 돌아 상태가 반영될 때까지. */
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

/** 텍스트가 조각(`NODES: <b>3</b>`)으로 나뉘어 있어 칩 단위로 읽는다. */
function chip(root: HTMLElement, startsWith: string): string {
  const found = [...root.querySelectorAll(".sqm-topbar__chip")]
    .find((el) => (el.textContent ?? "").trim().startsWith(startsWith));
  if (!found) throw new Error(`'${startsWith}' 칩이 없다`);
  return (found.textContent ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("상단바 — 정적 header.topbar 이관", () => {
  it("로고·VERSION·장식을 원본대로 그린다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 2 }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(screen.getByText(/ream DB Monitoring/)).toBeTruthy();
    expect(screen.getByText("SQ")).toBeTruthy();                       // 강조색이 붙는 조각
    expect(chip(container, "VERSION")).toContain("2026.08");
    expect(screen.getByText(/⚙ Admin/)).toBeTruthy();
  });

  it("워커가 전부 살아 있으면 HEALTHY, NODES는 실제 개수", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 2 }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(screen.getByText("HEALTHY")).toBeTruthy();
    expect(container.querySelector(".sqm-topbar__health--healthy")).toBeTruthy();
    expect(chip(container, "NODES")).toBe("NODES: 3");
  });

  it("워커가 하나라도 내려가면 DEGRADED", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 0, nodes: 3, alerts: 2 }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(container.querySelector(".sqm-topbar__health--degraded")).toBeTruthy();
    expect(screen.queryByText("HEALTHY")).toBeNull();
  });

  it("조회가 실패하면 HEALTHY로 위장하지 않고 `--`가 된다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(screen.queryByText("HEALTHY")).toBeNull();
    expect(screen.queryByText("DEGRADED")).toBeNull();
    expect(container.querySelector(".sqm-topbar__health--unknown")).toBeTruthy();
    expect(chip(container, "NODES")).toBe("NODES: --");
  });

  it("빈 응답도 `--` — 시리즈가 없는 것은 '노드 0개'가 아니다", async () => {
    vi.stubGlobal("fetch", installFetch());   // 두 식 모두 빈 vector
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(container.querySelector(".sqm-topbar__health--unknown")).toBeTruthy();
    expect(chip(container, "NODES")).toBe("NODES: --");
  });

  it("자동 갱신 Off(0)면 최초 1회만 조회하고 반복하지 않는다", async () => {
    // 타이머는 render **전에** 가짜로 바꾼다 — 뒤에 하면 최초 tick이 실타이머로
    // 빠져나가 테스트가 공허해진다(S3C에서 실제로 겪은 함정).
    vi.useFakeTimers();
    const fetchMock = installFetch({ up: 1, nodes: 3, alerts: 2 });
    vi.stubGlobal("fetch", fetchMock);

    render(<DrilldownTopbar refreshMs={0} />);
    await settle();
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst, "최초 1회는 조회해야 한다 — Off는 '반복 안 함'이지 '안 봄'이 아니다")
      .toBeGreaterThan(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock.mock.calls.length, "Off인데 재조회가 일어났다").toBe(afterFirst);
  });

  it("갱신 주기가 있으면 반복 조회한다 (위 테스트가 공허하지 않다는 증거)", async () => {
    vi.useFakeTimers();
    const fetchMock = installFetch({ up: 1, nodes: 3, alerts: 2 });
    vi.stubGlobal("fetch", fetchMock);

    render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    const afterFirst = fetchMock.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});

describe("codex 리뷰 반영 — 원본보다 정직하게", () => {
  it("🔔 배지는 실제 firing 알람 수다 (원본은 \"3\" 하드코딩이었다)", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 7 }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    expect(container.querySelector(".sqm-topbar__badge")?.textContent).toBe("7");
  });

  it("알람이 0건이면 배지를 아예 그리지 않는다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3 }));   // alerts 미지정 → 빈 vector
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    expect(container.querySelector(".sqm-topbar__badge")).toBeNull();
  });

  it("알람 조회만 실패해도 배지를 0으로 위장하지 않는다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, reject: ["alerts"] }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    expect(container.querySelector(".sqm-topbar__badge")).toBeNull();
    expect(container.querySelector(".sqm-topbar__bell")?.getAttribute("title"))
      .toBe("알람 수 조회 실패");
  });

  it("NODES만 실패해도 CLUSTER STATUS는 살아남는다 (지표 독립 판정)", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, alerts: 1, reject: ["nodes"] }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(screen.getByText("HEALTHY"), "성공한 health까지 버려졌다").toBeTruthy();
    expect(chip(container, "NODES")).toBe("NODES: --");
  });

  it("반대로 health만 실패해도 NODES는 살아남는다", async () => {
    vi.stubGlobal("fetch", installFetch({ nodes: 3, alerts: 1, reject: ["up"] }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(container.querySelector(".sqm-topbar__health--unknown")).toBeTruthy();
    expect(chip(container, "NODES")).toBe("NODES: 3");
  });

  it("비유한 값(NaN)은 DEGRADED가 아니라 `--`다", async () => {
    const Q = drilldownTopbar();
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = new URL(url, "http://localhost");
      const expr = u.searchParams.get("query") ?? "";
      // Prometheus는 NaN을 문자열로 준다. scalarOf라면 0으로 떨어져 DEGRADED가 됐다.
      const body = expr === Q.up
        ? { status: "success", data: { resultType: "vector", result: [{ metric: {}, value: [0, "NaN"] }] } }
        : EMPTY_VECTOR;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    expect(screen.queryByText("DEGRADED"), "NaN을 장애로 단정했다").toBeNull();
    expect(container.querySelector(".sqm-topbar__health--unknown")).toBeTruthy();
  });

  it("갱신 시각을 표시하고, 자동 갱신이 꺼져 있으면 그 사실도 말한다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 1 }));
    const { container, rerender } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();

    const stamp = () => container.querySelector(".sqm-topbar__stamp");
    expect(stamp()?.textContent).toMatch(/^\d{2}:\d{2}:\d{2} 기준$/);
    expect(stamp()?.className).not.toContain("--paused");

    rerender(<DrilldownTopbar refreshMs={0} />);
    await settle();
    expect(stamp()?.textContent).toContain("자동 갱신 꺼짐");
    expect(stamp()?.className).toContain("--paused");
  });

  it("정상 취소(주기 변경)가 유효한 표시를 `--`로 지우지 않는다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 1 }));
    const { container, rerender } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    expect(screen.getByText("HEALTHY")).toBeTruthy();

    rerender(<DrilldownTopbar refreshMs={30000} />);   // deps 변경 → 이전 세대 abort
    expect(container.querySelector(".sqm-topbar__health--healthy"),
      "취소 때문에 표시가 지워졌다").toBeTruthy();
  });
});

describe("dataUpdatedMs — 탑뷰가 잃은 신선도 표시를 대신한다", () => {
  /* 탑뷰의 옛 Header는 "갱신 HH:MM:SS"를 보여 줬고 그 값은 테이블·차트·구간상세
     세 폴링 중 최근 성공 시각이었다. 상단바 자체 시각(자기 두 쿼리 기준)과 의미가
     달라, 화면이 아는 값을 넘길 수 있게 했다. 안 넘기면 자기 시각을 쓴다. */
  it("주면 그 시각을 쓰고, 표기는 KST 고정이다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 1 }));
    // 고정 epoch로 만든다 — 로컬 타임존으로 만들면 테스트가 실행 머신을 따라가
    // "KST 고정"을 증명하지 못한다. 04:05:07 UTC = 13:05:07 KST(UTC+9).
    const at = Date.UTC(2026, 7, 9, 4, 5, 7);
    const { container } = render(<DrilldownTopbar refreshMs={5000} dataUpdatedMs={at} />);
    await settle();
    expect(container.querySelector(".sqm-topbar__stamp")?.textContent,
      "브라우저 로컬 시각을 쓰면 비-KST 환경에서 틀린 시각이 보인다")
      .toContain("13:05:07");
  });

  it("null을 주면 `--:--:--` — 아직 한 번도 성공 못 했다는 뜻이다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 1 }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} dataUpdatedMs={null} />);
    await settle();
    // 자체 조회는 성공했지만 화면 데이터는 아직이므로 화면 쪽을 따른다.
    expect(container.querySelector(".sqm-topbar__stamp")?.textContent).toContain("--:--:--");
    expect(screen.getByText("HEALTHY"), "상태 자체는 자기 조회로 살아 있다").toBeTruthy();
  });

  it("안 주면 자기 조회 시각을 쓴다 (상세 대시보드)", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 1 }));
    const { container } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    expect(container.querySelector(".sqm-topbar__stamp")?.textContent)
      .toMatch(/^\d{2}:\d{2}:\d{2} 기준$/);
  });

  it("sticky를 주면 탑뷰용 수식자가 붙는다", async () => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 1 }));
    const { container, rerender } = render(<DrilldownTopbar refreshMs={5000} />);
    await settle();
    expect(container.querySelector(".sqm-topbar")?.className).not.toContain("--sticky");

    rerender(<DrilldownTopbar refreshMs={5000} sticky />);
    expect(container.querySelector(".sqm-topbar")?.className).toContain("sqm-topbar--sticky");
  });
});

describe("상단바는 모든 드릴다운 화면에 있다", () => {
  /* 이 단정이 이번 회귀의 본체다. 정적 화면 11개가 전부 갖고 있던 헤더가
     React에는 한 화면에도 없었다. 화면별로 확인해야 다시 빠뜨려도 잡힌다. */
  it.each(DRILLDOWN_VIEWS as readonly DrilldownView[])("%s 화면에 상단바가 있다", async (view) => {
    vi.stubGlobal("fetch", installFetch({ up: 1, nodes: 3, alerts: 2 }));
    const { container } = render(<DrilldownDashboard view={view} onNavigate={() => {}} />);
    await settle();

    const bar = container.querySelector<HTMLElement>(".sqm-topbar");
    expect(bar, `${view} 화면에 상단바가 없다`).toBeTruthy();
    // 사이드바에도 비슷한 문자열이 있으므로 상단바 안으로 범위를 좁힌다.
    expect(within(bar!).getByText(/ream DB Monitoring/)).toBeTruthy();
    expect(within(bar!).getByText("HEALTHY")).toBeTruthy();
  });
});
