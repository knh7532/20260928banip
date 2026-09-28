import * as echarts from "echarts";
import { useEffect, useRef } from "react";

import { lineChartOption, lineSeries, pinMarkLine } from "../../lib/echartsOption";
import type { TimeSeries } from "../../lib/series";
import { useChartResize } from "../../hooks/useChartResize";

/**
 * GPU 시계열 라인 차트 (ECharts — E1, 시안 통일 스펙).
 *
 * C3 시절 규칙을 계승한다: **init은 1회만**, 이후 폴링 갱신은 `setOption`으로 데이터만
 * 교체한다(재생성 금지 — 깜빡임·성능). 라벨이 사라지면 `replaceMerge`가 제거를 반영한다.
 * C3의 d3 v7 툴팁 워크어라운드 3종(커서 추적·위치 계산·호버 재적용)은 ECharts 내장
 * 툴팁으로 대체되어 사라졌다.
 */
interface MetricChartProps {
  data: TimeSeries;
  yMax?: number;
  yFormat?: (v: number) => string;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분 (R9 F7.2). */
  emptyText?: string;
  /** 시간축 숨김 (R9.1) — 수직 스택 위쪽 카드용, 플롯 확보. */
  hideXAxis?: boolean;
  /** x도메인 고정 (R9.1 CDX) — 스택 4장이 요청 구간을 공유해 대표 축이 정확하다. */
  domain?: { startMs: number; endMs: number };
  /** 오른쪽 축에 붙일 계열 label (단위가 다른 계열 혼재 시). */
  y2Keys?: string[];
  /** 오른쪽 축 상한·포맷 (드릴다운이 정적본 규칙으로 계산해 넘긴다). */
  y2Max?: number;
  y2Format?: (v: number) => string;
  /** 누적(스택) 그룹 (X7-b). ECharts는 시리즈 stack이라 폴링 갱신에도 유지된다. */
  groups?: string[][];
  /** 눈금 개수 — 드릴다운은 정적본과 같은 5/5. 생략 시 탑뷰 기본(3/4). */
  tickCount?: { y?: number; x?: number };
  /**
   * (구 C3 legacyHover) 통일 스펙이 정의 순서 툴팁·crosshair를 기본 제공하므로
   * 동작 차이가 없다 — 호출부 호환을 위해 프롭만 받는다.
   */
  legacyHover?: boolean;
  /** 플롯을 클릭하면 그 시각(ms)을 올린다 — 표를 그 시점으로 고정한다. */
  onPickTime?: (ms: number) => void;
  /** 고정된 시점 — 그 자리에 세로 마크라인을 그린다. */
  pinnedMs?: number | null;
  /** 같은 시간축 카드 그룹 id — 그룹 내 crosshair가 동기된다(echarts.connect). */
  syncGroup?: string;
}

/** 빈 초기 응답은 축 domain이 없어 실제 라인이 올 때까지 생성을 미룬다. */
export function MetricChart(props: MetricChartProps) {
  if (props.data.lines.length === 0 || props.data.x.length === 0) {
    // R9(F3.4): 빈 축만 있는 거대한 박스는 고장처럼 보인다 — 상태를 문구로 말한다.
    return <div className="metric-chart metric-chart--empty">{props.emptyText ?? "데이터 없음"}</div>;
  }
  return <MetricChartCanvas {...props} />;
}

