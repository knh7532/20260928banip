/**
 * 상세 대시보드 툴바의 **상태 모델과 옵션** (S3).
 *
 * 컴포넌트 파일과 분리한 이유는 react-refresh 규칙 — 한 파일이 컴포넌트와 상수/함수를
 * 함께 내보내면 fast refresh가 꺼진다.
 */
import { NODES } from "../../api/queries";
import { workerName } from "../../lib/format";

/** 정적본과 같은 기본값. */
export const DEFAULT_RANGE_SEC = 1800;
export const DEFAULT_REFRESH_SEC = 5;

export const RANGE_OPTIONS: Array<[number, string]> = [
  [300, "Last 5 minutes"],
  [1800, "Last 30 minutes"],
  [3600, "Last 1 hour"],
  [21600, "Last 6 hours"],
];

export const REFRESH_OPTIONS: Array<[number, string]> = [
  [0, "Off"],
  [5, "5s"],
  [10, "10s"],
  [30, "30s"],
];

export const GPU_OPTIONS = ["0", "1", "2", "3"];
/** GPU 한 장의 MIG 분할 수 — H200 141GB를 2분할(3g.71gb)한 고정 구성.
    exporter `sim_params`와 같은 값이라 `GPU_OPTIONS × MIG_OPTIONS`가
    노드의 고정 워커 맵(8슬롯)이 된다(X9). */
export const MIG_OPTIONS = ["0", "1"];

/** 툴바가 들고 있는 필터 전체. 화면들은 필요한 것만 쓴다. */
export interface DrilldownFilters {
  env: string;
  /** 원시 노드 라벨(`gpu-server-01`). 빈 문자열이면 All. */
  server: string;
  /** 물리 GPU 번호. 빈 문자열이면 All. */
  gpu: string;
  /** MIG 슬롯 0~7. 빈 문자열이면 All. */
  mig: string;
  rangeSec: number;
  // ===== 20260908 추가 시작 : 조회기간 종료시각 고정 =====
  /** null이면 현재 시각 기준, 값이 있으면 해당 종료시각 기준으로 고정 조회. */
  endMs: number | null;
  // ===== 20260908 추가 끝 : 조회기간 종료시각 고정 =====
  /** 0이면 자동 갱신 Off. */
  refreshSec: number;
}

export const DEFAULT_FILTERS: DrilldownFilters = {
  env: "production", server: "", gpu: "", mig: "",
  rangeSec: DEFAULT_RANGE_SEC,
  // ===== 20260908 추가 시작 : 기본은 현재 시각 기준 상대 조회 =====
  endMs: null,
  // ===== 20260908 추가 끝 : 기본은 현재 시각 기준 상대 조회 =====
  refreshSec: DEFAULT_REFRESH_SEC,
};

export interface WorkerOption {
  /** 셀렉트 값 — `노드:슬롯`. 노드가 달라도 겹치지 않게 노드를 함께 싣는다. */
  value: string;
  /** `sqream101` 같은 워커 이름. */
  label: string;
  node: string;
  /** 평탄화 슬롯 0~7 (= gpu*2 + mig). */
  slot: string;
}

/**
 * 고를 수 있는 워커 목록.
 *
 * 정적본과 초기 React판은 **Node를 먼저 고르게 강제**했다(미선택이면 "Node 선택 필요"로
 * 비활성). 인간 지시로 바꾼다(2026-08-09) — Node가 All이면 **세 노드의 워커를 전부**
 * 보여 준다. 노드당 GPU 4 × MIG 2 = 8개이므로 All·All에서 24개다.
 *
 * 이름에 노드 번호가 들어가므로(`workerName` = `sqream{노드}{GPU}{MIG+1}`) 24개가
 * 서로 구별된다. 다만 **값**은 이름이 아니라 `노드:슬롯`을 쓴다 — 표시 문자열을
 * 되파싱하지 않기 위해서다.
 *
 * 워커를 고르면 호출부가 `server`와 `mig`를 **함께** 설정해야 한다. 슬롯만으로는
 * 어느 노드인지 알 수 없고, `queries.ts`의 `slotFilter()`가 노드를 `f.instances`에서
 * 받기 때문이다.
 */
export function workerOptions(server: string, gpu: string): WorkerOption[] {
  const nodes = server ? [server] : [...NODES];
  return nodes.flatMap((node) =>
    Array.from({ length: 8 }, (_, slot) => slot)
      .filter((slot) => !gpu || Math.floor(slot / 2) === Number(gpu))
      .map((slot) => ({
        value: `${node}:${slot}`,
        label: workerName(node, String(Math.floor(slot / 2)), String(slot % 2)),
        node,
        slot: String(slot),
      })));
}
