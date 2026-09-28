/*
 * S3-C — 나머지 7화면(Main·Worker·Query·Session·Snapshot·Table Usage·Table Activity) 이관 검증.
 *
 * 각 화면에서 공통으로 잠그는 것:
 *  1) 계약 메트릭에서 값이 실제로 채워진다 (표·KPI).
 *  2) 조회 실패는 **명시**되고 "데이터 없음(정상)"과 구분된다.
 *  3) 정적본에서 옮겨 온 규칙(정렬·임계·조인 키·목업 동작 고지)이 살아 있다.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DEFAULT_FILTERS } from "../src/components/drilldown/toolbarModel";
import { beforeEach, describe, expect, it, vi } from "vitest";


import {
  mainDashboard, queryAnalytics, sessionMonitoring, snapshotLock,
  tableActivity, tableUsage, workerMonitoring,
} from "../src/api/queries";
import { statusOf, statusOrdinal } from "../src/lib/statusMeta";
import { currentPhase, mockPhases } from "../src/screens/drilldown/mockQueryDetail";
import { MainDashboard } from "../src/screens/drilldown/MainDashboard";
import { QueryAnalytics } from "../src/screens/drilldown/QueryAnalytics";
import { SessionMonitoring } from "../src/screens/drilldown/SessionMonitoring";
import { SnapshotLock } from "../src/screens/drilldown/SnapshotLock";
import { TableActivity } from "../src/screens/drilldown/TableActivity";
import { TableUsage } from "../src/screens/drilldown/TableUsage";
import { WorkerMonitoring } from "../src/screens/drilldown/WorkerMonitoring";
import {
  CHUNK_ROW_CAP, avgChunkRows, deletedTone, fragTone,
  isCleanupTarget, isRechunkTarget, rechunkChecks,
} from "../src/screens/drilldown/tableRows";
import { TableStatusModal } from "../src/screens/drilldown/TableStatusModal";

const NOW = Math.floor(Date.now() / 1000);
const GiB = 1024 ** 3;
const TiB = 1024 ** 4;

type Row = { metric: Record<string, string>; value: [number, string] };
const v = (metric: Record<string, string>, value: number | string): Row =>
  ({ metric, value: [NOW, String(value)] });
const scalar = (n: number): Row[] => [v({}, n)];

/** expr → 결과. 등록되지 않은 expr은 빈 배열(정상 무데이터). */
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
        status: "success", data: { resultType, result: answer[expr] ?? [] },
      }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function failAll() {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
}

const kpiOf = (label: string) =>
  within(screen.getByText(label).closest(".sqm-kpi") as HTMLElement);

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

