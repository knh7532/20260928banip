import { useEffect, useState } from "react";

import { fetchMonitoringFilterOptions, type WorkerFilterOption } from "../api/filterOptions";
import {
  RANGE_OPTIONS, REFRESH_OPTIONS,
  type DashboardState,
} from "../hooks/useFilters";

interface FilterBarProps {
  state: DashboardState;
  setState: (patch: Partial<DashboardState>) => void;
  /** "전체 구간(30분)으로 리셋" — 시간범위 복귀 + 브러시 선택 해제 (필터 유지). */
  onResetRange: () => void;
  /** "구간·필터 모두 초기화" — 전체 초기 상태로. */
  onResetAll: () => void;
  /** MIG 드롭다운 렌더 여부 (L3 — GPU 단위인 LLM 화면은 false, 기본 = 현행). */
  showMig?: boolean;
}


export function FilterBar({ state, setState, onResetRange, onResetAll, showMig = true }: FilterBarProps) {
  // Overview 상단에서는 직접 조회기간 입력을 제거하고,
  // 시간 범위는 현재 시각 기준 최근 N분/시간으로만 조회한다.
  const applyPresetRange = (rangeSec: number) => {
    setState({ rangeSec, startMs: null, endMs: null });
  };
  const presetRangeValue = RANGE_OPTIONS.some((o) => o.sec === state.rangeSec)
    && state.startMs == null && state.endMs == null
    ? state.rangeSec
    : "";

  // ===== 20260916 추가 : DB 기반 Node -> GPU -> Worker 종속 필터 =====
  const [nodeOptions, setNodeOptions] = useState<string[]>([]);
  const [gpuOptions, setGpuOptions] = useState<number[]>([]);
  const [workerOptions, setWorkerOptions] = useState<WorkerFilterOption[]>([]);

  const selectedNode = state.instances[0] ?? "";
  const selectedGpu = state.gpus[0] ?? "";
  const selectedGi = state.migs[0] ?? "";

  useEffect(() => {
    const ac = new AbortController();
    fetchMonitoringFilterOptions(selectedNode || undefined, selectedGpu || undefined, ac.signal)
      .then((r) => {
        setNodeOptions(r.nodes ?? []);
        setGpuOptions(r.gpus ?? []);
        setWorkerOptions(r.workers ?? []);
      })
      .catch((e) => { if (e?.name !== "AbortError") console.error("filter-options", e); });
    return () => ac.abort();
  }, [selectedNode, selectedGpu]);

  const selectedWorker = workerOptions.find(
    (w) => w.hostname === selectedNode && String(w.gpuId) === selectedGpu && String(w.giId) === selectedGi,
  )?.name ?? "";

  return (
    <div className="filterbar">
      <label className="filter">
        <span className="filter__label">환경</span>
        <select className="filter__select" value={state.env} onChange={(e) => setState({ env: e.target.value, instances: [], gpus: [], migs: [] })}>
          <option value="production">production</option>
        </select>
      </label>

      <label className="filter">
        <span className="filter__label">Node(서버)</span>
        <select className="filter__select" value={selectedNode} onChange={(e) => setState({ instances: e.target.value ? [e.target.value] : [], gpus: [], migs: [] })}>
          <option value="">All</option>
          {nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}
        </select>
      </label>

      <label className="filter">
        <span className="filter__label">GPU</span>
        <select className="filter__select" value={selectedGpu} onChange={(e) => setState({ gpus: e.target.value ? [e.target.value] : [], migs: [] })}>
          <option value="">All</option>
          {gpuOptions.map((gpu) => <option key={gpu} value={gpu}>{gpu}</option>)}
        </select>
      </label>

      {showMig && (
        <label className="filter">
          <span className="filter__label">Worker</span>
          <select className="filter__select" value={selectedWorker} onChange={(e) => {
            const w = workerOptions.find((x) => x.name === e.target.value);
            if (!w) { setState({ migs: [] }); return; }
            setState({ instances: [w.hostname], gpus: [String(w.gpuId)], migs: [String(w.giId)] });
          }}>
            <option value="">All</option>
            {workerOptions.map((w) => <option key={`${w.hostname}-${w.gpuId}-${w.giId}-${w.name}`} value={w.name}>{w.name}</option>)}
          </select>
        </label>
      )}

      {/* R7: Grafana판 리셋 링크 2종 미러 — 툴바 우측으로 밀착 */}
      <div className="filterbar__actions">
        <button type="button" className="filterbar__reset" onClick={onResetRange}>
          전체 구간(30분)으로 리셋
        </button>
        <button type="button" className="filterbar__reset" onClick={onResetAll}>
          구간·필터 모두 초기화
        </button>
      </div>

      {/* ===== 20260908 추가 시작 : Overview 조회기간 오른쪽 기존 시간 범위 복원 ===== */}
      <label className="filter">
        <span className="filter__label">시간 범위</span>
        <select
          className="filter__select"
          value={presetRangeValue}
          onChange={(e) => {
            if (e.target.value) applyPresetRange(Number(e.target.value));
          }}
        >
          {presetRangeValue === "" && <option value="">직접 지정</option>}
          {RANGE_OPTIONS.map((o) => (
            <option key={o.sec} value={o.sec}>{o.label}</option>
          ))}
        </select>
      </label>
      {/* ===== 20260908 추가 끝 : Overview 조회기간 오른쪽 기존 시간 범위 복원 ===== */}

      <label className="filter">
        <span className="filter__label">자동 갱신</span>
        <select
          className="filter__select"
          value={state.refreshSec}
          onChange={(e) => setState({ refreshSec: Number(e.target.value) })}
        >
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.sec} value={o.sec}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
