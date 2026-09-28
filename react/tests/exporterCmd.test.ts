/*
 * X6 — exporter 명령 API 클라이언트 검증.
 *
 * 잠그는 것: ① 주소 규칙(agentUrl과 동일 — env 우선, 아니면 현재 호스트의 :9090,
 * 번들 하드코딩 금지), ② 오류 분류(http/네트워크/타임아웃 — 404는 status 보존,
 * "이미 종료" 문구 분기가 이것에 달렸다), ③ stmt_id URL 인코딩.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExporterCmdError, exporterBaseUrl, killStatement, removeLock,
} from "../src/api/exporterCmd";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("exporterBaseUrl", () => {
  it("VITE_EXPORTER_URL이 있으면 그것을 쓴다 (끝 슬래시는 뗀다)", () => {
    vi.stubEnv("VITE_EXPORTER_URL", "http://10.0.0.5:9090//");
    expect(exporterBaseUrl()).toBe("http://10.0.0.5:9090");
  });

  it("빈 값은 미설정으로 본다", () => {
    vi.stubEnv("VITE_EXPORTER_URL", "   ");
    expect(exporterBaseUrl()).toBe(`http://${location.hostname}:9090`);
  });

  it("미설정이면 **앱이 떠 있는 호스트의 :9090** — 하드코딩이 아니다", () => {
    expect(exporterBaseUrl()).toBe(`http://${location.hostname}:9090`);
  });
});

describe("killStatement", () => {
  it("POST JSON을 보내고 2xx면 조용히 끝난다", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await killStatement("100137", "운영 승인 티켓 #1234");

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://${location.hostname}:9090/api/v1/statements/100137/kill`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "운영 승인 티켓 #1234" });
  });

  it("HTTP 오류는 kind=http에 status를 보존한다 — 404는 '이미 종료' 분기용", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    await expect(killStatement("1", "r")).rejects.toMatchObject({
      name: "ExporterCmdError", kind: "http", status: 404,
    });
  });

  it("네트워크 실패는 kind=network다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const err = await killStatement("1", "r").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExporterCmdError);
    expect((err as ExporterCmdError).kind).toBe("network");
  });

  it("4초를 넘기면 kind=timeout이다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")));
      })));

    const outcome = killStatement("1", "r").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(4001);
    const err = await outcome;
    expect(err).toBeInstanceOf(ExporterCmdError);
    expect((err as ExporterCmdError).kind).toBe("timeout");
  });

  it("stmt_id를 URL 인코딩한다 — 경로 밖으로 새면 안 된다", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await killStatement("a/b?c", "r");
    expect((fetchSpy.mock.calls[0] as unknown as [string])[0])
      .toContain("/statements/a%2Fb%3Fc/kill");
  });

  it("세대 토큰(startTime)을 body에 싣는다 — 재사용된 stmt_id 오살 방지 (X6-R1)", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await killStatement("1", "r", 1787000000.5);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ reason: "r", start_time: 1787000000.5 });
  });

  it("startTime이 NaN이면(메트릭 결측) 토큰 없이 보낸다 — NaN을 JSON에 싣지 않는다", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await killStatement("1", "r", NaN);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ reason: "r" });
  });
});

/* shutdownWorker 테스트는 X15에서 함수와 함께 삭제 — Graceful Shutdown UI
   폐기(자동 기동 스크립트 모델, codex X15-02). exporter API는 존치. */
describe("removeLock (X11)", () => {
  it("removeLock은 락 경로로 POST한다 — orphaned lock 해제", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await removeLock("LOCK-100137", "잔존 락 정리");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://${location.hostname}:9090/api/v1/locks/LOCK-100137/remove`);
    expect(JSON.parse(init.body as string)).toEqual({ reason: "잔존 락 정리" });
  });

  it("409 본문의 error 문구를 detail로 보존한다 — 절차 위반 사유를 UI가 그대로 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false, status: 409,
      json: () => Promise.resolve({ ok: false, error: "stop running statement first" }),
    })));
    const err = await removeLock("LOCK-1", "r").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExporterCmdError);
    expect(err).toMatchObject({
      kind: "http", status: 409, detail: "stop running statement first",
    });
    expect((err as ExporterCmdError).message).toContain("stop running statement first");
  });

  it("오류 본문이 JSON이 아니어도(또는 json 미구현) 상태 코드로 실패를 보존한다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    const err = await removeLock("LOCK-1", "r").catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "http", status: 404 });
    expect((err as ExporterCmdError).detail).toBeUndefined();
  });
});