/* ══════════════ Main Dashboard ══════════════ */
describe("Main Dashboard", () => {
  const q = mainDashboard();

  it("KPI·세션 통계·Query Overview·Node Health·Top Queries를 채운다", async () => {
    installFetch({
      [q.sessions]: scalar(5), [q.running]: scalar(3),
      [q.cpu]: scalar(42), [q.memory]: scalar(61),
      [q.users]: scalar(4), [q.errors1h]: scalar(7),
      [q.spool]: scalar(7846238048),
      [q.statements]: [
        // X17: Service 열은 qid 파생(LOA→etl_service / SEL→select_service) — 라벨 service는 큐 축
        v({ stmt_id: "100137", sqream_user: "dba1", node: "gpu-server-01", worker: "sqream101", service: "etl_service", qid: "LOA-12H" }, 1),
        v({ stmt_id: "100138", sqream_user: "analyst2", node: "gpu-server-02", worker: "sqream212", service: "sqream", qid: "SEL-01L" }, 1),
      ],
      [q.duration]: [v({ stmt_id: "100137" }, 125), v({ stmt_id: "100138" }, 12)],
      [q.progress]: [v({ stmt_id: "100137" }, 0.4)],
      [q.workers]: [
        v({ node: "gpu-server-01", worker: "sqream101" }, 1),
        v({ node: "gpu-server-01", worker: "sqream102" }, 0),
      ],
      // 다운 + WorkerDown 알람 = crash "Down" (X14 — 알람 이름이 유형이다)
      [q.workerAlerts]: [v({ alertname: "WorkerDown", worker: "sqream102" }, 2)],
      [q.topGpu]: [v({ stmt_id: "100137", worker: "sqream101" }, 88)],
      [q.topScanned]: [v({ stmt_id: "100137" }, 40 * GiB)],
      // 워커 한도 314GB의 25% — MemCell이 분모를 제대로 쓰는지 본다
      [q.topMemory]: [v({ stmt_id: "100137", worker: "sqream101" }, 78.5 * GiB)],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(kpiOf("ACTIVE SESSIONS").getByText("5")).toBeInTheDocument());
    expect(kpiOf("CPU USAGE").getByText("42%")).toBeInTheDocument();
    expect(kpiOf("GPU MEMORY USAGE").getByText("61%")).toBeInTheDocument();

    // 세션 통계 4박스
    expect(screen.getByText("Connected Users").nextSibling).toHaveTextContent("4");
    // Cache Hit Rate 자리를 Disk Spill이 대신한다(2026-08-10). 7.3 GiB.
    expect(screen.queryByText("Cache Hit Rate"), "옛 카드가 남아 있다").toBeNull();
    expect(screen.getByText("Disk Spill").nextSibling).toHaveTextContent("7.3 GB");
    /* X14-f1(인간 지시): Queued Queries 카드 삭제 — 실제 시스템은 1초 이상
       대기하는 쿼리를 정지·에러 처리한다. 자리는 Longest Running(실행 중 최장
       쿼리, duration 최댓값 125s → 00:02:05). */
    expect(screen.queryByText("Queued Queries"), "삭제된 카드가 남아 있다").toBeNull();
    expect(screen.getByText("Longest Running").nextSibling).toHaveTextContent("00:02:05");

    // Query Overview — 경과 시간 내림차순, Statement ID 무접두(X17), etl_service는 배지
    const overview = within(
      screen.getByText("Query Overview").closest(".sqm-card") as HTMLElement);
    const ids = overview.getAllByRole("button", { name: /^1001\d+$/ }).map((b) => b.textContent);
    expect(ids[0]).toBe("100137"); // 125s가 12s보다 위
    // 둘 다 executing(경과 125s·12s ≫ 준비 합계) — qid 파생 서비스가 그대로 보인다
    expect(overview.getByText("etl_service")).toBeInTheDocument();
    expect(overview.getByText("select_service")).toBeInTheDocument();
    expect(overview.queryByText("Q-Type"), "X17: Q-Type 열은 삭제됐다").toBeNull();

    // Node Health — 기대 노드 3개를 항상 그린다 (Query Overview에도 노드명이 있어 범위를 좁힌다)
    const nodeHealth = within(
      screen.getByText("Node Health").closest(".sqm-card") as HTMLElement);
    expect(nodeHealth.getByText("icspreamh2gpu01")).toBeInTheDocument();
    expect(nodeHealth.getByText("icspreamh2gpu03")).toBeInTheDocument();
    expect(nodeHealth.getAllByText("Worker 데이터 없음")).toHaveLength(2); // 02·03은 데이터 없음
    expect(nodeHealth.getByText("50%")).toBeInTheDocument(); // 01: 1/2 healthy
    expect(nodeHealth.getByText("Down")).toBeInTheDocument(); // crash 유형 배지 (X14)

    /* Top Queries의 RAM 사용률 — 분모는 워커당 한도 314GB다. 78.5/314 = 25.0%.
       화면이 다른 분모(노드 전체 메모리 등)를 쓰면 여기서 바로 어긋난다. */
    const topCard = within(
      screen.getByText("Top Queries by Resource Usage").closest(".sqm-card") as HTMLElement);
    expect(topCard.getByText(/^25\.0% \(/)).toBeInTheDocument();
  });

  it("Node Health Recovery — hang 직행 Recovery(kill) 완주 (X15)", async () => {
    const answers: Record<string, unknown> = {
      [q.workers]: [
        v({ node: "gpu-server-01", worker: "sqream101" }, 1),
        v({ node: "gpu-server-01", worker: "sqream102" }, 0),
      ],
      // hang(WorkerUnresponsive) — 유형별 조치의 실질 대상 (X14)
      [q.workerAlerts]: [v({ alertname: "WorkerUnresponsive", worker: "sqream102" }, 2)],
    };
    const spy = installFetch(answers as Record<string, unknown[]>);
    render(<MainDashboard refreshMs={50} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    // hang 표기는 "No response"다 (X14-f1 인간 지시 — "무응답" 폐기)
    await waitFor(() => expect(screen.getByText("No response")).toBeInTheDocument());
    expect(screen.queryByText("무응답")).toBeNull();

    // Healthy 행의 버튼은 비활성(exporter 404 fail-closed와 일치), 다운만 동작
    const rowOf = (w: string) =>
      within(screen.getByText(w).closest(".sqm-workerhealth") as HTMLElement);
    expect(rowOf("sqream101").getByRole("button", { name: "Recovery" })).toBeDisabled();
    fireEvent.click(rowOf("sqream102").getByRole("button", { name: "Recovery" }));

    // hang 뷰 — 사다리·관찰 박스·shutdown 옵션 없음(X15 kill 모델)
    const guide = () =>
      within(screen.getByRole("dialog", { name: "Recovery sqream102" }));
    expect(guide().queryByText(/스스로 복귀할 수 있습니다/)).toBeNull();
    expect(guide().queryByText(/먼저 완료하세요/)).toBeNull();
    expect(guide().queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();

    // 재기동 = 워커 서버 kill — 실행 전 안내(명령 미리보기·실행 위치) 후 실행
    fireEvent.click(guide().getByRole("button", { name: "Recovery" }));
    expect(screen.getByText(/워커 프로세스를 kill합니다/)).toBeInTheDocument();
    expect(screen.getByText(
      `pgrep -a sqreamd | grep -w sqream102 | awk '{print "kill " $1}' | sh`,
    )).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "장애 조치" } });
    fireEvent.click(screen.getByRole("button", { name: "Recovery 실행" }));
    await waitFor(() => expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/workers/sqream102/restart"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/재기동 접수/)).toBeInTheDocument());
  });

  it("Node Health — 두 알람 동시 관측도 Down 우선 (codex X14-01, MainDashboard 경로)", async () => {
    /* Down을 먼저 주는 픽스처 — last-wins 구현이면 Unresponsive가 이겨 실패한다. */
    installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream102" }, 0)],
      [q.workerAlerts]: [
        v({ alertname: "WorkerDown", worker: "sqream102" }, 2),
        v({ alertname: "WorkerUnresponsive", worker: "sqream102" }, 2),
      ],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("Down")).toBeInTheDocument());
    expect(screen.queryByText("No response")).toBeNull();
  });

  it("고정 시점에서는 Down이어도 Recovery가 비활성이다 (codex X9F4-01)", async () => {
    installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream102" }, 0)],
      [q.workerAlerts]: [v({ alertname: "WorkerDown", worker: "sqream102" }, 2)],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={1_787_000_000_000} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("Down")).toBeInTheDocument());
    // 과거 스냅숏의 Down으로 현재 exporter에 명령을 보내면 안 된다
    const btn = within(screen.getByText("sqream102").closest(".sqm-workerhealth") as HTMLElement)
      .getByRole("button", { name: "Recovery" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/고정 시점/);
  });

  it("쿼리 메모리가 안 오면 0%가 아니라 '--'다", async () => {
    /* 0으로 접으면 "메모리를 안 쓰는 쿼리"처럼 보인다 — 있을 수 없는 상태다. */
    installFetch({
      [q.statements]: [v({ stmt_id: "100137", worker: "sqream101" }, 1)],
      [q.topGpu]: [v({ stmt_id: "100137", worker: "sqream101" }, 88)],
      // topMemory 없음
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    const topCard = () => within(
      screen.getByText("Top Queries by Resource Usage").closest(".sqm-card") as HTMLElement);
    // Node 컬럼도 "--"라서 MemCell만 집어서 본다 (title로 식별)
    await waitFor(() => expect(
      topCard().getByTitle("한도 314GB/워커"),
    ).toHaveTextContent("--"));
    expect(topCard().queryByText(/^0\.0%/)).toBeNull();
  });

  it("조회 실패는 KPI를 '--'로 두고 표에 실패를 적는다", async () => {
    failAll();
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(kpiOf("ACTIVE SESSIONS").getByText("--")).toBeInTheDocument());
    expect(screen.getAllByText(/조회 실패/).length).toBeGreaterThan(0);
  });

  it("'Failed Queries (1h)'는 이제 실패 쿼리 수다 — 보관 한도를 각주로 밝힌다", () => {
    /* 예전엔 에러 **로그 건수**였다. 카드를 누르면 나오는 내역은 실패 쿼리 목록인데
       숫자는 로그 건수라 113건 vs 12줄로 어긋났다(2026-08-10 계약 v4.3에서 통일). */
    installFetch({});
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    expect(screen.getByText((_t, el) => el?.textContent?.includes("최근 12건") === true,
      { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText(/에러 로그 건수/)).toBeNull();
  });

  it("Statement ID를 누르면 탭 상세(X6)가 열리고, Kill이 접수되면 행이 즉시 사라진다", async () => {
    /* 폴링(refreshMs=100000)이 다시 돌기 전에 사라져야 한다 — 낙관적 제거.
       exporter 반영은 다음 tick이라, 폴링을 기다리면 "죽였는데 남아 있는" 화면이 된다. */
    installFetch({
      [q.statements]: [
        v({ stmt_id: "100137", sqream_user: "dba1", node: "gpu-server-01",
          worker: "sqream101", service: "etl_service", qid: "JOI-14H" }, 1),
      ],
      [q.duration]: [v({ stmt_id: "100137" }, 125)],
      [q.topGpu]: [v({ stmt_id: "100137", worker: "sqream101" }, 88)],
      // 세대 토큰(X6-R1/R4) — 없으면 Kill이 비활성이라 이 시나리오가 성립하지 않는다
      [q.startTime]: [v({ stmt_id: "100137" }, 1787000000)],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "100137" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "100137" }));

    const detail = screen.getByRole("dialog", { name: "Statement 100137" });
    expect(within(detail).getAllByRole("tab").map((t) => t.textContent))
      .toEqual(["SQL", "로그", "플랜"]);

    // Kill — 사유 필수 다이얼로그를 거쳐 접수되면 팝업이 닫히고 행이 지워진다
    fireEvent.click(within(detail).getByRole("button", { name: "Kill" }));
    const dlg = screen.getByRole("dialog", { name: "Kill Statement" });
    fireEvent.change(within(dlg).getByLabelText("수행 사유"), { target: { value: "티켓 #1" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Kill 실행" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Statement 100137" })).toBeNull());
    // Query Overview·Top Queries 양쪽에서 사라졌다 (installFetch는 kill POST에도 ok를 낸다).
    // 성공 토스트에는 Statement ID가 남으므로 표 카드로 범위를 좁혀 본다.
    expect(screen.queryByRole("button", { name: "100137" })).toBeNull();
    const topCard = within(
      screen.getByText("Top Queries by Resource Usage").closest(".sqm-card") as HTMLElement);
    expect(topCard.queryByText("100137")).toBeNull();
  });

  it("CLE(cleanup류) statement는 Kill이 비활성이다 — 가이드: 중단 금지 (X11)", async () => {
    installFetch({
      [q.statements]: [
        v({ stmt_id: "100140", sqream_user: "dba1", node: "gpu-server-01",
          worker: "sqream101", service: "sqream", qid: "CLE-00L" }, 1),
      ],
      [q.duration]: [v({ stmt_id: "100140" }, 12)],
      // 세대 토큰이 있어도 CLE는 막힌다 — 토큰 결측과 다른 사유임을 명확히 한다
      [q.startTime]: [v({ stmt_id: "100140" }, 1787000000)],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "100140" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "100140" }));
    const detail = screen.getByRole("dialog", { name: "Statement 100140" });
    const kill = within(detail).getByRole("button", { name: "Kill" });
    expect(kill).toBeDisabled();
    expect(kill.getAttribute("title")).toMatch(/CLEANUP 계열은 중단 금지/);
  });

  it("Status는 상태 축 어휘·서수 정렬이다 — 항상 'Running'이 아니다 (X7-a·X16)", async () => {
    /* codex X16-02: 4행을 서로 다른 단계에 놓고 정렬 **결과 순서**까지 단언한다 —
       라벨 문자열(알파벳) 정렬 퇴행이면 순서가 달라져 잡힌다. 단계 경계는
       stmt_id+qid 해시 합성(mockPhases)이라 경계 중간값으로 의도 단계를 만들고,
       의도와 실제 판정의 일치를 가드 단언한다(시드 퇴화 시 여기서 잡힌다). */
    const rows = [
      { id: "100137", qid: "JOI-14H", elapsed: 125 }, // executingSec (준비 합계 ≤~8s)
      { id: "100138", qid: "SEL-01L", elapsed: mockPhases({ id: "100138", qid: "SEL-01L" }).compileSec / 2 },
      { id: "900201", qid: "AGG-02M", elapsed: (() => { const p = mockPhases({ id: "900201", qid: "AGG-02M" }); return p.compileSec + p.queuedSec / 2; })() },
      { id: "900202", qid: "ETL-03S", elapsed: (() => { const p = mockPhases({ id: "900202", qid: "ETL-03S" }); return p.compileSec + p.queuedSec + p.initializingSec / 2; })() },
    ];
    const phaseOf = (r: typeof rows[number]) => currentPhase({ id: r.id, qid: r.qid, elapsed: r.elapsed });
    expect(rows.map(phaseOf)).toEqual(["executingSec", "compileSec", "queuedSec", "initializingSec"]);
    installFetch({
      [q.statements]: rows.map((r, i) =>
        v({ stmt_id: r.id, sqream_user: "dba1", node: `gpu-server-0${(i % 3) + 1}`,
          worker: `sqream10${i + 1}`, service: "etl_service", qid: r.qid }, 1)),
      [q.duration]: rows.map((r) => v({ stmt_id: r.id }, r.elapsed)),
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "100137" })).toBeInTheDocument());
    const card = within(
      screen.getByText("Query Overview").closest(".sqm-card") as HTMLElement);

    expect(card.queryByText("Running")).toBeNull();
    // 125s 행은 준비 단계(≤~8s)를 한참 지났다 — Executing
    expect(card.getAllByText("Executing").length).toBeGreaterThan(0);
    // 어린 행의 상태는 currentPhase가 정한 단계의 상태 축 라벨이다(합성 경계는 fixture로 잠겨 있다)
    const young = statusOf(phaseOf(rows[1])).label;
    expect(card.getAllByText(young).length).toBeGreaterThan(0);

    /* Status 클릭 = 서수 내림차순(새 컬럼은 desc부터) → 재클릭 = 오름차순.
       서수 원천은 STATUS_META 순서(In Queue 0 < Preparing 1 < Initializing 2 <
       Executing 3)다 — 실제 tbody 순서로 단언한다 (codex X16-02). */
    const shown = () => card.getAllByRole("button", { name: /^\d+$/ }).map((b) => b.textContent);
    const byOrdinal = (desc: boolean) => [...rows]
      .sort((a, b) => (desc ? -1 : 1) * (statusOrdinal(phaseOf(a)) - statusOrdinal(phaseOf(b))))
      .map((r) => r.id);
    fireEvent.click(card.getByRole("button", { name: /Status/ }));
    expect(shown()).toEqual(byOrdinal(true));
    fireEvent.click(card.getByRole("button", { name: /Status/ }));
    expect(shown()).toEqual(byOrdinal(false));
  });

  it("Service·Worker 열은 단계 파생이다 — 실행 전 compile, In Queue는 워커 공란 (X17)", async () => {
    /* 실행 중(CLE) 행은 기본 큐 sqream, In Queue 행은 컴파일러 소관(compile) +
       배정 전이라 워커를 지어내지 않는다(dim —). 정렬도 표시값 기준이다. */
    const pQ = mockPhases({ id: "900201", qid: "AGG-02M" });
    const eQ = pQ.compileSec + pQ.queuedSec / 2;
    expect(currentPhase({ id: "900201", qid: "AGG-02M", elapsed: eQ })).toBe("queuedSec");
    installFetch({
      [q.statements]: [
        v({ stmt_id: "100137", sqream_user: "dba1", node: "gpu-server-01",
          worker: "sqream101", service: "sqream", qid: "CLE-00L" }, 1),
        v({ stmt_id: "900201", sqream_user: "analyst2", node: "gpu-server-02",
          worker: "sqream212", service: "sqream", qid: "AGG-02M" }, 1),
      ],
      [q.duration]: [v({ stmt_id: "100137" }, 125), v({ stmt_id: "900201" }, eQ)],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "100137" })).toBeInTheDocument());
    const card = within(
      screen.getByText("Query Overview").closest(".sqm-card") as HTMLElement);

    // 헤더 8개 — Q-Type이 빠지고 Statement ID로 개명됐다 (X17)
    const headers = card.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers).toHaveLength(8);
    expect(headers.some((h) => h.includes("Statement ID"))).toBe(true);
    expect(headers.some((h) => h.includes("Q-Type"))).toBe(false);

    // 실행 중 CLE(DDL·유지보수 계열) → 기본 큐 sqream
    expect(card.getByText("sqream")).toBeInTheDocument();
    // In Queue 행 — Service는 compile, 워커는 공란(—)이다
    expect(card.getByText("compile")).toBeInTheDocument();
    expect(card.queryByText("sqream212"), "배정 전 워커를 지어냈다").toBeNull();

    // Service 정렬은 표시값 기준 — desc면 sqream(실행 중)이 compile보다 위
    const shown = () => card.getAllByRole("button", { name: /^\d+$/ }).map((b) => b.textContent);
    fireEvent.click(card.getByRole("button", { name: /Service/ }));
    expect(shown()).toEqual(["100137", "900201"]);
    fireEvent.click(card.getByRole("button", { name: /Service/ }));
    expect(shown()).toEqual(["900201", "100137"]);
  });

  /* E1: 라인 차트는 ECharts — 전역 목 레지스트리에서 Cluster 차트 인스턴스를
     시리즈 이름(노드 표기)으로 찾는다. */
  const em = globalThis.__echartsMock;
  type StackOpt = {
    yAxis: Array<{ max?: number }>;
    series: Array<{ name: string; stack?: string; color?: string; data: Array<[number, number | null]> }>;
  };
  const lastClusterOption = (): StackOpt | undefined => {
    for (let i = em.instances.length - 1; i >= 0; i--) {
      const calls = em.instances[i].setOption.mock.calls;
      for (let j = calls.length - 1; j >= 0; j--) {
        const opt = calls[j][0] as Partial<StackOpt> & { brush?: unknown };
        // 브러시 미니맵(ECharts, E5 D3)도 같은 노드 이름의 계열을 갖는다 — brush 옵션은 건너뛴다.
        if (!("brush" in opt) && opt.series?.some((sr) => sr.name === "icspreamh2gpu01")) {
          // 갱신 호출에는 yAxis가 없을 수 있다 — 초기 옵션에서 가져온다.
          const initial = calls[0][0] as Partial<StackOpt>;
          return { yAxis: (opt.yAxis ?? initial.yAxis)!, series: opt.series } as StackOpt;
        }
      }
    }
    return undefined;
  };

  it("Cluster Performance는 선택 지표를 노드 3개 누적(스택)으로 그린다 (X7-b)", async () => {
    const mrow = (node: string, vals: Array<[number, number]>) => ({
      metric: { node }, values: vals.map(([t, val]) => [t, String(val)]),
    });
    installFetch({
      // 노드마다 시점이 어긋난다 — x축은 첫 시리즈가 아니라 **합집합**이어야 한다
      // (codex X7-02: 첫 노드에 없는 시점이 통째로 사라졌다).
      [q.cpuByNode]: [
        mrow("gpu-server-01", [[NOW - 30, 30], [NOW, 32]]),
        mrow("gpu-server-02", [[NOW - 15, 21], [NOW, 30]]),
        mrow("gpu-server-03", [[NOW - 30, 25], [NOW, 34]]),
      ],
    });
    em.reset();
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(lastClusterOption()).toBeDefined());
    const opt = lastClusterOption()!;
    // 노드 3계열이 한 그룹으로 스택 — 라벨은 화면 표기, 색은 뮤티드 노드 3색
    // (E4 — X13 classic 톤을 뮤티드 시안이 흡수. 타 화면 노드 팔레트와 같은 사다리)
    expect(opt.series.map((sr) => sr.name)).toEqual(
      ["icspreamh2gpu01", "icspreamh2gpu02", "icspreamh2gpu03"]);
    expect(opt.series.every((sr) => sr.stack === "g0")).toBe(true);
    expect(opt.series[0].color).toBe("#8ab4f8");
    expect(opt.series[1].color).toBe("#81c995");
    expect(opt.series[2].color).toBe("#fdd663");
    // X13 — Grafana 변형 클래스 훅은 이 차트(1개)에만 붙는다
    expect(document.querySelectorAll(".sqm-chart--grafana")).toHaveLength(1);
    // 스택 상한 = 시점별 합의 최대(32+30+34=96)를 number 규칙으로 — percent 100핀이면 잘린다
    expect(opt.yAxis[0].max).toBe(110);
    // x축 = 시점 합집합(3개, 오름차순), 결측 시점은 null — 시점이 사라지면 안 된다
    const s01 = opt.series.find((sr) => sr.name === "icspreamh2gpu01")!;
    const s02 = opt.series.find((sr) => sr.name === "icspreamh2gpu02")!;
    expect(s01.data).toHaveLength(3);
    expect(s02.data.map((d) => d[1])).toEqual([null, 21, 30]);
    expect(s01.data.map((d) => d[1])).toEqual([30, null, 32]);
  });

  it("지표 전환은 새 축 상한으로 다시 굳는다 — 옛 축·그룹이 남으면 안 된다 (X7-01)", async () => {
    /* CPU(%) 축으로 굳은 차트에 Disk(GB/s)가 실리면 잘린다 — 전환 시
       이전 데이터를 비우고(useRangeSeries) 새 응답으로 fresh 마운트되는지 잠근다. */
    const mrow = (node: string, vals: Array<[number, number]>) => ({
      metric: { node }, values: vals.map(([t, val]) => [t, String(val)]),
    });
    installFetch({
      [q.cpuByNode]: [
        mrow("gpu-server-01", [[NOW, 32]]), mrow("gpu-server-02", [[NOW, 30]]),
        mrow("gpu-server-03", [[NOW, 34]]),
      ],
      [q.diskIoByNode]: [
        mrow("gpu-server-01", [[NOW, 2.1e9]]), mrow("gpu-server-02", [[NOW, 2.2e9]]),
        mrow("gpu-server-03", [[NOW, 1.7e9]]),
      ],
    });
    em.reset();
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(lastClusterOption()).toBeDefined());

    em.reset();
    fireEvent.click(screen.getByRole("button", { name: /Disk I\/O/ }));
    await waitFor(() => expect(lastClusterOption()).toBeDefined());
    const opt = lastClusterOption()!;
    // 합 6e9 → number 규칙 7e9. CPU 시절의 110이 남아 있으면 이 단언이 잡는다.
    expect(opt.yAxis[0].max).toBe(7_000_000_000);
    expect(opt.series.every((sr) => sr.stack === "g0")).toBe(true);
  });

  it("스트립은 라디오다 — 지표를 누르면 그 지표의 노드별 식을 조회한다 (X7-b)", async () => {
    const spy = installFetch({});
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(0));

    const urlsCalled = () => spy.mock.calls.map((c) => String(c[0]));
    // 기본 선택은 CPU — cpuByNode가 이미 조회됐고 gpuByNode는 아직이다
    await waitFor(() => expect(
      urlsCalled().some((u) => u.includes(encodeURIComponent(q.cpuByNode)))).toBe(true));
    expect(urlsCalled().some((u) => u.includes(encodeURIComponent(q.gpuByNode)))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /GPU Usage/ }));
    await waitFor(() => expect(
      urlsCalled().some((u) => u.includes(encodeURIComponent(q.gpuByNode)))).toBe(true));
  });
});