function MetricChartCanvas({
  data,
  yMax,
  yFormat,
  hideXAxis,
  domain,
  y2Keys,
  y2Max,
  y2Format,
  groups,
  tickCount,
  onPickTime,
  pinnedMs,
  syncGroup,
}: MetricChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  /* init은 1회뿐이라 콜백을 굳혀 넣으면 첫 렌더의 클로저가 영원히 남는다 — ref로 최신을 가리킨다. */
  const pickRef = useRef(onPickTime);
  pickRef.current = onPickTime;
  /* 클릭 핸들러가 최신 고정값을 봐야 토글 판정이 맞는다. */
  const pinnedRef = useRef(pinnedMs);
  pinnedRef.current = pinnedMs;
  const dataRef = useRef(data);
  dataRef.current = data;

  // 최초 1회 init — 이후 데이터 변경은 아래 갱신 효과가 담당한다.
  useEffect(() => {
    // 방어 가드 — React가 커밋 후 ref를 보장하므로 정상 경로에선 도달 불가 (TS 내로잉용)
    /* v8 ignore next */
    if (!ref.current) return;
    // 컨테이너 실측 크기로 그린다 (R9-P0 계승 — 0이면 RO에 맡김).
    const { clientWidth: w, clientHeight: h } = ref.current;
    const c = echarts.init(ref.current, null, {
      renderer: "canvas",
      ...(w > 0 && h > 0 ? { width: w, height: h } : {}),
    });
    c.setOption(lineChartOption(dataRef.current, {
      yMax, yFormat, hideXAxis, domain, y2Keys, y2Max, y2Format, groups, tickCount,
      pinnedMs: pinnedRef.current,
    }));
    if (syncGroup) {
      c.group = syncGroup;
      echarts.connect(syncGroup);
    }
    // 툴팁 본문은 **포인터가 올라간 카드에만** 띄운다 (2026-09-04). connect 로 묶인 스택
    // 카드는 crosshair 와 함께 툴팁도 전 카드에 뜨는데, 툴팁을 body 에 붙이면서(클리핑
    // 해결) 4장이 세로로 겹쳐 보였다. crosshair 동기는 그대로 두고 showContent 만
    // 인스턴스별로 토글한다. 테스트 스텁에는 getZr 가 없어 가드한다.
    const zr = typeof c.getZr === "function" ? c.getZr() : null;
    if (zr) {
      let shown = false;
      zr.on("mousemove", (e: { offsetX: number; offsetY: number }) => {
        if (shown) return;
        shown = true;
        c.setOption({ tooltip: { showContent: true } });
        // 같은 이벤트로 이미 계산된 툴팁은 옵션 변경을 모른다 — 첫 진입에서 바로 뜨도록
        // 현재 포인터 위치로 showTip 을 한 번 쏜다(마우스가 멈춘 채 들어와도 보인다).
        c.dispatchAction({ type: "showTip", x: e.offsetX, y: e.offsetY });
      });
      zr.on("globalout", () => {
        if (!shown) return;
        shown = false;
        c.setOption({ tooltip: { showContent: false } });
      });
    }
    chart.current = c;
    return () => {
      /* v8 ignore next */
      chart.current?.dispose();
      chart.current = null;
    };
    // 생성은 마운트 시 1회만 — data는 의도적으로 제외(재생성 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 플롯 아무 데나 클릭해도 시점이 잡히게 한다 — 픽셀을 시간값으로 역변환해
     실제 샘플 시각으로 스냅한다(샘플이 없는 시각을 물으면 빈 결과가 온다). */
  useEffect(() => {
    const host = ref.current;
    if (!host || !onPickTime) return;

    const onClick = (e: MouseEvent) => {
      const c = chart.current;
      const xs = dataRef.current.x;
      if (!c || xs.length === 0) return;
      const rect = host.getBoundingClientRect();
      const picked = c.convertFromPixel({ xAxisIndex: 0 }, [
        e.clientX - rect.left, e.clientY - rect.top,
      ]);
      const wanted = Array.isArray(picked) ? picked[0] : picked;
      if (typeof wanted !== "number" || !Number.isFinite(wanted)) return;
      let best = xs[0];
      for (const t of xs) if (Math.abs(t - wanted) < Math.abs(best - wanted)) best = t;

      /* 같은 지점을 다시 누르면 풀린다(인간 지시). 폴링으로 샘플 격자가 밀려 같은
         픽셀이 다른 시각으로 스냅되면 토글이 영영 성립하지 않는다 — 반 스텝 안이면
         지금 고정된 값을 그대로 올려 셸의 동등 비교가 맞게 한다. */
      const pinned = pinnedRef.current;
      const step = xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 0;
      if (pinned != null && Math.abs(best - pinned) <= step / 2) {
        pickRef.current?.(pinned);
        return;
      }
      pickRef.current?.(best);
    };

    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [onPickTime]);

  useChartResize(ref, chart);

  // 데이터·도메인·고정선 갱신 → setOption (재생성 없이 교체).
  useEffect(() => {
    const c = chart.current;
    // 방어 가드 — 효과 실행 순서상 init이 선행하므로 도달 불가
    /* v8 ignore next */
    if (!c) return;
    const opts = { yMax, yFormat, y2Keys, y2Max, y2Format, groups, tickCount, pinnedMs };
    const series = lineSeries(data, opts);
    const pin = pinMarkLine(pinnedMs);
    // 마크라인은 첫 시리즈에 싣는다 — 해제(null)도 명시적으로 지워야 잔상이 없다.
    if (series.length > 0) series[0] = { ...series[0], markLine: pin ?? { data: [] } };
    c.setOption(
      {
        // 도메인도 폴링마다 전진 — 고정 모드가 풀리면 min/max를 비워 자동 축으로 되돌린다.
        // 축 대표 이동(hideXAxis — 부분 가용 회복 등)도 재마운트 없이 제자리 갱신한다.
        xAxis: {
          ...(domain && domain.endMs > domain.startMs
            ? { min: domain.startMs, max: domain.endMs }
            : { min: null, max: null }),
          axisLabel: { show: !hideXAxis },
        },
        grid: { bottom: hideXAxis ? 8 : 26 },
        series,
      },
      { replaceMerge: ["series"] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, domain, pinnedMs, hideXAxis]);

  return <div className="metric-chart" ref={ref} />;
}
