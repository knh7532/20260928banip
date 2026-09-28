/*
 * 모니터링 어시스턴트 채팅 위젯 (2026-08-09 인간 요청).
 *
 * 대화 내용 자체는 Chainlit이 담당하므로 여기서 검증할 것은 **껍데기의 계약**이다:
 * 버튼이 있고, 눌러야 열리고, 열기 전엔 에이전트를 부르지 않고, 주소를 올바로 만든다.
 *
 * 실제 대화 왕복은 이 저장소의 샌드박스에서 확인하지 못했다 — Python 3.14인데
 * chainlit 2.11이 자기 프런트엔드 자산을 500으로 낸다(현장은 py3.12 wheelhouse).
 * 임베드 가능 여부(X-Frame-Options·CSP 없음)와 문서 200은 실측으로 확인했다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWidget } from "../src/components/ChatWidget";
import { agentUrl } from "../src/components/agentUrl";

afterEach(() => { vi.unstubAllEnvs(); });

describe("agentUrl", () => {
  it("VITE_AGENT_URL이 있으면 그것을 쓴다", () => {
    vi.stubEnv("VITE_AGENT_URL", "http://10.0.0.5:8000");
    expect(agentUrl()).toBe("http://10.0.0.5:8000");
  });

  it("끝의 슬래시는 떼어 낸다 — iframe src가 `//`로 이어지지 않게", () => {
    vi.stubEnv("VITE_AGENT_URL", "http://10.0.0.5:8000///");
    expect(agentUrl()).toBe("http://10.0.0.5:8000");
  });

  it("빈 값은 미설정으로 본다", () => {
    vi.stubEnv("VITE_AGENT_URL", "   ");
    expect(agentUrl()).toBe(`http://${location.hostname}:8000`);
  });

  it("미설정이면 **앱이 떠 있는 호스트의 :8000**", () => {
    /* 포털 서브경로(/agent)가 아니다 — Chainlit 2.11은 자산을 절대경로로 내보내고
       `--root-path`는 기동이 실패해 서브경로 마운트가 불가하다(실측). */
    expect(agentUrl()).toBe(`http://${location.hostname}:8000`);
    expect(agentUrl()).not.toContain("/agent");
  });
});