/* ══════════════ Worker Monitoring ══════════════ */
describe("Worker Monitoring", () => {
  const q = workerMonitoring();

  it("고정 맵 8슬롯 — GPU 병합 셀·상태·MIG 사용률·VRAM(/71GB) 막대를 낸다 (X9·X9-f1)", async () => {
    installFetch({
      [q.workers]: [
        v({ node: "gpu-server-01", worker: "sqream101", service: "etl_service" }, 1),
        v({ node: "gpu-server-01", worker: "sqream102", service: "sqream" }, 0),
      ],
      // v4.11 — 구독 큐 시리즈(자기 이름 큐는 표시에서 걸러져야 한다)
      [q.subs]: [
        v({ node: "gpu-server-01", worker: "sqream101", service: "etl_service" }, 1),
        v({ node: "gpu-server-01", worker: "sqream101", service: "sqream101" }, 1),
        v({ node: "gpu-server-01", worker: "sqream102", service: "sqream" }, 1),
        v({ node: "gpu-server-01", worker: "sqream102", service: "sqream102" }, 1),
        v({ node: "gpu-server-01", worker: "sqream102", service: "select_service" }, 1),
      ],
      // 다운 + WorkerDown 알람 = crash "Down" (X14 — 알람 이름이 유형이다)
      [q.workerAlerts]: [
        v({ alertname: "WorkerDown", node: "gpu-server-01", worker: "sqream102" }, 2)],
      [q.workerCpu]: [v({ worker: "sqream101" }, 70), v({ worker: "sqream102" }, 35)],
      [q.workerMemory]: [v({ worker: "sqream101" }, 20 * GiB), v({ worker: "sqream102" }, 8 * GiB)],
      [q.migUtil]: [v({ node: "gpu-server-01", gpu: "0", mig: "0" }, 83)],
      // RAM 픽스처는 10진 GB(exporter GB_BYTES=1e9) — GiB(1024³)로 넣으면 단위 오류를 가린다(X9F2-01)
      [q.workerRam]: [v({ worker: "sqream101" }, 30e9), v({ worker: "sqream102" }, 12e9)],
      // 실행 중 문장(X9-f3) — sqream101에서 1건. Statement ID 열의 원천이다.
      [q.running]: [v({
        stmt_id: "100501", worker: "sqream101", node: "gpu-server-01",
        service: "etl_service", sqream_user: "analyst2", qid: "QID9001", qid_tags: "adhoc",
      }, 1)],
      [q.stmtDuration]: [v({ stmt_id: "100501" }, 42)],
      [q.stmtProgress]: [v({ stmt_id: "100501" }, 0.5)],
      [q.stmtStartTime]: [v({ stmt_id: "100501" }, NOW - 42)],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("icspreamh2gpu01")).toBeInTheDocument());
    const card = within(screen.getByText("icspreamh2gpu01").closest(".sqm-wnode") as HTMLElement);
    // 카드 상단 CPU USAGE·GPU MEMORY USAGE 수치는 삭제됐다 (2026-08-25 인간 지시)
    expect(screen.queryByText("CPU USAGE")).toBeNull();
    expect(screen.queryByText("GPU MEMORY USAGE")).toBeNull();
    // 분모는 관측 수가 아니라 고정 맵 8슬롯이다
    expect(screen.getByText("1/8")).toBeInTheDocument();
    // E5(인간 정정): Service 열 — Worker 오른쪽, MainDashboard 문법. ETL 전용은
    // etl_service 배지, 일반 워커는 구독 큐 평문(자기 이름 큐는 걸러진다).
    expect(card.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("etl_service")).toBeInTheDocument();
    // 큐마다 한 줄(실측 출력 모사) — "select_service"와 "sqream"이 별개 요소다.
    const svcCell = within(screen.getByText("sqream102").closest("tr") as HTMLElement);
    expect(svcCell.getByText("select_service")).toBeInTheDocument();
    expect(svcCell.getByText("sqream")).toBeInTheDocument();
    // GPU 소속은 세로 병합 셀(X9-f1) — GPU마다 1회. MIG 열은 삭제됐다(X9-f2)
    for (const g of ["GPU0", "GPU1", "GPU2", "GPU3"]) {
      expect(card.getAllByText(g)).toHaveLength(1);
    }
    expect(card.queryByText("MIG")).toBeNull();
    expect(card.queryByText("MIG0")).toBeNull();
    // RAM Memory 열(X9-f2) — 실행 문장 메모리 합 / 논리 할당 368GB
    expect(card.getByText("RAM Memory")).toBeInTheDocument();
    expect(card.getByRole("img", { name: "30 / 368 GB" })).toBeInTheDocument();
    // "워커당 VRAM 할당" 힌트는 삭제됐다(X9-f2)
    expect(screen.queryByText(/워커당 VRAM 할당/)).toBeNull();
    // up=0 + WorkerDown = crash "Down" 배지(X14) + 값 유지 — colSpan 가림 없음.
    // 수치는 행의 막대(BarCell, role=img)로 그려진다(X9-f1 — 상태바 복원).
    expect(screen.queryByText("✖ Suspended")).toBeNull();
    expect(card.getAllByText("Healthy")).toHaveLength(1);
    expect(card.getByText("Down")).toBeInTheDocument();
    // Recovery는 Down·No response·Stopped 행에만 — Healthy·수집 누락에는 없다 (X14)
    expect(card.getAllByRole("button", { name: "Recovery" })).toHaveLength(1);
    // Statement ID 열 — 실행 중 문장이 있는 워커만 무접두 stmt_id 버튼 (X9-f3·X17)
    expect(card.getByRole("button", { name: "100501" })).toBeInTheDocument();
    expect(card.getByRole("img", { name: "35%" })).toBeInTheDocument();       // 다운 워커의 CPU 막대
    expect(card.getByRole("img", { name: "8 / 71 GB" })).toBeInTheDocument(); // 다운 워커의 VRAM 막대
    expect(card.getByRole("img", { name: "12 / 368 GB" })).toBeInTheDocument(); // 다운 워커의 RAM 막대
    // MIG 단위 GPU 사용률(DCGM) 조인 + VRAM 분모 71GB
    expect(card.getByRole("img", { name: "83%" })).toBeInTheDocument();
    expect(card.getByText("20 / 71 GB")).toBeInTheDocument();
    // 고정 맵에 있으나 관측에 없는 6슬롯은 수집 누락(이상)
    expect(card.getAllByText("수집 누락(이상)")).toHaveLength(6);
    // 노드 총합(564GB) 표기는 삭제됐다(X9) — 힌트 부재 단언은 위 X9-f2 블록
    expect(screen.queryByText(/564/)).toBeNull();
    // 카드 수위 강조 — 전 슬롯 missing인 02는 회색 dim이지 빨강 down이 아니다 (codex X9-02)
    const card02 = screen.getByText("icspreamh2gpu02").closest(".sqm-wnode") as HTMLElement;
    expect(card02).toHaveClass("sqm-wnode--missing");
    expect(card02).not.toHaveClass("sqm-wnode--down");
  });

  it("Statement ID를 누르면 X6 팝업이 로그 탭으로 열린다 (X9-f3)", async () => {
    installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 1)],
      [q.running]: [v({
        stmt_id: "100501", worker: "sqream101", node: "gpu-server-01",
        service: "sqream", sqream_user: "analyst2", qid: "QID9001", qid_tags: "adhoc",
      }, 1)],
      [q.stmtDuration]: [v({ stmt_id: "100501" }, 42)],
      [q.stmtProgress]: [v({ stmt_id: "100501" }, 0.5)],
      [q.stmtStartTime]: [v({ stmt_id: "100501" }, NOW - 42)],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "100501" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "100501" }));
    const dialog = screen.getByRole("dialog", { name: /Statement 100501/ });
    expect(dialog).toBeInTheDocument();
    // 로그 탭이 기본이다(인간 피드백 순서: 로그·계획·kill) — SQL·플랜 탭도 존재
    expect(screen.getByRole("tab", { name: "로그" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "SQL" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "플랜" })).toBeInTheDocument();
    // 실행 중 + 세대 토큰 있음 — Kill 버튼이 활성이다
    expect(screen.getByRole("button", { name: "Kill" })).toBeEnabled();

    // Kill 실행(X6 규약 재사용) — 접수되면 행의 Statement ID가 낙관적으로 비워진다
    fireEvent.click(screen.getByRole("button", { name: "Kill" }));
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "런어웨이 종료" } });
    fireEvent.click(screen.getByRole("button", { name: "Kill 실행" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "100501" })).toBeNull());
  });

  it("Restart 요청 실패는 토스트로 알린다 — 404=이미 복구 (X9-f3·X11)", async () => {
    // 알람 없는 다운 = Stopped(정지 완료) — 가이드 ③이 바로 열리는 경로다
    const answers = {
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 0)],
    };
    // 명령 API만 404 — 조회는 정상 응답 (자동 복구가 요청을 앞지른 상황)
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).includes("/api/v1/workers/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      const u = new URL(String(url), "http://localhost");
      const expr = u.searchParams.get("query") ?? "";
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: "success",
          data: { resultType: "vector", result: (answers as Record<string, unknown>)[expr] ?? [] },
        }),
      });
    }));
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Recovery" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    const guide = within(screen.getByRole("dialog", { name: "Recovery sqream101" }));
    fireEvent.click(guide.getByRole("button", { name: "Recovery" }));
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "장애 조치" } });
    fireEvent.click(screen.getByRole("button", { name: "Recovery 실행" }));
    await waitFor(() =>
      expect(screen.getByText(/이미 복구됐거나 다운 상태가 아닙니다/)).toBeInTheDocument());
  });

  it("Restart 네트워크 실패는 사유와 함께 토스트로 알린다 (X9-f4·X11)", async () => {
    const answers = {
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 0)],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).includes("/api/v1/workers/")) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      const u = new URL(String(url), "http://localhost");
      const expr = u.searchParams.get("query") ?? "";
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: "success",
          data: { resultType: "vector", result: (answers as Record<string, unknown>)[expr] ?? [] },
        }),
      });
    }));
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Recovery" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    const guide = within(screen.getByRole("dialog", { name: "Recovery sqream101" }));
    fireEvent.click(guide.getByRole("button", { name: "Recovery" }));
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "장애 조치" } });
    fireEvent.click(screen.getByRole("button", { name: "Recovery 실행" }));
    await waitFor(() => expect(screen.getByText(/요청 실패/)).toBeInTheDocument());
  });

  it("Stopped 워커 — 단일 Recovery로 재기동을 접수한다 (X11·X14)", async () => {
    const spy = installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 0)],
      // 알람 없음 = graceful shutdown 완료(Stopped) — 재기동만 남은 상태
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("Stopped")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    const guide = () =>
      within(screen.getByRole("dialog", { name: "Recovery sqream101" }));
    expect(guide().getByText(/정상 종료가 완료됐습니다/)).toBeInTheDocument();
    // stopped 뷰는 절차 스텝이 없다 (X14)
    expect(guide().queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    fireEvent.click(guide().getByRole("button", { name: "Recovery" }));
    // 개정된 경고문(X14-f1) — 절차 강제 문구(X11) 폐기, 구 멘트 부재 유지.
    expect(screen.getByText(/정지된 워커를 재기동합니다/)).toBeInTheDocument();
    expect(screen.queryByText(/409로 거부/)).toBeNull();
    expect(screen.queryByText(/실행 중 statement는 유지/)).toBeNull();
    expect(screen.queryByText(/목업 반영 범위/)).toBeNull();
    // ActionDialog — 사유 없이는 실행이 비활성이다(공용 규약)
    const confirm = screen.getByRole("button", { name: "Recovery 실행" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "장애 조치 티켓 #77" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/workers/sqream101/restart"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/재기동 접수/)).toBeInTheDocument());
  });

  it("No response(hang) + 쓰기 문장 실행 중 — 조치 병렬·shutdown만 문장 게이트 (X14-f1)", async () => {
    const spy = installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "etl_service" }, 0)],
      [q.workerAlerts]: [
        v({ alertname: "WorkerUnresponsive", node: "gpu-server-01", worker: "sqream101" }, 2)],
      // hang 워커의 기존 문장은 계속 돈다 — LOA(적재)는 쓰기 계열이다
      [q.running]: [v({
        stmt_id: "100501", worker: "sqream101", node: "gpu-server-01",
        service: "etl_service", sqream_user: "etl_svc", qid: "LOA-12H", qid_tags: "BULK",
      }, 1)],
      [q.stmtStartTime]: [v({ stmt_id: "100501" }, NOW - 42)],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("No response")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    const guide = () =>
      within(screen.getByRole("dialog", { name: "Recovery sqream101" }));
    // 쓰기(락 보유) 경고 + 조치 2종 병렬(X15) — 재기동 활성, shutdown 옵션 부재
    expect(guide().getByText(/쓰기 계열\(락 보유\): 정지 시 트랜잭션이 롤백/)).toBeInTheDocument();
    expect(guide().queryByText(/먼저 완료하세요/)).toBeNull();
    expect(guide().getByRole("button", { name: "Recovery" })).toBeEnabled();
    expect(guide().queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();

    // STOP_STATEMENT — X6 kill 경로(세대 토큰) 재사용, 접수 후 낙관 반영
    fireEvent.click(guide().getByRole("button", { name: "STOP_STATEMENT" }));
    expect(screen.getByText("SELECT STOP_STATEMENT('100501');")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "배치 중단 승인" } });
    fireEvent.click(screen.getByRole("button", { name: "정지 실행" }));
    await waitFor(() => expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/statements/100501/kill"))).toBe(true));
    // 문장이 사라지면 정지 옵션 자체가 걷힌다 — 사다리 없이 상태가 곧 UI다.
    await waitFor(() =>
      expect(guide().queryByRole("button", { name: "STOP_STATEMENT" })).toBeNull());
    expect(guide().queryByText(/스스로 복귀할 수 있습니다/)).toBeNull();
    expect(guide().getByRole("button", { name: "Recovery" })).toBeEnabled();
  });

  it("crash(Down) — 스텝 없이 단일 Recovery, 재기동 접수까지 (X14)", async () => {
    const spy = installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 0)],
      [q.workerAlerts]: [
        v({ alertname: "WorkerDown", node: "gpu-server-01", worker: "sqream101" }, 2)],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("Down")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    const guide = () =>
      within(screen.getByRole("dialog", { name: "Recovery sqream101" }));
    // 절차 스텝이 없다 — 자동 기동 서사(X15) + 수동 트리거 Recovery
    expect(guide().getByText(/connection_lost로 실패 처리/)).toBeInTheDocument();
    expect(guide().getByText(/자동 기동 스크립트가 재기동합니다/)).toBeInTheDocument();
    expect(guide().queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    expect(guide().queryByText(/실행 중 statement 정지/)).toBeNull();
    fireEvent.click(guide().getByRole("button", { name: "Recovery" }));
    expect(screen.getByText(/다운된 워커를 수동 재기동/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "장애 조치" } });
    fireEvent.click(screen.getByRole("button", { name: "Recovery 실행" }));
    await waitFor(() => expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/workers/sqream101/restart"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/재기동 접수/)).toBeInTheDocument());
  });

  it("같은 워커에 두 알람이 동시 관측되면 WorkerDown이 이긴다 (codex X14-01)", async () => {
    /* 전환·stale 구간의 중복 관측 — instant-vector 순서는 계약이 아니다.
       픽스처는 **Down을 먼저** 준다: "마지막 값 승리" 구현이면 Unresponsive가
       덮어써 실패하는 순서라, 우선순위 규칙만 통과한다(재확인 지적 반영 —
       역순은 last-wins도 통과해 공허했다). */
    installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 0)],
      [q.workerAlerts]: [
        v({ alertname: "WorkerDown", node: "gpu-server-01", worker: "sqream101" }, 2),
        v({ alertname: "WorkerUnresponsive", node: "gpu-server-01", worker: "sqream101" }, 2),
      ],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("Down")).toBeInTheDocument());
    expect(screen.queryByText("No response")).toBeNull();
  });

  it("CLE(cleanup류) 실행 중인 No response 워커 — 전 조치 차단, 완료 대기 (X14-f1에서도 CLE 유지)", async () => {
    installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 0)],
      [q.workerAlerts]: [
        v({ alertname: "WorkerUnresponsive", node: "gpu-server-01", worker: "sqream101" }, 2)],
      [q.running]: [v({
        stmt_id: "100502", worker: "sqream101", node: "gpu-server-01",
        service: "sqream", sqream_user: "dba1", qid: "CLE-00L", qid_tags: "",
      }, 1)],
      [q.stmtProgress]: [v({ stmt_id: "100502" }, 0.4)],
      [q.stmtStartTime]: [v({ stmt_id: "100502" }, NOW - 10)],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Recovery" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    const guide = within(screen.getByRole("dialog", { name: "Recovery sqream101" }));
    // 차단 안내 + 정지 버튼 자체가 없다 — 완료 대기(진행도)만.
    // 가이드 영문 인용은 X12에서 제거(메타 멘트) — 부재를 잠근다.
    expect(guide.getByText(/중단 금지/)).toBeInTheDocument();
    expect(guide.queryByText(/Avoid interrupting/)).toBeNull();
    expect(guide.queryByRole("button", { name: "STOP_STATEMENT" })).toBeNull();
    expect(guide.getByRole("img", { name: "40%" })).toBeInTheDocument();
    // X15 kill 모델에서도 CLE는 전 조치 차단 — shutdown 옵션은 폐기됐다
    expect(guide.queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    expect(guide.getByRole("button", { name: "Recovery" })).toBeDisabled();
  });

  it("카드 제목을 누르면 본문이 접히고 다시 누르면 펼쳐진다 (X9-f4)", async () => {
    installFetch({
      [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101", service: "sqream" }, 1)],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("icspreamh2gpu01")).toBeInTheDocument());

    const toggle = screen.getByRole("button", { name: "icspreamh2gpu01" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("GPU0")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("GPU0")).toBeNull();               // 표가 접혔다
    expect(screen.queryByText(/ACTIVE WORKERS/)).toBeNull();     // 지표부도 접혔다
    expect(screen.getByText(/ACTIVE 1\/8/)).toBeInTheDocument(); // 접힘 요약은 헤더에

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("GPU0")).toBeInTheDocument();
  });

  it("워커 시리즈만 전무하고 노드 지표가 살아 있으면 — 24슬롯 전부 수집 누락(이상)이다 (codex X9-01 의도 잠금)", async () => {
    /* 인간 규칙: "수집 시 워커 없으면 이상 판단". 노드 지표(nodeCpu 등)가 관측되는데
       sqm_worker_up이 비면 워커 텔레메트리 결손이라는 뜻이므로 빈 상태 메시지로
       숨기지 않고 고정 맵을 이상으로 채운다. 빈 상태 메시지는 전 쿼리 무관측
       (exporter 자체 사망) 전용이다 — 아래 "수집이 전혀 없으면" 테스트가 그쪽을 잠근다. */
    installFetch({ [q.nodeCpu]: [v({ node: "gpu-server-01" }, 55)] });
    render(<WorkerMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("icspreamh2gpu01")).toBeInTheDocument());
    expect(screen.queryByText(/Worker 지표를 수집하지 못했습니다/)).toBeNull();
    expect(screen.getAllByText("수집 누락(이상)")).toHaveLength(24);
  });

  it("평면 표(X9-f1) — 병합 GPU 셀 rowSpan=2, 정렬 버튼·클릭 상세가 없다", async () => {
    installFetch({
      [q.workers]: [
        v({ node: "gpu-server-03", worker: "sqream301", service: "sqream" }, 1),
        v({ node: "gpu-server-03", worker: "sqream302", service: "sqream" }, 1),
      ],
      [q.workerCpu]: [v({ worker: "sqream301" }, 90), v({ worker: "sqream302" }, 30)],
      [q.migUtil]: [
        v({ node: "gpu-server-03", gpu: "0", mig: "0" }, 21),
        v({ node: "gpu-server-03", gpu: "0", mig: "1" }, 88),
        // 워커 시리즈가 없는 슬롯의 DCGM 사용률 — 수집 누락 행에 새면 안 된다(X9F1-01)
        v({ node: "gpu-server-03", gpu: "3", mig: "1" }, 44),
      ],
      // 관측되지 않은 워커의 RAM 합 — 수집 누락 행에 새면 안 된다(X9F1-01과 같은 게이트)
      [q.workerRam]: [v({ worker: "sqream332" }, 50e9)],
    });
    const { container } = render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-03" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("icspreamh2gpu03")).toBeInTheDocument());

    // GPU 셀은 MIG 2행을 세로로 감싼다 — 4개 병합 셀, 각 rowSpan=2
    const merged = container.querySelectorAll("td.sqm-wgpu");
    expect(merged).toHaveLength(4);
    for (const td of merged) expect(td).toHaveAttribute("rowspan", "2");
    // 정렬·아코디언 제거(X9-f1) — 표 안에 버튼이 없고, 행 순서는 고정 맵 순서다
    expect(container.querySelector(".sqm-table button")).toBeNull();
    const rows = () => [...container.querySelectorAll(".sqm-table tbody tr")];
    const workers = rows().map((tr) => tr.textContent).join("|");
    expect(workers.indexOf("sqream301")).toBeLessThan(workers.indexOf("sqream302"));
    // 수집 누락 행(sqream332)은 DCGM 사용률·RAM 합이 있어도 수치 전부 -- (X9F1-01)
    expect(screen.queryByText("44%")).toBeNull();
    expect(screen.queryByText("50 / 368 GB")).toBeNull();
    // 행을 클릭해도 상세가 열리지 않는다 — 평면 표 (X9F1-02)
    expect(rows()).toHaveLength(8);
    fireEvent.click(screen.getByText("sqream301").closest("tr") as HTMLElement);
    expect(rows()).toHaveLength(8);
    expect(container.querySelector(".sqm-wrow-detail")).toBeNull();
    // 표 범위로 한정 — 카드 제목 토글(X9-f4)은 표 밖의 정당한 aria-expanded다
    expect(container.querySelector(".sqm-table [aria-expanded]")).toBeNull();
  });

  it("server가 지정되면 그 노드만 남는다", async () => {
    installFetch({
      [q.workers]: [
        v({ node: "gpu-server-01", worker: "sqream101" }, 1),
        v({ node: "gpu-server-02", worker: "sqream201" }, 1),
      ],
    });
    render(<WorkerMonitoring refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-02" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("icspreamh2gpu02")).toBeInTheDocument());
    expect(screen.queryByText("icspreamh2gpu01")).toBeNull();
  });

  it("수집이 전혀 없으면 그렇게 말한다 / 실패는 실패로 말한다", async () => {
    installFetch({});
    const { unmount } = render(<WorkerMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Worker 지표를 수집하지 못했습니다/)).toBeInTheDocument());
    unmount();

    failAll();
    render(<WorkerMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/조회 실패/));
  });
});

