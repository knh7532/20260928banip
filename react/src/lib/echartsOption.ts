/**
 * ECharts 라인 차트 옵션 빌더 (순수) — 컴포넌트는 이 결과를 `setOption`한다 (E1).
 *
 * C3 시절 `c3config.lineChartConfig`의 후계다. 시안(echarts_line_design/, 2026-08-24
 * 인간 확정)의 통일 스펙을 코드로 굳힌다:
 *  - 선 2px · 평상시 점 없음 · 호버 시 8px 원(표면색 테두리)
 *  - 면: 계열별 수직 그라디언트 15% → 투명 소멸 (E4 — Google Finance 질감, 인간 확정)
 *  - crosshair: 세로 점선 1px (시간축 그룹은 컴포넌트가 connect로 동기)
 *  - 툴팁: 일시 머리글 + 색점·라벨·굵은 값, 항상 계열 정의 순서(값 내림차순 폐기)
 *  - 호버 강조: 그 계열만 남기고 나머지 흐림(blur) — 다계열 겹침 식별(워커 8선)
 *  - 인셋 범례 없음(하단 HTML 범례 유지) · 애니메이션 off(5s 폴링)
 *
 * 렌더 검증은 jsdom에서 불가하므로 테스트는 이 빌더의 반환 옵션만 대사한다
 * (C3와 같은 전략 — 컴포넌트 테스트는 echarts를 목으로 둔다).
 */
import type { EChartsOption, LineSeriesOption } from "echarts";
import { graphic } from "echarts";

import { seriesColor } from "./colors";
import type { TimeSeries } from "./series";

export const CROSSHAIR_COLOR = "#9aa0a6";  // E4: Google Finance 질감 — 점선 crosshair
export const GRID_LINE_COLOR = "rgba(232, 234, 237, 0.07)";
export const AXIS_INK = "#9098ac";
export const PIN_COLOR = "#22d3ee";
/** 면 그라디언트 알파(hex 2자리) — E4(Google Finance 질감, 인간 확정 2026-08-25):
    위 15%에서 완전 투명으로 소멸. 구 확정(35%→20%)을 대체한다. */
export const AREA_ALPHA = { top: "26", bottom: "00" } as const;

export interface LineOpts {
  /** y축 상한 (사용률·메모리는 100). 생략 시 자동. */
  yMax?: number;
  /** y축 눈금 포맷 (단위 표기). */
  yFormat?: (v: number) => string;
  /** 오른쪽 축 눈금 포맷. */
  y2Format?: (v: number) => string;
  /** 오른쪽 축 상한. */
  y2Max?: number;
  /** 오른쪽 축(y2)에 붙일 계열 label 목록 — 단위가 다른 계열 혼재 시. */
  y2Keys?: string[];
  /** 눈금 개수 — 탑뷰 3/4, 드릴다운 5/5 (C3 시절 규칙 유지). */
  tickCount?: { y?: number; x?: number };
  /** 시간축 숨김 — 수직 스택 위쪽 카드용(맨 아래 카드가 축 대표). */
  hideXAxis?: boolean;
  /** x도메인 고정 — 스택 카드들이 요청 구간을 공유해 대표 축이 정확하다. */
  domain?: { startMs: number; endMs: number };
  /** 누적(스택) 그룹 — 멤버 label 목록. ECharts는 시리즈별 stack 문자열로 표현한다. */
  groups?: string[][];
  /** 고정된 시점 — 세로 마크라인(시안: 청록 점선). */
  pinnedMs?: number | null;
}

/** label이 속한 스택 그룹 id ("g0"…) — 없으면 undefined. */
function stackOf(label: string, groups?: string[][]): string | undefined {
  if (!groups) return undefined;
  const i = groups.findIndex((g) => g.includes(label));
  return i >= 0 ? `g${i}` : undefined;
}

/** 통일 툴팁 마크업(.ec-tip) — 값은 그 계열이 붙은 축의 단위로 찍는다. */
export function tooltipFormatter(opts: LineOpts) {
  const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  return (params: unknown): string => {
    const rows = (Array.isArray(params) ? params : [params]) as Array<{
      seriesName?: string; color?: string; value?: [number, number | null];
    }>;
    if (rows.length === 0 || !rows[0]?.value) return "";
    const when = new Date(rows[0].value[0]).toLocaleString("ko-KR");
    const body = rows.map((r) => {
      const label = r.seriesName ?? "";
      const raw = r.value?.[1];
      const onRight = opts.y2Keys?.includes(label) ?? false;
      const fmt = onRight ? opts.y2Format : opts.yFormat;
      const text = raw == null ? "-" : fmt ? fmt(raw) : String(raw);
      return `<span><i style="background:${esc(r.color ?? "")}"></i>`
        + `${esc(label)}<b>${esc(text)}</b></span>`;
    }).join("");
    return `<div class="ec-tip"><strong>${esc(when)}</strong>${body}</div>`;
  };
}

