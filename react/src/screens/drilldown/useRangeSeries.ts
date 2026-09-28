/**
 * 드릴다운 시계열 데이터 훅 (S3).
 *
 * 컴포넌트와 분리한 이유는 react-refresh 규칙 — 한 파일이 컴포넌트와 훅을 함께
 * 내보내면 fast refresh가 꺼진다.
 */
import { useRef, useState } from "react";

import { promQueryRange } from "../../api/prom";
import { usePolling } from "../../hooks/usePolling";
import { nodeSeriesKey, type TimeSeries } from "../../lib/series";

export interface ChartSpec {
  expr: string;
  label: string;
  /** `seriesColor()`가 아는 키 — 신규 색 토큰을 만들지 않는다(lib/colors.ts 참조). */
  colorKey: string;
  /** matrix 응답을 라벨 값별 라인 여러 개로 편다 (X7-b — 노드 누적).
      기본(미지정)은 기존과 동일하게 **첫 시리즈만** 그린다. */
  splitBy?: "node";
  /** splitBy 라인의 색 팔레트 오버라이드 (X13 — opt-in). 미지정이면 기존과
      완전히 동일(탑뷰 노드 팔레트). "nodeClassic"은 Grafana classic 톤
      (`NODE_CLASSIC_COLORS`) — Main Dashboard Cluster Performance 전용. */
  palette?: "nodeClassic";
}

const EMPTY: TimeSeries = { x: [], lines: [] };

/**
 * 여러 식을 각각 range 질의해 하나의 `TimeSeries`로 합친다.
 *
 * 계열마다 식이 다르므로 `toTimeSeries`(라벨로 가르는 방식)를 쓸 수 없다 —
 * x축을 첫 계열 기준으로 잡고 나머지를 같은 인덱스에 맞춘다.
 */
export function useRangeSeries(
  specs: ChartSpec[],
  rangeSec: number,
  refreshMs: number,
  /** 샘플 간격. 정적본은 구간에 비례시켰다 — 기본 15초는 30분 구간 기준이다. */
  stepSec = 15,
  /** 구간 끝(ms). 없으면 now — Focus+Context 줌이 과거 창을 물을 때만 쓴다. */
  opts?: { endMs?: number; failThreshold?: number },
): { series: TimeSeries; failed: boolean } {
  const [data, setData] = useState<TimeSeries>(EMPTY);
  const endMs = opts?.endMs;
  const key = specs.map((s) => s.expr).join("|");

  /* 식이 바뀌면 이전 데이터를 즉시 비운다 (codex X7-01) — 옛 지표의 라인으로 새
     차트가 generate 되면 축 상한·스택 그룹이 낡은 값으로 굳는다(CPU 축에 GB/s가
     실리는 실측). 렌더 중 상태 초기화는 React의 파생 상태 재설정 관용구다 —
     effect로 미루면 낡은 데이터가 한 프레임 그려진다. 공백은 재조회 왕복 동안뿐. */
  const prevKey = useRef(key);
  if (prevKey.current !== key) {
    prevKey.current = key;
    setData(EMPTY);
  }

  const { failStreak } = usePolling(async (signal) => {
    /* `Promise.all`이 아니라 `allSettled`다 — 한 계열이 실패해도 나머지는 그린다
       (codex CDX-S3C-06).

       세 상태를 **구분**한다(codex CDX-S3D-02):
         · 쓸 수 있는 데이터가 하나라도 있으면 → 정상. 죽은 계열만 빈다.
         · 거절이 있는데 쓸 데이터가 하나도 없으면 → **실패**다. 성공한 빈 응답 하나 때문에
           "데이터 없음"으로 위장하면 안 된다.
         · 거절이 없고 전부 비었으면 → 진짜 "데이터 없음". */
    const settled = await Promise.allSettled(
      specs.map((s) => promQueryRange(s.expr, rangeSec, { stepSec, endMs, signal })),
    );
    const results = settled.map((r) => (r.status === "fulfilled" ? r.value : []));
    const rejected = settled.filter((r) => r.status === "rejected");
    if (rejected.length > 0 && !results.some((r) => r[0]?.values?.length)) {
      throw (rejected[0]).reason;
    }
    /* x축 = **그릴 시리즈 전체**의 타임스탬프 합집합, 오름차순 (codex X7-02).
       예전엔 "첫 시리즈"만 기준이라, splitBy에서 첫 노드에 없는 시점이 다른
       노드에 있어도 통째로 사라졌다. 비-split spec은 첫 시리즈만 그리므로
       합집합에도 그 시리즈만 넣는다(안 그리는 시리즈의 시점은 구멍만 만든다). */
    const drawn = specs.flatMap((spec, i) =>
      spec.splitBy === "node" ? results[i] : results[i].slice(0, 1));
    const tset = new Set<number>();
    for (const s of drawn) for (const [t] of s.values ?? []) tset.add(t);
    // 모든 계열이 비면 빈 차트 — "데이터 없음"을 그린다.
    if (tset.size === 0) {
      setData(EMPTY);
      return;
    }
    const x = [...tset].sort((a, b) => a - b).map((t) => t * 1000);
    setData({
      x,
      lines: specs.flatMap((spec, i) => {
        if (spec.splitBy === "node") {
          /* 노드별 fan-out (X7-b) — `by (node)` matrix의 전 시리즈를 각각 라인으로.
             라벨·색은 탑뷰 노드 계열 규칙(nodeSeriesKey → NODE_SERIES_COLORS)을
             그대로 쓴다. id 정렬로 스택 순서를 고정한다(응답 순서는 보장이 없다). */
          const nodeKey = nodeSeriesKey();
          return results[i]
            .map((s) => {
              const byTime = new Map(
                (s.values ?? []).map(([t, v]) => [t * 1000, Number(v)]));
              return {
                id: `${spec.label}/${nodeKey.id(s.metric)}`,
                label: nodeKey.label?.(s.metric) ?? nodeKey.id(s.metric),
                // X13: classic 팔레트 opt-in — 키 접두로 NODE_CLASSIC_COLORS를 탄다.
                colorKey: spec.palette === "nodeClassic"
                  ? `classic-${s.metric.node ?? ""}`
                  : nodeKey.colorKey?.(s.metric) ?? spec.colorKey,
                values: x.map((t) => byTime.get(t) ?? null),
              };
            })
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        }
        const values = results[i][0]?.values ?? [];
        const byTime = new Map(values.map(([t, v]) => [t * 1000, Number(v)]));
        return [{
          id: spec.label,
          label: spec.label,
          colorKey: spec.colorKey,
          values: x.map((t) => byTime.get(t) ?? null),
        }];
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refreshMs, [key, rangeSec, refreshMs, stepSec, endMs]);

  /* 부분 실패는 그 계열만 비고, **연속 3회 실패**면 화면이 실패라고 말한다.
     즉시 표시하지 않는 이유는 일시적 흔들림으로 차트가 깜빡이지 않게 하려는 것이다
     (탑뷰 연결 배너와 같은 기준). */
  // 일회성(폴링 0) 질의는 재시도가 없어 3회 문턱에 못 닿는다 — 호출자가 1로 낮춘다(codex Z1-01).
  return { series: data, failed: failStreak >= (opts?.failThreshold ?? 3) };
}
