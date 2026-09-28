/**
 * 모니터링 어시스턴트 채팅 위젯 — 우측 하단 동그란 버튼 + 열리는 대화 패널 (2026-08-09 인간 요청).
 *
 * 대화 UI 자체는 **Chainlit이 통째로 담당**한다. 여기서는 띄우고 감추는 껍데기만 만든다 —
 * 메시지 처리·스트리밍·승인 버튼은 이미 `../agent/app.py`에 있고, 그걸 다시
 * 구현하면 두 개의 진실이 생긴다.
 *
 * 왜 iframe인가: Chainlit의 copilot 스크립트(`/copilot/index.js`)를 쓰는 방법도 있지만
 * 그건 **서버에서 스크립트를 받아 실행**하는 방식이라, 폐쇄망에서 에이전트가 안 떠 있으면
 * 대시보드 쪽 자바스크립트가 먼저 깨진다. iframe은 실패해도 패널 안에서만 실패한다.
 * (Chainlit이 `X-Frame-Options`·CSP를 안 보내는 것은 실측으로 확인했다.)
 *
 * 로그인 화면은 이번 범위 밖이다(인간 지시). Chainlit에 인증을 걸면 이 패널 안에서
 * 그 화면이 그대로 뜬다 — 껍데기는 바꿀 필요가 없다.
 */
import { useEffect, useId, useRef, useState } from "react";

import { DRILLDOWN_VIEWS } from "../hooks/useRoute";

import { agentUrl } from "./agentUrl";
import { useChatDrag } from "./useChatDrag";

import "../styles/chat-widget.css";

/* 에이전트가 이동시킬 수 있는 해시 화이트리스트(E6) — 에이전트 레지스트리(PAGES)와
   같은 키. 목록 밖 대상은 무시한다: postMessage는 누구나 보낼 수 있는 채널이라
   오리진 검사와 화이트리스트 둘 다 없으면 임의 이동에 열린다. */
const NAV_HASH: Record<string, string> = {
  gpu: "#/",
  llm: "#/llm",
  ...Object.fromEntries(DRILLDOWN_VIEWS.map((v) => [v, `#/drilldown/${v}`])),
};

/* 대화 지속(E7) — 에이전트가 알려 준 thread id를 기억했다가 다음 로드에서
   `/thread/{id}`로 iframe을 열어 같은 대화를 잇는다. Chainlit 클라이언트는
   로드마다 새 세션을 만들기 때문에(sessionId 미저장 실측) 이 다리 없이는
   새로고침·새 탭에서 대화가 사라진다. */
const AGENT_THREAD_KEY = "sqm-agent-thread";
const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function initialAgentSrc(): string {
  try {
    const t = localStorage.getItem(AGENT_THREAD_KEY);
    if (t && THREAD_ID_RE.test(t)) return `${agentUrl()}/thread/${t}`;
  } catch { /* localStorage 불가(프라이빗 창 등) — 새 대화로 연다 */ }
  return agentUrl();
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  /** 처음 열 때까지 iframe을 만들지 않는다 — 안 쓰는 사용자에게 에이전트를 부르지 않는다. */
  const [everOpened, setEverOpened] = useState(false);
  /** iframe 주소 — 마운트 시 한 번 결정(E7). 이후 thread 갱신은 다음 로드에 반영된다. */
  const [agentSrc] = useState(initialAgentSrc);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /* 헤더를 잡고 끌면 패널이 움직인다(인간 지시 2026-08-10). 좁은 패널이 보고 싶은
     카드를 가릴 때 옆으로 치우기 위한 것이다. */
  const drag = useChatDrag(panelRef);

  useEffect(() => {
    /* 페이지 이동(E6, 인간 지시) — 에이전트(app.py)가 승인 후 보내는
       `sqm-navigate:{key}` window message를 받아 해시를 바꾼다. */
    let agentOrigin = "";
    try {
      agentOrigin = new URL(agentUrl()).origin;
    } catch {
      return; // 주소가 깨졌으면 이동 기능만 조용히 끈다 — 위젯 자체는 살린다.
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== agentOrigin) return;
      const data = typeof e.data === "string" ? e.data : "";
      // 대화 지속(E7): thread id 기억 — 다음 로드에서 이 대화를 다시 연다.
      const t = /^sqm-thread:([0-9a-f-]{36})$/i.exec(data);
      if (t && THREAD_ID_RE.test(t[1])) {
        try { localStorage.setItem(AGENT_THREAD_KEY, t[1]); } catch { /* 무시 */ }
        return;
      }
      const m = /^sqm-navigate:([a-z-]+)$/.exec(data);
      const hash = m ? NAV_HASH[m[1]] : undefined;
      if (hash) location.hash = hash;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!open) return;
    // 열려 있을 때만 Esc를 듣는다. 전역으로 걸어 두면 다른 화면의 Esc를 가로챈다.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    setOpen((v) => !v);
    setEverOpened(true);
  };

  return (
    <>
      <div
        ref={panelRef}
        id={panelId}
        className={`ax-chat ${open ? "ax-chat--open" : ""}${drag.state.dragging ? " ax-chat--dragging" : ""}`.trim()}
        role="dialog"
        aria-label="어시스턴트 대화"
        aria-hidden={!open}
        style={drag.state.dx || drag.state.dy
          ? { transform: `translate(${drag.state.dx}px, ${drag.state.dy}px)` }
          : undefined}
      >
        <header className="ax-chat__head" onPointerDown={drag.onPointerDown}>
          <span className="ax-chat__title">모니터링 어시스턴트</span>
          {/* 옮긴 뒤 원래 자리로 되돌리는 길 — 화면 밖으로 밀어 놓고 못 찾는 일을 막는다. */}
          {(drag.state.dx !== 0 || drag.state.dy !== 0) && (
            <button
              type="button" className="ax-chat__act"
              onClick={drag.reset} aria-label="원래 자리로" title="원래 자리로"
            >⌖</button>
          )}
          {/* 좁은 패널이 답답할 때를 위한 탈출구 — 같은 세션이 새 창에서 이어진다. */}
          <a
            className="ax-chat__act" href={agentUrl()} target="_blank" rel="noreferrer"
            title="새 창으로 열기"
          >↗</a>
          <button
            ref={closeRef} type="button" className="ax-chat__act"
            onClick={() => setOpen(false)} aria-label="대화 닫기"
          >✕</button>
        </header>
        {everOpened && (
          <iframe
            className="ax-chat__frame"
            src={agentSrc}
            title="모니터링 어시스턴트"
            /* 에이전트가 안 떠 있으면 이 안에서만 실패한다 — 대시보드는 멀쩡하다. */
          />
        )}
      </div>

      <button
        type="button"
        className={`ax-chat-fab ${open ? "ax-chat-fab--open" : ""}`.trim()}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "어시스턴트 대화 닫기" : "어시스턴트 대화 열기"}
        title={open ? "닫기" : "어시스턴트에게 물어보기"}
      >
        <span aria-hidden="true">{open ? "✕" : "💬"}</span>
      </button>
    </>
  );
}
