/**
 * X-View 이벤트 복원 — 완료 메트릭 2종의 range 응답을 산점도 점으로 만든다 (Phase X2).
 *
 * 원천(계약 §2b): `sqm_statement_completed_timestamp`(값=종료 epoch 초)와
 * `sqm_statement_completed_duration_seconds`(값=소요초). exporter는 최근 60건 링만
 * 노출하므로 instant 조회는 최근 ~5.6분밖에 못 본다 — **range 응답에서
 * (라벨셋, 값) 전환을 복원**해야 시간창 전체가 나온다 (XR-02).
 *
 * 결합 규칙 (NX-01): 이벤트 검출은 **timestamp 시리즈의 값 전환만** 기준으로 한다.
 * duration은 값이 연속 동일할 수 있어(같은 소요초가 잇달아 나오면 전환이 없다)
 * 전환 검출에 쓰지 않고, 전환이 관측된 **같은 평가시각의 duration 샘플**을 붙인다.
 * 그 시각의 duration 샘플이 없으면 짝이 안 맞는 것이므로 그 이벤트는 버린다.
 */
import type { PromSeries } from "../api/prom";
import { CATALOG } from "../api/queries";

/** query_name → query_type (계약 카탈로그) — 차트 점 색·필터가 같은 축을 쓴다 (X4). */
const TYPE_OF: Record<string, string> = Object.fromEntries(
  Object.values(CATALOG).map((c) => [c.name, c.type]),
);

/** 이벤트의 쿼리 유형 — 카탈로그에 없는 이름은 "other" (보수적 폴백). */
export function typeOfQuery(queryName: string): string {
  return TYPE_OF[queryName] ?? "other";
}

/** 유형 6종 전체 (계약 §3 카탈로그의 query_type 도메인 — 칩 표시 순서). */
export const ALL_QUERY_TYPES = [
  "aggregation", "join", "etl", "fullscan", "select", "other",
] as const;

/** 생애주기 단계별 소요 (X3 — 호버 툴팁 누적 막대). 계약 §2b의 phase 4값. */
export interface XViewPhases {
  /** v4.7: preparing → compile 어휘 개정 (인간 지시) */
  compileSec: number;
  queuedSec: number;
  initializingSec: number;
  executingSec: number;
}

export interface XViewEvent {
  node: string;
  gpu: string;
  mig: string;
  stmtId: string;
  queryId: string;
  user: string;
  queryName: string;
  status: "success" | "failed";
  reason: string;
  /** 종료 시각 (epoch ms) — 산점도 X축 */
  endMs: number;
  /** 소요 시간 (초) — 산점도 Y축 */
  durationSec: number;
  /** 단계별 소요 — phase 시리즈 짝이 없으면 null (툴팁 막대만 생략, 점은 유지) */
  phases: XViewPhases | null;
}

/** 라벨셋 → 결합 키. `__name__`(과 지정 라벨)만 빼고 전부 쓴다. */
function labelKey(metric: Record<string, string>, alsoDrop?: string): string {
  return Object.keys(metric)
    .filter((k) => k !== "__name__" && k !== alsoDrop)
    .sort()
    .map((k) => `${k}=${metric[k]}`)
    .join(",");
}

const PHASE_KEYS = ["compile", "queued", "initializing", "executing"] as const;

/**
 * range 응답 2종 → 완료 이벤트 목록.
 *
 * dedupe 키 = (전체 라벨셋, 종료 epoch 값) — 계약 §2b. 신원 재사용으로 같은 라벨셋이
 * 다른 종료 시각으로 여러 번 나타나는 것은 별개 이벤트이고, 같은 종료 시각이 다시
 * 보이는 것(링 체류 동안 반복 샘플·값 회귀)은 같은 이벤트다.
 */
