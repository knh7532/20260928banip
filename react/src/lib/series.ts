/**
 * Prometheus range 결과(matrix) → C3 라인 차트 입력으로 변환한다.
 *
 * 서로 다른 시리즈(GPU별)가 샘플 시각이 어긋날 수 있으므로 **시각의 합집합**을 x축으로
 * 만들고, 각 시리즈 값을 그 격자에 맞춘다. 빠진 지점은 `null`(C3에서 선이 끊김)로 둔다.
 * `"NaN"`·비유한 값도 `null`로 처리해 축이 튀지 않게 한다.
 */
import type { PromSeries } from "../api/prom";

import { displayNode, workerName } from "./format";

export interface SeriesLine {
  /** 라인 유일 식별 + C3 컬럼 ID의 근거 (예: "gpu-server-01/0") */
  id: string;
  /** 화면 표기 = C3 컬럼 ID (예: "S01·GPU0") — 라인마다 유일해야 한다 */
  label: string;
  /** 색 매핑 키 (예: gpu="0" → GPU 팔레트) */
  colorKey: string;
  /** x축 격자에 정렬된 값 (없으면 null) */
  values: Array<number | null>;
  // 20260916 추가: hostname 평균선 표시
  dashed?: boolean;
  average?: boolean;
}

export interface TimeSeries {
  /** x축 시각(ms), 오름차순 */
  x: number[];
  lines: SeriesLine[];
}

/** 시리즈를 라인으로 가르는 방법 — id/label/color 키 추출기. */
export interface SeriesKey {
  /** 라인 유일 식별 (여러 라벨을 합쳐 충돌 방지 — 예: node+gpu) */
  id: (m: Record<string, string>) => string;
  /** 화면 표기 라벨 (기본 id). **라인마다 유일**해야 C3 컬럼이 덮어써지지 않는다. */
  label?: (m: Record<string, string>) => string;
  /** 색 매핑 키 (기본 id) — 여러 라인이 같은 색을 공유할 수 있다(예: GPU 번호). */
  colorKey?: (m: Record<string, string>) => string;
}

/** 노드명 → 짧은 태그 (예: gpu-server-01 → S01). */
export const shortNode = (node: string): string => `S${/(\d+)$/.exec(node ?? "")?.[1] ?? node}`;

/**
 * GPU 라인 식별 키 (R6 인스턴스 중심 뷰 + R7 MIG).
 * 한 라인 = MIG 인스턴스 = SQream 워커 하나이므로 **워커 이름을 라벨로 쓴다**
 * (예: "sqream101"). 표·타임라인·드릴다운과 같은 표기로 맞춘 것이다 — 2026-08-08 표기 통일.
 * 색은 물리 gpu 번호로 매핑(MIG 쌍이 색 공유 — 라벨로 구분, ADR R-0006).
 */
export function gpuSeriesKey(_singleInstance: boolean): SeriesKey {
  return {
    id: (m) => `${m.node}/${m.gpu}/${m.mig}`,
    label: (m) => workerName(m.node, m.gpu, m.mig),
    colorKey: (m) => m.gpu,
  };
}

/**
 * GPU 단위 라인 키 (L3 — LLM 화면). `avg/sum by(node, gpu)` 시리즈용 — mig 없음.
 * 단일 인스턴스: "GPU-0"~"GPU-3" (시안), 복수/All: "S01·GPU0" 복합 라벨.
 * 색은 물리 gpu 번호 팔레트.
 */
export function nodeGpuSeriesKey(singleInstance: boolean): SeriesKey {
  return {
    id: (m) => `${m.node}/${m.gpu}`,
    label: singleInstance
      ? (m) => `GPU-${m.gpu}`
      : (m) => `${shortNode(m.node)}·GPU${m.gpu}`,
    colorKey: (m) => m.gpu,
  };
}

/**
 * 노드 평균 라인 키 (R9 — All 뷰). 24슬롯 개별선 대신 `avg by(node)` 3선을 그린다 —
 * 색은 노드 팔레트(`--node-1/2/3`), 라벨은 화면 표기("icspreamh2gpu01").
 */
export function nodeSeriesKey(): SeriesKey {
  return {
    id: (m) => m.node,
    label: (m) => displayNode(m.node),
    colorKey: (m) => m.node,
  };
}

/** 초 단위 타임스탬프 문자열 값을 숫자로. 비유한이면 null. */
function num(raw: string): number | null {
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? v : null;
}

/**
 * matrix 시리즈를 라인화한다.
 *
 * 라인 id/label은 **여러 라벨을 합쳐 유일**하게 만든다 — All 필터에서 여러 노드의 같은
 * GPU 번호(예: 3개 노드의 gpu=0)가 같은 컬럼으로 뭉쳐 C3가 뒤 컬럼으로 덮어쓰는 것을
 * 막는다(CDX-R4-01). 색은 별도 colorKey(예: gpu 번호)로 매핑해 노드가 달라도 GPU 색은 같다.
 */
export function toTimeSeries(series: PromSeries[], key: SeriesKey): TimeSeries {
  const labelOf = key.label ?? key.id;
  const colorOf = key.colorKey ?? key.id;

  // x축 = 모든 시리즈 타임스탬프(초)의 합집합, 오름차순
  const tset = new Set<number>();
  for (const s of series) {
    for (const [t] of s.values ?? []) tset.add(t);
  }
  const xs = [...tset].sort((a, b) => a - b);
  const idxOf = new Map<number, number>(xs.map((t, i) => [t, i]));

  const lines: SeriesLine[] = series
    .map((s) => {
      const values: Array<number | null> = Array.from({ length: xs.length }, () => null);
      for (const [t, raw] of s.values ?? []) {
        const i = idxOf.get(t);
        if (i !== undefined) values[i] = num(raw);
      }
      return { id: key.id(s.metric), label: labelOf(s.metric), colorKey: colorOf(s.metric), values };
    })
    // 라인 순서를 안정화 (id 기준 numeric)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  return { x: xs.map((t) => t * 1000), lines };
}

/**
 * C3 `columns` 형태로 변환한다: `[["x", ...ms], ["GPU-0", ...], ...]`.
 * x는 timeseries 축으로 쓸 ms 배열이다.
 */
export function toC3Columns(ts: TimeSeries): Array<Array<string | number | null>> {
  const xCol: Array<string | number> = ["x", ...ts.x];
  const valueCols = ts.lines.map((l) => [l.label, ...l.values] as Array<string | number | null>);
  return [xCol, ...valueCols];
}
