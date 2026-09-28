import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { Header } from "../src/components/Header";
import { KpiStrip } from "../src/components/KpiStrip";
import { Panel } from "../src/components/Panel";
import { QuerySummary } from "../src/components/QuerySummary";
import { Sidebar } from "../src/components/Sidebar";
import { statusOf } from "../src/lib/statusMeta";
import { QueryPerformance } from "../src/components/tables/QueryPerformance";
import { RunningQueries } from "../src/components/tables/RunningQueries";
import type { KpiData, PerformanceRow, ServerSummary, StatementRow } from "../src/hooks/useDashboardData";
import { currentPhase } from "../src/screens/drilldown/mockQueryDetail";

const server = (over: Partial<ServerSummary>): ServerSummary => ({
  node: "gpu-server-01",
  utilization: 60,
  memoryPct: 55,
  temperature: 58,
  power: 800,
  gpuTotal: 4,
  migTotal: 8,
  gpuBusy: 5,
  ...over,
});

const noSelect = { selectedInstances: [] as string[], onSelectInstance: () => {} };

describe("Sidebar", () => {
  it("접기 버튼으로 완전히 숨기고 선택 상태를 브라우저에 저장한다", () => {
    localStorage.removeItem("ax-portal.sidebar-collapsed");
    const { unmount } = render(<Sidebar servers={[]} {...noSelect} />);
    const aside = screen.getByRole("complementary", { name: "사이드바" });

    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(aside).toHaveClass("sidebar--collapsed");
    expect(localStorage.getItem("ax-portal.sidebar-collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    unmount();
    render(<Sidebar servers={[]} {...noSelect} />);
    expect(screen.getByRole("complementary", { name: "사이드바" })).toHaveClass("sidebar--collapsed");
    localStorage.removeItem("ax-portal.sidebar-collapsed");
  });

  it("접힌 사이드바 가장자리에 마우스를 두면 임시로 펼쳐지고 벗어나면 다시 접힌다", () => {
    localStorage.setItem("ax-portal.sidebar-collapsed", "true");
    render(<Sidebar servers={[]} {...noSelect} />);
    const aside = screen.getByRole("complementary", { name: "사이드바" });

    fireEvent.mouseEnter(aside);
    expect(aside).toHaveClass("sidebar--collapsed", "sidebar--hover-expanded");
    expect(localStorage.getItem("ax-portal.sidebar-collapsed")).toBe("true");

    fireEvent.mouseLeave(aside);
    expect(aside).not.toHaveClass("sidebar--hover-expanded");
    expect(aside).toHaveClass("sidebar--collapsed");
    localStorage.removeItem("ax-portal.sidebar-collapsed");
  });

  it("외곽 shape와 내부 scroll을 분리하고 section·separator 의미를 제공한다", () => {
    const { container } = render(<Sidebar servers={[]} {...noSelect} />);
    const aside = screen.getByRole("complementary", { name: "사이드바" });
    const scroll = aside.querySelector(":scope > .sidebar__scroll") as HTMLElement;
    expect(scroll).not.toBeNull();
    expect(within(scroll).getByRole("region", { name: /개요/ })).toBeInTheDocument();
    expect(within(scroll).getByRole("region", { name: /알림/ })).toBeInTheDocument();
    expect(within(scroll).getByRole("region", { name: "GPU 서버 목록" })).toBeInTheDocument();
    expect(within(scroll).getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
    expect(container.querySelector(".sidebar__separator")).not.toBeNull();
  });

  it("aria-current는 현재 화면 링크(GPU/SQream 모니터링)에만 있다 (ADR R-0003·R-0005)", () => {
    render(<Sidebar servers={[]} {...noSelect} />);
    // 화면 링크(sub)가 현재 화면을 표시한다 — 상위 카테고리는 강조만, aria-current 없음
    expect(screen.getByText("GPU/SQream 모니터링").closest(".sidebar__item")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("GPU 모니터링").closest(".sidebar__item")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("GPU/LLM 모니터링").closest(".sidebar__item")).not.toHaveAttribute("aria-current");
    const inactive = screen.getByText("Cost 분석");
    expect(inactive).toHaveAttribute("aria-disabled", "true");
  });

  it("서버 카드는 메트릭에서 산출한 상태·MIG 사용 수를 보인다 (하드코딩 금지, R7)", () => {
    render(<Sidebar servers={[server({ node: "gpu-server-02", migTotal: 8, gpuBusy: 2 })]} {...noSelect} />);
    const card = screen.getByText("icspreamh2gpu02").closest(".server-card") as HTMLElement;
    expect(within(card).getByText("정상")).toBeInTheDocument();
    expect(within(card).getByText(/2\s*\/\s*8/)).toBeInTheDocument();
    expect(card.textContent).toContain("MIG 사용 중");
  });

  it("MIG 슬롯이 하나도 없으면 중단으로 표시한다", () => {
    render(<Sidebar servers={[server({ migTotal: 0, gpuBusy: 0 })]} {...noSelect} />);
    expect(screen.getByText("중단")).toBeInTheDocument();
  });

  it("하위 항목들은 들여쓴 sub 항목이다 (R7 — PPTX 계층)", () => {
    render(<Sidebar servers={[]} {...noSelect} />);
    for (const label of ["GPU/SQream 모니터링", "GPU/LLM 모니터링",
                         "GPU 상세", "프로세스 모니터링", "LLM 모니터링", "Cost 분석"]) {
      expect(screen.getByText(label).closest(".sidebar__item")?.className).toContain("sidebar__item--sub");
    }
    expect(screen.getByText("GPU 모니터링").className).not.toContain("sidebar__item--sub");
    expect(screen.getByText("대시보드 설정").className).not.toContain("sidebar__item--sub");
  });

  it("현행 세 서버를 입력 순서 그대로 표시하고 긴 이름도 badge와 분리한다", () => {
    const fixed = [
      server({ node: "gpu-server-01" }),
      server({ node: "gpu-server-02" }),
      server({ node: "gpu-server-03" }),
    ];
    const { container, rerender } = render(<Sidebar servers={fixed} {...noSelect} />);
    expect([...container.querySelectorAll(".server-card__name")].map((node) => node.textContent)).toEqual([
      "icspreamh2gpu01",
      "icspreamh2gpu02",
      "icspreamh2gpu03",
    ]);

    rerender(
      <Sidebar
        servers={[
          server({
            node: "gpu-server-this-is-a-very-long-production-name" as ServerSummary["node"],
          }),
        ]}
        {...noSelect}
      />,
    );
    const head = container.querySelector(".server-card__head") as HTMLElement;
    expect(head.querySelector(".server-card__name")?.textContent).toHaveLength(46);
    expect(head.querySelector(":scope > .server-card__badge")).not.toBeNull();
  });
});

describe("Sidebar — 인스턴스 선택 (R6)", () => {
  it("서버 카드는 버튼이며 클릭 시 onSelectInstance(node)를 호출한다", () => {
    const onSelect = vi.fn();
    render(
      <Sidebar
        servers={[server({ node: "gpu-server-01" })]}
        selectedInstances={[]}
        onSelectInstance={onSelect}
      />,
    );
    const card = screen.getByRole("button", { name: /icspreamh2gpu01/ });
    expect(card).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith("gpu-server-01");
  });

  it("단독 선택된 카드는 active + aria-pressed=true", () => {
    render(
      <Sidebar
        servers={[server({ node: "gpu-server-01" }), server({ node: "gpu-server-02" })]}
        selectedInstances={["gpu-server-01"]}
        onSelectInstance={() => {}}
      />,
    );
    const active = screen.getByRole("button", { name: /icspreamh2gpu01/ });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active.className).toContain("server-card--active");
    const other = screen.getByRole("button", { name: /icspreamh2gpu02/ });
    expect(other).toHaveAttribute("aria-pressed", "false");
  });

  it("'인스턴스별 GPU' 항목은 더 이상 렌더하지 않는다 (인간 지시 2026-07-19 — 시안 정합)", () => {
    render(<Sidebar servers={[]} selectedInstances={["gpu-server-01"]} onSelectInstance={() => {}} />);
    expect(screen.queryByText("인스턴스별 GPU")).toBeNull();
  });
});

describe("RunningQueries 테이블 — 16열 (mockup/sqream_running_queries_mockup.html 이식, 2026-09-04)", () => {
  const row: StatementRow = {
    stmtId: "105234",
    queryId: "Q-88123",
    user: "dba1",
    node: "gpu-server-01",
    gpu: "0",
    mig: "0",
    worker: "sqream101",
    service: "etl_service",
    qid: "JOI-14H",
    qidTags: "JOIN:3",
    connectionId: "5012",
    memoryBytes: 22_300_000_000,
    gpuPct: 68,
    cpuPct: 145,
    // 2026-07-15T05:32:01Z → KST 14:32:01 (타임존 무관)
    startTimeSec: Date.UTC(2026, 6, 15, 5, 32, 1) / 1000,
    elapsedSec: 125,
    progress: 0.4,
    spoolBytes: Number.NaN,
    vramBytes: 55_066 * 1024 * 1024, // DCGM FB_USED(MiB) → bytes
    lockHeldSec: Number.NaN,
  };

  it("목업 16열 헤더를 그 순서로 그린다", () => {
    render(<RunningQueries rows={[row]} />);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual([
      "Query Start", "Hostname", "Worker", "Connection ID", "Statement ID", "Service", "Lock Type",
      "User Name", "상태", "Elapsed Time(초)", "진행율(%)", "사용 메모리(GRAM)", "Disk Spool",
      "GPU 메모리(VRAM)", "GPU 사용률(%)", "CPU 사용률(%)", "작업",
    ]);
  });

  it("작업 열: 로그는 로그 탭, Kill 은 onKill — 시작 시각 결측이면 Kill 비활성 (2026-09-04)", () => {
    const onOpen = vi.fn();
    const onKill = vi.fn();
    const { rerender } = render(<RunningQueries rows={[row]} onOpen={onOpen} onKill={onKill} />);
    fireEvent.click(screen.getByRole("button", { name: "로그" }));
    expect(onOpen).toHaveBeenLastCalledWith(row, "logs");
    fireEvent.click(screen.getByRole("button", { name: "Kill" }));
    expect(onKill).toHaveBeenCalledWith(row);
    expect(onOpen).toHaveBeenCalledTimes(1); // 버튼 클릭이 행 클릭(sql)로 번지지 않는다
    rerender(<RunningQueries rows={[{ ...row, startTimeSec: Number.NaN }]} onOpen={onOpen} onKill={onKill} />);
    expect(screen.getByRole("button", { name: "Kill" })).toBeDisabled();
    rerender(<RunningQueries rows={[row]} />);
    expect(screen.queryByRole("button", { name: "Kill" })).toBeNull();
    expect(screen.queryByRole("button", { name: "로그" })).toBeNull();
  });

  it("헤더 드래그로 열 순서를 바꾸고 localStorage 에 기억, 초기화 버튼으로 복귀 (2026-09-04)", () => {
    localStorage.removeItem("topview.running-queries.column-order");
    const { container, unmount } = render(<RunningQueries rows={[row]} />);
    const heads = () => [...container.querySelectorAll("thead th")].map((h) => h.getAttribute("data-col"));
    expect(heads().slice(0, 3)).toEqual(["stamp", "node", "worker"]);
    const worker = container.querySelector('th[data-col="worker"]') as HTMLElement;
    const stamp = container.querySelector('th[data-col="stamp"]') as HTMLElement;
    fireEvent.dragStart(worker);
    fireEvent.dragOver(stamp);
    expect(stamp.classList.contains("is-dragover")).toBe(true);
    fireEvent.drop(stamp);
    expect(heads().slice(0, 3)).toEqual(["worker", "stamp", "node"]);
    // 본문 셀도 같은 순서 — 첫 셀이 워커명
    expect(container.querySelector("tbody tr td")?.textContent).toBe("sqream101");
    expect((JSON.parse(localStorage.getItem("topview.running-queries.column-order") ?? "[]") as string[])[0]).toBe("worker");
    // 다시 마운트해도 순서 유지
    unmount();
    const again = render(<RunningQueries rows={[row]} />);
    expect([...again.container.querySelectorAll("thead th")][0].getAttribute("data-col")).toBe("worker");
    fireEvent.click(screen.getByRole("button", { name: "열 순서 초기화" }));
    expect([...again.container.querySelectorAll("thead th")][0].getAttribute("data-col")).toBe("stamp");
    expect(screen.queryByRole("button", { name: "열 순서 초기화" })).toBeNull();
    localStorage.removeItem("topview.running-queries.column-order");
  });

  it("행을 계약 값으로 채운다 — 스탬프·호스트·서비스 배지·경과(한글)·GRAM/VRAM 짝·게이지", () => {
    const { container } = render(<RunningQueries rows={[row]} />);
    expect(screen.getByText("2026-07-15 14:32:01")).toBeInTheDocument();
    expect(screen.getByText("icspreamh2gpu01")).toBeInTheDocument();
    expect(screen.getByText("sqream101")).toBeInTheDocument();
    expect(container.querySelector(".svc-badge")?.textContent).toBe("etl_service");
    expect(screen.getByText("dba1")).toBeInTheDocument();
    expect(screen.getByText("2분 5초")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument(); // 진행율 0.4
    expect(screen.getByText("22.3 GB / 364 GB")).toBeInTheDocument();
    expect(screen.getByText("57.7 GB / 71 GB")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.getByText("145%")).toBeInTheDocument();
    // Connection ID 는 계약 라벨(v4.12) — 값이 있으면 그대로, 락 없음·스풀 없음은 "-"
    expect(screen.getByText("5012")).toBeInTheDocument();
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("상태 컬럼은 상태 축 어휘다 — 판정은 currentPhase, 표기는 statusMeta (X8·X16)", () => {
    const { container, rerender } = render(<RunningQueries rows={[row]} />);
    expect(screen.getByRole("columnheader", { name: "상태" })).toBeInTheDocument();
    expect(screen.getByText("Executing")).toBeInTheDocument();
    expect(container.querySelector(".state-badge.state--run")).not.toBeNull();
    rerender(<RunningQueries rows={[{ ...row, elapsedSec: 1 }]} />);
    const phase = currentPhase({ id: row.stmtId, qid: row.qid, elapsed: 1 });
    expect(screen.getByText(statusOf(phase).label)).toBeInTheDocument();
    expect(screen.queryByText("Executing")).toBeNull();
    rerender(<RunningQueries rows={[{ ...row, elapsedSec: Number.NaN }]} />);
    expect(screen.getByText("Preparing")).toBeInTheDocument();
    expect(container.querySelector(".state-badge.state--compile")).not.toBeNull();
  });

  it("onOpen: 행 클릭은 쿼리문 탭, Statement ID 링크는 실행 계획 탭 (목업 규칙)", () => {
    const onOpen = vi.fn();
    const { rerender } = render(<RunningQueries rows={[row]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "105234" }));
    expect(onOpen).toHaveBeenLastCalledWith(row, "plan");
    fireEvent.click(screen.getByText("dba1"));
    expect(onOpen).toHaveBeenLastCalledWith(row, "sql");
    expect(onOpen).toHaveBeenCalledTimes(2); // 링크 클릭이 행 클릭으로 번지지 않는다
    rerender(<RunningQueries rows={[row]} />);
    expect(screen.queryByRole("button", { name: "105234" })).toBeNull();
    expect(screen.getByText("105234")).toBeInTheDocument();
  });

  it("틴트: Disk Spool>0 은 row--spool(우선), 30분 이상 경과는 row--long", () => {
    const { container, rerender } = render(
      <RunningQueries rows={[{ ...row, spoolBytes: 13_900_000_000, elapsedSec: 4000 }]} />,
    );
    expect(container.querySelector("tbody tr")?.className).toBe("row--spool");
    expect(screen.getByText("13.9 GB")).toBeInTheDocument();
    rerender(<RunningQueries rows={[{ ...row, elapsedSec: 1800 }]} />);
    expect(container.querySelector("tbody tr")?.className).toBe("row--long");
    rerender(<RunningQueries rows={[row]} />);
    expect(container.querySelector("tbody tr")?.className).toBe("");
  });

  it("헤더 클릭 정렬 — 새 열은 내림차순 우선, 재클릭 토글, 결측은 항상 뒤", () => {
    const rows = [
      { ...row, stmtId: "1", gpuPct: 10 },
      { ...row, stmtId: "2", gpuPct: Number.NaN },
      { ...row, stmtId: "3", gpuPct: 90 },
    ];
    const { container } = render(<RunningQueries rows={rows} />);
    const ids = () => [...container.querySelectorAll("tbody tr td:nth-child(5)")].map((td) => td.textContent);
    const gpuHead = screen.getByRole("columnheader", { name: "GPU 사용률(%)" });
    fireEvent.click(gpuHead);
    expect(ids()).toEqual(["3", "1", "2"]);
    expect(gpuHead).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(gpuHead);
    expect(ids()).toEqual(["1", "3", "2"]);
    expect(gpuHead).toHaveAttribute("aria-sort", "ascending");
    // Connection ID 는 값(문자열)으로 정렬된다(v4.12) — 픽스처는 전부 같은 값이라 안정 정렬로 원 순서
    fireEvent.click(screen.getByRole("columnheader", { name: "Connection ID" }));
    expect(ids()).toEqual(["1", "2", "3"]);
  });

  it("행이 없으면 안내 문구 (16열 colSpan)", () => {
    const { container } = render(<RunningQueries rows={[]} />);
    expect(screen.getByText("실행 중인 쿼리가 없습니다")).toBeInTheDocument();
    expect(container.querySelector("td.empty")).toHaveAttribute("colspan", "17");
  });

  it("emptyText로 첫 로드 문구를 구분한다 (R9 F7.2)", () => {
    render(<RunningQueries rows={[]} emptyText="불러오는 중…" />);
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
    expect(screen.queryByText("실행 중인 쿼리가 없습니다")).toBeNull();
  });

  it("20행 이상도 panel 밖이 아니라 table-scroll 내부에 유지한다", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      ...row,
      stmtId: `stmt-${index}`,
      queryId: `query-${index}`,
    }));
    const { container } = render(<RunningQueries rows={rows} />);
    const panel = container.querySelector(".panel--running") as HTMLElement;
    const body = panel.querySelector(":scope > .panel__body") as HTMLElement;
    const scroll = body.querySelector(":scope > .table-scroll") as HTMLElement;
    expect(scroll).not.toBeNull();
    expect(scroll.querySelectorAll("tbody tr")).toHaveLength(24);
    expect(scroll.querySelector("table")?.classList.contains("data-table--wide")).toBe(true);
  });
});

