/** 런타임 주입 설정 — 우선순위(런타임 > VITE_ 빌드 > 기본값)와 방어 검사.
 *  web-serve 가 기동 시 dist/runtime-config.js 를 재생성하므로, 주소 변경은
 *  재빌드 없이 재기동으로 반영된다(ADR R-0004 보강 2026-08-27). */
import { afterEach, describe, expect, it, vi } from "vitest";

import { exporterBaseUrl } from "../src/api/exporterCmd";
import { agentUrl } from "../src/components/agentUrl";
import { runtimeOverride } from "../src/runtimeConfig";

type Win = { __TVM_CONFIG__?: Record<string, unknown> };
const setCfg = (cfg: Record<string, unknown> | undefined) => {
  if (cfg === undefined) delete (window as Win).__TVM_CONFIG__;
  else (window as Win).__TVM_CONFIG__ = cfg;
};

afterEach(() => {
  setCfg(undefined);
  vi.unstubAllEnvs();
});

describe("runtimeOverride", () => {
  it("설정이 없으면 undefined — 기본 동작 불변", () => {
    expect(runtimeOverride("promUrl")).toBeUndefined();
  });

  it("빈 문자열·비문자열 값은 무시한다 (방어)", () => {
    setCfg({ promUrl: "  ", agentUrl: 123, exporterUrl: null });
    expect(runtimeOverride("promUrl")).toBeUndefined();
    expect(runtimeOverride("agentUrl")).toBeUndefined();
    expect(runtimeOverride("exporterUrl")).toBeUndefined();
  });
});

describe("런타임 > 빌드 > 페이지 호스트 기본값", () => {
  it("agentUrl — 런타임이 VITE_AGENT_URL 을 이긴다", () => {
    vi.stubEnv("VITE_AGENT_URL", "http://build-time:8000");
    setCfg({ agentUrl: "http://runtime:8100/" });
    expect(agentUrl()).toBe("http://runtime:8100");
  });

  it("agentUrl — 아무 설정 없으면 페이지 호스트 :8000", () => {
    vi.stubEnv("VITE_AGENT_URL", "");
    expect(agentUrl()).toBe(`http://${location.hostname}:8000`);
  });

  it("exporterBaseUrl — 런타임이 VITE_EXPORTER_URL 을 이긴다", () => {
    vi.stubEnv("VITE_EXPORTER_URL", "http://build-time:9090");
    setCfg({ exporterUrl: "http://runtime:9901/" });
    expect(exporterBaseUrl()).toBe("http://runtime:9901");
  });

  it("exporterBaseUrl — 아무 설정 없으면 페이지 호스트 :9090", () => {
    vi.stubEnv("VITE_EXPORTER_URL", "");
    expect(exporterBaseUrl()).toBe(`http://${location.hostname}:9090`);
  });
});
