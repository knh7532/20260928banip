/** 차트 표시 메타데이터 (컴포넌트 파일 밖 — react-refresh 규칙 준수). */
import type { ServerSummary } from "../hooks/useDashboardData";
import { GAUGE_LEVEL_COLORS } from "./colors";
import { formatPercent, formatTemp, formatWatt } from "./format";

/** 시계열 y축 눈금 라벨 — 단위는 소제목에 있으므로 정수만. */
export const axisLabel = (v: number): string => Number.isFinite(v) ? `${Math.round(v)}` : "-";

/**
 * 서버 카드 arc 게이지 지표 (R7 — Grafana판 미러 + 계약 v2.0 H200).
 * %·온도는 green→orange(70/75)→red(85) 임계 전환, 전력은 단색(info)·상한 2800W
 * (Grafana 재현판 v2 max — H200 TDP 700W × 4장).
 */
export const GAUGE_METRICS: Array<{
  key: keyof Pick<ServerSummary, "utilization" | "memoryPct" | "temperature" | "power">;
  label: string;
  min: number;
  max: number;
  /** 단계 색 — thresholds가 있으면 pattern으로 단계 전환, 없으면 첫 색 단색. */
  colors: string[];
  /** 색 전환 경계값 (value 단위). colors.length === thresholds.length + 1. */
  thresholds?: number[];
  fmt: (v: number) => string;
}> = [
  {
    key: "utilization",
    label: "GPU사용률(평균)",
    min: 0,
    max: 100,
    colors: [GAUGE_LEVEL_COLORS.ok, GAUGE_LEVEL_COLORS.warn, GAUGE_LEVEL_COLORS.danger],
    thresholds: [70, 85],
    fmt: (v) => formatPercent(v),
  },
  {
    key: "memoryPct",
    label: "메모리사용률(평균)",
    min: 0,
    max: 100,
    colors: [GAUGE_LEVEL_COLORS.ok, GAUGE_LEVEL_COLORS.warn, GAUGE_LEVEL_COLORS.danger],
    thresholds: [70, 85],
    fmt: (v) => formatPercent(v),
  },
  {
    key: "temperature",
    label: "온도(평균)",
    min: 0,
    max: 100,
    colors: [GAUGE_LEVEL_COLORS.ok, GAUGE_LEVEL_COLORS.warn, GAUGE_LEVEL_COLORS.danger],
    thresholds: [75, 85],
    fmt: (v) => formatTemp(v),
  },
  {
    key: "power",
    label: "전력사용(합계)",
    min: 0,
    max: 2800,
    colors: [GAUGE_LEVEL_COLORS.info],
    fmt: (v) => formatWatt(v),
  },
];
