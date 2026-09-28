// @vitest-environment jsdom
/** L3 — GPU/LLM 화면: 라우팅·조인·테이블·타임라인 카탈로그 검증. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import App from "../src/App";
import { LLM_CATALOG } from "../src/api/queries";
import { buildLlmProcesses, buildLlmServices } from "../src/hooks/useLlmData";
import { LLM_TIMELINE_CATALOG, useLlmCharts } from "../src/hooks/useLlmCharts";
import { useLlmRangeDetail } from "../src/hooks/useLlmRangeDetail";
import { hashForRoute, routeFromHash, useRoute } from "../src/hooks/useRoute";
import { formatTps } from "../src/lib/format";

const NOW = Math.floor(Date.now() / 1000);

/** LLM 화면용 Prometheus fetch 목 — 쿼리 문자열 패턴으로 응답을 고른다. */
function installLlmFetchMock() {
  const svc = (service: string, model: string, engine: string, gpu: string, tps: string) => ({
    metric: { service, model, engine, node: "gpu-server-01", gpu },
    value: [NOW, tps] as [number, string],
  });
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
    if (u.pathname.includes("/query_range")) {
      const expr = u.searchParams.get("query") ?? "";
      const result = expr.includes("llm_gpu_timeline_state")
        ? [
            { metric: { node: "gpu-server-01", gpu: "0" },
              values: [[NOW - 120, "1"], [NOW - 60, "1"], [NOW, "5"]] },
            { metric: { node: "gpu-server-01", gpu: "1" },
              values: [[NOW - 120, "2"], [NOW - 60, "0"], [NOW, "2"]] },
          ]
        : [];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "success", data: { resultType: "matrix", result } }),
      });
    }
    const expr = u.searchParams.get("query") ?? "";
    const result = expr.startsWith("max by(node, gpu, pid, proc_name, os_user)")
      ? [
          { metric: { node: "gpu-server-01", gpu: "0", pid: "2420041",
                      proc_name: "python (vLLM)", os_user: "user1" }, value: [NOW, "1"] },
          { metric: { node: "gpu-server-01", gpu: "1", pid: "2421202",
                      proc_name: "python (trainer.py)", os_user: "user3" }, value: [NOW, "1"] },
        ]
      : expr.startsWith("max by(pid) (llm_process_memory_bytes)")
        ? [{ metric: { pid: "2420041" }, value: [NOW, "22300000000"] },
           { metric: { pid: "2421202" }, value: [NOW, "31800000000"] }]
      : expr.startsWith("max by(pid) (llm_process_gpu_percent)")
        ? [{ metric: { pid: "2420041" }, value: [NOW, "68"] },
           { metric: { pid: "2421202" }, value: [NOW, "82"] }]
      : expr.startsWith("max by(pid) (llm_process_cpu_percent)")
        ? [{ metric: { pid: "2420041" }, value: [NOW, "145"] },
           { metric: { pid: "2421202" }, value: [NOW, "210"] }]
      : expr.startsWith("max by(pid) (llm_process_start_time_seconds)")
        ? [{ metric: { pid: "2420041" }, value: [NOW, String(NOW - 300)] },
           { metric: { pid: "2421202" }, value: [NOW, String(NOW - 120)] }]
      : expr.startsWith("max by(service, model, engine, node, gpu)")
        ? [svc("ChatBot-Service", "Llama-3.1-70B", "vLLM", "0", "185.4"),
           svc("CodeGen-Service", "CodeLlama-34B", "vLLM", "1", "112.7"),
           svc("RAG-QA-Service", "Mistral-7B", "vLLM", "2", "96.3"),
           svc("Summarization-Service", "Qwen-14B", "TensorRT-LLM", "3", "0")]
      : expr.startsWith("max by(service) (llm_service_p95_seconds")
        ? [{ metric: { service: "ChatBot-Service" }, value: [NOW, "1.28"] },
           { metric: { service: "CodeGen-Service" }, value: [NOW, "1.05"] },
           { metric: { service: "RAG-QA-Service" }, value: [NOW, "0.92"] },
           { metric: { service: "Summarization-Service" }, value: [NOW, "0.88"] }]
      : expr.startsWith("max by(service) (llm_service_state")
        ? [{ metric: { service: "ChatBot-Service" }, value: [NOW, "1"] },
           { metric: { service: "CodeGen-Service" }, value: [NOW, "1"] },
           { metric: { service: "RAG-QA-Service" }, value: [NOW, "1"] },
           { metric: { service: "Summarization-Service" }, value: [NOW, "2"] }]
      : expr.startsWith("count(count by(gpu)")
        ? [{ metric: {}, value: [NOW, "4"] }]
      : expr.startsWith("count(max by(env, node, gpu") // llmServerStatus.gpuBusy (합집합, 2026-08-10)
        ? [{ metric: {}, value: [NOW, "3"] }]
        : [{ metric: {}, value: [NOW, "60"] }];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result } }),
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRoute — 해시 라우팅 (의존성 무추가)", () => {
  it("해시를 라우트로 판별한다", () => {
    expect(routeFromHash("")).toBe("gpu");
    expect(routeFromHash("#/llm")).toBe("llm");
    expect(routeFromHash("#llm")).toBe("llm");
    expect(routeFromHash("#/unknown")).toBe("gpu");
    expect(hashForRoute("llm")).toBe("#/llm");
    expect(hashForRoute("gpu")).toBe("");
  });

  it("hashchange를 반영하고 navigate가 해시를 바꾼다", async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current.route).toBe("gpu");
    act(() => {
      result.current.navigate("llm");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(result.current.route).toBe("llm"));
    expect(location.hash).toBe("#/llm");
    act(() => result.current.navigate("gpu"));
    await waitFor(() => expect(result.current.route).toBe("gpu"));
    expect(location.hash).toBe(""); // '#' 잔재 없이 제거
  });
});

