/*
 * 표 컬럼 정렬 · 그래프 시점 고정 (인간 지시 2026-08-10).
 *
 * 둘 다 **10개 화면 전부**에 걸리는 기능이라, 한 화면에서 우연히 동작하는 것으로는
 * 부족하다. 여기서는 규칙 자체(정렬 순서·미정의 처리·고정 시 폴링 정지)를 잠근다.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Table } from "../src/components/drilldown/primitives";
import { useTableSort } from "../src/components/drilldown/useTableSort";
import { MainDashboard } from "../src/screens/drilldown/MainDashboard";
import { DEFAULT_FILTERS } from "../src/components/drilldown/toolbarModel";
import { mainDashboard } from "../src/api/queries";
import { TableUsage } from "../src/screens/drilldown/TableUsage";

interface Row { name: string; n?: number }
const ROWS: Row[] = [
  { name: "beta", n: 5 },
  { name: "alpha", n: undefined },
  { name: "gamma", n: 1 },
];

describe("useTableSort", () => {
  const pickers = { name: (r: Row) => r.name, n: (r: Row) => r.n };

  it("기본 키가 없으면 원본 순서 그대로다", () => {
    const { result } = renderHook(() => useTableSort<Row>(pickers));
    expect(result.current.apply(ROWS)).toBe(ROWS);   // 새 배열조차 만들지 않는다
    expect(result.current.dirty).toBe(false);
  });

  it("미정의는 **방향과 무관하게** 항상 뒤다", () => {
    /* 정적본은 결측을 -Infinity로 뒀다 — 오름차순으로 뒤집으면 빈 값이 표 맨 위를
       채워 표가 쓸모없어졌다. 이 규칙이 그 결함의 재발 방지선이다. */
    const { result } = renderHook(() => useTableSort<Row>(pickers, { key: "n", desc: true }));
    expect(result.current.apply(ROWS).map((r) => r.n)).toEqual([5, 1, undefined]);
    act(() => { result.current.setSort("n", false); });
    expect(result.current.apply(ROWS).map((r) => r.n)).toEqual([1, 5, undefined]);
  });

  it("문자열은 로케일 비교다 — 숫자 빼기로 처리하면 전부 NaN이 된다", () => {
    const { result } = renderHook(() => useTableSort<Row>(pickers, { key: "name", desc: false }));
    expect(result.current.apply(ROWS).map((r) => r.name)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("원본 배열을 건드리지 않는다 — 폴링이 넣어 준 배열을 뒤집으면 안 된다", () => {
    const original = [...ROWS];
    const { result } = renderHook(() => useTableSort<Row>(pickers, { key: "n", desc: true }));
    result.current.apply(ROWS);
    expect(ROWS).toEqual(original);
  });

  it("같은 컬럼을 다시 누르면 방향만 뒤집고, 다른 컬럼은 내림차순부터", () => {
    /* 실제 화면과 같은 경로로 누른다 — 훅의 setter를 직접 부르면 헤더 버튼이
       toggle을 제대로 부르는지는 확인하지 못한다. */
    let seen = { key: null as string | null, desc: true };
    function Harness() {
      const sort = useTableSort<Row>(pickers, { key: "n", desc: true });
      seen = { key: sort.key, desc: sort.desc };
      return <Table head={[sort.th("n", "N"), sort.th("name", "Name")]}>{null}</Table>;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "N" }));
    expect(seen).toEqual({ key: "n", desc: false });        // 같은 컬럼 → 방향만
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(seen).toEqual({ key: "name", desc: true });      // 다른 컬럼 → 내림차순부터
  });

  it("초기화하면 기본 키·방향으로 돌아오고 dirty가 풀린다", () => {
    const { result } = renderHook(() => useTableSort<Row>(pickers, { key: "n", desc: true }));
    act(() => { result.current.setSort("name", false); });
    expect(result.current.dirty).toBe(true);
    act(() => { result.current.reset(); });
    expect(result.current.dirty).toBe(false);
    expect(result.current.key).toBe("n");
    expect(result.current.desc).toBe(true);
  });

  it("aria-sort는 th에 붙는다 — 버튼에 붙이면 스크린리더가 못 읽는다", () => {
    const { result } = renderHook(() => useTableSort<Row>(pickers, { key: "n", desc: true }));
    const { container } = render(
      <Table head={[result.current.th("n", "N"), result.current.th("name", "Name")]}>{null}</Table>,
    );
    const ths = container.querySelectorAll("th");
    expect(ths[0].getAttribute("aria-sort")).toBe("descending");
    expect(ths[1].getAttribute("aria-sort")).toBe("none");
  });
});

/* ── 화면에서의 정렬·시점 고정 ─────────────────────────────────────────── */

const NOW = 1_786_000_000;
const q = mainDashboard();

function v(metric: Record<string, string>, val: number) {
  return { metric, value: [NOW, String(val)] };
}

/** 질의별 응답. `time=` 파라미터가 붙으면 다른 값을 돌려준다. */
function installFetch(byExpr: Record<string, unknown[]>, pinnedValue?: number) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    calls.push(url);
    const u = new URL(url, "http://x");
    const expr = u.searchParams.get("query") ?? "";
    const pinned = u.searchParams.has("time");
    let result = byExpr[expr] ?? [];
    if (pinned && pinnedValue !== undefined && expr === q.sessions) {
      result = [v({}, pinnedValue)];
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result } }),
    });
  }));
  return calls;
}