export function restoreEvents(
  tsSeries: PromSeries[],
  durSeries: PromSeries[],
  phaseSeries: PromSeries[] = [],
): XViewEvent[] {
  // duration을 (라벨 키 → 평가시각 → 값)으로 인덱싱한다
  const durAt = new Map<string, Map<number, number>>();
  for (const s of durSeries) {
    const byTime = new Map<number, number>();
    for (const [t, raw] of s.values ?? []) {
      const v = Number.parseFloat(raw);
      if (Number.isFinite(v)) byTime.set(t, v);
    }
    durAt.set(labelKey(s.metric), byTime);
  }
  // phase 시리즈는 (기본 라벨 키 → phase → 평가시각 → 값) — 같은 규칙으로 결합 (X3)
  const phaseAt = new Map<string, Map<string, Map<number, number>>>();
  for (const s of phaseSeries) {
    const phase = s.metric.phase ?? "";
    const byTime = new Map<number, number>();
    for (const [t, raw] of s.values ?? []) {
      const v = Number.parseFloat(raw);
      if (Number.isFinite(v)) byTime.set(t, v);
    }
    const base = labelKey(s.metric, "phase");
    if (!phaseAt.has(base)) phaseAt.set(base, new Map());
    phaseAt.get(base)!.set(phase, byTime);
  }

  const seen = new Set<string>();
  const events: XViewEvent[] = [];
  for (const s of tsSeries) {
    const key = labelKey(s.metric);
    const byTime = durAt.get(key);
    let prev: number | null = null;
    for (const [t, raw] of s.values ?? []) {
      const endEpoch = Number.parseFloat(raw);
      if (!Number.isFinite(endEpoch)) continue;
      const isTransition = prev === null || endEpoch !== prev;
      prev = endEpoch;
      if (!isTransition) continue;
      const dedupe = `${key}@${endEpoch}`;
      if (seen.has(dedupe)) continue;
      const durationSec = byTime?.get(t);
      if (durationSec === undefined) continue; // 결합 실패 — 짝 없는 전환은 버린다 (NX-01)
      seen.add(dedupe);
      // phase 결합 — 4종이 모두 같은 평가시각에 있어야 채운다. 없으면 null(점은 유지):
      // 산점도 거동은 phase 유무와 무관해야 한다는 불변 제약(X3) 때문이다.
      const phasesOf = phaseAt.get(key);
      let phases: XViewPhases | null = null;
      if (phasesOf) {
        const vals = PHASE_KEYS.map((p) => phasesOf.get(p)?.get(t));
        if (vals.every((v): v is number => v !== undefined)) {
          phases = {
            compileSec: vals[0],
            queuedSec: vals[1],
            initializingSec: vals[2],
            executingSec: vals[3],
          };
        }
      }
      events.push({
        node: s.metric.node ?? "",
        gpu: s.metric.gpu ?? "",
        mig: s.metric.mig ?? "",
        stmtId: s.metric.stmt_id ?? "",
        queryId: s.metric.query_id ?? "",
        user: s.metric.sqream_user ?? "",
        queryName: s.metric.query_name ?? "",
        status: s.metric.status === "failed" ? "failed" : "success",
        reason: s.metric.reason ?? "",
        endMs: endEpoch * 1000,
        durationSec,
        phases,
      });
    }
  }
  return events.sort((a, b) => a.endMs - b.endMs);
}

/** 표시 구간 필터 — 종료 시각이 [startMs, endMs] 안인 이벤트만 (경계 포함). */
export function filterEvents(
  events: XViewEvent[],
  startMs: number,
  endMs: number,
): XViewEvent[] {
  return events.filter((e) => e.endMs >= startMs && e.endMs <= endMs);
}

/** 드래그 영역의 세로(소요시간) 범위 — X5-b 2D 선택. 경계 포함, 초 단위. */
export interface DurationRange {
  minSec: number;
  maxSec: number;
}

/** 소요시간 범위 필터 — 시간 구간 필터(filterEvents) 뒤에 체이닝한다. 범위가 없으면 원본. */
export function filterByDuration(
  events: XViewEvent[],
  range: DurationRange | null | undefined,
): XViewEvent[] {
  if (!range) return events;
  return events.filter((e) => e.durationSec >= range.minSec && e.durationSec <= range.maxSec);
}

/** 표시 필터 (X4) — 상태 2 + 유형 6. 전부 켜짐이 기본이다. */
export interface XViewKindFilter {
  success: boolean;
  failed: boolean;
  types: ReadonlySet<string>;
}

export function defaultKindFilter(): XViewKindFilter {
  return { success: true, failed: true, types: new Set(ALL_QUERY_TYPES) };
}

/** 하나라도 꺼져 있으면 활성 — 아이콘 강조·리셋 버튼 활성 판정. */
export function isKindFilterActive(f: XViewKindFilter): boolean {
  return !f.success || !f.failed || f.types.size !== ALL_QUERY_TYPES.length;
}

/** 상태·유형 필터 적용 — 시간 구간 필터(filterEvents) 뒤에 체이닝한다. */
export function filterByKind(events: XViewEvent[], f: XViewKindFilter): XViewEvent[] {
  return events.filter(
    (e) =>
      (e.status === "failed" ? f.failed : f.success) &&
      f.types.has(typeOfQuery(e.queryName)),
  );
}

export interface XViewSummary {
  count: number;
  failedCount: number;
  /** 평균 소요초 — 이벤트가 없으면 NaN (화면은 "-") */
  avgDurationSec: number;
}

/** 요약행 집계 — **표시 중인 동일 이벤트 집합**에서 계산한다 (XR-04). */
export function summarize(events: XViewEvent[]): XViewSummary {
  const failedCount = events.filter((e) => e.status === "failed").length;
  const avgDurationSec =
    events.length === 0
      ? Number.NaN
      : events.reduce((acc, e) => acc + e.durationSec, 0) / events.length;
  return { count: events.length, failedCount, avgDurationSec };
}
