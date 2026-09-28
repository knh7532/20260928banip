import { useEffect, useRef } from "react";

import { useEchart } from "../../hooks/useEchart";
import { themeTokens } from "../../lib/echartsTheme";
import { gaugeOption, type GaugeOpts } from "../../lib/gaugeOption";

/**
 * 서버 카드 지표 반원 게이지 — ECharts (E5 D1, 시안 승인 2026-09-07 후 C3 gauge 교체).
 * props·DOM(.gauge > .gauge__chart + .gauge__label)은 C3 시절과 같아 ServerGauges 는 불변.
 *
 * init 1회 + 값 갱신은 setOption(병합). 크기가 바뀌면 반지름·중심을 다시 계산한다
 * (C3 는 SVG 라 자동이었지만 canvas 는 픽셀 기하를 명시해야 한다). 옵션은 lib/gaugeOption.ts.
 */
export function Gauge({
  label,
  value,
  min,
  max,
  colors,
  thresholds,
  format,
}: GaugeOpts & { label: string; value: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // 최신 props 를 ref 로 — 크기 변화 재계산이 stale 값을 쓰지 않게 한다.
  const latest = useRef({ value, opts: { min, max, colors, thresholds, format } as GaugeOpts });
  latest.current = { value, opts: { min, max, colors, thresholds, format } };
  const sizeRef = useRef<{ width: number; height: number } | undefined>(undefined);

  const chart = useEchart(ref, {
    onInit: (c, size) => {
      sizeRef.current = size;
      c.setOption(gaugeOption(latest.current.value, latest.current.opts, size, themeTokens()));
    },
    onResize: (c, size) => {
      sizeRef.current = size;
      c.setOption(gaugeOption(latest.current.value, latest.current.opts, size, themeTokens()));
    },
  });

  useEffect(() => {
    const c = chart.current;
    /* v8 ignore next -- init 효과가 선행한다 */
    if (!c) return;
    c.setOption(gaugeOption(value, { min, max, colors, thresholds, format }, sizeRef.current, themeTokens()));
  }, [chart, value, min, max, colors, thresholds, format]);

  return (
    <div className="gauge">
      <div className="gauge__chart" ref={ref} />
      <div className="gauge__label">{label}</div>
    </div>
  );
}
