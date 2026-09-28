// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import App from "../src/App";
import { currentPhase, mockPhases } from "../src/screens/drilldown/mockQueryDetail";

/** `node="gpu-server-0X"` 라벨을 쿼리 문자열에서 뽑는다. */
function nodeOf(expr: string): string {
  return /node="([^"]+)"/.exec(expr)?.[1] ?? "";
}

// 서버별로 다른 GPU/MIG 총·사용 수 — 사이드바가 정말 메트릭에서 산출하는지 검증 (CDX-R3-14, R7 MIG)
const PHYS: Record<string, string> = { "gpu-server-01": "4", "gpu-server-02": "4", "gpu-server-03": "0" };
const TOTAL: Record<string, string> = { "gpu-server-01": "8", "gpu-server-02": "8", "gpu-server-03": "0" };
const BUSY: Record<string, string> = { "gpu-server-01": "2", "gpu-server-02": "1", "gpu-server-03": "0" };

/** Prometheus 응답을 쿼리 문자열에 따라 흉내내는 fetch 목.
    `rangeOver`(X16): range 쿼리 결과 오버라이드 — 결과 배열 또는 그 Promise(보류 재현용)를
    반환하면 그대로 쓰고, undefined면 기존처럼 빈 matrix. */
function installFetchMock(
  over: (expr: string) => unknown = () => undefined,
  rangeOver: (expr: string) => unknown = () => undefined,
) {
  const spy = vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    if (u.pathname.includes("/label/")) {
      const data = u.pathname.includes("/node/")
        ? ["gpu-server-01", "gpu-server-02", "gpu-server-03"]
        : u.pathname.includes("/mig/")
          ? ["0", "1"]
          : ["0", "1", "2", "3"];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "success", data }) });
    }
    // range 쿼리(시계열·타임라인)는 matrix 빈 결과 — 차트는 비어도 렌더된다
    if (u.pathname.includes("/query_range")) {
      const custom = rangeOver(u.searchParams.get("query") ?? "");
      return Promise.resolve(custom).then((result) => ({
        ok: true,
        json: () => Promise.resolve({
          status: "success", data: { resultType: "matrix", result: result ?? [] },
        }),
      }));
    }
    const expr = u.searchParams.get("query") ?? "";
    const custom = over(expr);
    const result =
      custom !== undefined
        ? custom
        : expr.startsWith("count(count by(gpu)") // serverStatus.gpuTotal (물리 GPU)
          ? [{ metric: {}, value: [1, PHYS[nodeOf(expr)] ?? "0"] }]
        : expr.startsWith("count(DCGM") // serverStatus.migTotal (MIG 슬롯)
          ? [{ metric: {}, value: [1, TOTAL[nodeOf(expr)] ?? "0"] }]
          : expr.startsWith("count(max by(env, node, gpu") // serverStatus.gpuBusy(MIG 합집합)·gpuBusyByGpu(GPU 합집합)
            ? [{ metric: {}, value: [1, BUSY[nodeOf(expr)] ?? "0"] }]
            : expr.includes("sqm_statement_running{") && expr.includes("stmt_id")
              ? [
                  {
                    metric: { node: "gpu-server-01", gpu: "0", stmt_id: "105234", query_id: "Q-88123", sqream_user: "dba1" },
                    value: [1, "1"],
                  },
                ]
              : expr.includes("sqm_query_rows_per_second")
                ? [
                    {
                      metric: {
                        query_name: "Sales_Aggregation",
                        query_type: "aggregation",
                        database: "sales_db",
                        node: "gpu-server-01",
                        gpu: "0",
                      },
                      value: [1, "1850000"],
                    },
                  ]
                : [{ metric: {}, value: [1, "60"] }];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result } }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** X16: 완료(중단) 이벤트 range 픽스처 — 표시 구간 안 종료·reason 라벨 포함. */
function completedRangeOver(reason = "killed_by_admin") {
  const endSec = Math.floor(Date.now() / 1000) - 60;
  const metric = {
    node: "gpu-server-01", gpu: "0", mig: "0", stmt_id: "900001", query_id: "Q-STOP",
    sqream_user: "dba1", query_name: "Kill_Victim", status: "failed", reason,
  };
  return (expr: string) => {
    if (expr.includes("sqm_statement_completed_timestamp")) {
      return [{ metric, values: [[endSec + 30, String(endSec)]] }];
    }
    if (expr.includes("sqm_statement_completed_duration_seconds")) {
      return [{ metric, values: [[endSec + 30, "12"]] }];
    }
    return undefined; // phase 등은 빈 matrix
  };
}

