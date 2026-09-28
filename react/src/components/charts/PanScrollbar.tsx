import { useEffect, useRef } from "react";

/**
 * 시간 팬 공용 스크롤바 (X4) — 3× 조회 범위 안에서 표시 창을 좌우로 옮긴다.
 *
 * 네이티브 횡스크롤바의 UX를 그대로 쓴다: 실제 overflow-x 스크롤 요소에
 * (전체/창) 배율만큼 넓은 팬텀을 넣고, scrollLeft ↔ 창 끝 시각(anchor)을 매핑한다.
 *
 * 추적 규칙(계획 확정): **우측 끝 = 최신 추적**(`anchorEndMs === null`, 5s 갱신을
 * 따라간다) / 과거로 스크롤하면 **절대 시각 고정**(새 데이터가 와도 보던 구간 유지).
 */
export function PanScrollbar({
  panStartMs,
  panEndMs,
  windowMs,
  anchorEndMs,
  onPan,
  ariaLabel,
}: {
  /** 조회 전체(3×) 구간 */
  panStartMs: number;
  panEndMs: number;
  /** 표시 창 폭 (ms) */
  windowMs: number;
  /** 현재 창 끝 — null이면 최신 추적(우측 끝) */
  anchorEndMs: number | null;
  /** 사용자 스크롤 → 창 끝 시각. 우측 끝에 닿으면 null(추적 복귀). */
  onPan: (anchorEndMs: number | null) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** 프로그램적 이동의 **목표 위치** — 값이 일치하는 이벤트만 삼킨다 (CDX-X4-06:
   *  boolean 플래그는 대기 중 사용자 스크롤까지 무조건 무시할 수 있다). */
  const pendingTarget = useRef<number | null>(null);
  const totalMs = panEndMs - panStartMs;
  const ratio = windowMs > 0 && totalMs > windowMs ? totalMs / windowMs : 1;

  // 상태 → 스크롤 위치 동기화. 추적이면 우측 끝, 고정이면 앵커 위치.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0 || totalMs <= windowMs) return;
    const clampedEnd =
      anchorEndMs === null
        ? panEndMs
        : Math.min(Math.max(anchorEndMs, panStartMs + windowMs), panEndMs);
    const target = ((clampedEnd - panStartMs - windowMs) / (totalMs - windowMs)) * max;
    if (Math.abs(el.scrollLeft - target) > 1) {
      pendingTarget.current = target;
      el.scrollLeft = target;
    }
  }, [anchorEndMs, panStartMs, panEndMs, windowMs, totalMs]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (pendingTarget.current !== null) {
      const wasProgrammatic = Math.abs(el.scrollLeft - pendingTarget.current) <= 1;
      pendingTarget.current = null;
      if (wasProgrammatic) return; // 목표 위치와 일치 — 프로그램적 이동의 이벤트다
      // 위치가 다르면 그 사이 사용자가 움직인 것 — 사용자 입력으로 처리한다
    }
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0 || totalMs <= windowMs) return;
    if (el.scrollLeft >= max - 1) {
      onPan(null); // 우측 끝 = 최신 추적 복귀
      return;
    }
    onPan(panStartMs + windowMs + (el.scrollLeft / max) * (totalMs - windowMs));
  };

  if (ratio <= 1) return null; // 팬할 과거가 없으면 그리지 않는다

  return (
    <div className="pan-scroll" ref={ref} onScroll={onScroll} aria-label={ariaLabel}>
      <div className="pan-scroll__phantom" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