describe("ChatWidget", () => {
  const fab = () => screen.getByRole("button", { name: /어시스턴트 대화/ });
  const panel = (c: HTMLElement) => c.querySelector(".ax-chat") as HTMLElement;

  it("버튼을 그리고, 처음엔 닫혀 있으며 iframe을 만들지 않는다", () => {
    const { container } = render(<ChatWidget />);
    expect(fab()).toBeTruthy();
    expect(fab().getAttribute("aria-expanded")).toBe("false");
    expect(panel(container).className).not.toContain("ax-chat--open");
    // 안 쓰는 사용자에게 에이전트를 부르지 않는다 — 열기 전엔 iframe이 없어야 한다.
    expect(container.querySelector(".ax-chat__frame"), "열기도 전에 에이전트를 불렀다").toBeNull();
  });

  it("누르면 열리고 그때 iframe이 생긴다", () => {
    const { container } = render(<ChatWidget />);
    fireEvent.click(fab());

    expect(panel(container).className).toContain("ax-chat--open");
    expect(fab().getAttribute("aria-expanded")).toBe("true");
    const frame = container.querySelector(".ax-chat__frame");
    expect(frame).toBeTruthy();
    expect(frame!.getAttribute("src")).toBe(agentUrl());
  });

  it("다시 누르면 닫히지만 iframe은 살려 둔다 — 대화가 날아가면 안 된다", () => {
    const { container } = render(<ChatWidget />);
    fireEvent.click(fab());
    const first = container.querySelector(".ax-chat__frame");

    fireEvent.click(fab());
    expect(panel(container).className).not.toContain("ax-chat--open");
    expect(container.querySelector(".ax-chat__frame"), "닫으면서 iframe을 버렸다")
      .toBe(first);
  });

  it("Esc로 닫힌다 — 닫힌 상태에서는 Esc를 가로채지 않는다", () => {
    const { container } = render(<ChatWidget />);
    // 닫힌 상태: 리스너가 없어야 한다(다른 화면의 Esc를 훔치지 않게)
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel(container).className).not.toContain("ax-chat--open");

    fireEvent.click(fab());
    expect(panel(container).className).toContain("ax-chat--open");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel(container).className).not.toContain("ax-chat--open");
  });

  it("헤더의 닫기 버튼과 새 창 링크가 있다", () => {
    const { container } = render(<ChatWidget />);
    fireEvent.click(fab());

    fireEvent.click(screen.getByRole("button", { name: "대화 닫기" }));
    expect(panel(container).className).not.toContain("ax-chat--open");

    const link = container.querySelector(".ax-chat__head a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(agentUrl());
    expect(link.getAttribute("target")).toBe("_blank");
    // 새 창에 opener를 넘기지 않는다
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("패널이 대화상자로 노출되고 버튼이 그것을 가리킨다", () => {
    const { container } = render(<ChatWidget />);
    const p = panel(container);
    expect(p.getAttribute("role")).toBe("dialog");
    expect(p.getAttribute("aria-hidden")).toBe("true");
    expect(fab().getAttribute("aria-controls")).toBe(p.id);

    fireEvent.click(fab());
    expect(p.getAttribute("aria-hidden")).toBe("false");
  });
});

/* ══════════════ 에이전트 페이지 이동 (E6) ══════════════ */
describe("에이전트 페이지 이동", () => {
  const agentOrigin = `http://${location.hostname}:8000`;
  const send = (data: unknown, origin = agentOrigin) =>
    fireEvent(window, new MessageEvent("message", { data, origin }));

  afterEach(() => { location.hash = ""; });

  it("에이전트 오리진의 sqm-navigate 메시지로 해시를 바꾼다", () => {
    render(<ChatWidget />);
    send("sqm-navigate:worker");
    expect(location.hash).toBe("#/drilldown/worker");
  });

  it("탑뷰 이동 — gpu 키는 #/", () => {
    render(<ChatWidget />);
    location.hash = "#/drilldown/main";
    send("sqm-navigate:gpu");
    expect(location.hash).toBe("#/");
  });

  it("다른 오리진의 메시지는 무시한다 — postMessage는 공용 채널이다", () => {
    render(<ChatWidget />);
    send("sqm-navigate:worker", "http://evil.example");
    expect(location.hash).toBe("");
  });

  it("sqm-thread 메시지로 thread id를 기억하고, 다음 마운트에서 /thread/로 연다 (E7)", () => {
    const { unmount } = render(<ChatWidget />);
    const tid = "0a1b2c3d-1111-2222-3333-444455556666";
    send(`sqm-thread:${tid}`);
    expect(localStorage.getItem("sqm-agent-thread")).toBe(tid);
    unmount();
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));
    expect((document.querySelector("iframe.ax-chat__frame") as HTMLIFrameElement).src)
      .toBe(`${agentOrigin}/thread/${tid}`);
    localStorage.removeItem("sqm-agent-thread");
  });

  it("형식이 아닌 thread id·다른 오리진의 thread 메시지는 무시한다 (E7)", () => {
    render(<ChatWidget />);
    send("sqm-thread:not-a-uuid");
    send("sqm-thread:0a1b2c3d-1111-2222-3333-444455556666", "http://evil.example");
    expect(localStorage.getItem("sqm-agent-thread")).toBeNull();
  });

  it("화이트리스트 밖 대상·다른 형식은 무시한다", () => {
    render(<ChatWidget />);
    send("sqm-navigate:etc-page");
    send({ type: "sqm-navigate", view: "worker" });
    expect(location.hash).toBe("");
  });
});