/** 다중선택 그룹(체크박스) 안에서 옵션 체크박스를 클릭한다. */
function toggleOption(groupName: string, optionName: string) {
  const group = within(screen.getByRole("group", { name: groupName }));
  fireEvent.click(group.getByRole("checkbox", { name: optionName }));
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("탑뷰 상단바 (2026-08-09)", () => {
  /* 인간 지시로 탑뷰의 h1 헤더(`GPU/SQream Monitoring Dashboard` + KST 시계)를
     상세 대시보드와 같은 상단바로 대체했다. 두 가지를 잠근다:
     상단바가 있을 것, 그리고 **옛 헤더가 없을 것**(중복이 되살아나면 잡힌다). */
  it("상단바를 렌더하고 옛 h1 헤더는 없다", () => {
    installFetchMock();
    const { container } = render(<App />);

    const bar = container.querySelector(".sqm-topbar");
    expect(bar, "탑뷰에 상단바가 없다").toBeTruthy();
    expect(bar!.textContent).toContain("SQream DB Monitoring");
    expect(bar!.textContent).toContain("CLUSTER STATUS");

    expect(container.querySelector(".header__title"), "옛 h1 헤더가 남아 있다").toBeNull();
    expect(container.querySelector(".header__clock")).toBeNull();
  });

  it("스크롤 컨테이너 안에 고정된다 — sticky 수식자", () => {
    installFetchMock();
    const { container } = render(<App />);
    expect(container.querySelector(".sqm-topbar")?.className).toContain("sqm-topbar--sticky");
    // `.app-shell`(2열 그리드)이 아니라 `.content` 안에 있어야 한다 — 열이 밀리지 않게.
    expect(container.querySelector(".content > .sqm-topbar"), "content 바깥에 있다").toBeTruthy();
  });
});

describe("App 통합", () => {
  it("셸·헤더·필터바·테이블을 렌더하고 데이터를 채운다", async () => {
    installFetchMock();
    render(<App />);
    // 탑뷰 표식 = 상단바. 2026-08-09에 h1 헤더를 상단바로 대체했다.
    expect(screen.getByText(/CLUSTER STATUS/)).toBeInTheDocument();
    // 제목은 base 문구로 단언 — 인스턴스 접미사는 R6 전용 테스트에서 검증 (브리틀 방지)
    expect(screen.getByRole("heading", { name: /실행 중인 SQream DB 쿼리/ })).toBeInTheDocument();
    // 2026-09-04: ② SQL 쿼리 성능 표는 화면에서 제거(16열 표로 대체)
    expect(screen.queryByRole("heading", { name: /SQL 쿼리 성능 정보/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "105234" })).toBeInTheDocument());
  });

  it("Statement ID 클릭 → 상세 팝업(플랜 탭 기본) → Kill로 행이 사라진다 (X8·X16)", async () => {
    /* X16(codex X16-03): 카드 배선 검증용으로 행 3개를 서로 다른 단계에 놓는다.
       단계 경계는 stmt_id 해시 합성(mockPhases)이므로 경계 중간값으로 의도 단계를
       만들고, 의도와 실제 판정이 일치하는지 가드 단언한다(시드 퇴화 시 여기서 잡힌다). */
    const pPre = mockPhases({ id: "900101", qid: "" });
    const ePre = pPre.compileSec / 2;
    const pInit = mockPhases({ id: "900102", qid: "" });
    const eInit = pInit.compileSec + pInit.queuedSec + pInit.initializingSec / 2;
    expect(currentPhase({ id: "900101", qid: "", elapsed: ePre })).toBe("compileSec");
    expect(currentPhase({ id: "900102", qid: "", elapsed: eInit })).toBe("initializingSec");
    installFetchMock((expr) => {
      if (expr.includes("sqm_statement_running{") && expr.includes("stmt_id")) {
        return [
          { metric: { node: "gpu-server-01", gpu: "0", stmt_id: "105234", query_id: "Q-88123", sqream_user: "dba1" }, value: [1, "1"] },
          { metric: { node: "gpu-server-01", gpu: "1", stmt_id: "900101", query_id: "Q-90101", sqream_user: "dba1" }, value: [1, "1"] },
          { metric: { node: "gpu-server-02", gpu: "0", stmt_id: "900102", query_id: "Q-90102", sqream_user: "dba1" }, value: [1, "1"] },
        ];
      }
      if (expr.includes("sqm_statement_duration_seconds")) {
        return [
          { metric: { stmt_id: "105234" }, value: [1, "125"] },
          { metric: { stmt_id: "900101" }, value: [1, String(ePre)] },
          { metric: { stmt_id: "900102" }, value: [1, String(eInit)] },
        ];
      }
      if (expr.includes("sqm_statement_progress_ratio")) {
        return [{ metric: { stmt_id: "105234" }, value: [1, "0.4"] }];
      }
      if (expr.includes("sqm_statement_start_time_seconds")) {
        return [{ metric: { stmt_id: "105234" }, value: [1, "1800000000"] }];
      }
      if (expr.includes("sqm_statement_queued")) {
        return [{ metric: {}, value: [1, "2"] }];
      }
      return undefined;
    }, completedRangeOver());
    const { container } = render(<App />);

    /* X8-#5·X16(codex X16-03): 상태 축 카드 5슬롯 전부 — [0]=대기 2(배정 전 메트릭,
       표 행 아님 — 이중계상 금지), [1]=준비 1, [2]=초기화 1, [3]=실행 1(125s),
       [4]=중단 1(완료 이벤트 파생). */
    const summary = await screen.findByRole("region", { name: "쿼리 개수 요약" });
    const cardValues = () =>
      [...summary.querySelectorAll(".qsummary-card__value")].map((e) => e.textContent);
    await waitFor(() => expect(cardValues()).toEqual(["2", "1", "1", "1", "1"]));

    // X8-#1/#6: 행 클릭 → 드릴다운과 같은 팝업, 플랜 탭이 기본. sqm-page 래퍼는
    // display:contents(변수 상속용 — 박스 미생성이라 레이아웃 무영향).
    fireEvent.click(await screen.findByRole("button", { name: "105234" }));
    expect(screen.getByRole("tab", { name: "플랜" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".sqm-page")).not.toBeNull();

    // Kill: 사유 필수 다이얼로그 → 실행 → 팝업 닫힘 + 행 억제(낙관적 제거)
    fireEvent.click(within(document.querySelector(".sqm-modal") as HTMLElement).getByRole("button", { name: "Kill" }));
    const dlg = screen.getByRole("dialog", { name: "Kill Statement" });
    fireEvent.change(within(dlg).getByLabelText("수행 사유"), { target: { value: "X8 통합 테스트" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Kill 실행" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Statement 105234/ })).toBeNull());
    expect(screen.queryByRole("button", { name: "105234" })).toBeNull();

    /* X16(codex X16-03): Kill은 중단 카드에 낙관적 +1을 하지 않는다 — 목이 이벤트를
       더 주지 않으므로 다음 폴링이 와도 1 그대로여야 한다(증분은 완료 이벤트 도착
       시에만). 행 억제(위 단언)와 별개 축임을 잠근다. */
    expect(cardValues()[4]).toBe("1");
  });

  it("필터 변경 직후 중단 카드는 '-' — 이전 조건의 events로 집계하지 않는다 (codex X16-01)", async () => {
    let hold = false;
    const pending: Array<{ resolve: (r: unknown) => void; result: unknown }> = [];
    const fixture = completedRangeOver();
    installFetchMock(() => undefined, (expr) => {
      if (!expr.includes("sqm_statement_completed")) return undefined;
      const result = fixture(expr);
      if (!hold) return result;
      // 보류: 새 세대의 응답이 늦는 상황 재현 — 해제 시점은 테스트가 정한다
      return new Promise((resolve) => pending.push({ resolve, result }));
    });
    render(<App />);

    const summary = await screen.findByRole("region", { name: "쿼리 개수 요약" });
    const stoppedVal = () =>
      summary.querySelectorAll(".qsummary-card__value")[4].textContent;
    await waitFor(() => expect(stoppedVal()).toBe("1"));

    // 필터(노드) 변경 → 새 세대 응답 보류 중에는 이전 조건의 1을 보이면 안 된다
    hold = true;
    act(() => toggleOption("Node(서버)", "icspreamh2gpu01"));
    await waitFor(() => expect(stoppedVal()).toBe("-"));

    // 보류 해제 → 새 조건의 응답 도착 후에만 다시 집계된다
    hold = false;
    await act(async () => {
      pending.splice(0).forEach((p) => p.resolve(p.result));
      await Promise.resolve(); // 마이크로태스크 플러시 — setEvents 반영
    });
    await waitFor(() => expect(stoppedVal()).toBe("1"));
  });

  it("사이드바 서버 카드는 서버별 메트릭에서 상태·사용 수를 산출한다 (CDX-R3-14)", async () => {
    installFetchMock();
    render(<App />);
    const bar = () => within(screen.getByRole("complementary", { name: "사이드바" }));
    // server-01: mig 8 / busy 2 → 정상, "2 / 8 MIG 사용 중"
    await waitFor(() => {
      const card = bar().getByText("icspreamh2gpu01").closest(".server-card") as HTMLElement;
      expect(within(card).getByText("정상")).toBeInTheDocument();
      expect(within(card).getByText(/2\s*\/\s*8/)).toBeInTheDocument();
    });
    // server-03: mig 0 → 중단
    const card3 = bar().getByText("icspreamh2gpu03").closest(".server-card") as HTMLElement;
    expect(within(card3).getByText("중단")).toBeInTheDocument();
    // server-02: busy 1 → "1 / 8" (서버마다 값이 다름을 확인)
    const card2 = bar().getByText("icspreamh2gpu02").closest(".server-card") as HTMLElement;
    expect(within(card2).getByText(/1\s*\/\s*8/)).toBeInTheDocument();
  });

  it("연속 실패 3회면 연결 배너를 띄운다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 503 })),
    );
    vi.useFakeTimers();
    try {
      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("연결할 수 없습니다");
    } finally {
      vi.useRealTimers();
    }
  });

  it("인스턴스를 고르면 URL이 갱신된다", async () => {
    installFetchMock();
    render(<App />);
    await waitFor(() => screen.getByRole("checkbox", { name: "icspreamh2gpu01" }));
    act(() => toggleOption("Node(서버)", "icspreamh2gpu01"));
    await waitFor(() => expect(location.search).toContain("instance=gpu-server-01"));
  });

  it("GPU 두 개를 고르면 다중선택이 URL에 함께 복원된다 (CDX-R3-03)", async () => {
    installFetchMock();
    render(<App />);
    // "0" 체크박스는 MIG 그룹에도 있으므로 GPU 그룹 안에서만 찾는다
    const gpuGroup = () => within(screen.getByRole("group", { name: "GPU" }));
    await waitFor(() => gpuGroup().getByRole("checkbox", { name: "0" }));
    act(() => toggleOption("GPU", "0"));
    act(() => toggleOption("GPU", "2"));
    await waitFor(() => expect(location.search).toContain("gpu=0%2C2")); // "gpu=0,2"
  });

  it("인스턴스를 바꾸면 이전 GPU 선택이 초기화된다 (CDX-R3-05)", async () => {
    installFetchMock();
    render(<App />);
    const gpuGroup = () => within(screen.getByRole("group", { name: "GPU" }));
    await waitFor(() => gpuGroup().getByRole("checkbox", { name: "0" }));
    act(() => toggleOption("GPU", "0"));
    await waitFor(() => expect(location.search).toContain("gpu=0"));
    act(() => toggleOption("Node(서버)", "icspreamh2gpu02"));
    await waitFor(() => expect(location.search).toContain("instance=gpu-server-02"));
    expect(location.search).not.toContain("gpu=0");
  });

  it("MIG 드롭다운은 GPU 오른쪽에 있고, 선택은 URL 반영·GPU 변경 시 초기화된다", async () => {
    installFetchMock();
    render(<App />);
    // 필터 순서: 환경 → Node(서버) → GPU → Worker
    const labels = [...document.querySelectorAll(".filterbar .filter__label")].map(
      (el) => el.textContent,
    );
    expect(labels.slice(0, 4)).toEqual(["환경", "Node(서버)", "GPU", "Worker"]);

    /* 2026-08-09: Worker 항목은 슬롯 번호가 아니라 **워커 이름**이다. Node 선택이
       없으면 세 노드의 24개가 전부 보인다(상세 툴바와 같은 규칙). */
    const migGroup = () => within(screen.getByRole("group", { name: "Worker" }));
    await waitFor(() => migGroup().getByRole("checkbox", { name: "sqream102" }));
    expect(migGroup().getAllByRole("checkbox")).toHaveLength(25);   // All + 24

    // sqream102 = 노드1 · GPU0 · MIG1 → 슬롯 1. 노드도 함께 잡힌다.
    act(() => toggleOption("Worker", "sqream102"));
    await waitFor(() => expect(location.search).toContain("mig=1"));
    expect(location.search, "워커의 노드가 instances에 반영돼야 한다")
      .toContain("gpu-server-01");

    // 상위(GPU) 필터를 바꾸면 MIG 선택이 초기화된다 (CDX-R3-05 계단식 연장)
    act(() => toggleOption("GPU", "0"));
    await waitFor(() => expect(location.search).toContain("gpu=0"));
    expect(location.search).not.toContain("mig=1");
  });

  /*
   * 2026-08-07 인수인계 오버레이가 FilterBar에서 Prometheus `label_values` 조회를 걷어내고
   * GPU/Worker 옵션을 하드코딩으로 바꿨다(`GPU_OPTIONS`, `MIG_OPTIONS`). 그래서 이 테스트가
   * 붙잡으려는 `/label/gpu/` 요청 자체가 더는 발생하지 않는다 — 경합도 사라졌으므로 skip한다.
   *
   * ⚠ 부작용: 옵션 목록이 실데이터와 자동 동기화되지 않는다(노드·GPU 구성이 바뀌어도 화면은 그대로).
   *   동적 조회를 되살리기로 하면 이 테스트를 함께 복구할 것. RUNBOOK "표기 통일" 절 참조.
   */
  it.skip("instance 변경 중 늦게 도착한 이전 GPU 옵션 응답은 무시된다 (CDX-R3-05 경합)", async () => {
    // gpu 라벨 요청을 수동 resolver로 붙잡아 응답 순서를 뒤집는다(타이머 없이 결정적).
    const gpuResolvers: Array<(vals: string[]) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const u = new URL(url, "http://localhost");
        if (u.pathname.includes("/label/") && u.pathname.includes("/gpu/")) {
          return new Promise((resolve) => {
            gpuResolvers.push((vals) =>
              resolve({ ok: true, json: () => Promise.resolve({ status: "success", data: vals }) }));
          });
        }
        if (u.pathname.includes("/label/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: "success", data: ["gpu-server-01", "gpu-server-02"] }),
          });
        }
        const rt = u.pathname.includes("/query_range") ? "matrix" : "vector";
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "success", data: { resultType: rt, result: [] } }),
        });
      }),
    );

    render(<App />);
    // 초기 GPU 옵션 로드(call#0) → ["0","1"]
    await waitFor(() => expect(gpuResolvers).toHaveLength(1));
    await act(async () => {
      gpuResolvers[0](["0", "1"]);
      await Promise.resolve();
    });
    await waitFor(() => screen.getByRole("checkbox", { name: "0" }));

    // server-01 선택 → GPU 효과 재실행(call#1, pending)
    act(() => toggleOption("인스턴스(서버)", "gpu-server-01"));
    await waitFor(() => expect(gpuResolvers).toHaveLength(2));

    // server-02 추가 → 이전(call#1) abort, call#2(pending)
    act(() => toggleOption("인스턴스(서버)", "gpu-server-02"));
    await waitFor(() => expect(gpuResolvers).toHaveLength(3));

    // 최신(call#2) 먼저 도착 → ["2","3"]
    await act(async () => {
      gpuResolvers[2](["2", "3"]);
      await Promise.resolve();
    });
    await waitFor(() => screen.getByRole("checkbox", { name: "2" }));

    // 뒤늦게 stale(call#1) 도착 → ["9"] : abort 세대 가드가 있으면 무시된다
    await act(async () => {
      gpuResolvers[1](["9"]);
      await Promise.resolve();
    });

    const group = within(screen.getByRole("group", { name: "GPU" }));
    expect(group.queryByRole("checkbox", { name: "9" })).toBeNull(); // stale 무시
    expect(group.getByRole("checkbox", { name: "2" })).toBeInTheDocument();
  });

  it("URL에 저장된 다중 GPU 선택이 화면에 복원된다", async () => {
    installFetchMock();
    history.replaceState(null, "", "/?gpu=0,2");
    render(<App />);
    await waitFor(() => {
      const group = within(screen.getByRole("group", { name: "GPU" }));
      expect(group.getByRole("checkbox", { name: "0" })).toBeChecked();
      expect(group.getByRole("checkbox", { name: "2" })).toBeChecked();
      expect(group.getByRole("checkbox", { name: "1" })).not.toBeChecked();
    });
  });

  it("시간 범위·자동 갱신을 바꾸면 URL이 갱신된다", async () => {
    installFetchMock();
    render(<App />);
    act(() => {
      fireEvent.change(screen.getByLabelText("시간 범위"), { target: { value: "3600" } });
    });
    await waitFor(() => expect(location.search).toContain("range=3600"));
    act(() => {
      fireEvent.change(screen.getByLabelText("자동 갱신"), { target: { value: "10" } });
    });
    await waitFor(() => expect(location.search).toContain("refresh=10"));
  });
});

