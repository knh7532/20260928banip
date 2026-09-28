/** Prometheus 클라이언트 — 성공/HTTP 오류/타임아웃/취소/비정상 응답 처리. */
import { afterEach, beforeEach, vi } from "vitest";

import {
  PromAbortError,
  PromError,
  promBaseUrl,
  promLabelValues,
  promQuery,
  promQueryRange,
  resolveStep,
  scalarOf,
} from "../src/api/prom";

const okBody = (result: unknown) => ({
  ok: true,
  json: () => Promise.resolve({ status: "success", data: { result } }),
});

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("promBaseUrl", () => {
  it("환경변수가 없으면 현재 호스트의 :3002을 쓴다 (하드코딩 없음)", () => {
    // ⚠️ 빈 문자열로 명시 스텁 — 개발 PC의 web/.env(VITE_PROM_URL)가 vitest에도
    //    로드되므로, 스텁 없이는 기본 분기가 실행되지 않은 채 통과하는 가짜
    //    green이 된다(실사고: "/prometheus" 표류를 이 테스트가 못 잡았다).
    vi.stubEnv("VITE_PROM_URL", "");
    expect(promBaseUrl()).toBe(`http://${location.hostname}:3002`);
  });

  it("VITE_PROM_URL이 있으면 그것을 쓰고 끝의 슬래시를 정리한다", () => {
    vi.stubEnv("VITE_PROM_URL", "http://192.168.0.10:3002/");
    expect(promBaseUrl()).toBe("http://192.168.0.10:3002");
  });

  it("런타임 설정(window.__TVM_CONFIG__)이 빌드 값보다 우선한다", () => {
    vi.stubEnv("VITE_PROM_URL", "http://build-time:3002");
    (window as { __TVM_CONFIG__?: object }).__TVM_CONFIG__ = { promUrl: "http://runtime:9191/" };
    try {
      expect(promBaseUrl()).toBe("http://runtime:9191");
    } finally {
      delete (window as { __TVM_CONFIG__?: object }).__TVM_CONFIG__;
    }
  });
});

describe("promQuery (instant)", () => {
  it("결과 배열을 반환한다", async () => {
    const series = [{ metric: { node: "gpu-server-01" }, value: [1, "42"] }];
    const spy = mockFetch(() => okBody(series));
    await expect(promQuery('up{job="x"}')).resolves.toEqual(series);
    const url = spy.mock.calls[0][0];
    expect(url).toContain("/api/v1/query?query=");
    expect(url).toContain(encodeURIComponent('up{job="x"}'));
  });

  it("HTTP 오류를 PromError(http)로 변환한다", async () => {
    mockFetch(() => ({ ok: false, status: 503 }));
    await expect(promQuery("up")).rejects.toMatchObject({ kind: "http" });
  });

  it("status != success를 PromError(status)로 변환한다", async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ status: "error", error: "parse error" }),
    }));
    await expect(promQuery("bad(((")).rejects.toMatchObject({ kind: "status" });
  });

  it("네트워크 오류를 PromError(network)로 변환한다", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(promQuery("up")).rejects.toBeInstanceOf(PromError);
  });

  it("응답이 늦으면 타임아웃으로 끊는다", async () => {
    vi.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const p = promQuery("up");
    const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(4001);
    await assertion;
  });

});

