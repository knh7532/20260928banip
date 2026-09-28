// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fireEvent, render, within } from "@testing-library/react";
import { vi } from "vitest";

const nodes = ["gpu-server-01", "gpu-server-02", "gpu-server-03"] as const;
const servers = nodes.map((node) => ({
  node,
  utilization: 60,
  memoryPct: 55,
  temperature: 58,
  power: 800,
  gpuTotal: 4,
  migTotal: 8,
  gpuBusy: 4,
}));
const emptySeries = { x: [], lines: [] };

vi.mock("../src/hooks/useFilters", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/hooks/useFilters")>();
  return {
    ...original,
    useFilters: () => ({
      state: { env: "production", instances: [], gpus: [], migs: [], rangeSec: 1800, refreshSec: 5 },
      setState: vi.fn(),
      selectGpu: vi.fn(),
      selectInstance: vi.fn(),
      reset: vi.fn(),
    }),
  };
});
const kpi = { migActive: 12, migTotal: 24, inQueue: 0, rowsPerSecond: 1_850_000, p95Seconds: 1.2 };

vi.mock("../src/hooks/useDashboardData", () => ({
  useDashboardData: () => ({
    data: { statements: [], performance: [], servers, kpi },
    failStreak: 0,
    lastSuccessAt: null,
  }),
}));
vi.mock("../src/hooks/useCharts", () => ({
  useCharts: () => ({
    data: {
      timelineRows: [],
      domain: { startMs: 0, endMs: 1 },
      panDomain: { startMs: 0, endMs: 1 },
      series: {
        utilization: emptySeries,
        memory: emptySeries,
        temperature: emptySeries,
        power: emptySeries,
      },
    },
    failStreak: 0,
  }),
}));
// X2: GPU 화면의 상세 열은 X-View 패널로 교체됐다 — useRangeDetail 폴링은 중단(XR-04).
vi.mock("../src/hooks/useXViewEvents", () => ({
  useXViewEvents: () => ({ events: [], failStreak: 0, lastSuccessAt: null }),
}));
vi.mock("../src/hooks/useRangeSelection", () => ({
  useRangeSelection: () => ({ selection: null, setSelection: vi.fn(), clear: vi.fn() }),
}));