describe("App 통합 — R6 인스턴스 중심 뷰", () => {
  it("기본(All) 화면의 패널 제목은 '(인스턴스: All)' 접미사를 단다", () => {
    installFetchMock();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "실행 중인 SQream DB 쿼리 (인스턴스: All)" }),
    ).toBeInTheDocument();
    // R7: 시계열은 Grafana 표기 독립 카드 4개 — 접미사 없음
    expect(screen.getByRole("heading", { name: "GPU사용률(%)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "전력사용량(W)" })).toBeInTheDocument();
  });

  it("사이드바 카드 클릭 → 단일 선택 접미사·URL 갱신, 재클릭 → All 복귀", async () => {
    installFetchMock();
    render(<App />);
    const bar = () => within(screen.getByRole("complementary", { name: "사이드바" }));
    await waitFor(() => bar().getByRole("button", { name: /icspreamh2gpu01/ }));

    act(() => {
      fireEvent.click(bar().getByRole("button", { name: /icspreamh2gpu01/ }));
    });
    await waitFor(() => expect(location.search).toContain("instance=gpu-server-01"));
    expect(
      screen.getByRole("heading", { name: /실행 중인 SQream DB 쿼리 \(선택 인스턴스: icspreamh2gpu01\)/ }),
    ).toBeInTheDocument();
    expect(bar().getByRole("button", { name: /icspreamh2gpu01/ })).toHaveAttribute("aria-pressed", "true");

    act(() => {
      fireEvent.click(bar().getByRole("button", { name: /icspreamh2gpu01/ }));
    });
    await waitFor(() => expect(location.search).not.toContain("instance="));
    expect(
      screen.getByRole("heading", { name: "실행 중인 SQream DB 쿼리 (인스턴스: All)" }),
    ).toBeInTheDocument();
  });

  it("RangeDetail ×는 선택이 없으면 비활성이다", () => {
    installFetchMock();
    render(<App />);
    expect(screen.getByRole("button", { name: "선택 구간 해제" })).toBeDisabled();
  });

  it("R7: '전체 구간(30분)으로 리셋'은 시간범위만 되돌린다 (필터 유지)", async () => {
    installFetchMock();
    render(<App />);
    act(() => {
      fireEvent.change(screen.getByLabelText("시간 범위"), { target: { value: "3600" } });
    });
    await waitFor(() => expect(location.search).toContain("range=3600"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "전체 구간(30분)으로 리셋" }));
    });
    await waitFor(() => expect(location.search).not.toContain("range="));
  });

  it("R7: '구간·필터 모두 초기화'는 전체 초기 상태로 되돌린다", async () => {
    installFetchMock();
    render(<App />);
    const bar = () => within(screen.getByRole("complementary", { name: "사이드바" }));
    await waitFor(() => bar().getByRole("button", { name: /icspreamh2gpu01/ }));
    act(() => {
      fireEvent.click(bar().getByRole("button", { name: /icspreamh2gpu01/ }));
    });
    await waitFor(() => expect(location.search).toContain("instance=gpu-server-01"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "구간·필터 모두 초기화" }));
    });
    await waitFor(() => expect(location.search).toBe(""));
  });
});