describe("QueryPerformance 테이블", () => {
  const mk = (state: number): PerformanceRow => ({
    queryName: "Sales_Aggregation",
    queryType: "aggregation",
    database: "sales_db",
    node: "gpu-server-01",
    gpu: "0",
    mig: "0",
    rowsPerSecond: 1_850_000,
    p95Seconds: 1.28,
    state,
  });

  it("유형 한글 표기·rows/s·P95를 렌더한다", () => {
    render(<QueryPerformance rows={[mk(1)]} />);
    expect(screen.getByText("집계")).toBeInTheDocument();
    expect(screen.getByText("1.85M rows/s")).toBeInTheDocument();
    expect(screen.getByText("1.28 s")).toBeInTheDocument();
  });

  it.each([
    [0, "Initializing"],
    [1, "In Process"],
    [2, "In Queue"],
  ])("상태 %i → 배지 '%s'", (state, label) => {
    render(<QueryPerformance rows={[mk(state)]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("알 수 없는 유형·상태는 원본/‘-’로 방어한다", () => {
    const row: PerformanceRow = { ...mk(9), queryType: "unknown_type" };
    render(<QueryPerformance rows={[row]} />);
    expect(screen.getByText("unknown_type")).toBeInTheDocument(); // QUERY_TYPE_LABEL fallback
    // 상태 배지 fallback "-" + 비실행 행 MIG "-" (CDX-R9) — 둘 다 존재
    expect(screen.getByText("-", { selector: ".state-badge" })).toBeInTheDocument();
  });

  it("행이 없으면 안내 문구 (RunningQueries와 일관, CDX-R3-11)", () => {
    render(<QueryPerformance rows={[]} />);
    expect(screen.getByText("표시할 쿼리가 없습니다")).toBeInTheDocument();
  });

  it("Worker 컬럼으로 SQream 실행 슬롯을 식별한다", () => {
    render(<QueryPerformance rows={[{ ...mk(1), mig: "1" }]} />);
    expect(screen.getByRole("columnheader", { name: "Worker" })).toBeInTheDocument();
    expect(screen.getByText("sqream102")).toBeInTheDocument();
  });

  it("In Process가 아닌 행의 MIG는 '-' — 대기·유휴 라벨은 슬롯 잔재 (CDX-R9)", () => {
    const { container } = render(<QueryPerformance rows={[{ ...mk(2), mig: "1" }]} />);
    expect(screen.queryByText("sqream102")).toBeNull();
    // GPU 컬럼 다음 셀(MIG)이 "-"
    const cells = [...container.querySelectorAll("tbody td")].map((c) => c.textContent);
    expect(cells).toContain("-");
  });

  it("In Queue 행은 틴트 클래스, 그 외 상태는 없음 (R9 F5.2)", () => {
    const { container } = render(<QueryPerformance rows={[mk(2), { ...mk(1), queryName: "Customer_Join" }]} />);
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows[0].className).toContain("row--queue");
    expect(rows[1].className).not.toContain("row--queue");
  });

  it("emptyText로 첫 로드 문구를 구분한다 (R9 F7.2)", () => {
    render(<QueryPerformance rows={[]} emptyText="불러오는 중…" />);
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
  });
});

describe("KpiStrip — 요약 4타일 (R9 F1.1)", () => {
  const kpi: KpiData = {
    migActive: 12,
    migTotal: 24,
    inQueue: 0,
    rowsPerSecond: 1_850_000,
    p95Seconds: 1.28,
    queuedStatements: 0, // X8 — KpiStrip은 읽지 않는다(QuerySummary 소관)
  };

  it("활성 MIG n / 분모 · In Queue · 총 처리행수 · 평균 P95를 렌더한다", () => {
    const { container } = render(<KpiStrip kpi={kpi} />);
    const tiles = [...container.querySelectorAll(".kpi-tile")];
    expect(tiles).toHaveLength(4);
    expect(tiles[0].textContent).toContain("활성 MIG");
    expect(tiles[0].textContent).toContain("12");
    expect(tiles[0].textContent).toContain("/ 24");
    // sqm_query_state에 위치 라벨이 없어 인스턴스 필터 미적용 — 전역임을 라벨로 명시 (CDX-R9)
    expect(tiles[1].textContent).toContain("In Queue (환경 전체)");
    expect(tiles[1].textContent).toContain("0");
    expect(tiles[2].textContent).toContain("1.85M rows/s");
    expect(tiles[3].textContent).toContain("1.28 s");
  });

  it("In Queue > 0이면 경고 강조, 0이면 없음", () => {
    const { container, rerender } = render(<KpiStrip kpi={kpi} />);
    expect(container.querySelector(".kpi-tile--alert")).toBeNull();
    rerender(<KpiStrip kpi={{ ...kpi, inQueue: 2 }} />);
    expect(container.querySelector(".kpi-tile--alert")).not.toBeNull();
  });

  it("결측(공란)은 '-'로 표기한다", () => {
    const nan = Number.NaN;
    const { container } = render(
      <KpiStrip kpi={{
        migActive: nan, migTotal: nan, inQueue: nan, rowsPerSecond: nan, p95Seconds: nan,
        queuedStatements: nan,
      }} />,
    );
    const values = [...container.querySelectorAll(".kpi-tile__value")].map((e) => e.textContent);
    expect(values).toEqual(["- / -", "-", "-", "-"]);
    expect(container.querySelector(".kpi-tile--alert")).toBeNull(); // NaN은 경고 아님
  });
});

describe("QuerySummary — 상태 축 카드 5장 (X8·X16)", () => {
  const props = {
    queued: 2, preparing: 1, initializing: 3, running: 7, stopped: 4, stoppedWindow: "30분",
  };

  it("In Queue→Preparing→Initializing→Executing→Stopped 순서로 5장을 렌더한다", () => {
    const { container } = render(<QuerySummary {...props} />);
    const section = screen.getByRole("region", { name: "쿼리 개수 요약" });
    const cards = [...container.querySelectorAll(".qsummary-card")];
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.querySelector(".qsummary-card__label")?.textContent)).toEqual([
      "대기 (In Queue)", "준비 (Preparing)", "초기화 (Initializing)",
      "실행 중 (Executing)", "중단 (Stopped · 최근 30분)",
    ]);
    expect(cards.map((c) => c.querySelector(".qsummary-card__value")?.textContent))
      .toEqual(["2", "1", "3", "7", "4"]);
    // 대기(배정 전 메트릭)와 준비~실행(실행 슬롯 위 합성 단계)은 다른 축 — 힌트 명시
    expect(section.textContent).toContain("배정 전 statement");
    // 중단은 문장 축 — 워커 Stopped와 구분되게 대상(문장)을 힌트에 명시
    expect(section.textContent).toContain("Kill된 문장");
  });

  it("결측(NaN)은 '-'로 표기한다 — 대기·중단 각각", () => {
    render(<QuerySummary {...props} queued={Number.NaN} stopped={Number.NaN} />);
    const section = screen.getByRole("region", { name: "쿼리 개수 요약" });
    expect([...section.querySelectorAll(".qsummary-card__value")].map((e) => e.textContent))
      .toEqual(["-", "1", "3", "7", "-"]);
  });
});

describe("Header — 갱신 시각 (R9 F7.1)", () => {
  it("lastUpdatedMs를 KST 시각으로 표기한다", () => {
    // 2026-07-15T05:32:01Z → KST 14:32:01
    const { container } = render(<Header lastUpdatedMs={Date.UTC(2026, 6, 15, 5, 32, 1)} />);
    expect(container.querySelector(".header__updated")?.textContent).toBe("갱신 14:32:01");
  });

  it("첫 성공 전(null)에는 '—'", () => {
    const { container } = render(<Header lastUpdatedMs={null} />);
    expect(container.querySelector(".header__updated")?.textContent).toBe("갱신 —");
  });
});

describe("Panel 프레임", () => {
  it("제목은 heading이고 section에 연결된다 (CDX-R3-09)", () => {
    render(
      <Panel title="제목" hint="도움말 내용" className="panel--x">
        <div>본문</div>
      </Panel>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "제목" });
    expect(heading).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "제목" });
    expect(region).toContainElement(heading);
    expect(screen.getByText("본문")).toBeInTheDocument();
  });

  it("도움말 버튼을 누르면 팝오버가 열리고 다시 누르면 닫힌다 (CDX-R3-10)", () => {
    render(
      <Panel title="제목" hint="도움말 내용">
        <div>본문</div>
      </Panel>,
    );
    const btn = screen.getByRole("button", { name: "도움말" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent("도움말 내용");
    expect(btn).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);

    fireEvent.click(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Escape로 팝오버를 닫는다", () => {
    render(
      <Panel title="t" hint="h">
        <div>b</div>
      </Panel>,
    );
    fireEvent.click(screen.getByRole("button", { name: "도움말" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("바깥을 클릭하면 팝오버를 닫는다", () => {
    render(
      <Panel title="t" hint="h">
        <div>b</div>
      </Panel>,
    );
    fireEvent.click(screen.getByRole("button", { name: "도움말" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseDown(document.body); // wrap 바깥
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hint가 없으면 도움말 버튼이 없다", () => {
    const { container } = render(
      <Panel title="제목만">
        <div>본문</div>
      </Panel>,
    );
    expect(screen.getByText("제목만")).toBeInTheDocument();
    expect(container.querySelector(".panel__hint")).toBeNull();
  });

  it("actions 슬롯은 헤더 우측에 렌더된다 (R6)", () => {
    const { container } = render(
      <Panel title="t" actions={<button type="button">액션</button>}>
        <div>b</div>
      </Panel>,
    );
    const slot = container.querySelector(".panel__actions");
    expect(slot).not.toBeNull();
    expect(within(slot as HTMLElement).getByRole("button", { name: "액션" })).toBeInTheDocument();
  });

  it("actions가 없으면 슬롯도 없다", () => {
    const { container } = render(
      <Panel title="t">
        <div>b</div>
      </Panel>,
    );
    expect(container.querySelector(".panel__actions")).toBeNull();
  });
});
