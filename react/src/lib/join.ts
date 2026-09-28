/** instant 결과를 라벨 키로 조인한다 — Grafana의 joinByField에 대응. */
import type { PromSeries } from "../api/prom";

/**
 * 시계열 배열을 특정 라벨 값으로 인덱싱한다 (stmt_id, query_name 등).
 *
 * 조인 키는 계약(TV-C1)상 **노출 시점에 전역 유일**하다 — `stmt_id`는 슬롯에 고정되어
 * 노드/GPU를 떠돌지 않고(누적 36), 카탈로그 쿼리는 `sqm_query_rows_per_second` 라벨셋을
 * 항상 정확히 1개만 노출한다. 따라서 정상 계약에서는 키 충돌이 없다.
 *
 * 그럼에도 충돌을 **조용히 덮어쓰면** 잘못된 수치가 다른 행에 붙어도 드러나지 않는다
 * (CDX-R3-01). 값 메트릭은 `stmt_id`만 캐리어라 복합 키 조인이 설계상 불가하므로,
 * 여기서는 **첫 시리즈를 유지하고 경고를 남겨** 계약 위반을 가시화한다.
 */
export function indexBy(series: PromSeries[], label: string): Map<string, PromSeries> {
  const map = new Map<string, PromSeries>();
  for (const s of series) {
    const key = s.metric[label];
    if (key === undefined) continue;
    if (map.has(key)) {
      console.warn(`[join] 중복 조인 키 '${label}=${key}' — 계약(TV-C1) 위반, 첫 시리즈 유지`);
      continue;
    }
    map.set(key, s);
  }
  return map;
}

/** instant 시계열의 스칼라 값 (없으면 NaN). */
export function valueOf(s: PromSeries | undefined): number {
  const raw = s?.value?.[1];
  if (raw === undefined) return Number.NaN;
  return Number.parseFloat(raw);
}

/** instant 결과 배열의 첫 스칼라 값 (집계 쿼리처럼 시리즈가 1개일 때). */
export function firstScalar(series: PromSeries[]): number {
  return valueOf(series[0]);
}

/**
 * 숫자 내림차순 비교 — **비유한값(NaN 등)은 항상 최하위**로 보낸다 (CDX-R3-02).
 *
 * 별도 HTTP 요청으로 신원과 수치를 각각 받으므로, 둘 사이에 쿼리가 종료되면
 * 수치가 `NaN`이 될 수 있다(요청 간 race). `b - a`로 그대로 비교하면 `NaN`이 껴서
 * 정렬이 깨진다 — 유한값이 반드시 위로 오도록 total order를 만든다.
 * 동순위(둘 다 유한하지만 같거나, 둘 다 비유한)는 0을 반환하므로 호출측에서
 * 안정적인 2차 키로 tie-break 한다.
 */
export function cmpNumDesc(a: number, b: number): number {
  const fa = Number.isFinite(a);
  const fb = Number.isFinite(b);
  if (fa && fb) return b - a;
  if (fa) return -1; // a만 유한 → a가 앞
  if (fb) return 1; // b만 유한 → b가 앞
  return 0; // 둘 다 비유한 → 동순위
}
