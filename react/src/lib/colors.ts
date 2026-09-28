/**
 * 차트 색 — 시안(PPTX)·Grafana mockup 팔레트를 코드에서 쓰기 위한 맵.
 *
 * GPU/쿼리 색은 `src/styles/tokens.css`의 `--gpu-*`·`--qt-*`와 동일해야 한다.
 * 게이지 색은 Grafana JSON의 기본 임계 팔레트를 직접 따른다. C3는 색을 CSS 변수로
 * 못 받고 문자열 hex를 요구하므로 여기서 상수로 둔다.
 */

/**
 * GPU 시리즈 4색 — Google Finance풍 뮤티드 팔레트 (E4, 인간 확정 2026-08-25).
 * Google 다크 테마 데이터 색: blue/green/yellow/red.
 */
export const GPU_SERIES_COLORS: Record<string, string> = {
  "0": "#8ab4f8",
  "1": "#81c995",
  "2": "#fdd663",
  "3": "#f28b82",
};

/** 쿼리 유형 6색 (시안 범례). */
export const QUERY_TYPE_COLORS: Record<string, string> = {
  select: "#4ade80",
  etl: "#f5a623",
  aggregation: "#a78bfa",
  join: "#22d3ee",
  fullscan: "#f87171",
  other: "#6b7280",
};

/**
 * Grafana 게이지 단계 색 — mockup dashboard JSON의 기본 팔레트와 동일.
 * 상태 배지 토큰과는 별도이며, 값은 tests/chartColors.contract.test.ts가 고정한다.
 */
export const GAUGE_LEVEL_COLORS = {
  // Grafana palette-classic / gauge 기본 임계 색을 그대로 사용한다.
  ok: "#73BF69",
  warn: "#FF9830",
  danger: "#F2495C",
  info: "#5794F2",
} as const;

/**
 * 노드(서버) 시리즈 3색 (R9 — All 뷰 노드 평균 3선). `--node-1/2/3` 토큰과 동일해야
 * 하며, GPU 4색·쿼리 유형 6색과 겹치지 않는 색을 쓴다(색 의미 혼동 방지, F4.1).
 */
export const NODE_SERIES_COLORS: Record<string, string> = {
  // E4: 시안 확정 — 노드 3선은 뮤티드 사다리 앞 3색 공용(blue/green/yellow).
  // "노드색≠GPU색"(F4.1)은 두 뷰가 동시에 안 보이므로 시안에서 의도적으로 완화.
  "gpu-server-01": "#8ab4f8",
  "gpu-server-02": "#81c995",
  "gpu-server-03": "#fdd663",
};

/**
 * Grafana classic 톤의 노드 3색 (X13 — Main Dashboard Cluster Performance 전용).
 *
 * **새 hex가 아니다**(계약 §6.4: 신규 색 토큰 금지) — `GAUGE_LEVEL_COLORS`의
 * green/info와 정적 `--yellow`(#FADE2A)를 재사용한다. 셋 다 Grafana 기본
 * 팔레트 계열이라 classic(그린·옐로·시안) 인상을 낸다. 키에 `classic-` 접두를
 * 붙여 기존 `NODE_SERIES_COLORS`(타 화면·토큰 `--node-*`)와 충돌하지 않는다.
 */
export const NODE_CLASSIC_COLORS: Record<string, string> = {
  // E4: Cluster Performance도 뮤티드 노드 3색 — grafana classic 톤을 대체(값만 교체).
  "classic-gpu-server-01": "#8ab4f8",
  "classic-gpu-server-02": "#81c995",
  "classic-gpu-server-03": "#fdd663",
};

/**
 * 드릴다운 화면(S3)의 **의미색** — 로그 레벨·상태 계열.
 *
 * 신규 색 토큰을 만들지 않는다(LLM 계열이 잡은 선례와 같다). 값은 정적
 * `mockup/assets/style.css`의 `--green`·`--orange`·`--red`·`--info`와 동일하며,
 * 그것은 곧 Grafana 기본 팔레트(`GAUGE_LEVEL_COLORS`)다.
 */
// ===== 20260925 추가 시작 : Node별 색 계열 + 같은 Node Worker별 shade =====
export const WORKER_SERIES_COLORS: Record<string, string> = {
  "worker-0-0":"#4f8cff", "worker-0-1":"#73a6ff", "worker-0-2":"#98bdff", "worker-0-3":"#bfd6ff",
  "worker-1-0":"#e25555", "worker-1-1":"#eb7777", "worker-1-2":"#f09a9a", "worker-1-3":"#f5bcbc",
  "worker-2-0":"#9b6bd6", "worker-2-1":"#ae86df", "worker-2-2":"#c1a3e8", "worker-2-3":"#d5c1f0",
};
// ===== 20260925 추가 끝 : Node별 색 계열 + 같은 Node Worker별 shade =====

export const LEVEL_SERIES_COLORS: Record<string, string> = {
  // E4: 드릴다운 의미색도 뮤티드 팔레트로 — 정상=green·경고=yellow·오류=red·CPU=blue.
  info: "#81c995",
  warning: "#fdd663",
  error: "#f28b82",
  blue: "#8ab4f8",
  /* Cluster Performance의 RAM 계열 — 사다리 4색과 겹치지 않는 Google 다크 퍼플. */
  purple: "#d7aefb",
};

/** 알 수 없는 GPU/유형은 --muted(#6b7280)로. */
const FALLBACK = "#6b7280";

export function gpuColor(gpu: string): string {
  return GPU_SERIES_COLORS[gpu] ?? FALLBACK;
}

/**
 * 시계열 라인 colorKey → 색. colorKey는 물리 GPU 번호(단일/복수 인스턴스 뷰)이거나
 * 노드명(All 뷰 평균 3선)이다 — 두 팔레트를 순서대로 찾는다.
 */
export function seriesColor(colorKey: string): string {
  return WORKER_SERIES_COLORS[colorKey]
    ?? GPU_SERIES_COLORS[colorKey]
    ?? NODE_SERIES_COLORS[colorKey]
    ?? NODE_CLASSIC_COLORS[colorKey]  // X13 — Grafana classic 노드 팔레트(opt-in)
    ?? LEVEL_SERIES_COLORS[colorKey]  // 드릴다운 화면 (S3)
    ?? FALLBACK;
}

export function queryTypeColor(type: string): string {
  return QUERY_TYPE_COLORS[type] ?? FALLBACK;
}

/**
 * LLM 워크로드 분류 6색 (L3 — 시안 범례). **기존 6색 hex를 재사용**한다 — 신규 색 토큰
 * 없음(계약 §6.4). 의미 매핑만 다르다: vllm=초록, train=주황, data=보라, rag=청록,
 * tensorrt=빨강, other=회색.
 */
export const LLM_CATEGORY_COLORS: Record<string, string> = {
  vllm: "#4ade80",
  train: "#f5a623",
  data: "#a78bfa",
  rag: "#22d3ee",
  tensorrt: "#f87171",
  other: "#6b7280",
};

export function llmCategoryColor(category: string): string {
  return LLM_CATEGORY_COLORS[category] ?? FALLBACK;
}
