/*
 * 상태 변경 규약 — 정리 작업 · 재시작 · SQL 복사 (인간 지시 2026-08-10).
 *
 * ADR-0004: **목업은 상태를 바꾸지 않는다.** 사유를 받아 감사 기록 문구만 낸다.
 * 여기서 잠그는 것은 그 규약 자체다 — 사유 없이 눌리는 버튼이 하나라도 생기면 실패한다.
 * (예외: Statement Kill(X6, 인간 승인 2026-08-18)은 exporter 합성 데이터에 반영된다 —
 *  그 갈래는 queryDetailModal.test.tsx가 잠근다. 기본 표기는 여기 그대로다.)
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionDialog } from "../src/components/drilldown/ActionDialog";
import { isBusinessHours } from "../src/lib/businessHours";
import { copyText } from "../src/lib/copyText";
import { cleanupCommand, mockSql, qualifiedName } from "../src/screens/drilldown/cleanupCommands";
import type { TableRow } from "../src/screens/drilldown/tableRows";

const T = (table: string): TableRow => ({ db: "sqream", schema: "public", table });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("정리 작업 명령문 (회의록 §5.1)", () => {
  it("RECHUNK는 3단계 배리어 구조다 — 단계 내 Parallel, 단계 사이 완료 대기 (X10·codex X10-02)", () => {
    const cmd = cleanupCommand("RECHUNK", [T("orders"), T("items")]);
    const stmts = cmd.split("\n").filter((l) => l.startsWith("SELECT"));
    // 평면 병렬이 아니라 단계별 그룹 — Extents가 Rechunk를 앞지르면 안 된다
    expect(stmts).toEqual([
      "SELECT RECHUNK('sqream.public.orders');",
      "SELECT RECHUNK('sqream.public.items');",
      "SELECT CLEANUP_EXTENTS('sqream.public.orders');",
      "SELECT CLEANUP_EXTENTS('sqream.public.items');",
    ]);
    expect(cmd).toContain("-- 1단계: Rechunk");
    expect(cmd).toContain("-- 2단계: Cleanup Extents — 1단계 전체 완료 후");
  });

  it("RECHUNK 3단계(말미)에 clustering key 테이블 chunk index 재생성이 붙는다 (X10)", () => {
    const cmd = cleanupCommand("RECHUNK", [T("orders")], [T("orders"), T("dim_date")]);
    expect(cmd).toContain("-- 3단계(마지막)");
    expect(cmd).toContain("chunk index 재생성");
    expect(cmd).toContain("SELECT RECALCULATE_CHUNKS_INDEXES('sqream.public.orders');");
    expect(cmd).toContain("SELECT RECALCULATE_CHUNKS_INDEXES('sqream.public.dim_date');");
    // CLEANUP_CHUNKS에는 붙지 않는다 — reindex는 Rechunk 배치의 말미 단계다
    expect(cleanupCommand("CLEANUP_CHUNKS", [T("orders")], [T("orders")]))
      .not.toContain("RECALCULATE_CHUNKS_INDEXES");
  });

  it("머리말에 건수와 Parallel·새벽 권장을 적는다 — 회의록이 확정한 사항이다", () => {
    const cmd = cleanupCommand("CLEANUP_CHUNKS", [T("a"), T("b"), T("c")]);
    expect(cmd).toContain("대상 3건");
    expect(cmd).toContain("Parallel");
    expect(cmd).toContain("새벽");
  });

  it("작업 종류마다 다른 함수를 부른다", () => {
    expect(cleanupCommand("RECHUNK", [T("t")])).toContain("RECHUNK(");
    expect(cleanupCommand("CLEANUP_CHUNKS", [T("t")])).toContain("CLEANUP_CHUNKS(");
    expect(cleanupCommand("CLEANUP_EXTENTS", [T("t")])).toContain("CLEANUP_EXTENTS(");
  });

  it("대상이 없으면 빈 명령문 대신 '대상 없음'이라고 말한다", () => {
    const cmd = cleanupCommand("RECHUNK", []);
    expect(cmd).toContain("대상 없음");
    expect(cmd).not.toContain("SELECT RECHUNK");
  });

  it("이름은 db.schema.table 정규형이다", () => {
    expect(qualifiedName(T("orders"))).toBe("sqream.public.orders");
  });
});

describe("mockSql", () => {
  it("QID 유형에 따라 다른 문장을 낸다", () => {
    expect(mockSql({ id: "1", qid: "JOI-14H" })).toContain("JOIN");
    expect(mockSql({ id: "1", qid: "DEL-05M" })).toContain("DELETE");
    expect(mockSql({ id: "1", qid: "LOA-12H" })).toContain("CREATE TABLE");
  });

  it("같은 입력이면 같은 문장이다 — 볼 때마다 바뀌면 못 믿는다", () => {
    const a = mockSql({ id: "42", qid: "AGG-04M", user: "dba1" });
    expect(mockSql({ id: "42", qid: "AGG-04M", user: "dba1" })).toBe(a);
  });

  it("목업 고지가 문장에 없다 — 메타 멘트는 화면·산출물에 싣지 않는다 (X12)", () => {
    // 재구성 문장이라는 사실은 코드 주석·문서가 담는다(인간 지시 2026-08-19).
    const sql = mockSql({ id: "1", qid: "SEL-01L" });
    expect(sql).not.toContain("목업");
    expect(sql).toContain("-- statement 1"); // 식별 머리말은 유지
  });
});

describe("ActionDialog — 상태 변경 규약", () => {
  const base = {
    title: "Rechunk",
    target: "3개 테이블",
    warning: "위험합니다",
    confirmLabel: "요청",
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("사유가 비면 실행 버튼이 비활성이다", () => {
    render(<ActionDialog {...base} />);
    const run = screen.getByRole("button", { name: "요청" });
    expect(run).toBeDisabled();

    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "  " } });
    expect(run, "공백만 넣어도 눌린다").toBeDisabled();

    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "단편화 62%" } });
    expect(run).toBeEnabled();
  });

  it("사유를 앞뒤 공백 없이 넘긴다", () => {
    const onConfirm = vi.fn();
    render(<ActionDialog {...base} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "  티켓 #1234  " } });
    fireEvent.click(screen.getByRole("button", { name: "요청" }));
    expect(onConfirm).toHaveBeenCalledWith("티켓 #1234");
  });

  it("대상과 건수를 반드시 보여 준다", () => {
    render(<ActionDialog {...base} />);
    expect(screen.getByText("3개 테이블")).toBeInTheDocument();
  });

  it("제목에 목업 표기가 없다 — mockNote 괄호는 X12에서 철거됐다", () => {
    render(<ActionDialog {...base} />);
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).not.toContain("목업");
    expect(text).not.toContain("실제 실행 없음");
    expect(text).not.toContain("합성 데이터");
  });

  it("업무시간이면 경고가 뜬다 (막지는 않는다)", () => {
    // 09~18시가 아니면 이 단언이 무의미해지므로 시각을 고정한다.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 10, 14, 0, 0));
      render(<ActionDialog {...base} />);
      const alerts = screen.getAllByRole("alert").map((e) => e.textContent ?? "");
      expect(alerts.some((t) => t.includes("업무시간"))).toBe(true);
      // 경고가 떠도 실행 자체는 막지 않는다
      fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "x" } });
      expect(screen.getByRole("button", { name: "요청" })).toBeEnabled();
    } finally { vi.useRealTimers(); }
  });

  it("새벽에는 업무시간 경고가 없다", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 10, 3, 0, 0));
      render(<ActionDialog {...base} />);
      const alerts = screen.queryAllByRole("alert").map((e) => e.textContent ?? "");
      expect(alerts.some((t) => t.includes("업무시간"))).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it("추가 경고(열린 스냅샷 등)를 함께 보여 준다", () => {
    render(<ActionDialog {...base} extraWarning="열린 스냅샷 3건" />);
    expect(screen.getByText("열린 스냅샷 3건")).toBeInTheDocument();
  });

  it("명령문이 있으면 복사 버튼이 붙고 결과를 알린다", async () => {
    const onCopyResult = vi.fn();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ActionDialog {...base} command="SELECT 1;" onCopyResult={onCopyResult} />);
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(onCopyResult).toHaveBeenCalledWith(true));
    expect(writeText).toHaveBeenCalledWith("SELECT 1;");
  });
});

describe("copyText — http 폴백", () => {
  it("clipboard API가 없으면 execCommand로 떨어진다 (포털은 http다)", async () => {
    /* 보안 컨텍스트가 아니면 `navigator.clipboard`가 아예 없다. 폴백이 없으면
       현장에서 복사 버튼이 조용히 아무 일도 안 한다. */
    vi.stubGlobal("navigator", {});
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });

    expect(await copyText("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    // 임시 textarea를 남기지 않는다
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });

  it("clipboard API가 거부해도 폴백을 시도한다", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
    });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    expect(await copyText("x")).toBe(true);
  });

  it("둘 다 실패하면 false를 낸다 — 조용히 성공한 척하지 않는다", async () => {
    vi.stubGlobal("navigator", {});
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    expect(await copyText("x")).toBe(false);
  });
});