describe("LLM 조인·카탈로그 (단위)", () => {
  it("buildLlmProcesses — pid 조인 + GPU사용률 내림차순", () => {
    const s = (metric: Record<string, string>, v: string) => ({ metric, value: [NOW, v] as [number, string] });
    const rows = buildLlmProcesses({
      identity: [
        s({ node: "gpu-server-01", gpu: "0", pid: "p1", proc_name: "python (vLLM)", os_user: "user1" }, "1"),
        s({ node: "gpu-server-01", gpu: "1", pid: "p2", proc_name: "python (trainer.py)", os_user: "user3" }, "1"),
      ],
      memory: [s({ pid: "p1" }, "22300000000")],
      gpuPct: [s({ pid: "p1" }, "68"), s({ pid: "p2" }, "82")],
      cpuPct: [s({ pid: "p2" }, "210")],
      startTime: [],
    });
    expect(rows.map((r) => r.pid)).toEqual(["p2", "p1"]); // 82% > 68%
    expect(rows[1].memoryBytes).toBe(22300000000);
    expect(rows[0].cpuPct).toBe(210); // CPU는 100 초과 가능
    expect(Number.isNaN(rows[0].memoryBytes)).toBe(true); // 결측은 NaN
  });

  it("buildLlmServices — service 조인 + TPS 내림차순", () => {
    const s = (metric: Record<string, string>, v: string) => ({ metric, value: [NOW, v] as [number, string] });
    const rows = buildLlmServices({
      tps: [
        s({ service: "A", model: "m1", engine: "vLLM", node: "gpu-server-01", gpu: "0" }, "10"),
        s({ service: "B", model: "m2", engine: "vLLM", node: "gpu-server-01", gpu: "1" }, "99"),
      ],
      p95: [s({ service: "A" }, "1.1")],
      state: [s({ service: "B" }, "1")],
    });
    expect(rows.map((r) => r.service)).toEqual(["B", "A"]);
    expect(rows[1].p95Seconds).toBe(1.1);
    expect(rows[0].state).toBe(1);
  });

  it("정렬 동률은 이름으로 tie-break한다 (프로세스=pid, 서비스=service)", () => {
    const s = (metric: Record<string, string>, v: string) => ({ metric, value: [NOW, v] as [number, string] });
    const procs = buildLlmProcesses({
      identity: [
        s({ node: "n", gpu: "0", pid: "pB", proc_name: "x", os_user: "u" }, "1"),
        s({ node: "n", gpu: "1", pid: "pA", proc_name: "y", os_user: "u" }, "1"),
      ],
      memory: [],
      gpuPct: [s({ pid: "pA" }, "50"), s({ pid: "pB" }, "50")],
      cpuPct: [],
      startTime: [],
    });
    expect(procs.map((r) => r.pid)).toEqual(["pA", "pB"]);
    const svcs = buildLlmServices({
      tps: [
        s({ service: "S2", model: "m", engine: "e", node: "n", gpu: "0" }, "50"),
        s({ service: "S1", model: "m", engine: "e", node: "n", gpu: "1" }, "50"),
      ],
      p95: [],
      state: [],
    });
    expect(svcs.map((r) => r.service)).toEqual(["S1", "S2"]);
  });

  it("LLM 타임라인 카탈로그 — 8종 라벨·분류가 계약 카탈로그와 일치한다", () => {
    expect(Object.keys(LLM_TIMELINE_CATALOG)).toHaveLength(8);
    for (const [idx, w] of Object.entries(LLM_CATALOG)) {
      expect(LLM_TIMELINE_CATALOG[Number(idx)]).toEqual({
        name: w.label,
        type: w.category,
        database: "",
      });
    }
  });

  it("formatTps — 시안 표기", () => {
    expect(formatTps(185.42)).toBe("185.4 tok/s");
    expect(formatTps(Number.NaN)).toBe("-");
  });
});

