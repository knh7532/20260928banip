/**
 * 드릴다운 화면의 시계열 차트 (S3).
 *
 * 정적 화면은 `registerPromChart`로 **수제 SVG**를 그렸다. React 쪽은 이미 C3 기반
 * `MetricChart`가 있고 보간·호버 유지·리사이즈가 검증돼 있으므로(ADR H-0004) 그것을 쓴다.
 * 즉 차트는 재구현이 아니라 기존 자산으로 대체한다 — 구현이 다르다.
 *
 * **다만 "모양은 같다"는 처음 주장이 틀렸다**(인간 지적 2026-08-09). C3 기본값으로
 * 옮기면서 정적본의 축 규칙을 통째로 잃었고, 화면이 눈에 띄게 달라졌다:
 *
 * | 항목 | 정적 원본 | 이관 직후(결함) |
 * | --- | --- | --- |
 * | y축 눈금 | 5개, `chartNumber()`로 포맷 | 3개, **`65.06763563699022`** 원시 실수 |
 * | y축 상한 | percent는 **100 고정**, 그 밖은 깔끔한 수 | C3 자동 (데이터 따라 출렁임) |
 * | x축 눈금 | 5개 | 4개 |
 * | 면 투명도 | 0.07 | 0.12 (계열이 겹쳐 회색 덩어리) |
 *
 * 여기서 그 규칙을 되살린다. 축 계산은 `lib/format.ts`의 `chartNumber`·`chartAxisMax`가
 * 단일 진원지이고, 둘 다 정적 `app.js`에서 그대로 옮긴 것이다.
 */
import { MetricChart } from "../../components/charts/MetricChart";
import { chartAxisMax, chartNumber, type ChartUnit } from "../../lib/format";
import type { TimeSeries } from "../../lib/series";
import { ChartBrush } from "./ChartBrush";
import type { ZoomWindow } from "./useFocusContext";

/** 정적본과 같은 격자 밀도 — y 5줄(0/25/50/75/100), x 5눈금. */
const DRILLDOWN_TICKS = { y: 5, x: 5 };

/* 호버도 정적 원본 방식을 쓴다(`legacyHover`). 인간이 C3 기본 대신 그쪽을 명시적으로
   골랐다(2026-08-09): 세로 점선 가이드 + 계열별 r=4 점 + 전체 일시 머리글 +
   색점·라벨·굵은 값, 그리고 **정의 순서 고정**. */

export function DrilldownChart({
  series, ariaLabel, y2Keys, unit = "number", y2Unit, failed, onPickTime, pinnedMs,
  context, zoom, onZoom, stacked = false, variant,
}: {
  series: TimeSeries;
  ariaLabel: string;
  /** 오른쪽 축에 붙일 계열 label — 단위가 다른 계열을 섞을 때 필수다. */
  y2Keys?: string[];
  /** 왼쪽 축 단위. 축 상한·눈금 표기가 여기서 갈린다. */
  unit?: ChartUnit;
  /** 오른쪽 축 단위 (`y2Keys`가 있을 때). */
  y2Unit?: ChartUnit;
  /** 전 계열을 한 그룹으로 누적(스택)한다 (X7-b — 노드별 누적). */
  stacked?: boolean;
  /** 전 계열 조회 실패 — "데이터 없음"과 구분해서 말한다(codex CDX-S3C-06). */
  failed?: boolean;
  /** 플롯을 클릭하면 그 시각(ms)을 올린다 — 표가 그 시점으로 고정된다. */
  onPickTime?: (ms: number) => void;
  /** 고정된 시점 — 세로선으로 표시한다. */
  pinnedMs?: number | null;
  /** Focus+Context: 전체 구간 미니맵 데이터. 주면 아래에 브러시가 붙는다. */
  context?: TimeSeries;
  /** 현재 줌 창 — 브러시와 양방향 동기화된다. */
  zoom?: ZoomWindow | null;
  /** 브러시 확정/해제 콜백. */
  onZoom?: (z: ZoomWindow | null) => void;
  /** 시각 변형 (X13, opt-in) — "grafana"면 래퍼에 클래스 훅만 덧붙인다
      (면 채움·crosshair를 drilldown.css의 `.sqm-chart--grafana` 스코프가 정련).
      미지정이면 기존과 완전히 동일하다. */
  variant?: "grafana";
}) {
  // 축별로 값을 갈라 각자의 상한을 낸다 — 단위가 다른 계열을 한 축으로 재면 안 된다.
  const onRight = (label: string) => y2Keys?.includes(label) ?? false;
  const valuesOf = (right: boolean) => series.lines
    .filter((l) => onRight(l.label) === right)
    .flatMap((l) => l.values.filter((v): v is number => v !== null));

  /* 스택이면 상한은 개별 라인이 아니라 **시점별 합의 최대**다 (X7-b). percent도
     "number" 경로로 잰다 — chartAxisMax의 100 고정핀을 그대로 두면 노드 3개
     합(≤300)이 잘린다. 깔끔한 수 규칙(×1.1 headroom)은 동일하게 탄다. */
  const stackSums = stacked
    ? series.x.map((_, i) =>
        series.lines.reduce((acc, l) => acc + (l.values[i] ?? 0), 0))
    : [];
  const yMax = stacked
    ? chartAxisMax(stackSums, unit === "percent" ? "number" : unit)
    : chartAxisMax(valuesOf(false), unit);
  const y2Max = y2Keys?.length ? chartAxisMax(valuesOf(true), y2Unit ?? "number") : undefined;

  return (
    <div
      className={`sqm-chart${onPickTime ? " sqm-chart--pickable" : ""}`
        + `${variant === "grafana" ? " sqm-chart--grafana" : ""}`}
      aria-label={ariaLabel}
      role="img"
    >
      <MetricChart
        /* 스택의 축 상한·그룹은 generate 시 굳고 load()는 못 바꾼다 — 폴링으로 합이
           깔끔수 경계를 넘거나 노드 멤버십이 바뀌면 리마운트로 다시 굳힌다
           (codex X7-01). yMax는 이미 양자화된 값이라 리마운트는 드물다. */
        key={stacked
          ? `stack|${yMax}|${series.lines.map((l) => l.label).join(",")}` : "line"}
        data={series}
        y2Keys={y2Keys}
        groups={stacked && series.lines.length > 0
          ? [series.lines.map((l) => l.label)] : undefined}
        yMax={yMax}
        yFormat={(v) => chartNumber(v, unit)}
        y2Max={y2Max}
        y2Format={(v) => chartNumber(v, y2Unit ?? "number")}
        tickCount={DRILLDOWN_TICKS}
        legacyHover
        onPickTime={onPickTime}
        pinnedMs={pinnedMs}
        domain={zoom ? { startMs: zoom.startMs, endMs: zoom.endMs } : undefined}
        emptyText={failed ? "⚠ 차트 조회 실패 — 데이터 소스에 연결할 수 없습니다." : "데이터 없음"}
      />
      {context && onZoom ? (
        <ChartBrush series={context} zoom={zoom ?? null} onZoom={onZoom} />
      ) : null}
    </div>
  );
}