describe("isBusinessHours", () => {
  it("09시 이상 18시 미만", () => {
    const at = (h: number) => new Date(2026, 7, 10, h, 0, 0);
    expect(isBusinessHours(at(8))).toBe(false);
    expect(isBusinessHours(at(9))).toBe(true);
    expect(isBusinessHours(at(17))).toBe(true);
    expect(isBusinessHours(at(18))).toBe(false);
    expect(isBusinessHours(at(3))).toBe(false);
  });
});

/* ── 화면 배선 ───────────────────────────────────────────────────────── */

import { TableUsage } from "../src/screens/drilldown/TableUsage";
import { DEFAULT_FILTERS } from "../src/components/drilldown/toolbarModel";
import { tableUsage } from "../src/api/queries";
import { nextBatchLocal, scheduleText } from "../src/screens/drilldown/maintSchedule";

function installFetch(byExpr: Record<string, unknown[]>) {
  const spy = vi.fn((url: string) => {
    const expr = new URL(url, "http://x").searchParams.get("query") ?? "";
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        status: "success",
        data: { resultType: "vector", result: byExpr[expr] ?? [] },
      }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("Table Usage — RECHUNK · CLEANUP_CHUNKS 배치", () => {
  const q = tableUsage();
  const lbl = { db: "sqream", schema: "public", table: "orders" };

  it("행 단위 버튼이 그 테이블만 대상으로 삼는다 — 전역 reindex를 붙이지 않는다 (codex X10-03)", async () => {
    installFetch({
      [q.rows]: [{ metric: lbl, value: [0, "100"] },
        { metric: { ...lbl, table: "dim_date" }, value: [0, "50"] }],
      [q.fragmentation]: [{ metric: lbl, value: [0, "0.62"] }],
      // orders는 CK 없음, dim_date는 CK 있음 — 행 단위 RECHUNK(orders)에
      // dim_date의 reindex가 끼면 "한 테이블만 손보기"가 아니다
      [q.clusteringKey]: [{ metric: lbl, value: [0, "0"] },
        { metric: { ...lbl, table: "dim_date" }, value: [0, "1"] }],
    });
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("orders")).toBeInTheDocument());
    const row = screen.getByText("orders").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "RECHUNK" }));

    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toContain("sqream.public.orders");
    expect(dlg.textContent).not.toContain("dim_date");
    expect(dlg.textContent).not.toContain("RECALCULATE_CHUNKS_INDEXES");
    expect(within(dlg).getByRole("button", { name: "Rechunk 요청" })).toBeDisabled();
  });

  it("일괄 버튼은 배치 판정 대상을 삼는다 — Cleanup=deleted>0, Rechunk=4임계 (X10)", async () => {
    installFetch({
      [q.rows]: [
        { metric: lbl, value: [0, "100"] },
        { metric: { ...lbl, table: "items" }, value: [0, "50"] },
        { metric: { ...lbl, table: "clean" }, value: [0, "70"] },
      ],
      [q.deleted]: [
        { metric: lbl, value: [0, "10"] },
        { metric: { ...lbl, table: "items" }, value: [0, "5"] },
        // clean은 delete/update 레코드가 없다 — Cleanup 비대상
        { metric: { ...lbl, table: "clean" }, value: [0, "0"] },
      ],
    });
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("orders")).toBeInTheDocument());
    // 4임계 통계가 없는 픽스처 — Rechunk 대상 0건이라 일괄 버튼이 비활성이다
    expect(screen.getByRole("button", { name: "RECHUNK (0)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "CLEANUP CHUNKS (2)" }));
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toContain("2개 테이블");
    expect(dlg.textContent).toContain("대상 2건");
  });

  it("확인하면 exporter 명령 API로 접수한다 — 합성 데이터 반영 (X10-f2)", async () => {
    const spy = installFetch({
      [q.rows]: [
        { metric: lbl, value: [0, "100"] },
        { metric: { ...lbl, table: "items" }, value: [0, "50"] },
      ],
      [q.deleted]: [
        { metric: lbl, value: [0, "10"] },
        { metric: { ...lbl, table: "items" }, value: [0, "5"] },
      ],
    });
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("orders")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "CLEANUP CHUNKS (2)" }));
    fireEvent.change(screen.getByLabelText("수행 사유"),
      { target: { value: "배치 선행 조치" } });
    fireEvent.click(screen.getByRole("button", { name: "Cleanup 요청" }));

    await waitFor(() => expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/tables/sqream/public/orders/cleanup"))).toBe(true));
    expect(spy.mock.calls.some((c) =>
      String(c[0]).includes("/api/v1/tables/sqream/public/items/cleanup"))).toBe(true);
    await waitFor(() => expect(screen.getByText(/2건 접수/)).toBeInTheDocument());
    // 접수 토스트에 목업 표기가 없다(X12) — 접수 사실·사유·반영 안내만.
    expect(screen.queryByText(/합성 데이터에 반영/)).toBeNull();
  });

  it("고정 시점에서는 유지보수 버튼이 비활성이다 — 상태 변경 금지 규약 (X10-f2)", async () => {
    installFetch({
      [q.rows]: [{ metric: lbl, value: [0, "100"] }],
      [q.deleted]: [{ metric: lbl, value: [0, "10"] }],
    });
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={1_787_000_000_000} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("orders")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "CLEANUP CHUNKS (1)" })).toBeDisabled();
    const row = screen.getByText("orders").closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: "CLEANUP" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "RECHUNK" })).toBeDisabled();
  });
});