describe("useLlmCharts / useLlmRangeDetail (훅 단위)", () => {
  const filters = { env: "production", instances: [], gpus: [], migs: [] };

  function installChartsFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const u = new URL(url, "http://localhost");
        const expr = u.searchParams.get("query") ?? "";
        if (u.pathname.includes("/query_range")) {
          const result = expr.includes("llm_gpu_timeline_state")
            ? [
                { metric: { node: "gpu-server-01", gpu: "0" },
                  values: [[100, "1"], [110, "1"], [120, "5"]] },
                { metric: { node: "gpu-server-01", gpu: "1" },
                  values: [[100, "0"], [110, "2"]] },
              ]
            : expr.includes("by(node, gpu)")
              ? [
                  { metric: { node: "gpu-server-01", gpu: "0" }, values: [[100, "40"], [110, "55"]] },
                  { metric: { node: "gpu-server-01", gpu: "1" }, values: [[100, "30"], [110, "35"]] },
                ]
              : [
                  // All 뷰 노드 평균 — avg by(node) 응답은 node 라벨만 남는다
                  { metric: { node: "gpu-server-01" }, values: [[100, "40"], [110, "55"]] },
                  { metric: { node: "gpu-server-02" }, values: [[100, "20"], [110, "25"]] },
                  { metric: { node: "gpu-server-03" }, values: [[100, "10"], [110, "15"]] },
                ];
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: "success", data: { resultType: "matrix", result } }),
          });
        }
        const result = expr.includes("proc_name")
          ? [{ metric: { pid: "p1", proc_name: "python (vLLM)" }, value: [1, "1"] },
             { metric: { pid: "p2", proc_name: "python (trainer.py)" }, value: [1, "1"] }]
          : expr.includes("by(model)")
            ? [{ metric: { model: "Llama-3.1-70B" }, value: [1, "1"] }]
            : expr.includes("by(node, gpu)")
              ? [{ metric: { node: "gpu-server-01", gpu: "0" }, value: [1, "1"] }]
              : [{ metric: {}, value: [1, "192.7"] }];
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result } }),
        });
      }),
    );
  }

  it("All 뷰는 노드 평균 3선, 단일 인스턴스는 GPU-0 표기 (GPU/SQream 화면과 동일 규칙)", async () => {
    installChartsFetch();
    const { result } = renderHook(() => useLlmCharts(filters, 1800, 0));
    await waitFor(() => expect(result.current.data.series.utilization.lines.length).toBeGreaterThan(0));
    const util = result.current.data.series.utilization;
    expect(util.lines.map((l) => l.label)).toEqual([
      "icspreamh2gpu01",
      "icspreamh2gpu02",
      "icspreamh2gpu03",
    ]);
    // 색 키는 노드명(노드 팔레트) — GPU 번호가 아니다
    expect(util.lines.map((l) => l.colorKey)).toEqual([
      "gpu-server-01",
      "gpu-server-02",
      "gpu-server-03",
    ]);
    // 타임라인은 All 뷰에도 GPU 단위 그대로: GPU-0은 1→5 두 세그먼트, LLM 카탈로그 이름
    const rows = result.current.data.timelineRows;
    expect(rows).toHaveLength(2);
    expect(rows[0].segments.map((s) => s.name)).toEqual(["vLLM (Llama-3.1-70B)", "trainer.py"]);
    expect(rows[0].segments.map((s) => s.type)).toEqual(["vllm", "train"]);

    const single = { ...filters, instances: ["gpu-server-01"] };
    const { result: r2 } = renderHook(() => useLlmCharts(single, 1800, 0));
    await waitFor(() => expect(r2.current.data.series.utilization.lines.length).toBeGreaterThan(0));
    const util2 = r2.current.data.series.utilization;
    expect(util2.lines.map((l) => l.label)).toEqual(["GPU-0", "GPU-1"]);
    expect(util2.lines.map((l) => l.colorKey)).toEqual(["0", "1"]);
  });

  it("선택 구간 상세 — 프로세스명·모델 목록과 집계를 만든다", async () => {
    installChartsFetch();
    const sel = { startMs: 1_000_000, endMs: 1_600_000 };
    const { result } = renderHook(() => useLlmRangeDetail(filters, 1800, sel, 0));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const d = result.current.detail!;
    expect(d.startMs).toBe(sel.startMs);
    expect(d.endMs).toBe(sel.endMs);
    expect(d.gpuCount).toBe(1);
    expect(d.procNames).toEqual(["python (trainer.py)", "python (vLLM)"]); // 정렬됨
    expect(d.models).toEqual(["Llama-3.1-70B"]);
    expect(d.tps).toBe(192.7);
  });

  it("선택이 없으면 전체 범위 기준으로 구간을 잡는다", async () => {
    installChartsFetch();
    const { result } = renderHook(() => useLlmRangeDetail(filters, 1800, null, 0));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const d = result.current.detail!;
    expect(d.endMs - d.startMs).toBe(1800 * 1000);
  });
});

