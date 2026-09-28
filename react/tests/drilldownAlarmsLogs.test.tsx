/*
 * S3-C — Alarms · Log Monitoring 이관 검증.
 *
 * 두 화면 다 "조회 실패"와 "정상인데 비어 있음"을 구분해야 한다 — 정적본이 codex 0.14
 * Major로 한 번 잡혔던 부분이라 여기서 잠근다.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DEFAULT_FILTERS } from "../src/components/drilldown/toolbarModel";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Alarms } from "../src/screens/drilldown/Alarms";
import { buildAlarms } from "../src/screens/drilldown/alarmRows";
import { LogMonitoring } from "../src/screens/drilldown/LogMonitoring";
import { alarms as alarmQueries, logMonitoring } from "../src/api/queries";
import type { PromSeries } from "../src/api/prom";

const NOW = Math.floor(Date.now() / 1000);

const alarmSeries = (
  alertname: string, severity: string, node: string, state: number, ago: number,
): [PromSeries, PromSeries] => [
  { metric: { alertname, severity, node }, value: [NOW, String(state)] },
  { metric: { alertname, severity, node }, value: [NOW, String(NOW - ago)] },
];

function installFetch(answer: Record<string, unknown>) {
  const spy = vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    if (u.pathname.includes("/label/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "success", data: [] }) });
    }
    const expr = u.searchParams.get("query") ?? "";
    const resultType = u.pathname.includes("/query_range") ? "matrix" : "vector";
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        status: "success",
        data: { resultType, result: answer[expr] ?? [] },
      }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("Alarms — 정렬·집계", () => {
  it("활성(firing→ack) 우선, critical 우선, 최신 순으로 정렬한다", () => {
    const rows = [
      alarmSeries("Resolved1", "warning", "gpu-server-01", 4, 10),
      alarmSeries("AckWarn", "warning", "gpu-server-02", 3, 20),
      alarmSeries("FireWarn", "warning", "gpu-server-03", 2, 30),
      alarmSeries("FireCrit", "critical", "gpu-server-01", 2, 5),
    ];
    const out = buildAlarms(rows.map((r) => r[0]), rows.map((r) => r[1]));
    expect(out.map((a) => a.alert)).toEqual(["FireCrit", "FireWarn", "AckWarn", "Resolved1"]);
  });

  it("since 계열이 없는 알람도 떨어뜨리지 않는다 (NaN → '--')", () => {
    const out = buildAlarms(
      [{ metric: { alertname: "NoSince", severity: "warning", node: "gpu-server-01" }, value: [NOW, "2"] }],
      []);
    expect(out).toHaveLength(1);
    expect(Number.isNaN(out[0].since)).toBe(true);
  });
});

describe("Alarms 화면", () => {
  const q = alarmQueries();

  it("KPI와 피드를 계약 메트릭에서 채운다", async () => {
    const rows = [
      alarmSeries("SlowQuery", "warning", "gpu-server-02", 2, 95),
      alarmSeries("DiskFull", "critical", "gpu-server-01", 3, 600),
      alarmSeries("Old", "warning", "gpu-server-03", 4, 7200),
    ];
    installFetch({ [q.state]: rows.map((r) => r[0]), [q.since]: rows.map((r) => r[1]) });
    render(<Alarms refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("SlowQuery")).toBeInTheDocument());
    const kpi = (label: string) =>
      within(screen.getByText(label).closest(".sqm-kpi") as HTMLElement);
    expect(kpi("FIRING").getByText("1")).toBeInTheDocument();
    expect(kpi("ACKNOWLEDGED (조치 중)").getByText("1")).toBeInTheDocument();
    expect(kpi("CRITICAL ACTIVE").getByText("1")).toBeInTheDocument();
    expect(kpi("RESOLVED (표시 중)").getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2 active")).toBeInTheDocument();
    // 노드는 표시 어휘로 변환된다 (ADR H-0002)
    expect(screen.getByText("icspreamh2gpu02")).toBeInTheDocument();
  });

  it("정상인데 알람이 없으면 '활성 알람 없음' — 실패와 구분한다", async () => {
    installFetch({});
    render(<Alarms refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("활성 알람 없음")).toBeInTheDocument());
    expect(screen.getByText("0 active")).toBeInTheDocument();
    expect(screen.queryByText(/조회 실패/)).toBeNull();
  });

  it("조회 실패는 명시적으로 표시하고 KPI를 '--'로 둔다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    render(<Alarms refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/알람 조회 실패/)).toBeInTheDocument());
    expect(screen.getByText("조회 실패")).toBeInTheDocument();
    expect(screen.queryByText("활성 알람 없음")).toBeNull(); // 정상 상태와 혼동 금지
  });

  it("Firing 행에만 Acknowledge 버튼이 있고, 누르면 확인 처리를 알린다 (X12 — 메타 멘트 없음)", async () => {
    const rows = [
      alarmSeries("SlowQuery", "warning", "gpu-server-02", 2, 95),
      alarmSeries("Acked", "warning", "gpu-server-01", 3, 95),
    ];
    installFetch({ [q.state]: rows.map((r) => r[0]), [q.since]: rows.map((r) => r[1]) });
    render(<Alarms refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("SlowQuery")).toBeInTheDocument());

    const buttons = screen.getAllByRole("button", { name: "Acknowledge" });
    expect(buttons).toHaveLength(1); // firing 1건에만
    act(() => { fireEvent.click(buttons[0]); });
    // 기록 전용이라 "처리했습니다"(완료 확정)가 아니라 "요청이 기록"이다(X12-01)
    expect(screen.getByRole("status")).toHaveTextContent(/확인\(Acknowledge\) 요청이\s*기록/);
    expect(screen.getByRole("status")).not.toHaveTextContent(/목업|ADR-0004|처리했습니다/);
  });
});

describe("Log Monitoring 화면", () => {
  const q = logMonitoring();
  const scalar = (v: number) => [{ metric: {}, value: [NOW, String(v)] }];

  it("KPI 4종을 24시간 increase에서 채운다", async () => {
    installFetch({
      [q.total24h]: scalar(2481), [q.errors24h]: scalar(7),
      [q.warnings24h]: scalar(43), [q.info24h]: scalar(2431),
    });
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("2,481")).toBeInTheDocument());
    expect(screen.getByText("43")).toBeInTheDocument();
    // X13 — Grafana 변형은 Main Dashboard 전용 opt-in: 다른 차트에는 안 붙는다
    expect(document.querySelector(".sqm-chart--grafana")).toBeNull();
  });

  it("레벨·노드·검색 필터가 목업 로그를 걸러낸다", () => {
    installFetch({});
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    expect(screen.getByText(/Showing 12 of 2,481/)).toBeInTheDocument();

    act(() => { fireEvent.change(screen.getByLabelText("레벨"), { target: { value: "Error" } }); });
    expect(screen.getByText(/Showing 1 of 2,481/)).toBeInTheDocument();

    act(() => { fireEvent.change(screen.getByLabelText("레벨"), { target: { value: "" } }); });
    act(() => { fireEvent.change(screen.getByLabelText("노드"), { target: { value: "icspreamh2gpu01" } }); });
    expect(screen.getByText(/Showing 5 of 2,481/)).toBeInTheDocument();

    act(() => { fireEvent.change(screen.getByLabelText("로그 검색"), { target: { value: "rechunk" } }); });
    expect(screen.getByText(/Showing 1 of 2,481/)).toBeInTheDocument();
  });

  it("노드를 바꾸면 워커 옵션이 그 노드 것만 남고 선택이 풀린다", () => {
    installFetch({});
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    const workerSelect = () => screen.getByLabelText<HTMLSelectElement>("워커");
    expect(within(workerSelect()).getAllByRole("option")).toHaveLength(13); // All + 12

    act(() => { fireEvent.change(screen.getByLabelText("노드"), { target: { value: "icspreamh2gpu03" } }); });
    expect(within(workerSelect()).getAllByRole("option")).toHaveLength(4); // All + 3
    expect(workerSelect().value).toBe("");
  });

  it("CLEAR FILTERS가 모든 조건을 되돌린다", () => {
    installFetch({});
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    act(() => { fireEvent.change(screen.getByLabelText("레벨"), { target: { value: "Info" } }); });
    act(() => { fireEvent.change(screen.getByLabelText("로그 검색"), { target: { value: "worker" } }); });
    expect(screen.getByText(/Showing 1 of 2,481/)).toBeInTheDocument();

    act(() => { fireEvent.click(screen.getByRole("button", { name: "CLEAR FILTERS" })); });
    expect(screen.getByText(/Showing 12 of 2,481/)).toBeInTheDocument();
  });

  it("조건에 맞는 로그가 없으면 그렇게 말한다", () => {
    installFetch({});
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText("로그 검색"), { target: { value: "존재하지않는문자열" } });
    });
    expect(screen.getByText("조건에 맞는 로그 없음")).toBeInTheDocument();
  });

  it("조회 실패면 KPI가 '--'로 떨어진다 (0과 구분)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => {
      const kpi = screen.getByText("ERRORS").closest(".sqm-kpi") as HTMLElement;
      expect(within(kpi).getByText("--")).toBeInTheDocument();
    });
  });
});

describe("Log Monitoring — CSV 내보내기", () => {
  it("EXPORT LOGS가 12건을 CSV Blob으로 만들고 알린다 — 파일명에 mock 표기 없음 (X12)", () => {
    installFetch({});
    const created: Blob[] = [];
    const revoked: string[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((b: Blob) => { created.push(b); return "blob:mock"; }),
      revokeObjectURL: vi.fn((u: string) => { revoked.push(u); }),
    });
    // jsdom의 a.click()은 navigation을 시도하지 않지만, 다운로드 속성만 확인한다
    const clicks: HTMLAnchorElement[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 원본을 저장했다 되돌리는 용도
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicks.push(this);
    };
    try {
      render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
      act(() => { fireEvent.click(screen.getByRole("button", { name: "EXPORT LOGS" })); });

      expect(created).toHaveLength(1);
      expect(created[0].type).toBe("text/csv");
      expect(clicks).toHaveLength(1);
      expect(clicks[0].download).toBe("sqream-logs.csv");
      expect(revoked).toEqual(["blob:mock"]); // 누수 없이 해제한다
      expect(screen.getByRole("status")).toHaveTextContent(/12건을 CSV로/);
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it("워커 필터도 목록을 좁힌다", () => {
    installFetch({});
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    act(() => { fireEvent.change(screen.getByLabelText("워커"), { target: { value: "sqream101" } }); });
    expect(screen.getByText(/Showing 1 of 2,481/)).toBeInTheDocument();
  });
});