const rows = {
  [q.sessions]: [v({}, 5)],
  [q.statements]: [
    v({ stmt_id: "1", sqream_user: "a", node: "gpu-server-01", worker: "sqream101" }, 1),
    v({ stmt_id: "2", sqream_user: "b", node: "gpu-server-02", worker: "sqream201" }, 1),
  ],
  [q.duration]: [v({ stmt_id: "1" }, 10), v({ stmt_id: "2" }, 90)],
};

describe("Main Dashboard — 정렬·시점 고정", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Elapsed 헤더를 누르면 순서가 뒤집힌다", async () => {
    installFetch(rows);
    render(<MainDashboard refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);

    const card = () => within(
      screen.getByText("Query Overview").closest(".sqm-card") as HTMLElement);
    // 기본: 경과 시간 내림차순 → 90초짜리(2)가 위 (X17: 무접두 Statement ID)
    const rowIds = () => card().getAllByRole("button", { name: /^[12]$/ }).map((b) => b.textContent);
    await waitFor(() => expect(rowIds()[0]).toBe("2"));

    fireEvent.click(card().getByRole("button", { name: /Elapsed/ }));
    expect(rowIds()[0]).toBe("1");

    // 기본이 아니게 되면 초기화 버튼이 생긴다
    fireEvent.click(card().getByRole("button", { name: "정렬 초기화" }));
    expect(rowIds()[0]).toBe("2");
    expect(card().queryByRole("button", { name: "정렬 초기화" })).toBeNull();
  });

  it("고정 시점을 주면 질의에 `time=`이 붙고 그 시각의 값이 나온다", async () => {
    const pinned = (NOW - 600) * 1000;
    const calls = installFetch(rows, 42);
    render(<MainDashboard refreshMs={5000} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={pinned} onPickTime={() => {}} onClearPin={() => {}} />);

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    const instant = calls.filter((u) => u.includes("/api/v1/query?"));
    expect(instant.length).toBeGreaterThan(0);
    for (const u of instant) {
      expect(u, "instant 질의에 시점이 안 붙었다").toContain(`time=${Math.floor(pinned / 1000)}`);
    }
  });

  it("고정 중에는 instant 폴링을 멈춘다 — 같은 시각을 다시 물어도 값이 같다", async () => {
    vi.useFakeTimers();
    try {
      const calls = installFetch(rows, 42);
      render(<MainDashboard refreshMs={1000} filters={DEFAULT_FILTERS} title="T"
        pinnedMs={(NOW - 600) * 1000} onPickTime={() => {}} onClearPin={() => {}} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      const first = calls.filter((u) => u.includes("/api/v1/query?")).length;
      expect(first).toBeGreaterThan(0);

      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      const after = calls.filter((u) => u.includes("/api/v1/query?")).length;
      expect(after, "고정 중인데 계속 다시 물었다").toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("시점 고정 해제 (인간 지시 2026-08-10)", () => {
  it("같은 지점을 다시 클릭하면 풀린다 — 다른 지점이면 옮겨간다", () => {
    /* 셸이 토글을 맡는다. 차트가 실제 샘플 시각으로 스냅해 주므로 같은 점을 누르면
       값이 정확히 같고, 그래서 토글이 성립한다. */
    let pinned: number | null = null;
    const pick = (ms: number) => { pinned = pinned === ms ? null : ms; };

    pick(1000);
    expect(pinned).toBe(1000);
    pick(1000);
    expect(pinned, "같은 지점을 다시 눌렀는데 안 풀렸다").toBeNull();
    pick(1000);
    pick(2000);
    expect(pinned, "다른 지점인데 풀려 버렸다").toBe(2000);
  });

  it("고정 칩이 차트 카드 머리에 있고, ✕로 해제한다", async () => {
    installFetch(rows, 42);
    const onClearPin = vi.fn();
    render(<MainDashboard refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={(NOW - 600) * 1000} onPickTime={() => {}} onClearPin={onClearPin} />);

    const card = await waitFor(() =>
      screen.getByText("Cluster Performance").closest(".sqm-card") as HTMLElement);
    const chip = within(card).getByRole("status");
    expect(chip.textContent, "칩이 Cluster Performance 카드에 없다").toContain("고정");

    fireEvent.click(within(chip).getByRole("button", { name: "시점 고정 해제" }));
    expect(onClearPin).toHaveBeenCalledOnce();
  });

  it("고정이 없으면 칩을 그리지 않는다", () => {
    installFetch(rows);
    render(<MainDashboard refreshMs={0} filters={DEFAULT_FILTERS} title="T"
      pinnedMs={null} onPickTime={() => {}} onClearPin={() => {}} />);
    expect(screen.queryByRole("button", { name: "시점 고정 해제" })).toBeNull();
  });

  it("차트가 없는 화면에서도 풀 수 있다 — 고정은 화면을 옮겨도 유지된다", async () => {
    /* 표시가 없는 화면이 하나라도 있으면 거기서는 값이 안 변하는 이유를 알 수 없다. */
    installFetch({});
    const onClearPin = vi.fn();
    render(<TableUsage refreshMs={0} filters={DEFAULT_FILTERS} title="Table Usage"
      pinnedMs={(NOW - 600) * 1000} onPickTime={() => {}} onClearPin={onClearPin} />);
    fireEvent.click(await screen.findByRole("button", { name: "시점 고정 해제" }));
    expect(onClearPin).toHaveBeenCalledOnce();
  });
});
