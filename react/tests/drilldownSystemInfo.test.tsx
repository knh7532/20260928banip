/*
 * S3 파일럿 — System Info 화면의 React 이관 검증.
 *
 * 이 화면이 **iframe 없이** 뜨는 것이 S3의 목적이므로, 라우트 단정(`#/drilldown/metadata`에
 * iframe이 없다)을 여기서 잠근다. 나머지 9화면은 아직 iframe이며 그것도 함께 확인한다 —
 * 한 화면씩 옮기는 동안 나머지가 계속 동작해야 하기 때문이다.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { DEFAULT_FILTERS } from "../src/components/drilldown/toolbarModel";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { SystemInfo } from "../src/screens/drilldown/SystemInfo";
import { systemInfo } from "../src/api/queries";

/* 라이선스 숫자는 **십진 TB**다(2026-08-10). exporter도 `300 * 10**12`로 낸다 —
   1024로 재면 300 TB 계약이 화면에 272.8 TB로 나와 계약서와 어긋난다. */
const TB = 10 ** 12;
const NOW = Math.floor(Date.now() / 1000);

/** systemInfo() 쿼리에만 답하는 fetch 목. 그 밖의 쿼리는 빈 결과. */
function installFetch(over: Partial<Record<keyof ReturnType<typeof systemInfo>, unknown>> = {}) {
  const q = systemInfo();
  const answer: Record<string, unknown> = {
    [q.version]: [{ metric: { version: "2026.08", build: "2026.08" }, value: [NOW, "1"] }],
    [q.lastUpdate]: [{ metric: {}, value: [NOW, String(NOW - 12 * 86400)] }],
    [q.dataLimit]: [{ metric: {}, value: [NOW, String(300 * TB)] }],
    [q.dataUsed]: [{ metric: {}, value: [NOW, String(214 * TB)] }],
  };
  for (const [key, value] of Object.entries(over)) {
    answer[q[key as keyof typeof q]] = value;
  }
  const spy = vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    if (u.pathname.includes("/label/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "success", data: [] }) });
    }
    const expr = u.searchParams.get("query") ?? "";
    const result = answer[expr] ?? [];
    const resultType = u.pathname.includes("/query_range") ? "matrix" : "vector";
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: { resultType, result } }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("System Info (S3 이관)", () => {
  it("버전·최종 갱신·사용률을 계약 메트릭에서 채운다", async () => {
    installFetch();
    render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("2026.08")).toBeInTheDocument());
    // 214 / 300 TB = 71.3%
    expect(screen.getByText("71.3%")).toBeInTheDocument();
    expect(screen.getByText(/214\.0 TB \/ 300\.0 TB/)).toBeInTheDocument();
    expect(screen.getByText("12 days ago")).toBeInTheDocument();
  });

  /* 임계값 양쪽을 다 짚는다 — 한 점(92%)만 보면 노랑 분기를 지워도 통과한다
     (codex CDX-S3B-05). KPI 글자색과 **막대 색**을 함께 본다. */
  it.each([
    [70, "var(--green)"],
    [74.9, "var(--green)"],
    [75, "var(--yellow)"],
    [89.9, "var(--yellow)"],
    [90, "var(--red)"],
    [92, "var(--red)"],
  ])("사용률 %s%%면 색이 %s (75/90 임계)", async (percent, color) => {
    const limit = 300 * TB;
    installFetch({ dataUsed: [{ metric: {}, value: [NOW, String((limit * percent) / 100)] }] });
    const { container } = render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    const label = `${percent.toFixed(1)}%`;
    await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
    expect(screen.getByText(label)).toHaveStyle({ color });
    expect(container.querySelector(".sqm-bar__fill")).toHaveStyle({ background: color });

    const bar = screen.getByRole("progressbar", { name: "데이터 한도 사용률" });
    expect(bar).toHaveAttribute("aria-valuenow", String(Math.round(percent)));
  });

  it("첫 응답 전에는 '로드 중…'을 보인다 (빈 값과 구분)", () => {
    installFetch();
    render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    expect(screen.getByText("로드 중…")).toBeInTheDocument();
    expect(screen.queryByText("SW Version")).toBeNull();
  });

  it("빈 문자열 라벨도 '--'로 떨어진다 (?? 가 아니라 ||)", async () => {
    installFetch({ version: [{ metric: { version: "", build: "" }, value: [NOW, "1"] }] });
    render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("SW Version")).toBeInTheDocument());
    const versionKpi = screen.getByText("SW VERSION").closest(".sqm-kpi") as HTMLElement;
    expect(within(versionKpi).getByText("--")).toBeInTheDocument();
  });

  it("조회에 실패하면 낡은 값을 남기지 않고 실패를 표시한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    installFetch();
    const { rerender } = render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    /* "2026.08"은 고정 이력 표에도 있으므로 KPI 타일 안에서만 찾는다 — 안 그러면
       실패 후에도 이력 표가 매칭돼 단정이 헐거워진다. */
    const versionKpi = () =>
      screen.getByText("SW VERSION").closest(".sqm-kpi") as HTMLElement;
    await waitFor(() =>
      expect(within(versionKpi()).getByText("2026.08")).toBeInTheDocument());

    // 이제부터 전부 실패시킨다
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    vi.useFakeTimers();
    try {
      rerender(<SystemInfo refreshMs={1000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });
      expect(screen.getByText(/시스템 정보 조회 실패/)).toBeInTheDocument();
      // KPI의 낡은 값이 "--"로 지워졌다 (이력 표의 2026.08은 고정값이라 그대로 남는다)
      expect(within(versionKpi()).getByText("--")).toBeInTheDocument();
      expect(within(versionKpi()).queryByText("2026.08")).toBeNull();
      expect(screen.getByText("조회 실패")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/연속으로 조회하지 못했습니다/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("갱신 이력 4건은 고정 데이터로 항상 렌더된다", () => {
    installFetch();
    render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    const history = screen.getByText("Update History").closest(".sqm-card") as HTMLElement;
    expect(within(history).getAllByRole("row")).toHaveLength(5); // 헤더 + 4
    expect(within(history).getByText("2026.07.1")).toBeInTheDocument();
  });

  it("데이터 한도가 0이면 사용률을 계산하지 않는다 (0 나눗셈 방어)", async () => {
    installFetch({ dataLimit: [{ metric: {}, value: [NOW, "0"] }] });
    render(<SystemInfo refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("2026.08")).toBeInTheDocument());
    const bar = screen.getByRole("progressbar", { name: "데이터 한도 사용률" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });
});

describe("드릴다운 라우트 — 이관 화면과 iframe 화면의 공존", () => {
  it("#/drilldown/metadata는 iframe 없이 React가 직접 그린다 (S3의 목적)", async () => {
    installFetch();
    history.replaceState(null, "", "/#/drilldown/metadata");
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /System Info/ })).toBeInTheDocument());
    // 이 화면에서는 ③④ 문서가 아예 없다
    expect(screen.queryByTitle("SQream 상세 대시보드")).toBeNull();
  });

  /*
   * 2026-08-09 S3 완료: 10화면이 전부 네이티브가 되면서 **iframe 자체가 사라졌다.**
   * 여기 있던 경계 전환 테스트 3건(CDX-S3B-01 회귀)은 검증 대상이 없어져 제거했다.
   * 그 자리는 `drilldownDashboard.test.tsx`의 "어떤 화면에서도 iframe이 없다"가 대신한다.
   */

  /*
   * CDX-S3B-02(자동 갱신 Off)의 회귀 테스트도 함께 제거했다 — ③ 툴바가 사라지면서
   * postMessage로 refresh를 받던 경로 자체가 없어졌다. 갱신 주기는 이제
   * `DrilldownDashboard`의 `DEFAULT_REFRESH_MS` 하나뿐이다.
   * (툴바를 React로 다시 만들면 그때 폴링 정지 테스트를 되살릴 것 — S3 후속.)
   */
});
