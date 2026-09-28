import { useEffect, useRef, useState } from "react";

/**
 * 연속 실패가 이 값 이상이면 "연결 끊김"으로 본다 — 연결 배너(App)와
 * 데이터 공란 처리(각 데이터 훅)가 같은 기준을 공유한다 (R7 C-4).
 */
export const DISCONNECT_THRESHOLD = 3;

/**
 * 자기 스케줄링 폴링 훅 (형제 프로젝트 custom-ui의 3층 방어를 이식).
 *
 *  1. **겹침 방지**: 이전 tick이 끝나기 전에는 새 tick을 시작하지 않는다. effect가 다시
 *     실행돼도(필터 변경·StrictMode) 이전 tick이 정착할 때까지 기다린다 (CDX-R2-08).
 *  2. **취소**: 언마운트·`deps` 변경 시 진행 중인 요청을 AbortController로 끊는다.
 *     따라서 옛 필터의 응답이 새 화면을 덮어쓸 수 없다 (CDX-R2-07).
 *  3. **연속 실패 감지**: 실패가 이어지면 `failStreak`가 올라간다(3 이상이면 화면에 고지).
 *
 * `setInterval` 대신 완료 후 `setTimeout`으로 다음 tick을 예약한다 — 느린 응답이
 * 쌓여 요청이 폭주하는 것을 막는다.
 *
 * @param deps 쿼리에 영향을 주는 값들(필터 등). 바뀌면 즉시 재조회한다.
 */
export function usePolling(
  fn: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  deps: readonly unknown[] = [],
): { failStreak: number; lastSuccessAt: number | null } {
  const [failStreak, setFailStreak] = useState(0);
  // R9(F7.1): 마지막 성공 시각(epoch ms) — 헤더 "갱신 HH:MM:SS" 표기. 끊겨도 남겨
  // 마지막으로 신선했던 시점을 알 수 있다.
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  /** 이전 effect 세대의 진행 중 tick — 세대가 바뀌어도 겹치지 않도록 이어받는다. */
  const inFlight = useRef<Promise<void> | null>(null);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const tick = async (): Promise<void> => {
      try {
        await fnRef.current(controller.signal);
        if (!stopped) {
          setFailStreak(0);
          setLastSuccessAt(Date.now());
        }
      } catch (e) {
        if (controller.signal.aborted) return; // 취소는 실패가 아니다
        if (!stopped) setFailStreak((n) => n + 1);
        console.warn("[polling] tick failed:", e);
      }
    };

    const loop = async (): Promise<void> => {
      // 이전 세대의 tick이 아직 살아 있으면 그것이 끝난 뒤에 시작한다
      const prev = inFlight.current;
      if (prev) await prev.catch(() => undefined);
      if (stopped) return;

      const current = tick();
      inFlight.current = current;
      try {
        await current;
      } finally {
        if (inFlight.current === current) inFlight.current = null;
        if (!stopped && intervalMs > 0) {
          timer = setTimeout(() => void loop(), intervalMs);
        }
      }
    };

    void loop();

    return () => {
      stopped = true;
      controller.abort(); // 진행 중 요청 취소 — 옛 필터 응답이 새 화면을 덮지 않는다
      if (timer !== undefined) clearTimeout(timer);
    };
    // depsKey로 필터 변경을 감지한다(배열 참조가 매 렌더 바뀌어도 안전)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, depsKey]);

  return { failStreak, lastSuccessAt };
}