describe("요청 = 예약 등록 (E3-f1) — 비대상 테이블도 요청하면 예정 배지가 뜬다", () => {
  const q = tableUsage();
  it("행 CLEANUP 요청 접수 → 예정 배지 표시, 모달 취소 → 배지 소멸", async () => {
    installFetch({
      // clean: deleted=0 — 판정 비대상(유지보수 열 "—")
      [q.rows]: [{ metric: { db: "d", schema: "s", table: "clean" }, value: [0, "100"] }],
      [q.deleted]: [{ metric: { db: "d", schema: "s", table: "clean" }, value: [0, "0"] }],
    });
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("clean")).toBeInTheDocument());
    const row = screen.getByText("clean").closest("tr") as HTMLElement;
    expect(within(row).queryByText("Cleanup 예정")).toBeNull();

    // 행 버튼 배치(인간 최종 지시): CLEANUP 왼쪽 · RECHUNK 오른쪽
    const rowButtons = within(row).getAllByRole("button").map((b) => b.textContent);
    expect(rowButtons.indexOf("CLEANUP")).toBeLessThan(rowButtons.indexOf("RECHUNK"));

    fireEvent.click(within(row).getByRole("button", { name: "CLEANUP" }));
    fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: "수동 예약" } });
    fireEvent.click(screen.getByRole("button", { name: "Cleanup 요청" }));
    // 요청 즉시 예약 등록 — 판정 비대상이어도 예정 배지가 뜬다
    expect(within(row).getByText("Cleanup 예정")).toBeInTheDocument();

    // 배지 클릭 → 모달(사용자 요청 문구) → 수행 취소 → 배지째 소멸
    fireEvent.click(within(row).getByRole("button", { name: "Cleanup 예정" }));
    expect(screen.getByRole("dialog").textContent).toContain("예약되어 있습니다");
    fireEvent.click(screen.getByRole("button", { name: "수행 취소" }));
    expect(within(row).queryByText("Cleanup 예정")).toBeNull();
    expect(within(row).queryByText("Cleanup 취소됨")).toBeNull();
  });
});

