/**
 * 타임라인 세그먼트화 — `sqm_gpu_timeline_state` range 결과를 D3 간트 막대로 만든다.
 *
 * 값 도메인: 0=Idle, 1~6=카탈로그 인덱스(실행 중인 쿼리). GPU당 동시 1쿼리이므로
 * 각 (node,gpu) 행에서 **연속 동일값 구간을 하나의 막대**로 병합한다. Idle(0)은 막대를
 * 그리지 않는다. 색은 카탈로그의 `query_type`으로 정한다(계약 라벨 기준 — design-tokens §1.5).
 */
import type { PromSeries } from "../api/prom";

export interface CatalogEntry {
  name: string;
  type: string;
  database: string;
}

export interface TimelineSegment {
  node: string;
  gpu: string;
  /** MIG 인스턴스 인덱스 (v2.0) */
  mig: string;
  startMs: number;
  endMs: number;
  /** 카탈로그 인덱스 1~6 */
  value: number;
  /** 카탈로그에서 온 쿼리명·유형 */
  name: string;
  type: string;
  // ===== 20260916 추가 시작 : Worker Log 서비스/실행시간 강조 =====
  serviceName?: string;
  executionTimeMs?: number;
  highlight?: boolean;
  // ===== 20260916 추가 끝 : Worker Log 서비스/실행시간 강조 =====
}

export interface TimelineRow {
  node: string;
  gpu: string;
  /** MIG 인스턴스 인덱스 (v2.0) */
  mig: string;
  /** 정렬·React key용 (node/gpu/mig) */
  key: string;
  segments: TimelineSegment[];
}

/** 샘플 간 최소 양(+) 간격을 step으로 추정한다 (마지막 막대의 끝 시각 계산용). */
function inferStepSec(sortedTimes: number[]): number {
  let min = Infinity;
  for (let i = 1; i < sortedTimes.length; i++) {
    const d = sortedTimes[i] - sortedTimes[i - 1];
    if (d > 0 && d < min) min = d;
  }
  return Number.isFinite(min) ? min : 5;
}

/**
 * matrix 시리즈를 (node,gpu) 행별 세그먼트로 병합한다.
 * @param stepSec 마지막 막대 끝 시각에 쓸 step(초). 생략 시 샘플 간격에서 추정.
 */
export function segmentTimeline(
  series: PromSeries[],
  catalog: Record<number, CatalogEntry>,
  stepSec?: number,
): TimelineRow[] {
  return series
    .map((s) => {
      const node = s.metric.node ?? "";
      const gpu = s.metric.gpu ?? "";
      const mig = s.metric.mig ?? "";
      const samples = (s.values ?? [])
        .map(([t, raw]) => [t, Math.round(Number.parseFloat(raw))] as [number, number])
        .filter(([, v]) => Number.isFinite(v))
        .sort((a, b) => a[0] - b[0]);

      const step = stepSec ?? inferStepSec(samples.map(([t]) => t));
      const segments: TimelineSegment[] = [];

      let i = 0;
      while (i < samples.length) {
        const [t0, v] = samples[i];
        if (v <= 0) {
          i++;
          continue; // Idle — 막대 없음
        }
        // 연속 동일값 구간의 끝 인덱스 j
        let j = i;
        while (j + 1 < samples.length && samples[j + 1][1] === v) j++;
        // 막대 끝 = 다음 샘플 시각(있으면) 아니면 마지막 샘플 + step → 막대가 맞닿음
        const endT = j + 1 < samples.length ? samples[j + 1][0] : samples[j][0] + step;
        const cat = catalog[v];
        segments.push({
          node,
          gpu,
          mig,
          startMs: t0 * 1000,
          endMs: endT * 1000,
          value: v,
          name: cat?.name ?? `#${v}`,
          type: cat?.type ?? "other",
        });
        i = j + 1;
      }

      return { node, gpu, mig, key: `${node}/${gpu}/${mig}`, segments };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

/** 세그먼트 라벨 문자폭 추정 (11px 폰트 평균). jsdom엔 측정 API(getComputedTextLength)가 없어 순수 추정으로 계산한다. */
const LABEL_CHAR_W = 6.2;
/** 좌우 여백(px) — 라벨 x 오프셋(4)과 우측 숨 쉴 틈. */
const LABEL_PAD_PX = 8;

/**
 * 세그먼트 막대 안에 넣을 라벨 (R6 — PPTX 막대 위 쿼리명 재현).
 * 폭에 안 들어가면 null(라벨 생략), 일부만 들어가면 "…" 절단.
 * 내용은 쿼리명만 — "(type)" 접미사는 DES-1(계약-시안 유형 스왑)을 텍스트로도
 * 드러내므로 넣지 않는다.
 */
export function fitLabel(name: string, widthPx: number): string | null {
  const maxChars = Math.floor((widthPx - LABEL_PAD_PX) / LABEL_CHAR_W);
  if (maxChars < 4) return null;
  if (name.length <= maxChars) return name;
  return `${name.slice(0, maxChars - 1)}…`;
}

/**
 * 브러시 픽셀/시각 선택을 데이터 도메인으로 정돈한다.
 * 뒤집힌 선택(끝<시작)을 바로잡고 [domainStart,domainEnd]로 clamp한다.
 * 폭이 0이면 null(선택 해제)로 본다.
 */
export function normalizeSelection(
  a: number,
  b: number,
  domainStart: number,
  domainEnd: number,
): { startMs: number; endMs: number } | null {
  let start = Math.min(a, b);
  let end = Math.max(a, b);
  start = Math.max(domainStart, Math.min(start, domainEnd));
  end = Math.max(domainStart, Math.min(end, domainEnd));
  if (end - start <= 0) return null;
  return { startMs: start, endMs: end };
}

/**
 * 브러시 픽셀 선택 → 시간 범위. `invert`는 픽셀→ms 역스케일(D3 scale.invert).
 * 선택이 없으면(클릭·해제) null. 매핑 로직을 순수 함수로 떼어 테스트한다(d3-brush 드래그는
 * jsdom에서 재현이 불안정 — 브라우저/HCI로 확인).
 */
export function brushRange(
  selection: [number, number] | null,
  invert: (px: number) => number,
  domainStart: number,
  domainEnd: number,
): { startMs: number; endMs: number } | null {
  if (!selection) return null;
  return normalizeSelection(invert(selection[0]), invert(selection[1]), domainStart, domainEnd);
}
