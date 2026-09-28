/** 폴링 훅(겹침 방지·취소·연속 실패)과 필터 훅(URL 동기화). */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import {
  DEFAULT_STATE,
  searchFromState,
  stateFromSearch,
  useFilters,
} from "../src/hooks/useFilters";
import { usePolling } from "../src/hooks/usePolling";
import { useRangeSelection } from "../src/hooks/useRangeSelection";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

describe("usePolling", () => {
  it("즉시 1회 실행하고 주기마다 반복한다", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(() => Promise.resolve());
    renderHook(() => usePolling(fn, 5000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("이전 tick이 끝나기 전에는 새 tick을 시작하지 않는다 (겹침 방지)", async () => {
    vi.useFakeTimers();
    let inFlight = 0;
    let maxInFlight = 0;
    const fn = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 12_000)); // 주기보다 오래 걸리는 요청
      inFlight -= 1;
    });
    renderHook(() => usePolling(fn, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(maxInFlight).toBe(1);
  });

  it("연속 실패를 센다 (3 이상이면 화면 고지 대상)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fn = vi.fn(() => Promise.reject(new Error("boom")));
    const { result } = renderHook(() => usePolling(fn, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.failStreak).toBeGreaterThanOrEqual(3);
  });

  it("성공하면 실패 카운터가 0으로 돌아온다", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let shouldFail = true;
    const fn = vi.fn(() => (shouldFail ? Promise.reject(new Error("x")) : Promise.resolve()));
    const { result } = renderHook(() => usePolling(fn, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.failStreak).toBeGreaterThan(0);

    shouldFail = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.failStreak).toBe(0);
  });

  it("성공 시 lastSuccessAt을 기록하고 실패 중엔 마지막 성공 시각을 보존한다 (R9 F7.1)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let shouldFail = false;
    const fn = vi.fn(() => (shouldFail ? Promise.reject(new Error("x")) : Promise.resolve()));
    const { result } = renderHook(() => usePolling(fn, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const first = result.current.lastSuccessAt;
    expect(first).not.toBeNull(); // 첫 성공 후 기록 (첫 성공 전 null이 F7.2 로딩 판정 근거)

    // 이후 실패가 이어져도 시각은 지워지지 않는다 — 갱신 정체 판단용
    shouldFail = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.failStreak).toBeGreaterThan(0);
    expect(result.current.lastSuccessAt).toBe(first);
  });

  it("언마운트 시 진행 중인 요청을 취소하고 다음 tick을 예약하지 않는다", async () => {
    vi.useFakeTimers();
    const seen: AbortSignal[] = [];
    const fn = vi.fn((signal: AbortSignal) => {
      seen.push(signal);
      return Promise.resolve();
    });
    const { unmount } = renderHook(() => usePolling(fn, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect(seen[0].aborted).toBe(true);

    const callsAtUnmount = fn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fn).toHaveBeenCalledTimes(callsAtUnmount);
  });

  it("취소는 실패로 세지 않는다", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const { result, unmount } = renderHook(() => usePolling(fn, 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect(result.current.failStreak).toBe(0);
  });
});

describe("useFilters — URL 동기화", () => {
  it("기본 상태는 production / All / 30분 / 5초", () => {
    expect(DEFAULT_STATE).toMatchObject({
      env: "production",
      instances: [],
      gpus: [],
      migs: [],
      rangeSec: 1800,
      refreshSec: 5,
    });
  });

  it("URL을 상태로 복원한다", () => {
    const s = stateFromSearch("?instance=gpu-server-01&gpu=0,2&mig=1&range=300&refresh=0");
    expect(s.instances).toEqual(["gpu-server-01"]);
    expect(s.gpus).toEqual(["0", "2"]);
    expect(s.migs).toEqual(["1"]);
    expect(s.rangeSec).toBe(300);
    expect(s.refreshSec).toBe(0);
  });

  it("잘못된 값은 기본값으로 떨어진다", () => {
    const s = stateFromSearch("?range=abc&refresh=-5");
    expect(s.rangeSec).toBe(DEFAULT_STATE.rangeSec);
    expect(s.refreshSec).toBe(DEFAULT_STATE.refreshSec);
  });

  it("기본값은 URL에 쓰지 않는다 (짧게 유지)", () => {
    expect(searchFromState(DEFAULT_STATE)).toBe("");
    expect(searchFromState({ ...DEFAULT_STATE, gpus: ["1"] })).toBe("?gpu=1");
    expect(searchFromState({ ...DEFAULT_STATE, migs: ["0"] })).toBe("?mig=0");
  });

  it("상태 변경이 URL에 반영된다", async () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.setState({ rangeSec: 300 }));
    await waitFor(() => expect(location.search).toBe("?range=300"));
  });

  it("필터 변경이 해시 라우트(#/llm)를 보존한다 (L3 — RL-2)", async () => {
    history.replaceState(null, "", "/#/llm");
    const { result } = renderHook(() => useFilters());
    act(() => result.current.setState({ rangeSec: 300 }));
    await waitFor(() => expect(location.search).toBe("?range=300"));
    expect(location.hash).toBe("#/llm"); // replaceState가 해시를 지우지 않는다
  });

  it("뒤로가기(popstate)는 URL 쿼리스트링을 상태로 재수화한다 (CDX-L-02)", async () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.setState({ rangeSec: 300 }));
    await waitFor(() => expect(location.search).toBe("?range=300"));
    // 브라우저 뒤로가기로 이전 엔트리(필터 없던 URL)에 도착한 상황을 재현
    act(() => {
      history.replaceState(null, "", "/?range=3600");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(result.current.state.rangeSec).toBe(3600));
  });

  it("selectGpu는 해당 서버·GPU만 남긴다 (타임라인 막대 클릭)", async () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.selectGpu("gpu-server-02", "3"));
    expect(result.current.state.instances).toEqual(["gpu-server-02"]);
    expect(result.current.state.gpus).toEqual(["3"]);
    await waitFor(() => expect(location.search).toContain("instance=gpu-server-02"));
  });

  it("reset은 초기 상태로 되돌린다", async () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.selectGpu("gpu-server-01", "0"));
    act(() => result.current.reset());
    expect(result.current.state).toEqual(DEFAULT_STATE);
    await waitFor(() => expect(location.search).toBe(""));
  });

  it("selectInstance는 해당 서버만 선택하고 GPU를 리셋한다 (R6 카드 클릭)", async () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.setState({ gpus: ["2"] }));
    act(() => result.current.selectInstance("gpu-server-02"));
    expect(result.current.state.instances).toEqual(["gpu-server-02"]);
    expect(result.current.state.gpus).toEqual([]); // 인스턴스 전환 시 GPU 선택 무효화
    await waitFor(() => expect(location.search).toBe("?instance=gpu-server-02"));
  });

  it("selectGpu·selectInstance는 MIG 선택도 초기화한다 (CDX-R3-05 계단식 연장)", () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.setState({ migs: ["1"] }));
    act(() => result.current.selectGpu("gpu-server-01", "0"));
    expect(result.current.state.migs).toEqual([]);
    act(() => result.current.setState({ migs: ["0"] }));
    act(() => result.current.selectInstance("gpu-server-02"));
    expect(result.current.state.migs).toEqual([]);
  });

  it("단독 선택된 카드를 다시 클릭하면 All로 토글한다", () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.selectInstance("gpu-server-01"));
    expect(result.current.state.instances).toEqual(["gpu-server-01"]);
    act(() => result.current.selectInstance("gpu-server-01"));
    expect(result.current.state.instances).toEqual([]);
  });

  it("다른 카드 클릭은 선택을 교체한다 (누적 아님)", () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.selectInstance("gpu-server-01"));
    act(() => result.current.selectInstance("gpu-server-03"));
    expect(result.current.state.instances).toEqual(["gpu-server-03"]);
  });

  it("복수 선택(필터) 상태에서 카드 클릭은 그 서버 단독 선택으로 좁힌다", () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.setState({ instances: ["gpu-server-01", "gpu-server-02"] }));
    act(() => result.current.selectInstance("gpu-server-01"));
    expect(result.current.state.instances).toEqual(["gpu-server-01"]);
  });
});

describe("useRangeSelection — 브러시 선택 상태 (R6)", () => {
  it("초기 null → set → clear로 되돌린다", () => {
    const { result } = renderHook(() => useRangeSelection());
    expect(result.current.selection).toBeNull();
    act(() => result.current.setSelection({ startMs: 1000, endMs: 2000 }));
    expect(result.current.selection).toEqual({ startMs: 1000, endMs: 2000 });
    act(() => result.current.clear());
    expect(result.current.selection).toBeNull();
  });
});