describe("promQueryRange", () => {
  it("start/end/step을 계산해 붙인다 (step은 최소 5초)", async () => {
    const spy = mockFetch(() => okBody([]));
    await promQueryRange("up", 1800, { endMs: 1_800_000_000_000 });
    const url = spy.mock.calls[0][0];
    expect(url).toContain("/api/v1/query_range?");
    expect(url).toContain("end=1800000000");
    expect(url).toContain("start=1799998200"); // 1800초 전
    expect(url).toContain("step=30"); // 1800/60
  });

  it("아주 짧은 구간에서도 step이 5초 아래로 내려가지 않는다", async () => {
    const spy = mockFetch(() => okBody([]));
    await promQueryRange("up", 60, { endMs: 1_800_000_000_000 });
    expect(spy.mock.calls[0][0]).toContain("step=5");
  });

  it("비정상 구간 값을 거부한다 (NaN이 URL에 실리지 않도록)", async () => {
    const spy = mockFetch(() => okBody([]));
    await expect(promQueryRange("up", Number.NaN)).rejects.toMatchObject({ kind: "input" });
    await expect(promQueryRange("up", -1)).rejects.toMatchObject({ kind: "input" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("promQuery — 평가 시각 (브러시 구간의 끝에서 상태를 본다)", () => {
  it("atMs를 주면 time 파라미터를 붙인다", async () => {
    const spy = mockFetch(() => okBody([]));
    await promQuery("up", undefined, 1_800_000_000_000);
    expect(spy.mock.calls[0][0]).toContain("&time=1800000000");
  });

  it("비정상 시각은 거부한다", async () => {
    const spy = mockFetch(() => okBody([]));
    await expect(promQuery("up", undefined, Number.NaN)).rejects.toMatchObject({ kind: "input" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("step 계산 (짧은 세그먼트를 놓치지 않도록)", () => {
  it("기본은 목표 포인트 수로 계산하되 최소 5초", () => {
    expect(resolveStep(1800)).toBe(30);
    expect(resolveStep(60)).toBe(5);
  });

  it("maxStepSec을 주면 그 이하로 제한한다 (타임라인용)", () => {
    expect(resolveStep(6 * 3600, { maxStepSec: 15 })).toBe(15);
    expect(resolveStep(1800, { maxStepSec: 15 })).toBe(15);
  });

  it("stepSec을 직접 지정할 수 있다", () => {
    expect(resolveStep(1800, { stepSec: 10 })).toBe(10);
  });

  it("promQueryRange가 잘못된 step을 거부한다", async () => {
    const spy = mockFetch(() => okBody([]));
    await expect(promQueryRange("up", 1800, { stepSec: 0 })).rejects.toMatchObject({
      kind: "input",
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("응답 형태 검증", () => {
  it("result가 배열이 아니면 malformed", async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: { result: "nope" } }),
    }));
    await expect(promQuery("up")).rejects.toMatchObject({ kind: "malformed" });
  });

  it("instant 응답에 value가 없으면 malformed", async () => {
    mockFetch(() => ({
      ok: true,
      json: () =>
        Promise.resolve({ status: "success", data: { resultType: "vector", result: [{ metric: {} }] } }),
    }));
    await expect(promQuery("up")).rejects.toMatchObject({ kind: "malformed" });
  });

  it("resultType이 기대와 다르면 malformed (instant에 matrix가 오는 경우)", async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: { resultType: "matrix", result: [] } }),
    }));
    await expect(promQuery("up")).rejects.toMatchObject({ kind: "malformed" });
  });
});

describe("취소 vs 타임아웃 구분", () => {
  it("이미 취소된 신호로 부르면 요청을 만들지 않는다", async () => {
    const spy = mockFetch(() => okBody([]));
    const controller = new AbortController();
    controller.abort();
    await expect(promQuery("up", controller.signal)).rejects.toBeInstanceOf(PromAbortError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("호출자 취소는 PromAbortError (실패로 세지 않도록)", async () => {
    const controller = new AbortController();
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const p = promQuery("up", controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(PromAbortError);
  });
});

describe("promLabelValues", () => {
  it("정렬된 라벨 값을 반환한다", async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: ["gpu-server-02", "gpu-server-01"] }),
    }));
    await expect(promLabelValues("node", "DCGM_FI_DEV_GPU_UTIL")).resolves.toEqual([
      "gpu-server-01",
      "gpu-server-02",
    ]);
  });

  it("HTTP 오류를 PromError로 변환한다", async () => {
    mockFetch(() => ({ ok: false, status: 500 }));
    await expect(promLabelValues("node", "x")).rejects.toMatchObject({ kind: "http" });
  });

  it("data가 배열이 아니면 malformed", async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve({ status: "success", data: 42 }) }));
    await expect(promLabelValues("node", "x")).rejects.toMatchObject({ kind: "malformed" });
  });

  it("문자열이 아닌 값은 걸러낸다", async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ status: "success", data: ["b", 3, "a", null] }),
    }));
    await expect(promLabelValues("node", "x")).resolves.toEqual(["a", "b"]);
  });

  it("이미 취소된 신호면 요청하지 않는다", async () => {
    const spy = mockFetch(() => ({ ok: true, json: () => Promise.resolve({ status: "success", data: [] }) }));
    const c = new AbortController();
    c.abort();
    await expect(promLabelValues("node", "x", c.signal)).rejects.toBeInstanceOf(PromAbortError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("응답이 늦으면 타임아웃으로 끊는다", async () => {
    vi.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const p = promLabelValues("node", "x");
    const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(4001);
    await assertion;
  });

  it("네트워크 오류를 PromError로 변환한다", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(promLabelValues("node", "x")).rejects.toMatchObject({ kind: "network" });
  });
});

describe("scalarOf", () => {
  it("첫 값을 숫자로 뽑는다", () => {
    expect(scalarOf([{ metric: {}, value: [1, "72.5"] }])).toBe(72.5);
  });

  it("결과가 없거나 숫자가 아니면 fallback", () => {
    expect(scalarOf([], 7)).toBe(7);
    expect(scalarOf([{ metric: {}, value: [1, "NaN"] }], -1)).toBe(-1);
  });
});