/* ══════════════ Query Analytics ══════════════ */
describe("Query Analytics", () => {
  const q = queryAnalytics();

  it("GPU 내림차순 정렬, Long Query·Heavy·락 표시를 한다", async () => {
    installFetch({
      [q.running]: scalar(2), [q.avgDuration]: scalar(45.5),
      [q.heavyCount]: scalar(1), [q.scanned]: scalar(80 * GiB), [q.slow5m]: scalar(3),
      [q.statements]: [
        v({ stmt_id: "1", sqream_user: "u1", node: "gpu-server-01", worker: "sqream101" }, 1),
        v({ stmt_id: "2", sqream_user: "u2", node: "gpu-server-02", worker: "sqream201" }, 1),
      ],
      [q.duration]: [v({ stmt_id: "1" }, 120), v({ stmt_id: "2" }, 10)],
      [q.cpu]: [v({ stmt_id: "1" }, 30)],
      [q.gpu]: [v({ stmt_id: "1" }, 85), v({ stmt_id: "2" }, 20)],
      [q.memory]: [v({ stmt_id: "1" }, 8 * GiB)],
      [q.scannedBytes]: [v({ stmt_id: "1" }, 12 * GiB)],
      [q.locks]: [v({ lock_id: "LOCK-1", stmt_id: "1" }, 41)],
    });
    render(<QueryAnalytics refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    const idCells = () => [...document.querySelectorAll("td > b")].map((e) => e.textContent);
    await waitFor(() => expect(idCells()).toContain("1"));
    expect(kpiOf("AVG DURATION").getByText("45.5s")).toBeInTheDocument();
    expect(kpiOf("HEAVY QUERIES (GPU > 80%)").getByText("1")).toBeInTheDocument();
    // gpu 85 > 20 이므로 1이 먼저 (X17: 무접두 Statement ID)
    expect(idCells()[0]).toBe("1");
    expect(screen.getAllByText("Long Query").length).toBeGreaterThan(0); // 120s
    // 락 표시는 Running·Slow 두 표 모두에 있다 (codex CDX-S3C-05)
    expect(screen.getAllByText(/🔒/).length).toBe(2);
    // Slow Queries 표 — 60초 초과 1건
    expect(screen.getByText(/1 running > 60s/)).toBeInTheDocument();
    // 지속시간 임계: 120s < 180s → 노랑
    const slowDur = screen.getAllByText("00:02:00").find((e) => e.classList.contains("sqm-pill"));
    expect(slowDur).toHaveClass("sqm-pill--yellow");
  });

  it("EXPLAIN은 목업 실행계획 모달을 연다 (토스트가 아니다 — CDX-S3C-05)", async () => {
    installFetch({
      [q.statements]: [v({ stmt_id: "7", sqream_user: "u", node: "gpu-server-01", worker: "sqream101" }, 1)],
      [q.scannedBytes]: [v({ stmt_id: "7" }, 640 * 1024 * 1024)],
    });
    render(<QueryAnalytics refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(
      [...document.querySelectorAll("td > b")].map((e) => e.textContent)).toContain("7"));
    act(() => { fireEvent.click(screen.getByRole("button", { name: "EXPLAIN" })); });

    const dialog = within(screen.getByRole("dialog"));
    // 계획 본문이 실제로 있어야 한다 — 토스트 한 줄로는 안 된다
    expect(dialog.getByText(/PushToNetworkQueue/)).toBeInTheDocument();
    expect(dialog.getByText(/worker: sqream101/)).toBeInTheDocument();
    expect(dialog.getByText(/chunks_scanned=10/)).toBeInTheDocument(); // 640MiB / 64MiB
    // 목업 고지·제목 괄호는 X12에서 제거 — 부재를 잠근다
    expect(dialog.queryByText(/목업/)).toBeNull();

    act(() => { fireEvent.click(dialog.getByRole("button", { name: "닫기" })); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("실행 중인 쿼리가 없으면 정상 무데이터로 표시한다", async () => {
    installFetch({});
    render(<QueryAnalytics refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("실행 중인 쿼리 없음")).toBeInTheDocument());
    expect(screen.getByText("60초를 넘긴 쿼리 없음")).toBeInTheDocument();
  });

  it("조회 실패는 KPI를 '--'로 두고 표에 실패를 적는다", async () => {
    /* 다른 화면들과 같은 규약이다 — "데이터 없음(정상)"과 실패를 구분해 말한다. */
    failAll();
    render(<QueryAnalytics refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(kpiOf("AVG DURATION").getByText("--")).toBeInTheDocument());
    expect(screen.getAllByText(/조회 실패/).length).toBeGreaterThan(0);
  });
});

/* ══════════════ Session Monitoring ══════════════ */
describe("Session Monitoring", () => {
  const q = sessionMonitoring();
  const base = {
    [q.active]: scalar(2), [q.running]: scalar(1), [q.avgCpu]: scalar(33), [q.avgGpu]: scalar(55),
    [q.sessions]: [
      v({ session_id: "SES1101", sqream_user: "dba1", node: "gpu-server-01", worker: "sqream101" }, 1),
      v({ session_id: "SES1102", sqream_user: "analyst2", node: "gpu-server-02" }, 1),
    ],
    [q.started]: [v({ session_id: "SES1101" }, NOW - 3661)],
    [q.queries]: [v({ session_id: "SES1101" }, 2)],
  };

  it("세션 표를 채우고, worker 라벨이 없으면 지어내지 않는다", async () => {
    installFetch(base);
    render(<SessionMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("SES1101")).toBeInTheDocument());
    expect(screen.getByText("sqream101")).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("--")).toBeInTheDocument();   // SES1102는 worker 라벨 없음
    expect(table.getByText(/^01:01:0[0-9]$/)).toBeInTheDocument();
    // 상태 배지 — "Running"은 KPI 라벨·필터 옵션에도 있어 표 안에서만 찾는다
    expect(table.getAllByText("Running").length).toBe(1);
  });

  it("사용자·상태 필터가 걸린다", async () => {
    installFetch(base);
    render(<SessionMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument());
    act(() => { fireEvent.change(screen.getByLabelText("상태"), { target: { value: "Running" } }); });
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "CLEAR FILTERS" })); });
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it("Terminate는 사유 없이는 확정할 수 없고, 확정하면 접수를 알린다 (X12 — 메타 멘트 없음)", async () => {
    installFetch(base);
    render(<SessionMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("SES1101")).toBeInTheDocument());

    act(() => { fireEvent.click(screen.getAllByRole("button", { name: "Terminate" })[0]); });
    const dialog = within(screen.getByRole("dialog"));
    const confirm = dialog.getByRole("button", { name: "Terminate" });
    expect(confirm).toBeDisabled();                      // 사유 필수

    act(() => { fireEvent.change(dialog.getByLabelText("Kill 사유"), { target: { value: "티켓 #1234" } }); });
    expect(confirm).toBeEnabled();
    act(() => { fireEvent.click(confirm); });
    expect(screen.queryByRole("dialog")).toBeNull();
    // X12 — 토스트는 접수·사유만. 목업 멘트·감사 서사(session_kill_audit)는 부재.
    expect(screen.getByRole("status")).toHaveTextContent(/종료 요청이 기록되었습니다/);
    expect(screen.getByRole("status")).toHaveTextContent(/티켓 #1234/);
    expect(screen.getByRole("status")).not.toHaveTextContent(/목업|session_kill_audit|ADR/);
  });
});

