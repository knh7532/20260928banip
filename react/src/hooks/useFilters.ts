import { useCallback, useEffect, useState } from "react";

import type { Filters } from "../api/queries";

/** 필터바 전체 상태 — 서버·GPU 선택 + 시간범위 + 자동 갱신. */
export interface DashboardState extends Filters {
  /** 조회 구간(초). 기본 30분 — 형제 프로젝트의 시간 압축과 정합. */
  rangeSec: number;
  // ===== 20260908 추가 시작 : Overview 조회기간 시작 ~ 끝 직접 지정 =====
  /** 직접 지정한 조회 시작 시각(ms). null이면 현재시각 기준 rangeSec 사용. */
  startMs: number | null;
  /** 직접 지정한 조회 종료 시각(ms). null이면 현재시각 사용. */
  endMs: number | null;
  // ===== 20260908 추가 끝 : Overview 조회기간 시작 ~ 끝 직접 지정 =====
  /** 자동 갱신 주기(초). 0이면 갱신하지 않는다. */
  refreshSec: number;
}

export const DEFAULT_STATE: DashboardState = {
  env: "production",
  instances: [],
  gpus: [],
  migs: [],
  rangeSec: 30 * 60,
  // ===== 20260908 추가 시작 : Overview 기본은 최근 30분 =====
  startMs: null,
  endMs: null,
  // ===== 20260908 추가 끝 : Overview 기본은 최근 30분 =====
  refreshSec: 5,
};

export const RANGE_OPTIONS = [
  { label: "Last 5 minutes", sec: 5 * 60 },
  { label: "Last 30 minutes", sec: 30 * 60 },
  { label: "Last 1 hour", sec: 60 * 60 },
  { label: "Last 6 hours", sec: 6 * 60 * 60 },
] as const;

export const REFRESH_OPTIONS = [
  { label: "Off", sec: 0 },
  { label: "5s", sec: 5 },
  { label: "10s", sec: 10 },
  { label: "30s", sec: 30 },
] as const;

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

/**
 * URL에서 온 숫자는 **허용 목록에 있는 값만** 받는다 (CDX-R2-09).
 * 임의 정수를 허용하면 비표준 구간이나 과도한 갱신 주기가 요청 폭주를 만든다.
 */
function parseAllowed(raw: string | null, allowed: readonly number[], fallback: number): number {
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const v = Number.parseInt(raw, 10);
  return allowed.includes(v) ? v : fallback;
}

const ALLOWED_RANGES = RANGE_OPTIONS.map((o) => o.sec);
const ALLOWED_REFRESH = REFRESH_OPTIONS.map((o) => o.sec);

/** URL 쿼리스트링 → 상태 (새로고침·링크 공유 시 화면이 복원된다). */
export function stateFromSearch(search: string): DashboardState {
  const p = new URLSearchParams(search);
  return {
    env: p.get("env") ?? DEFAULT_STATE.env,
    instances: parseList(p.get("instance")),
    gpus: parseList(p.get("gpu")),
    migs: parseList(p.get("mig")),
    rangeSec: parseAllowed(p.get("range"), ALLOWED_RANGES, DEFAULT_STATE.rangeSec),
    // ===== 20260908 추가 시작 : Overview URL 조회기간 복원 =====
    startMs: p.get("start") && /^\d+$/.test(p.get("start")!) ? Number(p.get("start")) : null,
    endMs: p.get("end") && /^\d+$/.test(p.get("end")!) ? Number(p.get("end")) : null,
    // ===== 20260908 추가 끝 : Overview URL 조회기간 복원 =====
    refreshSec: parseAllowed(p.get("refresh"), ALLOWED_REFRESH, DEFAULT_STATE.refreshSec),
  };
}

/** 상태 → URL 쿼리스트링 (기본값은 생략해 URL을 짧게 유지). */
export function searchFromState(s: DashboardState): string {
  const p = new URLSearchParams();
  if (s.env !== DEFAULT_STATE.env) p.set("env", s.env);
  if (s.instances.length > 0) p.set("instance", s.instances.join(","));
  if (s.gpus.length > 0) p.set("gpu", s.gpus.join(","));
  if (s.migs.length > 0) p.set("mig", s.migs.join(","));
  if (s.rangeSec !== DEFAULT_STATE.rangeSec) p.set("range", String(s.rangeSec));
  // ===== 20260908 추가 시작 : Overview URL 조회기간 저장 =====
  if (s.startMs != null) p.set("start", String(s.startMs));
  if (s.endMs != null) p.set("end", String(s.endMs));
  // ===== 20260908 추가 끝 : Overview URL 조회기간 저장 =====
  if (s.refreshSec !== DEFAULT_STATE.refreshSec) p.set("refresh", String(s.refreshSec));
  const q = p.toString();
  return q === "" ? "" : `?${q}`;
}

/**
 * 필터 상태 + URL 동기화.
 *
 * 타임라인 막대를 클릭하면 특정 GPU만 보도록 좁힐 수 있어야 하므로(`selectGpu`),
 * 상태 변경 API를 함께 제공한다.
 */
export function useFilters(): {
  state: DashboardState;
  setState: (patch: Partial<DashboardState>) => void;
  selectGpu: (node: string, gpu: string) => void;
  selectInstance: (node: string) => void;
  reset: () => void;
} {
  const [state, setStateRaw] = useState<DashboardState>(() =>
    stateFromSearch(typeof location === "undefined" ? "" : location.search),
  );

  useEffect(() => {
    if (typeof history === "undefined") return;
    // location.hash 보존 (L3) — 해시 라우트(#/llm)가 필터 변경마다 지워지지 않도록.
    const url = `${location.pathname}${searchFromState(state)}${location.hash}`;
    history.replaceState(null, "", url);
  }, [state]);

  // 뒤로가기(popstate)로 이전 히스토리 엔트리에 도착하면 그 URL의 쿼리스트링을
  // 상태로 재수화한다 (CDX-L-02) — 해시 내비게이션이 히스토리 엔트리를 만들므로
  // 뒤로가기 후 URL과 필터 상태가 어긋나는 것을 막는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => setStateRaw(stateFromSearch(location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setState = useCallback((patch: Partial<DashboardState>) => {
    setStateRaw((prev) => ({ ...prev, ...patch }));
  }, []);

  const selectGpu = useCallback((node: string, gpu: string) => {
    setStateRaw((prev) => ({ ...prev, instances: [node], gpus: [gpu], migs: [] }));
  }, []);

  /**
   * 사이드바 서버 카드 클릭 → 인스턴스 선택 토글 (R6 — PPTX 단일 인스턴스 뷰).
   * 이미 단독 선택된 카드를 다시 클릭하면 All([])로 해제. 인스턴스가 바뀌면
   * GPU 선택은 의미를 잃으므로 항상 초기화한다(CDX-R3-05와 동일 규칙).
   */
  const selectInstance = useCallback((node: string) => {
    setStateRaw((prev) => {
      const isSole = prev.instances.length === 1 && prev.instances[0] === node;
      return { ...prev, instances: isSole ? [] : [node], gpus: [], migs: [] };
    });
  }, []);

  const reset = useCallback(() => setStateRaw(DEFAULT_STATE), []);

  return { state, setState, selectGpu, selectInstance, reset };
}
