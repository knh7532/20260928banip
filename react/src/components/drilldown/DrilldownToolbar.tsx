/**
 * 상세 대시보드 툴바 (S3, 2026-08-09) — 정적 `res/sqream/drilldown.html`의 이관.
 *
 * S3에서 ③ 셸을 걷어내면서 **이 툴바를 통째로 잃었다**(codex CDX-S3C-01). 서버 선택만
 * 사이드바에 남았고 자동 갱신은 5초 고정·Off 불가였다. 원본 컨트롤을 그대로 되살렸다.
 *
 * 정적본과 맞춘 것:
 *  - 옵션값·라벨·기본값(구간 1800초, 갱신 5초)이 동일하다.
 *  - 워커 이름 규칙은 `sqream{노드번호}{GPU}{MIG+1}` (MIG만 1-based) —
 *    exporter의 `sim_params.worker_name()`과 같아야 한다. `lib/format.ts`의
 *    `workerName()`이 단일 진원지이므로 그것을 쓴다(ADR H-0002).
 *  - 리셋 2종: "전체 구간(30분)으로 리셋"은 **구간만**, "구간·필터 모두 초기화"는 전부.
 *
 * 원본과 **다르게 한 것** (인간 지시 2026-08-09):
 *  - 제목을 통째로 뺐다. 상단바가 "SQream DB Monitoring"을, 본문 `h2`가 화면 이름을
 *    말하므로 툴바가 또 말할 이유가 없다(2026-08-09 큰 제목 제거 → 2026-08-10 화면 이름도).
 *  - 필터 4종이 툴바 맨 앞에 온다.
 *  - **Worker 목록이 더는 Node에 종속되지 않는다.** Node가 All이면 세 노드의 워커
 *    24개를 전부 보여 준다. 하나를 고르면 Node도 그 노드로 함께 이동한다 —
 *    슬롯만으로는 어느 노드인지 알 수 없기 때문이다.
 */
import { useMemo, useState } from "react";

import { NODES } from "../../api/queries";
import { displayNode } from "../../lib/format";
import {
  DEFAULT_FILTERS, DEFAULT_RANGE_SEC, GPU_OPTIONS, RANGE_OPTIONS, REFRESH_OPTIONS, workerOptions,
  type DrilldownFilters,
} from "./toolbarModel";