import App from "../src/App";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(resolve(ROOT, "src/styles/app.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...CSS.matchAll(new RegExp(`(?<![\\w-])${escaped}\\s*\\{([^}]*)\\}`, "g")),
  ];
  const match = matches.at(-1);
  expect(match, `CSS rule ${selector}`).toBeDefined();
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

describe("R8 dashboard layout contract", () => {
  it("dashboard-canvas owns explicit top, middle, and bottom sections", () => {
    const { container } = render(<App />);
    const canvas = container.querySelector(".dashboard-canvas") as HTMLElement;
    expect(canvas).not.toBeNull();

    /* X8-f2(인간 지시 2026-08-18): KPI 4타일 스트립은 화면에서 제거 — 요약은
       QuerySummary 카드 3장으로 일원화됐다. 중첩 위치 재등장까지 잡는다. */
    expect(canvas.querySelector(".dashboard-kpi")).toBeNull();

    const top = canvas.querySelector(":scope > .dashboard-top") as HTMLElement;
    const middle = canvas.querySelector(":scope > .dashboard-middle") as HTMLElement;
    const bottom = canvas.querySelector(":scope > .dashboard-bottom") as HTMLElement;
    expect(top.querySelector(":scope > .panel--running")).not.toBeNull();
    // 2026-09-04: ② SQL 쿼리 성능 표는 제거 — 16열 실행 쿼리 표가 상단 전폭(.dashboard-top--single)
    expect(top.querySelector(":scope > .panel--performance")).toBeNull();
    expect(top.classList.contains("dashboard-top--single")).toBe(true);
    expect(middle.querySelector(":scope > .panel--timeline")).not.toBeNull();
    // X2(NX-03): GPU 화면의 상세 열은 X-View 전용 modifier를 쓴다 — LLM 화면(#/llm)의
    // .detail-col 2행(TimeRangePanel+LlmRangeDetail)과 셀렉터가 분리된다.
    const detailCol = middle.querySelector(":scope > .detail-col") as HTMLElement;
    expect(detailCol).not.toBeNull();
    expect(detailCol.classList.contains("detail-col--xview")).toBe(true);
    expect(detailCol.querySelector(":scope > .panel--xview")).not.toBeNull();
    expect(bottom.querySelector(":scope > .metric-stack")).not.toBeNull();
    expect(bottom.querySelector(":scope > .server-gauges")).not.toBeNull();
  });

  // R9.1: bottom 16→18 rows (시계열 y축 판독성 — 인간 지시)
  it("uses the approved 24-column shares and fixed 7:11:18 section heights", () => {
    // R9(F1.1): KPI 스트립 — 4타일 고정 높이
    expect(rule(".dashboard-kpi")).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(rule(".dashboard-kpi")).toContain("height: var(--dashboard-kpi-h)");
    expect(rule(".dashboard-top")).toContain("grid-template-columns: minmax(0, 13fr) minmax(0, 11fr)");
    expect(rule(".dashboard-top")).toContain("height: var(--dashboard-top-h)");
    expect(rule(".dashboard-middle")).toContain("grid-template-columns: minmax(0, 18fr) minmax(0, 6fr)");
    expect(rule(".dashboard-middle")).toContain("height: var(--dashboard-middle-h)");
    expect(rule(".dashboard-bottom")).toContain("grid-template-columns: minmax(0, 18fr) minmax(0, 6fr)");
    expect(rule(".dashboard-bottom")).toContain("height: var(--dashboard-bottom-h)");
    // R9-P0(F3.2): 시간 구간은 내용 높이(auto), 상세가 나머지 — LLM 화면(#/llm)이 계속 쓴다
    expect(rule(".detail-col")).toContain("grid-template-rows: auto minmax(0, 1fr)");
    // X2(NX-03): GPU 화면 전용 X-View는 1행 — 패널 하나가 열 전체를 갖는다
    expect(rule(".detail-col--xview")).toContain("grid-template-rows: minmax(0, 1fr)");
  });

  it("keeps table overflow inside fixed top panels", () => {
    expect(rule(".dashboard-top > .panel")).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(rule(".table-scroll")).toContain("overflow-y: auto");
    expect(rule(".table-scroll")).toContain("min-height: 0");
    expect(rule(".table-scroll")).toContain("height: 100%");
  });

  // X8-#5: GPU 화면 전용 확장 — 기존 단언은 그대로 두고 additive로만 잠근다.
  it("GPU 화면은 쿼리 요약 섹션과 top 세로 확장 **토글**을 갖는다 (X8·X8-f1)", () => {
    const { container } = render(<App />);
    const canvas = container.querySelector(".dashboard-canvas") as HTMLElement;
    // 요약 카드 5장 (X16 상태 축) — KPI 스트립과 별개 섹션(4타일 계약 불변)
    const qsummary = canvas.querySelector(":scope > .dashboard-qsummary") as HTMLElement;
    expect(qsummary).not.toBeNull();
    expect(qsummary.querySelectorAll(".qsummary-card")).toHaveLength(5);
    /* X8-f1(인간 지시): 기본은 원래 높이(모디파이어 없음) — 리스트가 길어도
       아래 섹션이 밀리지 않는다. 펼치기 토글을 눌렀을 때만 확장된다. */
    const top = canvas.querySelector(":scope > .dashboard-top") as HTMLElement;
    expect(top.classList.contains("dashboard-top--gpu-tall")).toBe(false);
    const toggle = within(top).getByRole("button", { name: "펼치기 ▾" });
    // 표시 범위 토글 = aria-expanded + 제어 대상 연결 (codex X8-f1-01)
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "dashboard-queries");
    fireEvent.click(toggle);
    expect(top.classList.contains("dashboard-top--gpu-tall")).toBe(true);
    const collapse = within(top).getByRole("button", { name: "접기 ▴" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    expect(top.classList.contains("dashboard-top--gpu-tall")).toBe(false);
    expect(rule(".dashboard-top--gpu-tall")).toContain("height: var(--dashboard-queries-h)");
    expect(rule(".dashboard-qsummary")).toContain("height: var(--dashboard-qsummary-h)");
  });

  it("keeps the timeline legend fixed while only the plot owns vertical scrolling", () => {
    const { container } = render(<App />);
    const timeline = container.querySelector(".timeline") as HTMLElement;
    const plot = timeline.querySelector(":scope > .timeline__plot-scroll") as HTMLElement;
    const legend = timeline.querySelector(":scope > .timeline__legend") as HTMLElement;
    expect(plot).not.toBeNull();
    expect(legend).not.toBeNull();
    expect(plot).not.toContainElement(legend);
    expect(rule(".timeline")).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(rule(".timeline__plot-scroll")).toContain("overflow-y: auto");
  });

  it("fits four metric cards and three four-gauge cards inside the fixed bottom section", () => {
    expect(rule(".metric-stack")).toContain("grid-template-rows: repeat(3, minmax(0, 1fr)) minmax(0, 1.3fr)");
    expect(rule(".server-gauges")).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(rule(".gauge-card__stack")).toContain("grid-template-rows: repeat(4, minmax(0, 1fr))");
  });

  it("assigns clipping to the rounded sidebar and scrolling to its inner wrapper", () => {
    expect(rule(".sidebar")).toContain("overflow: hidden");
    expect(rule(".sidebar")).toContain("border-radius: 0 var(--sidebar-radius) var(--sidebar-radius) 0");
    expect(rule(".sidebar__scroll")).toContain("overflow-y: auto");
    expect(rule(".sidebar__scroll")).toContain("height: 100%");
    expect(rule(".server-card__name")).toContain("min-width: 0");
    expect(rule(".server-card__name")).toContain("overflow-wrap: anywhere");
    expect(rule(".server-card__badge")).toContain("flex: 0 0 auto");
  });

  it("maps the fixed NODES order identically in sidebar and gauge regions", () => {
    const { container } = render(<App />);
    const sidebarNames = [...container.querySelectorAll(".sidebar .server-card__name")].map(
      (node) => node.textContent,
    );
    const gaugeNames = [...container.querySelectorAll(".server-gauges .gauge-card__name")].map(
      (node) => node.textContent,
    );
    expect(sidebarNames).toEqual(["icspreamh2gpu01", "icspreamh2gpu02", "icspreamh2gpu03"]);
    expect(gaugeNames).toEqual(sidebarNames);
  });

  it("below 1366 assigns horizontal scrolling only to content around a 1120px canvas", () => {
    const normalized = CSS.replace(/\s+/g, " ");
    expect(rule("body")).toContain("overflow-x: hidden");
    expect(rule(".app-shell")).toContain("overflow: hidden");
    expect(rule(".content")).toContain("overflow: auto");
    expect(rule(".content")).toContain("min-width: 0");
    expect(normalized).toContain("@media (max-width: 1365px)");
    expect(normalized).toContain(".dashboard-canvas { min-width: var(--dashboard-min-w)");
    expect(rule(".sidebar__scroll")).toContain("overflow-x: hidden");
  });
});