/* ══════════════ Snapshot & Lock ══════════════ */
describe("Snapshot & Lock", () => {
  const q = snapshotLock();

  it("스냅샷·락 표와 spool 막대를 채우고 임계 색을 적용한다", async () => {
    installFetch({
      [q.openCount]: scalar(1), [q.maxAge]: scalar(300), [q.maxLock]: scalar(200),
      [q.spoolTotal]: scalar(3 * GiB),
      [q.snapshots]: [v({ node: "gpu-server-02", snapshot_id: "SNAP-2048" }, 300)],
      [q.locks]: [v({ lock_id: "LOCK-2048", stmt_id: "100137" }, 200)],
      [q.statements]: [
        v({ stmt_id: "100137", sqream_user: "dba1", node: "gpu-server-01", worker: "sqream101" }, 1),
      ],
      [q.spool]: [v({ worker: "sqream101", stmt_id: "100137" }, 3 * GiB)],
    });
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("#SNAP-2048")).toBeInTheDocument());
    expect(screen.getByText("LOCK-2048")).toBeInTheDocument();
    expect(screen.getByText("100137")).toBeInTheDocument();
    expect(screen.getByText("dba1")).toBeInTheDocument();      // stmt_id 조인으로 채운다
    expect(screen.getByText("1 open")).toBeInTheDocument();
    expect(screen.getByText("1 held")).toBeInTheDocument();
    // 300s ≥ 240 → red, 200s ≥ 180 → red (KPI에도 같은 문자열이 있어 pill만 고른다)
    const pill = (text: string) =>
      screen.getAllByText(text).find((el) => el.classList.contains("sqm-pill"));
    expect(pill("00:05:00")).toHaveClass("sqm-pill--red");
    expect(pill("00:03:20")).toHaveClass("sqm-pill--red");
  });

  it("데이터가 없으면 정상 무데이터, 실패는 실패로 구분한다", async () => {
    installFetch({});
    const { unmount } = render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("열린 스냅샷 없음")).toBeInTheDocument());
    expect(screen.getByText("보유 중인 락 없음")).toBeInTheDocument();
    expect(screen.getByText("Disk spooling 없음")).toBeInTheDocument();
    unmount();

    failAll();
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/조회 실패/).length).toBeGreaterThan(0));
    expect(screen.queryByText("열린 스냅샷 없음")).toBeNull();
  });

  it("orphaned lock — 배지·실패 이력 폴백·Remove 접수와 낙관 제거 (X11)", async () => {
    const spy = installFetch({
      [q.locks]: [
        // 실행 중 문장과 조인되는 정상 락 — orphan 아님, Remove 없음
        v({ lock_id: "LOCK-100137", stmt_id: "100137" }, 41),
        // 조인 실패 = orphan(죽은 워커가 남김) — 신원은 실패 이력에서 폴백
        v({ lock_id: "LOCK-100200", stmt_id: "100200" }, 300),
      ],
      [q.statements]: [
        v({ stmt_id: "100137", sqream_user: "dba1", node: "gpu-server-01", worker: "sqream101" }, 1),
      ],
      [q.failed]: [
        v({ stmt_id: "100200", sqream_user: "etl_svc", node: "gpu-server-02",
          worker: "sqream201", reason: "connection_lost" }, NOW - 60),
      ],
    });
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("LOCK-100200")).toBeInTheDocument());

    // orphan 배지는 조인 실패 락에만
    const rowOf = (lockId: string) =>
      within(screen.getByText(lockId).closest("tr") as HTMLElement);
    expect(rowOf("LOCK-100200").getByText("orphan")).toBeInTheDocument();
    expect(rowOf("LOCK-100137").queryByText("orphan")).toBeNull();
    // 신원은 실패 이력 폴백 — running에 없어도 워커·사용자가 나온다
    expect(rowOf("LOCK-100200").getByText("sqream201")).toBeInTheDocument();
    expect(rowOf("LOCK-100200").getByText("etl_svc")).toBeInTheDocument();
    // Remove는 orphan에만 — 실행 중 락 제거는 위험(exporter 409와 일치)
    expect(rowOf("LOCK-100200").getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(rowOf("LOCK-100137").queryByRole("button", { name: "Remove" })).toBeNull();

    fireEvent.click(rowOf("LOCK-100200").getByRole("button", { name: "Remove" }));
    // 명령 미리보기 — REMOVE_LOCK 문구는 경고문에도 있으므로 pre로 좁힌다
    expect(screen.getByText(/SELECT REMOVE_LOCK\(.*'100200'\);/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "잔존 락 정리" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove 실행" }));
    // 접수 → POST + 낙관 제거(다음 tick 반영 전이라 폴링을 기다리지 않는다).
    // 토스트에도 lock_id가 남으므로 표(카드) 범위로 좁혀 부재를 본다.
    await waitFor(() => expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/locks/LOCK-100200/remove"))).toBe(true));
    const lockCard = () => within(
      screen.getByText("Active Locks").closest(".sqm-card") as HTMLElement);
    await waitFor(() => expect(lockCard().queryByText("LOCK-100200")).toBeNull());
    expect(screen.getByText(/제거 접수/)).toBeInTheDocument();
  });

  it("Remove 409/404 — 서버 거부는 사유와 함께 유지, 이미 제거는 그렇게 알린다 (X11)", async () => {
    const answers = {
      [q.locks]: [v({ lock_id: "LOCK-100200", stmt_id: "100200" }, 300)],
    };
    const stubWith = (status: number, error?: string) => vi.stubGlobal("fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/api/v1/locks/")) {
          return Promise.resolve({
            ok: false, status,
            json: () => Promise.resolve({ ok: false, error }),
          });
        }
        const u = new URL(String(url), "http://localhost");
        const expr = u.searchParams.get("query") ?? "";
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: "success",
            data: { resultType: "vector", result: (answers as Record<string, unknown>)[expr] ?? [] },
          }),
        });
      }));
    const removeFlow = async () => {
      await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "정리" } });
      fireEvent.click(screen.getByRole("button", { name: "Remove 실행" }));
    };

    // 409 — exporter fail-closed(살아 있는 락 등): 서버 사유를 그대로 보이고 행 유지
    stubWith(409, "lock is held by a running statement - stop it first");
    const first = render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await removeFlow();
    await waitFor(() =>
      expect(screen.getByText(/거부됨 — lock is held by a running statement/)).toBeInTheDocument());
    const lockCard = () => within(
      screen.getByText("Active Locks").closest(".sqm-card") as HTMLElement);
    expect(lockCard().getByText("LOCK-100200")).toBeInTheDocument(); // 낙관 제거 안 함
    first.unmount();

    // 404 — 이미 제거됐거나 미존재
    stubWith(404);
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await removeFlow();
    await waitFor(() =>
      expect(screen.getByText(/이미 제거됐거나 알 수 없는 락/)).toBeInTheDocument());
  });

  it("고정 시점에서는 orphan Remove가 숨는다 — 과거 스냅숏으로 현재를 지우지 않는다 (X11)", async () => {
    installFetch({
      [q.locks]: [v({ lock_id: "LOCK-100200", stmt_id: "100200" }, 300)],
    });
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={1_787_000_000_000} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("LOCK-100200")).toBeInTheDocument());
    expect(screen.getByText("orphan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("Remove 취소는 다이얼로그만 닫고, CLEANUP EXTENTS는 스냅샷 경고와 함께 기록된다", async () => {
    installFetch({
      [q.snapshots]: [v({ node: "gpu-server-02", snapshot_id: "SNAP-1" }, 100)],
      [q.locks]: [v({ lock_id: "LOCK-100200", stmt_id: "100200" }, 300)],
    });
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("LOCK-100200")).toBeInTheDocument());

    // Remove 취소 — 락은 그대로, 다이얼로그만 닫힌다
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("button", { name: "Remove 실행" })).toBeNull();
    expect(screen.getByText("LOCK-100200")).toBeInTheDocument();

    // 정렬 헤더 순회 — 두 표의 정렬 접근자가 실제로 동작한다(회귀 방지 겸 커버)
    const lockCard = within(
      screen.getByText("Active Locks").closest(".sqm-card") as HTMLElement);
    for (const name of ["Lock ID", "Statement ID", "User", "Node", "Worker", "Held"]) {
      fireEvent.click(lockCard.getByRole("button", { name: new RegExp(`^${name}`) }));
    }
    const snapCard = within(
      screen.getByText("Open Snapshots").closest(".sqm-card") as HTMLElement);
    for (const name of ["Node", "Snapshot ID", "Age"]) {
      fireEvent.click(snapCard.getByRole("button", { name: new RegExp(`^${name}`) }));
    }
    expect(screen.getByText("LOCK-100200")).toBeInTheDocument();

    // CLEANUP EXTENTS(기록 전용 — X11 이후에도 상태 변경 아님): 열린 스냅샷 경고 동반
    fireEvent.click(screen.getByRole("button", { name: "CLEANUP EXTENTS" }));
    expect(screen.getByText(/열린 스냅샷/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(
      screen.getByText(/클립보드에 복사했습니다|복사에 실패했습니다/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "정리" } });
    fireEvent.click(screen.getByRole("button", { name: "Cleanup Extents 요청" }));
    await waitFor(() =>
      expect(screen.getByText(/요청이 기록되었습니다/)).toBeInTheDocument());
    expect(screen.getByText(/열린 스냅샷 1건이 함께 기록됩니다/)).toBeInTheDocument();
  });
});