export function DrilldownToolbar({ filters, onChange, realtimeOnly = false }: {
  filters: DrilldownFilters;
  onChange: (next: DrilldownFilters) => void;
  realtimeOnly?: boolean;
}) {
  const set = (patch: Partial<DrilldownFilters>) => onChange({ ...filters, ...patch });
  const workers = workerOptions(filters.server, filters.gpu);

  // ===== 20260908 추가 시작 : 조회기간 시작시간 ~ 끝시간 직접 지정 =====
  const initialRange = useMemo(() => {
    const end = filters.endMs ?? Date.now();
    return { start: end - filters.rangeSec * 1000, end };
  }, []);
  const toInputValue = (ms: number) => {
    const d = new Date(ms);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };
  const [startText, setStartText] = useState(() => toInputValue(initialRange.start));
  const [endText, setEndText] = useState(() => toInputValue(initialRange.end));
  const [rangeError, setRangeError] = useState("");

  const applyDateRange = () => {
    const startMs = new Date(startText).getTime();
    const endMs = new Date(endText).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      setRangeError("시작시간은 끝시간보다 이전이어야 합니다.");
      return;
    }
    const rangeSec = Math.max(1, Math.floor((endMs - startMs) / 1000));
    setRangeError("");
    // 과거 구간 조회 중 자동으로 현재 시각으로 이동하지 않도록 자동 갱신은 Off 처리.
    set({ rangeSec, endMs, refreshSec: 0 });
  };

  const resetDateRange = () => {
    const end = Date.now();
    const start = end - DEFAULT_RANGE_SEC * 1000;
    setStartText(toInputValue(start));
    setEndText(toInputValue(end));
    setRangeError("");
    set({ rangeSec: DEFAULT_RANGE_SEC, endMs: null });
  };

  // ===== 20260908 추가 시작 : 조회기간 오른쪽 시간 범위 프리셋 복원 =====
  const applyPresetRange = (rangeSec: number) => {
    const end = Date.now();
    const start = end - rangeSec * 1000;
    setStartText(toInputValue(start));
    setEndText(toInputValue(end));
    setRangeError("");
    // 프리셋은 원래 동작처럼 '현재 시각 기준 최근 N분/시간' 조회로 복귀한다.
    set({ rangeSec, endMs: null });
  };
  const presetRangeValue = RANGE_OPTIONS.some(([v]) => v === filters.rangeSec) && filters.endMs == null
    ? filters.rangeSec
    : "";
  // ===== 20260908 추가 끝 : 조회기간 오른쪽 시간 범위 프리셋 복원 =====
  // ===== 20260908 추가 끝 : 조회기간 시작시간 ~ 끝시간 직접 지정 =====

  return (
    <header className="sqm-toolbar">
      {/* 필터 4종. DOM 순서(환경 → Node → GPU → Worker)는 게이트가 단언한다.
          화면 이름은 **본문 제목이 맡는다** — 툴바에도 두면 같은 이름이 두 번 나온다
          (인간 지적 2026-08-10). */}
      <div className="sqm-toolbar__filters" aria-label="상세 대시보드 필터">
        <label className="sqm-toolbar__filter">
          <span>환경</span>
          <select value={filters.env} onChange={(e) => set({ env: e.target.value })}>
            <option value="production">production</option>
          </select>
        </label>

        <label className="sqm-toolbar__filter">
          <span>Node(서버)</span>
          <select
            value={filters.server}
            onChange={(e) => {
              // Node가 바뀌면 하위 선택(GPU·Worker)은 무효다 — 정적본과 같다.
              set({ server: e.target.value, gpu: "", mig: "" });
            }}
          >
            <option value="">All</option>
            {NODES.map((n) => <option key={n} value={n}>{displayNode(n)}</option>)}
          </select>
        </label>

        <label className="sqm-toolbar__filter">
          <span>GPU</span>
          <select
            value={filters.gpu}
            onChange={(e) => set({ gpu: e.target.value, mig: "" })}
          >
            <option value="">All</option>
            {GPU_OPTIONS.map((g) => <option key={g} value={g}>GPU-{g}</option>)}
          </select>
        </label>

        <label className="sqm-toolbar__filter sqm-toolbar__filter--worker">
          <span>Worker</span>
          <select
            value={filters.mig === "" ? "" : `${filters.server}:${filters.mig}`}
            onChange={(e) => {
              if (e.target.value === "") { set({ mig: "" }); return; }
              // 노드를 함께 옮긴다. 슬롯만 저장하면 Node=All에서 어느 노드인지 잃는다.
              const [node, slot] = e.target.value.split(":");
              set({ server: node, mig: slot });
            }}
          >
            <option value="">All</option>
            {workers.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </label>
      </div>

      {/* 뒷줄 — 오른쪽 끝에 붙는다(`margin-left: auto`).
          시간 범위·자동 갱신은 Worker보다 뒤에 있어야 게이트의 라벨 순서 단언이 맞는다. */}
      <div className="sqm-toolbar__trailing">
        {!realtimeOnly && <>
        <div className="sqm-toolbar__actions">
          <button
            type="button" className="sqm-toolbar__reset"
            onClick={resetDateRange}
          >
            전체 구간(30분)으로 리셋
          </button>
          <button
            type="button" className="sqm-toolbar__reset"
            onClick={() => { resetDateRange(); onChange({ ...DEFAULT_FILTERS }); }}
          >
            구간·필터 모두 초기화
          </button>
        </div>

        {/* ===== 20260908 추가 시작 : 시간 범위 셀렉트 -> 조회기간 시작/끝 ===== */}
        <div className="sqm-toolbar__date-range">
          <label className="sqm-toolbar__filter sqm-toolbar__filter--datetime">
            <span>조회기간 시작</span>
            <input
              type="datetime-local"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
            />
          </label>
          <span className="sqm-toolbar__date-sep">~</span>
          <label className="sqm-toolbar__filter sqm-toolbar__filter--datetime">
            <span>조회기간 끝</span>
            <input
              type="datetime-local"
              value={endText}
              onChange={(e) => setEndText(e.target.value)}
            />
          </label>
          <button type="button" className="sqm-toolbar__search" onClick={applyDateRange}>조회</button>
          {rangeError && <span className="sqm-toolbar__date-error">{rangeError}</span>}
        </div>
        {/* ===== 20260908 추가 끝 : 시간 범위 셀렉트 -> 조회기간 시작/끝 ===== */}

        {/* ===== 20260908 추가 시작 : 조회기간 오른쪽 기존 시간 범위 복원 ===== */}
        <label className="sqm-toolbar__filter">
          <span>시간 범위</span>
          <select
            value={presetRangeValue}
            onChange={(e) => {
              if (e.target.value) applyPresetRange(Number(e.target.value));
            }}
          >
            {presetRangeValue === "" && <option value="">직접 지정</option>}
            {RANGE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        {/* ===== 20260908 추가 끝 : 조회기간 오른쪽 기존 시간 범위 복원 ===== */}

        </>}

        <label className="sqm-toolbar__filter">
          <span>자동 갱신</span>
          <select value={filters.refreshSec} onChange={(e) => set({ refreshSec: Number(e.target.value) })}>
            {REFRESH_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
      </div>
    </header>
  );
}