describe("GPU/LLM 화면 통합 (#/llm)", () => {
  it("해시 라우트로 LLM 화면을 렌더하고 서버 3·GPU 4·MIG 8 필터를 제공한다", async () => {
    installLlmFetchMock();
    history.replaceState(null, "", "/#/llm");
    render(<App />);

    expect(screen.getByText("GPU/LLM Monitoring Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /실행 중인 프로세스/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /LLM \/ AI 서비스 정보/ })).toBeInTheDocument();

    const instanceGroup = within(screen.getByRole("group", { name: "Node(서버)" }));
    const gpuGroup = within(screen.getByRole("group", { name: "GPU" }));
    const migGroup = within(screen.getByRole("group", { name: "Worker" }));
    expect(instanceGroup.getAllByRole("checkbox")).toHaveLength(4); // All + 서버 3
    expect(gpuGroup.getAllByRole("checkbox")).toHaveLength(5); // All + GPU 4
    expect(migGroup.getAllByRole("checkbox")).toHaveLength(25); // All + MIG 8

    // ⑦ 프로세스 표 (pid 조인)
    await waitFor(() => expect(screen.getByText("2420041")).toBeInTheDocument());
    expect(screen.getAllByText("python (vLLM)").length).toBeGreaterThanOrEqual(1);
    // ⑧ 서비스 표 — RUNNING/STARTING 배지
    expect(screen.getByText("ChatBot-Service")).toBeInTheDocument();
    expect(screen.getAllByText("RUNNING")).toHaveLength(3);
    expect(screen.getByText("STARTING")).toBeInTheDocument();

    // 사이드바 — GPU 단위 표기 + 현재 화면 강조
    const bar = within(screen.getByRole("complementary", { name: "사이드바" }));
    await waitFor(() => {
      const card = bar.getByText("icspreamh2gpu01").closest(".server-card") as HTMLElement;
      expect(within(card).getByText(/3\s*\/\s*4/)).toBeInTheDocument();
      expect(within(card).getByText(/GPU 사용 중/)).toBeInTheDocument();
    });
    // 라벨은 <span>이고 aria-current는 그 부모(role=button)에 있다 — 사이드바 개편(접기 토글) 이후 구조
    expect(
      bar.getByText("GPU/LLM 모니터링").closest("[role=button]")?.getAttribute("aria-current"),
    ).toBe("page");

    // 타임라인 범례 — 시안 6분류
    const legend = screen.getByLabelText("워크로드 분류 범례");
    for (const label of ["vLLM 추론", "학습/미세조정", "데이터 처리", "RAG 서비스", "TensorRT-LLM", "기타"]) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
  });

  it("사이드바 메뉴로 두 화면을 오간다 (GPU ↔ LLM)", async () => {
    installLlmFetchMock();
    render(<App />);
    // 기본 = GPU 화면. 표식은 상단바 — LLM 화면에는 상단바가 없다(적용 범위: 탑뷰만).
    expect(screen.getByText(/CLUSTER STATUS/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("GPU/LLM 모니터링"));
    expect(location.hash).toBe("#/llm");
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() =>
      expect(screen.getByText("GPU/LLM Monitoring Dashboard")).toBeInTheDocument());

    fireEvent.click(screen.getByText("GPU 모니터링"));
    await waitFor(() =>
      expect(screen.getByText(/CLUSTER STATUS/)).toBeInTheDocument());
    expect(location.hash).toBe("");
  });

  it("LLM 화면에서 필터를 바꿔도 해시가 유지된다 (RL-2 회귀)", async () => {
    installLlmFetchMock();
    history.replaceState(null, "", "/#/llm");
    render(<App />);
    act(() => {
      fireEvent.change(screen.getByLabelText("시간 범위"), { target: { value: "3600" } });
    });
    await waitFor(() => expect(location.search).toContain("range=3600"));
    expect(location.hash).toBe("#/llm");
  });

  it("리셋 링크 2종이 LLM 화면에서도 동작한다", async () => {
    installLlmFetchMock();
    history.replaceState(null, "", "/#/llm");
    render(<App />);
    act(() => {
      fireEvent.change(screen.getByLabelText("시간 범위"), { target: { value: "3600" } });
    });
    await waitFor(() => expect(location.search).toContain("range=3600"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "전체 구간(30분)으로 리셋" }));
    });
    await waitFor(() => expect(location.search).not.toContain("range="));
    act(() => {
      fireEvent.change(screen.getByLabelText("자동 갱신"), { target: { value: "10" } });
    });
    await waitFor(() => expect(location.search).toContain("refresh=10"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "구간·필터 모두 초기화" }));
    });
    await waitFor(() => expect(location.search).toBe(""));
    expect(location.hash).toBe("#/llm"); // 리셋은 화면 라우트를 바꾸지 않는다
  });

  it("연속 실패 3회면 LLM 화면도 연결 배너를 띄운다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 503 })),
    );
    history.replaceState(null, "", "/#/llm");
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
});