/* ══════════════ Table Usage ══════════════ */
describe("Table Usage — 판정 규칙", () => {
  it("Cleanup Chunk 대상 = delete/update 레코드 존재 (X10 인간 기준 — 구 1.5%/50% 대체)", () => {
    const t = (over: Record<string, number>) =>
      ({ db: "d", schema: "s", table: "t", rows: 1000, ...over });
    expect(isCleanupTarget(t({ deleted: 1 }))).toBe(true);
    expect(isCleanupTarget(t({ deleted: 0 }))).toBe(false);
    expect(isCleanupTarget(t({}))).toBe(false);              // 결측은 판정 불가
    // 단편화는 이제 Cleanup 판정과 무관하다 — Rechunk 4임계가 따로 있다
    expect(isCleanupTarget(t({ deleted: 0, frag: 0.9 }))).toBe(false);
  });

  it("Rechunk 4임계 — 각 임계의 경계값에서 판정이 갈린다 (X10 인간 확정)", () => {
    // 기준 픽스처: 4임계 전부 충족 (chunks 100, avg 500k, filled90 40%, nodel 2, under80 11)
    const base = {
      db: "d", schema: "s", table: "t",
      rows: 50_000_000, chunks: 100, filled90: 40, under80: 11, nodel: 2,
    };
    expect(isRechunkTarget(base)).toBe(true);
    // ① 평균 청크 행 < 900,000 — 90,000,000/100 = 900,000은 미충족(미만이어야)
    expect(isRechunkTarget({ ...base, rows: 90_000_000 })).toBe(false);
    expect(isRechunkTarget({ ...base, rows: 89_999_999 })).toBe(true);
    // ② 단편화율 90%↑ 청크 비율 < 60% — 60개(=60%)는 미충족
    expect(isRechunkTarget({ ...base, filled90: 60 })).toBe(false);
    expect(isRechunkTarget({ ...base, filled90: 59 })).toBe(true);
    // ③ NoDel_Cnt ≥ 2 — 1은 미충족
    expect(isRechunkTarget({ ...base, nodel: 1 })).toBe(false);
    // ④ 단편화율 80%↓ 청크 > 10 — 정확히 10은 미충족
    expect(isRechunkTarget({ ...base, under80: 10 })).toBe(false);
    // 통계 결측이면 판정 불가(undefined) — 대상 아님
    expect(rechunkChecks({ ...base, nodel: undefined })).toBeUndefined();
    expect(isRechunkTarget({ ...base, nodel: undefined })).toBe(false);
    // 툴팁 상세 — 4줄, 통과 여부와 값이 실린다
    const checks = rechunkChecks(base);
    expect(checks).toHaveLength(4);
    expect(checks?.[0].text).toContain("500,000");
    expect(checks?.every((c) => c.pass)).toBe(true);
  });

  it("상태 모달 결론 분기 — Rechunk 대상·Cleanup만·건강·통계 결측 (X10-f2)", () => {
    const base = {
      db: "d", schema: "s", table: "t",
      rows: 50_000_000, chunks: 100, filled90: 40, under80: 11, nodel: 2,
      deleted: 5, frag: 0.3,
    };
    // 4임계 충족 + deleted>0 → Rechunk 대상(Extent 동반·reindex 서술)
    const { rerender, unmount } = render(<TableStatusModal row={base} onClose={() => {}} />);
    expect(screen.getByText(/Rechunk 대상/)).toBeInTheDocument();
    expect(screen.getByText(/Cleanup\s*Extent가 동반/)).toBeInTheDocument();
    // ① 미충족(평균 950k)·③ 통과 → Cleanup만
    rerender(<TableStatusModal row={{ ...base, rows: 95_000_000 }} onClose={() => {}} />);
    expect(screen.getByText(/Cleanup Chunk 대상/)).toBeInTheDocument();
    // ①과 ③이 함께 실패 — Cleanup을 해도 Rechunk 대상이 안 되므로 "선행 필요"
    // 약속을 하면 안 된다(codex X10F2-01)
    rerender(<TableStatusModal
      row={{ ...base, rows: 95_000_000, nodel: 1 }} onClose={() => {}} />);
    expect(screen.queryByText(/Cleanup 선행 필요/)).toBeNull();
    expect(screen.getByText(/Cleanup Chunk 대상/)).toBeInTheDocument();
    // deleted=0(전 청크 무삭제) + 임계 미충족 → 조치 없음
    rerender(<TableStatusModal
      row={{ ...base, rows: 95_000_000, deleted: 0, nodel: 100 }} onClose={() => {}} />);
    expect(screen.getByText(/조치 없음/)).toBeInTheDocument();
    // 통계 결측 — "건강"으로 결론내면 안 된다(codex X10F2-03): 판정 불가 결론
    rerender(<TableStatusModal row={{ db: "d", schema: "s", table: "t" }} onClose={() => {}} />);
    expect(screen.getAllByText(/판정 불가/).length).toBeGreaterThanOrEqual(2); // 섹션+결론
    expect(screen.getByText(/관측 없음/)).toBeInTheDocument();
    expect(screen.queryByText(/조치 없음/)).toBeNull();
    expect(screen.queryByText(/건강한 상태/)).toBeNull();
    // deleted만 관측(>0)·청크 통계 결측 — Cleanup 대상이되 Rechunk는 결측 명시
    rerender(<TableStatusModal
      row={{ db: "d", schema: "s", table: "t", deleted: 5 }} onClose={() => {}} />);
    expect(screen.getByText(/Cleanup Chunk 대상/)).toBeInTheDocument();
    expect(screen.getByText(/청크 통계 결측으로 불가/)).toBeInTheDocument();
    // 청크 통계 4/4인데 deleted 결측 — "Rechunk 대상"으로 새면 안 된다(회차 2)
    rerender(<TableStatusModal
      row={{ ...base, deleted: undefined }} onClose={() => {}} />);
    expect(screen.queryByText(/Rechunk 대상/)).toBeNull();
    expect(screen.getByText(/삭제 레코드 관측이 없어/)).toBeInTheDocument();
    // deleted=0 관측·청크 통계 결측 — 건강 단정 대신 Rechunk 유보
    rerender(<TableStatusModal
      row={{ db: "d", schema: "s", table: "t", deleted: 0 }} onClose={() => {}} />);
    expect(screen.queryByText(/건강한 상태/)).toBeNull();
    expect(screen.getByText(/Rechunk 대상 여부를 결론낼 수/)).toBeInTheDocument();
    unmount();
  });

  it("평균 청크 행 수 = rows/chunks — 상한 1,048,576과 함께 읽는다", () => {
    expect(avgChunkRows({ db: "d", schema: "s", table: "t", rows: 1000, chunks: 4 })).toBe(250);
    expect(avgChunkRows({ db: "d", schema: "s", table: "t", rows: 1000 })).toBeUndefined();
    expect(avgChunkRows({ db: "d", schema: "s", table: "t", rows: 1000, chunks: 0 })).toBeUndefined();
    expect(CHUNK_ROW_CAP).toBe(1_048_576);
  });

  it("단편화·삭제 비율 색 구간", () => {
    expect(fragTone(undefined)).toBe("grey");
    expect(fragTone(0.2)).toBe("green");
    expect(fragTone(0.35)).toBe("yellow");
    expect(fragTone(0.6)).toBe("red");
    const t = (deleted?: number) => ({ db: "d", schema: "s", table: "t", rows: 1000, deleted });
    expect(deletedTone(t(undefined))).toBe("grey");
    expect(deletedTone(t(5))).toBe("green");
    expect(deletedTone(t(20))).toBe("yellow");
    expect(deletedTone(t(40))).toBe("red");
  });

  /* 정렬 규칙은 `useTableSort`로 옮겼다 — 그쪽 테스트가 이어받는다. */
});