describe("유지보수 수행 예정 모달 (E3 — 배지 클릭: 일자 확인·변경·취소)", () => {
  const q = tableUsage();
  const vv = (table: string, val: number) =>
    ({ metric: { db: "d", schema: "s", table }, value: [0, String(val)] as [number, string] });
  /* frag_t = Rechunk 4/4 + Cleanup 대상, del_only = Cleanup만 — drilldownScreens의
     판정 픽스처와 같은 수치다(판정 로직 자체는 그쪽이 잠근다). */
  const fixtures = () => installFetch({
    [q.rows]: [vv("frag_t", 50_000_000), vv("del_only", 10_000_000)],
    [q.chunks]: [vv("frag_t", 100), vv("del_only", 10)],
    [q.filled90]: [vv("frag_t", 40), vv("del_only", 9)],
    [q.under80]: [vv("frag_t", 30), vv("del_only", 0)],
    [q.noDeletion]: [vv("frag_t", 25), vv("del_only", 5)],
    [q.deleted]: [vv("frag_t", 500), vv("del_only", 100)],
  });

  it("배지를 누르면 수행 예정 모달 — 기본 예정일은 다음 01:00 배치 회차다", async () => {
    fixtures();
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("frag_t")).toBeInTheDocument());

    const row = screen.getByText("frag_t").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Rechunk 예정" }));

    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toContain("d.s.frag_t");
    expect(dlg.textContent).toContain("Rechunk 수행 예정");
    expect(screen.getByLabelText("수행 예정일자")).toHaveValue(nextBatchLocal());
    // 다음 회차 규칙: 01:00 이전이면 오늘, 이후면 내일 01:00
    expect(nextBatchLocal(new Date("2026-08-25T00:30:00"))).toBe("2026-08-25T01:00");
    expect(nextBatchLocal(new Date("2026-08-25T09:00:00"))).toBe("2026-08-26T01:00");
    expect(scheduleText("2026-08-26T01:00")).toBe("2026-08-26 01:00");
  });

  it("예정일 변경은 토스트로 확인되고, 수행 취소는 배지·일괄 대상에 반영·복원된다", async () => {
    fixtures();
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    await waitFor(() => expect(screen.getByText("del_only")).toBeInTheDocument());
    // 초기 일괄 카운트: Cleanup 대상 2(frag_t·del_only), Rechunk 대상 1(frag_t)
    expect(screen.getByRole("button", { name: "CLEANUP CHUNKS (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RECHUNK (1)" })).toBeInTheDocument();

    // 예정일 변경
    const row = screen.getByText("del_only").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Cleanup 예정" }));
    fireEvent.change(screen.getByLabelText("수행 예정일자"),
      { target: { value: "2026-08-27T02:30" } });
    fireEvent.click(screen.getByRole("button", { name: "예정일 변경" }));
    expect(screen.getByText(/2026-08-27 02:30로 변경되었습니다/)).toBeInTheDocument();

    // 수행 취소 → 배지 문구·회색 톤, 일괄 카운트에서 제외
    fireEvent.click(within(row).getByRole("button", { name: "Cleanup 예정" }));
    fireEvent.click(screen.getByRole("button", { name: "수행 취소" }));
    expect(within(row).getByText("Cleanup 취소됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLEANUP CHUNKS (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RECHUNK (1)" })).toBeInTheDocument(); // 무관 종류는 불변

    // 복원 — 배지·카운트 원복 (변경했던 예정일 유지)
    fireEvent.click(within(row).getByRole("button", { name: "Cleanup 취소됨" }));
    fireEvent.click(screen.getByRole("button", { name: "예정 복원" }));
    expect(screen.getByText(/복원되었습니다\(2026-08-27 02:30\)/)).toBeInTheDocument();
    expect(within(row).getByText("Cleanup 예정")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLEANUP CHUNKS (2)" })).toBeInTheDocument();
  });
});
