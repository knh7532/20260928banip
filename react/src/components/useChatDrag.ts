/**
 * 채팅 패널 드래그 (인간 지시 2026-08-10).
 *
 * 포인터 이벤트 + `setPointerCapture`를 쓴다. 마우스 이벤트로 하면 커서가 **iframe 위를
 * 지나는 순간 이벤트를 잃는다** — iframe은 별도 문서라 부모의 `mousemove`가 안 온다.
 * 캡처를 걸면 그 포인터의 이벤트가 계속 이 요소로 온다.
 *
 * 그래도 **끄는 동안 iframe에 `pointer-events: none`** 은 필요하다. 캡처가 없었다면
 * 커서가 Chainlit 안으로 빨려 들어가 텍스트가 선택된다.
 *
 * 위치는 `right/bottom` 기준 배치를 유지한 채 `transform`으로만 옮긴다 — 원래 자리
 * 계산(반응형·안전 여백)을 CSS에 남겨 두기 위해서다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface DragState {
  /** 적용할 오프셋. `transform: translate(dx, dy)`로 쓴다. */
  dx: number;
  dy: number;
  dragging: boolean;
}

/** 드래그를 시작한 시점의 "원래 자리" — 클램프의 기준이다. */
export interface DragBase {
  left: number;
  top: number;
  width: number;
}

/** 헤더가 최소 이만큼은 화면 안에 남아야 다시 잡을 수 있다. */
export const KEEP_VISIBLE = 48;

/**
 * 패널이 화면 밖으로 나가지 않게 자른다.
 *
 * ⚠ **기준은 드래그 시작 시점의 자리(`base`)여야 한다.** 처음엔 매 이동마다
 * `getBoundingClientRect()`에서 현재 오프셋을 빼서 base를 다시 구했는데, 그 rect에는
 * **직전** transform이 반영돼 있고 빼는 것은 **새** 오프셋이라 base가 매번 어긋났다.
 * 결과적으로 클램프가 전혀 듣지 않아 패널이 화면 밖(-1374, -1014)으로 사라졌다(실측).
 */
export function clampOffset(
  base: DragBase, dx: number, dy: number,
  viewport: { width: number; height: number },
): { dx: number; dy: number } {
  // 오른쪽 끝이 화면 왼쪽 밖으로 완전히 나가지 않게 / 왼쪽 끝이 오른쪽 밖으로 나가지 않게
  const minDx = KEEP_VISIBLE - base.left - base.width;
  const maxDx = viewport.width - KEEP_VISIBLE - base.left;
  // 위로는 화면 상단까지만 — 헤더가 위로 넘어가면 다시 잡을 수 없다
  const minDy = -base.top;
  const maxDy = viewport.height - KEEP_VISIBLE - base.top;
  return {
    dx: Math.min(maxDx, Math.max(minDx, dx)),
    dy: Math.min(maxDy, Math.max(minDy, dy)),
  };
}

export function useChatDrag(panelRef: React.RefObject<HTMLElement | null>): {
  state: DragState;
  onPointerDown: (e: React.PointerEvent) => void;
  reset: () => void;
} {
  const [state, setState] = useState<DragState>({ dx: 0, dy: 0, dragging: false });
  /**
   * 드래그의 기준점 — 시작 포인터 좌표·시작 오프셋·원래 자리.
   *
   * `id`는 **끌고 있는 포인터**다. 안 두면 멀티터치에서 두 번째 손가락의 이동이
   * 첫 손가락의 기준으로 계산돼 창이 튀고, 두 번째 손가락을 떼면 첫 손가락의
   * 드래그가 끝나 버린다(codex 지적).
   */
  const origin = useRef({
    id: -1, x: 0, y: 0, dx: 0, dy: 0, base: { left: 0, top: 0, width: 0 },
  });
  /** 마지막 포인터 좌표 — 리사이즈로 기준을 다시 잡을 때 필요하다. */
  const lastPointer = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // 헤더의 버튼·링크에서 시작한 드래그는 무시한다 — 닫기를 누르려다 창이 끌린다.
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (e.button !== 0) return;                         // 주 버튼만

    const el = panelRef.current;
    const r = el?.getBoundingClientRect();
    origin.current = {
      id: e.pointerId,
      x: e.clientX, y: e.clientY, dx: state.dx, dy: state.dy,
      // 지금 화면 위치에서 지금 오프셋을 빼면 "원래 자리"다. 여기서 **한 번만** 잰다.
      base: r
        ? { left: r.left - state.dx, top: r.top - state.dy, width: r.width }
        : { left: 0, top: 0, width: 0 },
    };
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setState((s) => ({ ...s, dragging: true }));
    e.preventDefault();                                 // 헤더 텍스트가 선택되지 않게
  }, [state.dx, state.dy, panelRef]);

  useEffect(() => {
    if (!state.dragging) return;

    const move = (e: PointerEvent) => {
      const o = origin.current;
      if (e.pointerId !== o.id) return;          // 다른 손가락의 이동은 무시
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const next = clampOffset(
        o.base, o.dx + (e.clientX - o.x), o.dy + (e.clientY - o.y),
        { width: window.innerWidth, height: window.innerHeight },
      );
      setState({ ...next, dragging: true });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== origin.current.id) return;
      origin.current.id = -1;
      setState((s) => ({ ...s, dragging: false }));
    };

    // 캡처가 걸려 있어도 pointercancel(터치 취소 등)은 따로 받아야 상태가 안 남는다.
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, [state.dragging]);

  /* 창 크기가 바뀌면 다시 자른다 — 안 하면 패널이 화면 밖에 남는다.
   *
   * ⚠ 끌고 있는 중이라면 `origin`까지 다시 잡아야 한다. 위치만 보정하고 기준을 그대로
   * 두면 **다음 `pointermove`가 옛 기준으로 계산해 보정을 덮어쓴다**(codex 지적).
   * 마지막 포인터 좌표를 새 시작점으로 삼아 전부 새로 앵커링한다. */
  useEffect(() => {
    const onResize = () => {
      setState((s) => {
        if (s.dx === 0 && s.dy === 0) return s;
        const r = panelRef.current?.getBoundingClientRect();
        if (!r) return s;
        const base = { left: r.left - s.dx, top: r.top - s.dy, width: r.width };
        const next = clampOffset(base, s.dx, s.dy,
          { width: window.innerWidth, height: window.innerHeight });
        if (s.dragging) {
          origin.current = {
            ...origin.current,
            x: lastPointer.current.x, y: lastPointer.current.y,
            dx: next.dx, dy: next.dy, base,
          };
        }
        return { ...s, ...next };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [panelRef]);

  const reset = useCallback(() => setState({ dx: 0, dy: 0, dragging: false }), []);

  return { state, onPointerDown, reset };
}