describe("Table Usage 화면", () => {
  const q = tableUsage();
  const two = {
    [q.tableCount]: scalar(2), [q.totalRows]: scalar(150_000_000_000),
    [q.totalSize]: scalar(130 * TiB), [q.totalCompressed]: scalar(20 * TiB),
    [q.rows]: [
      v({ db: "sales_db", schema: "public", table: "sales_data" }, 84_200_000_000),
      v({ db: "crm_db", schema: "public", table: "customer_orders" }, 65_500_000_000),
    ],
    [q.chunks]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, 8000)],
    [q.size]: [
      v({ db: "sales_db", schema: "public", table: "sales_data" }, 80 * TiB),
      v({ db: "crm_db", schema: "public", table: "customer_orders" }, 50 * TiB),
    ],
    [q.compressed]: [
      v({ db: "sales_db", schema: "public", table: "sales_data", compression: "LZ4" }, 10 * TiB),
      v({ db: "sales_db", schema: "public", table: "sales_data", compression: "Zstd" }, 2 * TiB),
    ],
    [q.fragmentation]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, 0.6)],
    [q.deleted]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, 30_000_000)],
  };

  it("KPI와 표를 채우고 compression 라벨을 합산·수집한다", async () => {
    installFetch(two);
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sales_data")).toBeInTheDocument());
    expect(kpiOf("TOTAL TABLES").getByText("2")).toBeInTheDocument();
    // compression 두 개가 합산되고 알고리즘이 모인다 (CDX-0.6-01)
    expect(screen.getByText("LZ4, Zstd")).toBeInTheDocument();
    expect(screen.getByText(/12\.0 TB/)).toBeInTheDocument(); // 10 + 2
  });

  it("CLEANUP 대상만 토글이 목록을 좁힌다", async () => {
    installFetch(two);
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/of 2 tables/)).toBeInTheDocument());
    act(() => { fireEvent.click(screen.getByRole("button", { name: "CLEANUP 대상만" })); });
    // sales_data만 대상 (deleted 30M > 0 — X10 기준. customer_orders는 deleted 결측)
    expect(screen.getByText(/of 1 tables/)).toBeInTheDocument();
    expect(screen.queryByText("customer_orders")).toBeNull();
  });

  it("유지보수 배치 판정 — 안내 카드·배지·행 틴트·평균 청크 행 (X10)", async () => {
    const lbl = (table: string) => ({ db: "d", schema: "s", table });
    installFetch({
      [q.rows]: [v(lbl("frag_t"), 50_000_000), v(lbl("healthy"), 41_943_040),
        v(lbl("del_only"), 10_000_000)],
      [q.chunks]: [v(lbl("frag_t"), 100), v(lbl("healthy"), 40), v(lbl("del_only"), 10)],
      [q.filled90]: [v(lbl("frag_t"), 40), v(lbl("healthy"), 39), v(lbl("del_only"), 9)],
      [q.under80]: [v(lbl("frag_t"), 30), v(lbl("healthy"), 1), v(lbl("del_only"), 0)],
      [q.noDeletion]: [v(lbl("frag_t"), 25), v(lbl("healthy"), 40), v(lbl("del_only"), 5)],
      [q.clusteringKey]: [v(lbl("frag_t"), 1), v(lbl("healthy"), 0), v(lbl("del_only"), 0)],
      [q.deleted]: [v(lbl("frag_t"), 500), v(lbl("healthy"), 0), v(lbl("del_only"), 100)],
    });
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("frag_t")).toBeInTheDocument());

    // 안내 카드는 X10-f1로 삭제됐다 — 기준 설명은 이름 클릭 모달이 담는다(X10-f2)
    expect(screen.queryByText(/유지보수 배치 기준/)).toBeNull();
    const rowOf = (t: string) => screen.getByText(t).closest("tr") as HTMLElement;
    // frag_t: avg 500k·filled90 40%·nodel 25·under80 30 → Rechunk 4/4 + Cleanup —
    // 행 틴트는 빨강 우선(인간 지시). 배지는 3상태 문구(X10-f3): "예정"이 다음
    // 새벽 1시 배치 대상임을 말한다. Idx 배지·n/4 표기는 폐기됐다.
    expect(rowOf("frag_t")).toHaveClass("sqm-trow--rechunk");
    expect(rowOf("frag_t")).not.toHaveClass("sqm-trow--cleanup");
    const maintCell = rowOf("frag_t").querySelector(".sqm-maintcell") as HTMLElement;
    expect(maintCell.textContent?.trim().replace(/\s+/g, " ")).toBe("Cleanup 예정Rechunk 예정"); // E3: 배지가 버튼이 되며 텍스트 공백 제거(간격은 CSS)
    expect(screen.queryByText("Idx")).toBeNull();
    // del_only: Rechunk 미충족(①②④)인데 deleted>0 → Cleanup 노랑 틴트, n/4 표기 없음
    expect(rowOf("del_only")).toHaveClass("sqm-trow--cleanup");
    expect(screen.queryByText("1/4")).toBeNull();
    expect(within(rowOf("del_only")).getByText("Cleanup 예정")).toBeInTheDocument();
    // healthy: deleted=0 — 무틴트, 평균이 정확히 상한(1,048,576 = 100%)
    expect(rowOf("healthy").className).toBe("");
    expect(within(rowOf("healthy")).getByText("1,048,576")).toBeInTheDocument();
    expect(within(rowOf("healthy")).getByText("(100%)")).toBeInTheDocument();
    expect(within(rowOf("frag_t")).getByText("500,000")).toBeInTheDocument();
    expect(within(rowOf("frag_t")).getByText("(48%)")).toBeInTheDocument();
    // 일괄 버튼 건수 = 배치 판정 대상 (필터 목록이 아니다)
    expect(screen.getByRole("button", { name: "RECHUNK (1)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "CLEANUP CHUNKS (2)" })).toBeEnabled();
    // 구 "Cleanup" 헤더는 "Deleted Rows"로 정정됐다(의미 어긋남 해소)
    expect(screen.getByText("Deleted Rows")).toBeInTheDocument();
  });

  it("실행 중 테이블 — 진행 중 배지·Progress 바·진행단계·파랑 틴트·버튼 잠금 (X10-f3)", async () => {
    const lbl = { db: "d", schema: "s", table: "busy" };
    installFetch({
      [q.rows]: [v(lbl, 10_000_000)],
      [q.deleted]: [v(lbl, 100)],
      // 실행 중에만 존재하는 진행도 시리즈 — stage 라벨이 현재 단계다(계약 v4.9)
      [q.maintProgress]: [v({ ...lbl, stage: "cleanup_extent" }, 0.7)],
    });
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("busy")).toBeInTheDocument());

    const row = screen.getByText("busy").closest("tr") as HTMLElement;
    // 3상태: 실행 중이면 "예정" 배지 대신 파랑 "진행 중" + 파랑 틴트
    expect(row).toHaveClass("sqm-trow--running");
    expect(within(row).getByText("진행 중")).toBeInTheDocument();
    expect(within(row).queryByText(/예정/)).toBeNull();
    // Progress 바(전체 진행도)와 진행단계 표시명
    expect(within(row).getByRole("img", { name: "70%" })).toBeInTheDocument();
    expect(within(row).getByText("Cleanup Extent")).toBeInTheDocument();
    // 행 버튼 잠금 — exporter의 "테이블당 하나" 규약 선반영
    expect(within(row).getByRole("button", { name: "RECHUNK" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "CLEANUP" })).toBeDisabled();
    // 일괄 대상 집계에서도 제외 — cleanup 대상이지만 실행 중이라 0건
    expect(screen.getByRole("button", { name: "CLEANUP CHUNKS (0)" })).toBeDisabled();
    // 모달에도 진행 줄이 뜬다
    fireEvent.click(screen.getByRole("button", { name: "busy" }));
    expect(screen.getByText(/유지보수 진행 중/)).toBeInTheDocument();
  });

  it("열린 상태 모달이 폴링 갱신을 따라간다 — 완료 시 진행 줄 소멸 (codex X10F3-01)", async () => {
    const lbl = { db: "d", schema: "s", table: "busy" };
    const answers: Record<string, unknown> = {
      [q.rows]: [v(lbl, 10_000_000)],
      [q.deleted]: [v(lbl, 100)],
      [q.maintProgress]: [v({ ...lbl, stage: "cleanup_chunk" }, 0.4)],
    };
    installFetch(answers as Record<string, unknown[]>);
    render(<TableUsage refreshMs={50} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("busy")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "busy" }));
    const runLine = screen.getByText(/유지보수 진행 중/).closest("div") as HTMLElement;
    expect(runLine.textContent).toContain("Cleanup Chunk");
    expect(runLine.textContent).toContain("(40%)");
    // 실행 종료 — 시리즈 제거(계약 v4.9). 모달이 낡은 스냅숏이면 "진행 중"이 남는다
    answers[q.maintProgress] = [];
    answers[q.deleted] = [v(lbl, 0)];
    await waitFor(() => expect(screen.queryByText(/유지보수 진행 중/)).toBeNull());
  });

  it("Rechunk 임계 표기는 단편화율 어휘다 (X10-f3 — 인간 확정, 수치 유지)", () => {
    const checks = rechunkChecks({
      db: "d", schema: "s", table: "t",
      rows: 50_000_000, chunks: 100, filled90: 40, under80: 11, nodel: 2,
    });
    expect(checks?.[1].text).toBe("② 단편화율 90%↑ 청크 40% < 60%");
    expect(checks?.[3].text).toBe("④ 단편화율 80%↓ 청크 11 > 10");
    expect(checks?.some((c) => c.text.includes("충전율"))).toBe(false);
  });

  it("테이블 이름을 누르면 유지보수 상태 설명 모달이 열린다 (X10-f2)", async () => {
    const lbl = { db: "d", schema: "s", table: "audit_like" };
    installFetch({
      // audit_trail형: ①②④ 충족·③(NoDel=1) 미충족 + deleted>0 → "Cleanup 선행 필요"
      [q.rows]: [v(lbl, 9_800_000)],
      [q.chunks]: [v(lbl, 30)],
      [q.filled90]: [v(lbl, 2)],
      [q.under80]: [v(lbl, 26)],
      [q.noDeletion]: [v(lbl, 1)],
      [q.deleted]: [v(lbl, 500)],
    });
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("audit_like")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "audit_like" }));
    const dlg = screen.getByRole("dialog", { name: /audit_like 유지보수 상태/ });
    // 4임계가 값과 함께 나열되고, 미충족 임계가 식별된다
    expect(within(dlg).getByText(/③ NoDel_Cnt 1 ≥ 2/)).toBeInTheDocument();
    expect(within(dlg).getByText(/① 평균 청크 행 326,667 < 900,000/)).toBeInTheDocument();
    // 결론 — Cleanup 선행 관계를 문장으로 설명한다
    expect(within(dlg).getByText(/Cleanup 선행 필요/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("헤더를 눌러 정렬 방향을 뒤집는다", async () => {
    installFetch(two);
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sales_data")).toBeInTheDocument());
    const first = () => screen.getAllByRole("row")[1].textContent;
    expect(first()).toContain("sales_data"); // size 내림차순 기본
    act(() => { fireEvent.click(screen.getByRole("button", { name: /^Total Size/ })); });
    expect(first()).toContain("customer_orders");
  });

  it("ARCHIVE DATA는 접수를 알린다 (X12 — 목업 멘트 없음) / 실패는 실패로", async () => {
    installFetch(two);
    const { unmount } = render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sales_data")).toBeInTheDocument());
    act(() => { fireEvent.click(screen.getByRole("button", { name: "ARCHIVE DATA" })); });
    expect(screen.getByRole("status")).toHaveTextContent(/아카이브 요청이 기록되었습니다/);
    expect(screen.getByRole("status")).not.toHaveTextContent(/목업/);
    unmount();

    failAll();
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/테이블 사용량 조회 실패/)).toBeInTheDocument());
  });
});

/* ══════════════ Table Activity ══════════════ */
describe("Table Activity", () => {
  // 툴바 기본 구간 30분이 이 화면의 allowlist에 있으므로 화면도 30분으로 시작한다
  const q = tableActivity(1800);

  it("구간별 KPI와 테이블 표를 채운다", async () => {
    installFetch({
      [q.selects]: scalar(1200), [q.inserts]: scalar(300),
      [q.copyfroms]: scalar(20), [q.deletes]: scalar(5),
      [q.lastAccess]: scalar(NOW - 120),
      [q.perSelect]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, 900)],
      [q.perInsert]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, 100)],
      [q.perTableLastAccess]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, NOW - 300)],
      [q.perTableSize]: [v({ db: "sales_db", schema: "public", table: "sales_data" }, 5 * GiB)],
    });
    render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sales_data")).toBeInTheDocument());
    expect(kpiOf("TOTAL SELECTS").getByText("1,200")).toBeInTheDocument();
    expect(kpiOf("RECENT ACTIVITY").getByText("2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("900")).toBeInTheDocument();
    expect(screen.getByText("+5.0 GB")).toBeInTheDocument();
  });

  it("구간 선택은 allowlist 안에서만 바뀐다", async () => {
    installFetch({});
    render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    const select = screen.getByLabelText<HTMLSelectElement>("구간");
    expect(select.value).toBe("1800"); // 툴바 기본값을 따라간다
    // 툴바의 5분(300)도 고를 수 있어야 한다 (codex CDX-S3D-01)
    expect(within(select).getAllByRole("option")).toHaveLength(5);
    expect([...select.options].map((o) => o.value))
      .toEqual(["300", "1800", "3600", "21600", "86400"]);
    act(() => { fireEvent.change(select, { target: { value: "86400" } }); });
    await waitFor(() => expect(screen.getByText(/Last 24 hours · access_type별/)).toBeInTheDocument());
  });

  it("툴바가 준 구간이 allowlist에 있으면 그것으로 시작한다", () => {
    installFetch({});
    const { unmount } = render(<TableActivity refreshMs={100000} filters={{ ...DEFAULT_FILTERS, rangeSec: 21600 }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    expect(screen.getByLabelText<HTMLSelectElement>("구간").value).toBe("21600");
    unmount();
    // 툴바의 5분도 그대로 따라간다 — 예전엔 조용히 1시간으로 떨어졌다(CDX-S3D-01)
    render(<TableActivity refreshMs={100000} filters={{ ...DEFAULT_FILTERS, rangeSec: 300 }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    expect(screen.getByLabelText<HTMLSelectElement>("구간").value).toBe("300");
  });

  it("실패는 실패로 표시한다", async () => {
    failAll();
    render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText(/테이블 활동 조회 실패/)).toBeInTheDocument());
  });
});

/* ══════════════ 공용 조각 · 훅 ══════════════ */
import { logDistribution, mainDashboard as mainQ } from "../src/api/queries";
import { LogMonitoring } from "../src/screens/drilldown/LogMonitoring";
import { Alarms } from "../src/screens/drilldown/Alarms";
import { alarms as alarmQ, tableActivityTrend } from "../src/api/queries";
import { buildAlarms } from "../src/screens/drilldown/alarmRows";

describe("useRangeSeries — 차트 데이터 결합", () => {
  const d = logDistribution();
  const matrix = (points: Array<[number, string]>) => [{ metric: {}, values: points }];

  it("여러 식을 하나의 시계열로 합치고, 없는 지점은 null로 둔다", async () => {
    installFetch({
      [d.info]: matrix([[NOW - 30, "1"], [NOW - 15, "2"], [NOW, "3"]]),
      [d.warning]: matrix([[NOW - 30, "9"]]),            // 뒤쪽 두 지점 없음
      [d.error]: [],                                      // 계열 자체가 비어 있음
    });
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    // c3는 목이므로 렌더 여부만 본다 — 결합 로직이 예외 없이 통과하는 것이 요점
    await waitFor(() =>
      expect(screen.getByLabelText("Log Level Distribution")).toBeInTheDocument());
  });

  it("모든 계열이 비면 '데이터 없음'을 그린다", async () => {
    installFetch({});
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Log Level Distribution")).toHaveTextContent("데이터 없음"));
  });
});

describe("Alarms — 알 수 없는 상태값", () => {
  it("정의에 없는 state는 OK로 떨어뜨린다 (표가 비지 않는다)", async () => {
    const q = alarmQ();
    installFetch({
      [q.state]: [v({ alertname: "Weird", severity: "warning", node: "gpu-server-01" }, 99)],
      [q.since]: [],
    });
    render(<Alarms refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("Weird")).toBeInTheDocument());
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument(); // since 없음
  });
});

describe("Snapshot & Lock — 임계 구간과 노드 되짚기", () => {
  const q = snapshotLock();

  it("중간 구간은 노랑, 짧으면 초록", async () => {
    installFetch({
      [q.snapshots]: [v({ node: "gpu-server-01", snapshot_id: "S1" }, 150)],  // 120~240 → yellow
      [q.locks]: [v({ lock_id: "L1", stmt_id: "1" }, 30)],                     // <60 → green
      [q.statements]: [],
    });
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("#S1")).toBeInTheDocument());
    const pill = (t: string) =>
      screen.getAllByText(t).find((el) => el.classList.contains("sqm-pill"));
    expect(pill("00:02:30")).toHaveClass("sqm-pill--yellow");
    expect(pill("00:00:30")).toHaveClass("sqm-pill--green");
  });

  it("실행 문장을 못 찾으면 워커 이름으로 노드를 되짚는다", async () => {
    installFetch({
      [q.locks]: [v({ lock_id: "L9", stmt_id: "999", worker: "sqream301" }, 10)],
      [q.statements]: [],
    });
    render(<SnapshotLock refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("L9")).toBeInTheDocument());
    expect(screen.getByText("icspreamh2gpu03")).toBeInTheDocument();
  });

  it("server가 지정되면 그 노드의 스냅샷·락만 남는다", async () => {
    installFetch({
      [q.snapshots]: [
        v({ node: "gpu-server-01", snapshot_id: "S1" }, 10),
        v({ node: "gpu-server-02", snapshot_id: "S2" }, 20),
      ],
    });
    render(<SnapshotLock refreshMs={100000} filters={{ ...DEFAULT_FILTERS, server: "gpu-server-02" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("#S2")).toBeInTheDocument());
    expect(screen.queryByText("#S1")).toBeNull();
  });
});

describe("Main Dashboard — Node Health 색 구간", () => {
  it("100%는 초록, 50%는 노랑, 0%는 빨강", async () => {
    const q = mainQ();
    installFetch({
      [q.workers]: [
        v({ node: "gpu-server-01", worker: "w1" }, 1),           // 100%
        v({ node: "gpu-server-02", worker: "w2" }, 1),
        v({ node: "gpu-server-02", worker: "w3" }, 0),           // 50%
        v({ node: "gpu-server-03", worker: "w4" }, 0),           // 0%
      ],
    });
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
    expect(screen.getByText("100%")).toHaveStyle({ color: "var(--green)" });
    expect(screen.getByText("50%")).toHaveStyle({ color: "var(--yellow)" });
    expect(screen.getByText("0%")).toHaveStyle({ color: "var(--red)" });
  });
});

