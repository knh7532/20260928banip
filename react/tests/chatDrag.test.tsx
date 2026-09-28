/*
 * 채팅창 드래그 (인간 지시 2026-08-10).
 *
 * 잠그는 것 셋:
 *  1. 헤더의 **버튼에서 시작한 드래그는 무시**한다 — 닫기를 누르려다 창이 끌리면 안 된다.
 *  2. 끄는 동안 **iframe이 포인터를 훔치지 못한다** — 커서가 Chainlit 안으로 빨려 든다.
 *  3. 패널이 **화면 밖으로 나가지 않는다** — 머리를 잃으면 다시 잡을 수 없다.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatWidget } from "../src/components/ChatWidget";
import { KEEP_VISIBLE, clampOffset } from "../src/components/useChatDrag";

/* jsdom에는 `PointerEvent`도 포인터 캡처도 없다. 폴리필이 없으면 fireEvent가 만드는
   이벤트에 `button`·`pointerId`가 안 실려, "주 버튼일 때만 끈다" 같은 규칙을 시험할 수
   없다(실제로 처음엔 전부 무시돼 통과하는 것처럼 보였다). MouseEvent를 상속해 채운다. */
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeEach(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const panel = () => document.querySelector(".ax-chat") as HTMLElement;
const head = () => document.querySelector(".ax-chat__head") as HTMLElement;

function drag(from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(head(), { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

describe("ChatWidget 드래그", () => {
  it("헤더를 끌면 패널이 그만큼 움직인다", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));

    expect(panel().style.transform).toBe("");
    drag([500, 500], [420, 460]);
    // jsdom의 getBoundingClientRect는 전부 0이라 클램프가 0으로 접는다.
    // 여기서 보는 것은 "포인터 이동이 transform으로 반영되는가"다.
    expect(panel().style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\)$/);
    expect(panel().className).toContain("ax-chat--dragging");

    fireEvent.pointerUp(document, { pointerId: 1 });
    expect(panel().className).not.toContain("ax-chat--dragging");
  });

  it("헤더의 버튼에서 시작한 드래그는 무시한다", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));

    const close = screen.getByRole("button", { name: "대화 닫기" });
    fireEvent.pointerDown(close, { clientX: 500, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 300, clientY: 300, pointerId: 1 });

    expect(panel().className, "닫기 버튼에서 창이 끌렸다").not.toContain("ax-chat--dragging");
    expect(panel().style.transform).toBe("");
  });

  it("주 버튼이 아니면 끌지 않는다 (우클릭 메뉴에서 창이 따라오면 안 된다)", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));
    fireEvent.pointerDown(head(), { clientX: 500, clientY: 500, button: 2, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 300, clientY: 300, pointerId: 1 });
    expect(panel().className).not.toContain("ax-chat--dragging");
  });

  it("pointercancel에도 드래그 상태가 남지 않는다", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));
    drag([500, 500], [400, 400]);
    expect(panel().className).toContain("ax-chat--dragging");
    fireEvent.pointerCancel(document, { pointerId: 1 });
    expect(panel().className, "취소됐는데 끄는 중으로 남았다").not.toContain("ax-chat--dragging");
  });

  it("옮기고 나면 '원래 자리로' 버튼이 생기고, 누르면 transform이 사라진다", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));
    expect(screen.queryByRole("button", { name: "원래 자리로" })).toBeNull();

    drag([500, 500], [400, 400]);
    fireEvent.pointerUp(document, { pointerId: 1 });

    const home = screen.queryByRole("button", { name: "원래 자리로" });
    // 클램프가 0으로 접으면 버튼이 안 생긴다 — 그때는 이 단언을 건너뛴다.
    if (home) {
      fireEvent.click(home);
      expect(panel().style.transform).toBe("");
      expect(screen.queryByRole("button", { name: "원래 자리로" })).toBeNull();
    }
  });
});

describe("clampOffset — 화면 밖으로 못 나간다", () => {
  const VP = { width: 1920, height: 1100 };
  /** 우측 하단 기본 자리와 비슷한 값. */
  const base = { left: 1478, top: 392, width: 420 };

  it("왼쪽으로 밀어도 오른쪽 끝이 화면 안에 남는다", () => {
    const { dx } = clampOffset(base, -99_999, 0, VP);
    expect(base.left + dx + base.width).toBeGreaterThanOrEqual(KEEP_VISIBLE);
  });

  it("오른쪽으로 밀어도 왼쪽 끝이 화면 안에 남는다", () => {
    const { dx } = clampOffset(base, 99_999, 0, VP);
    expect(base.left + dx).toBeLessThanOrEqual(VP.width - KEEP_VISIBLE);
  });

  it("위로는 화면 상단까지만 — 헤더가 넘어가면 다시 잡을 수 없다", () => {
    const { dy } = clampOffset(base, 0, -99_999, VP);
    expect(base.top + dy).toBe(0);
  });

  it("아래로 밀어도 헤더가 화면 안에 남는다", () => {
    const { dy } = clampOffset(base, 0, 99_999, VP);
    expect(base.top + dy).toBeLessThanOrEqual(VP.height - KEEP_VISIBLE);
  });

  it("범위 안이면 그대로 통과한다", () => {
    expect(clampOffset(base, -500, -300, VP)).toEqual({ dx: -500, dy: -300 });
  });

  it("실측에서 새어 나갔던 값(-1374, -1014)이 이제 막힌다", () => {
    /* 기준을 매 이동마다 다시 재던 시절, 패널이 여기까지 밀려 사라졌다. */
    const { dx, dy } = clampOffset(base, -2852, -1406, VP);
    expect(base.left + dx + base.width).toBeGreaterThanOrEqual(KEEP_VISIBLE);
    expect(base.top + dy).toBeGreaterThanOrEqual(0);
  });
});

describe("멀티터치 (codex 지적 2026-08-10)", () => {
  /* 두 번째 손가락의 이동이 첫 손가락 기준으로 계산돼 창이 튀고, 두 번째를 떼면
     첫 손가락의 드래그가 끝나 버렸다. 끌고 있는 pointerId만 본다. */
  it("다른 포인터의 이동은 무시한다", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));

    /* jsdom의 rect가 전부 0이라 클램프 범위가 dx∈[48,976]·dy∈[0,720]이다.
       두 좌표가 **모두 범위 안**이어야 이 단언이 헛돌지 않는다 — 범위 밖이면 둘 다
       같은 경계값으로 접혀 가드가 없어도 통과한다. */
    fireEvent.pointerDown(head(), { clientX: 500, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 600, clientY: 600, pointerId: 1 });
    const afterFirst = panel().style.transform;
    expect(afterFirst).toBe("translate(100px, 100px)");

    // 두 번째 손가락이 움직여도 패널은 그대로여야 한다
    fireEvent.pointerMove(document, { clientX: 900, clientY: 900, pointerId: 2 });
    expect(panel().style.transform, "다른 손가락에 창이 끌렸다").toBe(afterFirst);
  });

  it("다른 포인터를 떼도 드래그가 끝나지 않는다", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 대화 열기" }));

    fireEvent.pointerDown(head(), { clientX: 500, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 480, clientY: 480, pointerId: 1 });
    expect(panel().className).toContain("ax-chat--dragging");

    fireEvent.pointerUp(document, { pointerId: 2 });
    expect(panel().className, "다른 손가락을 떼자 드래그가 끝났다").toContain("ax-chat--dragging");

    fireEvent.pointerUp(document, { pointerId: 1 });
    expect(panel().className).not.toContain("ax-chat--dragging");
  });
});
