// @vitest-environment jsdom
/** PanScrollbar (X4) — scrollLeft ↔ 창 끝 시각 매핑·추적/고정 규칙. */
import { fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";

import { PanScrollbar } from "../src/components/charts/PanScrollbar";

const PAN = { panStartMs: 0, panEndMs: 90_000, windowMs: 30_000 }; // 3× (과거 60s)

/** jsdom에는 레이아웃이 없어 scrollWidth/clientWidth를 수동 정의한다. */
function sizeScroller(el: HTMLElement, scrollWidth = 300, clientWidth = 100) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
}

function renderBar(anchorEndMs: number | null, onPan = vi.fn()) {
  const { container } = render(
    <PanScrollbar {...PAN} anchorEndMs={anchorEndMs} onPan={onPan} ariaLabel="테스트 스크롤" />,
  );
  const el = container.querySelector(".pan-scroll") as HTMLElement;
  sizeScroller(el);
  return { el, onPan, container };
}

describe("PanScrollbar", () => {
  it("팬텀 폭 = 전체/창 배율 (3× → 300%)", () => {
    const { container } = renderBar(null);
    const phantom = container.querySelector(".pan-scroll__phantom") as HTMLElement;
    expect(phantom.style.width).toBe("300%");
  });

  it("우측 끝으로 스크롤하면 onPan(null) — 최신 추적 복귀", () => {
    const { el, onPan } = renderBar(60_000);
    el.scrollLeft = 200; // max = 300-100 = 200 → 끝
    fireEvent.scroll(el);
    expect(onPan).toHaveBeenCalledWith(null);
  });

  it("중간 위치는 창 끝 시각으로 환산된다", () => {
    const { el, onPan } = renderBar(null);
    // 프로그램적 동기화(추적 → 우측 끝) 1회를 소화한 뒤 사용자 스크롤을 흉내낸다
    fireEvent.scroll(el);
    el.scrollLeft = 100; // max 200의 절반 → anchor = 30000 + 0.5*60000 = 60000
    fireEvent.scroll(el);
    expect(onPan).toHaveBeenLastCalledWith(60_000);
  });

  it("왼쪽 끝은 가장 오래된 창(창폭 하한)으로 환산된다", () => {
    const { el, onPan } = renderBar(60_000);
    el.scrollLeft = 0;
    fireEvent.scroll(el);
    expect(onPan).toHaveBeenLastCalledWith(30_000); // panStart + windowMs
  });

  it("상태 → 스크롤 동기화: 추적=우측 끝, 고정=앵커 위치·클램프, 프로그램적 이동은 onPan 미발화", () => {
    const sw = vi.spyOn(HTMLDivElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    const cw = vi.spyOn(HTMLDivElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const onPan = vi.fn();
    const { container, rerender } = render(
      <PanScrollbar {...PAN} anchorEndMs={null} onPan={onPan} ariaLabel="동기화" />,
    );
    const el = container.querySelector(".pan-scroll") as HTMLElement;
    expect(el.scrollLeft).toBe(200); // 추적 → 우측 끝(max=200)
    fireEvent.scroll(el); // 프로그램적 이동의 스크롤 이벤트는 삼킨다
    expect(onPan).not.toHaveBeenCalled();
    rerender(<PanScrollbar {...PAN} anchorEndMs={45_000} onPan={onPan} ariaLabel="동기화" />);
    expect(el.scrollLeft).toBe(50); // (45000-30000)/60000 × 200
    rerender(<PanScrollbar {...PAN} anchorEndMs={999_999} onPan={onPan} ariaLabel="동기화" />);
    expect(el.scrollLeft).toBe(200); // panEnd로 클램프
    sw.mockRestore();
    cw.mockRestore();
  });

  it("프로그램적 이동 대기 중 사용자 스크롤은 삼키지 않는다 (CDX-X4-06 — 목표 위치 대조)", () => {
    const sw = vi.spyOn(HTMLDivElement.prototype, "scrollWidth", "get").mockReturnValue(300);
    const cw = vi.spyOn(HTMLDivElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const onPan = vi.fn();
    const { container } = render(
      <PanScrollbar {...PAN} anchorEndMs={null} onPan={onPan} ariaLabel="경합" />,
    );
    const el = container.querySelector(".pan-scroll") as HTMLElement;
    expect(el.scrollLeft).toBe(200); // 마운트 동기화 목표 = 200 (대기 중)
    el.scrollLeft = 100; // 이벤트 도착 전 사용자가 움직였다
    fireEvent.scroll(el);
    expect(onPan).toHaveBeenCalledWith(60_000); // 목표(200)와 달라 사용자 입력으로 처리
    sw.mockRestore();
    cw.mockRestore();
  });

  it("팬할 과거가 없으면(전체≤창) 그리지 않는다", () => {
    const { container } = render(
      <PanScrollbar
        panStartMs={0}
        panEndMs={30_000}
        windowMs={30_000}
        anchorEndMs={null}
        onPan={vi.fn()}
        ariaLabel="없음"
      />,
    );
    expect(container.querySelector(".pan-scroll")).toBeNull();
  });
});