/** 폴링 갱신용 시리즈 배열 — 라벨 제거·추가를 `replaceMerge`로 반영한다. */
export function lineSeries(ts: TimeSeries, opts: LineOpts): LineSeriesOption[] {
  return ts.lines.map((l) => {
    const color = seriesColor(l.colorKey);
    return {
      id: l.label,
      name: l.label,
      type: "line" as const,
      data: ts.x.map((ms, i) => [ms, l.values[i]] as [number, number | null]),
      color,
      showSymbol: false,
      symbol: "circle",
      symbolSize: 8,
      // 20260916 추가: hostname 평균은 같은 색 점선
      lineStyle: { width: l.average ? 2.5 : 2, type: l.dashed ? "dashed" : "solid" },
      ...(l.average ? { areaStyle: undefined } : {}),
      connectNulls: false,
      emphasis: { focus: "series" as const, itemStyle: { borderColor: "#141b2e", borderWidth: 2 } },
      blur: { lineStyle: { opacity: 0.1 }, areaStyle: { opacity: 0.04 } },
      areaStyle: {
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: `${color}${AREA_ALPHA.top}` },
          { offset: 1, color: `${color}${AREA_ALPHA.bottom}` },
        ]),
      },
      ...(stackOf(l.label, opts.groups) ? { stack: stackOf(l.label, opts.groups) } : {}),
      ...(opts.y2Keys?.includes(l.label) ? { yAxisIndex: 1 } : {}),
    };
  });
}

/** 고정 시점 마크라인 — 첫 시리즈에 싣는다(시리즈가 없으면 없음). */
export function pinMarkLine(pinnedMs: number | null | undefined): LineSeriesOption["markLine"] {
  if (pinnedMs == null) return undefined;
  return {
    symbol: "none",
    animation: false,
    label: { show: false },
    lineStyle: { color: PIN_COLOR, type: "dashed", width: 1.5 },
    data: [{ xAxis: pinnedMs }],
  };
}

/** GPU 시계열 라인 차트 옵션 (통일 스펙). */
export function lineChartOption(ts: TimeSeries, opts: LineOpts): EChartsOption {
  const yCount = opts.tickCount?.y ?? 3;
  // 상한을 알면 0~max 균등 분할 — C3 시절 격자 위치 규칙 유지.
  const yAxisBase = {
    type: "value" as const,
    min: 0,
    axisLabel: {
      color: AXIS_INK, fontSize: 11,
      // 탑뷰 스택 카드(플롯 높이 ~60px)에서 온도·전력처럼 상한이 없는 축은 눈금이 촘촘해
      // 글씨가 겹쳤다(인간 보고 2026-09-04) — 겹치는 라벨은 숨기고 min/max 는 유지한다.
      hideOverlap: true,
      showMinLabel: true,
      showMaxLabel: true,
      ...(opts.yFormat ? { formatter: opts.yFormat } : {}),
    },
    splitLine: { lineStyle: { color: GRID_LINE_COLOR } },
  };
  const series = lineSeries(ts, opts);
  const pin = pinMarkLine(opts.pinnedMs);
  if (pin && series.length > 0) series[0] = { ...series[0], markLine: pin };
  return {
    animation: false,
    grid: {
      left: 48,
      right: opts.y2Keys?.length ? 56 : 16,
      top: 12,
      bottom: opts.hideXAxis ? 8 : 26,
      containLabel: false,
    },
    xAxis: {
      type: "time",
      ...(opts.domain && opts.domain.endMs > opts.domain.startMs
        ? { min: opts.domain.startMs, max: opts.domain.endMs }
        : {}),
      axisLine: { lineStyle: { color: "#232d45" } },
      axisTick: { show: false },
      axisLabel: {
        show: !opts.hideXAxis,
        color: AXIS_INK,
        fontSize: 11,
        hideOverlap: true,
        formatter: (v: number) => {
          const d = new Date(v);
          const p = (n: number) => String(n).padStart(2, "0");
          return `${p(d.getHours())}:${p(d.getMinutes())}`;
        },
      },
      axisPointer: {
        show: true,
        type: "line",
        lineStyle: { color: CROSSHAIR_COLOR, width: 1, type: "dashed" },
        label: { show: false },
      },
    },
    yAxis: [
      {
        ...yAxisBase,
        ...(opts.yMax != null
          ? { max: opts.yMax, interval: opts.yMax / Math.max(1, yCount - 1) }
          : { splitNumber: yCount }),
      },
      ...(opts.y2Keys?.length
        ? [{
            ...yAxisBase,
            ...(opts.y2Format ? { axisLabel: { ...yAxisBase.axisLabel, formatter: opts.y2Format } } : {}),
            ...(opts.y2Max != null
              ? { max: opts.y2Max, interval: opts.y2Max / Math.max(1, yCount - 1) }
              : { splitNumber: yCount }),
            splitLine: { show: false },
          }]
        : []),
    ],
    tooltip: {
      trigger: "axis",
      order: "seriesAsc",
      backgroundColor: "#1a2338",
      borderColor: "#232d45",
      padding: [9, 12],
      // 패널(.panel overflow:hidden)·스택 카드 안에서 툴팁이 잘렸다(인간 보고 2026-09-04) —
      // body 에 붙여 클리핑을 벗어난다. 위치 계산은 ECharts 가 그대로 한다.
      appendTo: "body",
      // 본문은 호버한 카드만 — MetricChart 가 zr mousemove/globalout 으로 켜고 끈다.
      showContent: false,
      extraCssText: "border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.4);z-index:60;",
      formatter: tooltipFormatter(opts),
    },
    legend: { show: false },
    series,
  };
}