describe("남은 분기 — 토스트 자동 소멸 · 스파크라인 · 정렬 tie", () => {
  it("토스트는 시간이 지나면 사라진다", async () => {
    const q = tableUsage();
    installFetch({});
    vi.useFakeTimers();
    try {
      render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      act(() => { fireEvent.click(screen.getByRole("button", { name: "ARCHIVE DATA" })); });
      expect(screen.getByRole("status")).toBeInTheDocument();
      // 연속 호출해도 타이머가 겹치지 않는다
      act(() => { fireEvent.click(screen.getByRole("button", { name: "ARCHIVE DATA" })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    void q;
  });

  it("Table Activity — 추이 데이터가 있으면 스파크라인을, 없으면 '--'를 그린다", async () => {
    const q = tableActivity(1800);
    const key = { db: "sales_db", schema: "public", table: "sales_data" };
    installFetch({
      [q.perSelect]: [v(key, 10)],
      [tableActivityTrend().perTable]: [{
        metric: key,
        values: [[NOW - 60, "1"], [NOW - 30, "5"], [NOW, "NaN"]],
      }],
    });
    const { container, unmount } = render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sales_data")).toBeInTheDocument());
    expect(container.querySelector(".sqm-spark")).toBeInTheDocument();
    unmount();

    installFetch({ [q.perSelect]: [v(key, 10)] }); // 추이 없음
    render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sales_data")).toBeInTheDocument());
    expect(document.querySelector(".sqm-spark")).toBeNull();
  });

  it("Alarms — 같은 등급·같은 상태면 최신(since)이 위로 온다", () => {
    const older = v({ alertname: "A", severity: "warning", node: "n1" }, 2);
    const newer = v({ alertname: "B", severity: "warning", node: "n2" }, 2);
    const out = buildAlarms([older, newer], [
      { metric: { alertname: "A", severity: "warning", node: "n1" }, value: [NOW, String(NOW - 500)] },
      { metric: { alertname: "B", severity: "warning", node: "n2" }, value: [NOW, String(NOW - 10)] },
    ]);
    expect(out.map((a) => a.alert)).toEqual(["B", "A"]);
  });
});

/* ══════════ codex CDX-S3C-04·06·07 회귀 ══════════ */
describe("Snapshot & Lock — 툴바 필터 (CDX-S3C-04)", () => {
  const q = snapshotLock();

  it("필터와 맞는 후보를 먼저 골라 락이 사라지지 않는다", async () => {
    // 같은 stmt_id에 후보 둘 — 첫 후보는 01, 두 번째가 필터(02)와 맞는다
    installFetch({
      [q.locks]: [v({ lock_id: "L1", stmt_id: "9" }, 100)],
      [q.statements]: [
        v({ stmt_id: "9", sqream_user: "u1", node: "gpu-server-01", worker: "sqream101" }, 1),
        v({ stmt_id: "9", sqream_user: "u2", node: "gpu-server-02", worker: "sqream201" }, 1),
      ],
    });
    render(<SnapshotLock refreshMs={100000}
      filters={{ ...DEFAULT_FILTERS, server: "gpu-server-02" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("L1")).toBeInTheDocument());
    expect(screen.getByText("u2")).toBeInTheDocument();          // 맞는 후보를 골랐다
    expect(screen.getByText("icspreamh2gpu02")).toBeInTheDocument();
  });

  it("spool에도 같은 필터가 걸린다", async () => {
    installFetch({
      [q.spool]: [
        v({ worker: "sqream101", node: "gpu-server-01", stmt_id: "1" }, 3 * GiB),
        v({ worker: "sqream201", node: "gpu-server-02", stmt_id: "2" }, 5 * GiB),
      ],
    });
    render(<SnapshotLock refreshMs={100000}
      filters={{ ...DEFAULT_FILTERS, server: "gpu-server-02" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sqream201")).toBeInTheDocument());
    expect(screen.queryByText("sqream101")).toBeNull();
  });

  it("GPU 필터는 워커 이름에서 GPU를 되짚어 적용된다", async () => {
    installFetch({
      [q.spool]: [
        v({ worker: "sqream101", stmt_id: "1" }, 3 * GiB),   // GPU 0
        v({ worker: "sqream132", stmt_id: "2" }, 5 * GiB),   // GPU 3
      ],
    });
    render(<SnapshotLock refreshMs={100000}
      filters={{ ...DEFAULT_FILTERS, server: "gpu-server-01", gpu: "3" }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("sqream132")).toBeInTheDocument());
    expect(screen.queryByText("sqream101")).toBeNull();
  });
});

describe("차트 부분 실패 (CDX-S3C-06)", () => {
  it("한 계열만 실패해도 나머지를 그린다", async () => {
    const d = logDistribution();
    const matrix = [{ metric: {}, values: [[NOW - 30, "1"], [NOW, "2"]] }];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = new URL(url, "http://localhost");
      const expr = u.searchParams.get("query") ?? "";
      if (expr === d.error) return Promise.resolve({ ok: false, status: 503 });
      const rt = u.pathname.includes("/query_range") ? "matrix" : "vector";
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: "success",
          data: { resultType: rt, result: rt === "matrix" ? matrix : [] },
        }),
      });
    }));
    render(<LogMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Log Level Distribution")).toBeInTheDocument());
    // "데이터 없음"도 "조회 실패"도 아니어야 한다 — 살아 있는 계열이 있다
    expect(screen.getByLabelText("Log Level Distribution")).not.toHaveTextContent("조회 실패");
  });

  it("전 계열 실패는 차트가 실패라고 말한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
      render(<LogMonitoring refreshMs={1000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(screen.getByLabelText("Log Level Distribution")).toHaveTextContent("차트 조회 실패");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Main Dashboard — 현재값 스트립·Top Queries 표기 (CDX-S3C-07)", () => {
  const q = mainQ();

  it("차트 아래 현재값 스트립이 마지막 값을 보인다", async () => {
    /* `q.cpu` 등은 KPI(instant)와 차트(range)가 **같은 식**을 쓴다. 한 답만 주면
       instant 쪽이 matrix를 받아 파싱에 실패하므로 요청 종류로 갈라 답한다. */
    const range: Record<string, Array<[number, string]>> = {
      [q.cpu]: [[NOW - 30, "40"], [NOW, "44"]],
      [q.gpu]: [[NOW - 30, "50"], [NOW, "57"]],
      [q.diskIo]: [[NOW - 30, "1000"], [NOW, "2048"]],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = new URL(url, "http://localhost");
      if (u.pathname.includes("/label/")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "success", data: [] }) });
      }
      const expr = u.searchParams.get("query") ?? "";
      const isRange = u.pathname.includes("/query_range");
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: "success",
          data: isRange
            ? { resultType: "matrix", result: range[expr] ? [{ metric: {}, values: range[expr] }] : [] }
            : { resultType: "vector", result: [] },
        }),
      });
    }));
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    const strip = () => document.querySelector(".sqm-summary") as HTMLElement;
    await waitFor(() => expect(strip()).toBeInTheDocument());
    await waitFor(() => expect(strip().textContent).toContain("44%"));
    expect(strip().textContent).toContain("57%");
    expect(strip().textContent).toContain("2.0 KB/s");
  });

  it("Top Queries는 결측을 0으로, CPU Time을 초로, GPU를 막대로 낸다", async () => {
    installFetch({
      // running 메타에 없는 stmt — topk 라벨의 node로 되짚어야 한다
      [q.topGpu]: [v({ stmt_id: "77", node: "gpu-server-03", worker: "sqream301" }, 91)],
    });
    const { container } = render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("77")).toBeInTheDocument());
    // Node Health에도 노드명이 있어 Top Queries 표 안에서만 찾는다
    const top = within(screen.getByText("Top Queries by Resource Usage")
      .closest(".sqm-card") as HTMLElement);
    expect(top.getByText("icspreamh2gpu03")).toBeInTheDocument(); // topk 라벨 폴백
    expect(top.getByText("0s")).toBeInTheDocument();              // 결측 → 0
    expect(top.getByText("0.0 B")).toBeInTheDocument();
    expect(container.querySelectorAll(".sqm-barcell").length).toBeGreaterThan(0);
  });
});

describe("Minor 회귀 (CDX-S3C-08)", () => {
  it("Table Activity: 이름이 겹칠 때만 스키마를 붙이고, 결측은 0/+0 B", async () => {
    const q = tableActivity(1800);
    installFetch({
      [q.perSelect]: [
        v({ db: "a", schema: "public", table: "dup" }, 5),
        v({ db: "b", schema: "logs", table: "dup" }, 3),
        v({ db: "c", schema: "iot", table: "solo" }, 1),
      ],
    });
    render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getAllByText("dup").length).toBe(2));
    // 겹치는 이름에만 스키마가 붙는다
    expect(screen.getByText("· public")).toBeInTheDocument();
    expect(screen.getByText("· logs")).toBeInTheDocument();
    expect(screen.queryByText("· iot")).toBeNull();
    // 결측 카운트는 0, 크기 변화는 +0 B
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+0.0 B").length).toBe(3);
  });

  it("Table Activity 페이저에 Next ›가 있고 동작한다", async () => {
    const q = tableActivity(1800);
    installFetch({
      [q.perSelect]: Array.from({ length: 12 }, (_, i) =>
        v({ db: "d", schema: "s", table: `t${i}` }, 12 - i)),
    });
    render(<TableActivity refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("t0")).toBeInTheDocument());
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Next ›" })); });
    expect(screen.getByText("t10")).toBeInTheDocument();
    expect(screen.queryByText("t0")).toBeNull();
  });

  it("Table Usage: CLEANUP 토글은 삭제 대기 내림차순을 강제한다", async () => {
    const q = tableUsage();
    const t = (name: string, deleted: number, size: number) => [
      v({ db: "d", schema: "s", table: name }, 1000),
      v({ db: "d", schema: "s", table: name }, deleted),
      v({ db: "d", schema: "s", table: name }, size),
    ];
    const [r1, d1, s1] = t("small", 30, 900);
    const [r2, d2, s2] = t("big", 100, 100);
    installFetch({ [q.rows]: [r1, r2], [q.deleted]: [d1, d2], [q.size]: [s1, s2] });
    render(<TableUsage refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("small")).toBeInTheDocument());
    // 기본은 size 내림차순 → small(900)이 위
    expect(screen.getAllByRole("row")[1].textContent).toContain("small");

    act(() => { fireEvent.click(screen.getByRole("button", { name: "CLEANUP 대상만" })); });
    // deleted 내림차순으로 바뀐다 → big(100)이 위
    expect(screen.getAllByRole("row")[1].textContent).toContain("big");
  });

  it("Worker 카드는 표시명 옆에 원시 라벨을 병기한다", async () => {
    const q = workerMonitoring();
    installFetch({ [q.workers]: [v({ node: "gpu-server-01", worker: "sqream101" }, 1)] });
    render(<WorkerMonitoring refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("icspreamh2gpu01")).toBeInTheDocument());
    expect(screen.getByText("gpu-server-01")).toBeInTheDocument();
  });
});

describe("재실행 게이트 회귀 (CDX-S3D)", () => {
  it("툴바 5분이 Table Activity 질의 구간에 실제로 반영된다 (CDX-S3D-01)", async () => {
    const spy = installFetch({});
    render(<TableActivity refreshMs={100000} filters={{ ...DEFAULT_FILTERS, rangeSec: 300 }} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/Last 5 min/).length).toBeGreaterThan(0));
    const urls = spy.mock.calls.map((c) => String(c[0]));
    // instant 식에 [300s]가 박혀야 한다
    expect(urls.some((u) => decodeURIComponent(u).includes("[300s]"))).toBe(true);
    // range 질의의 start/end 간격도 300초
    const range = urls.find((u) => u.includes("/query_range"));
    const p = new URL(range as string, "http://localhost").searchParams;
    expect(Number(p.get("end")) - Number(p.get("start"))).toBe(300);
  });

  it("일부 성공(빈 결과) + 나머지 실패는 '데이터 없음'으로 위장하지 않는다 (CDX-S3D-02)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const d = logDistribution();
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn((url: string) => {
        const u = new URL(url, "http://localhost");
        const expr = u.searchParams.get("query") ?? "";
        // Info만 성공하되 **빈 결과**, 나머지는 503
        if (expr === d.info) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: "success", data: { resultType: "matrix", result: [] } }),
          });
        }
        return Promise.resolve({ ok: false, status: 503 });
      }));
      render(<LogMonitoring refreshMs={1000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(screen.getByLabelText("Log Level Distribution")).toHaveTextContent("차트 조회 실패");
    } finally {
      vi.useRealTimers();
    }
  });

  it("KPI 질의가 실패해도 차트가 살아 있으면 스트립은 값을 낸다 (CDX-S3D-03)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const q = mainQ();
    const range: Record<string, Array<[number, string]>> = {
      [q.cpu]: [[NOW, "44"]], [q.gpu]: [[NOW, "57"]], [q.diskIo]: [[NOW, "2048"]],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = new URL(url, "http://localhost");
      const isRange = u.pathname.includes("/query_range");
      if (!isRange) return Promise.resolve({ ok: false, status: 503 }); // instant 전부 실패
      const expr = u.searchParams.get("query") ?? "";
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: "success",
          data: {
            resultType: "matrix",
            result: range[expr] ? [{ metric: {}, values: range[expr] }] : [],
          },
        }),
      });
    }));
    render(<MainDashboard refreshMs={100000} filters={DEFAULT_FILTERS} title="T" pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    const strip = () => document.querySelector(".sqm-summary") as HTMLElement;
    await waitFor(() => expect(strip().textContent).toContain("44%"));
    expect(strip().textContent).toContain("57%");
    expect(strip().textContent).toContain("2.0 KB/s");
    // KPI는 실패했으니 "--"가 맞다 — 둘이 분리돼 있음을 함께 확인한다
    expect(kpiOf("CPU USAGE").getByText("--")).toBeInTheDocument();
  });
});
