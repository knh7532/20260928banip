/**
 * X-View 이벤트 복원 순수 함수 (lib/xview.ts) — Phase X2.
 *
 * 핵심 규칙(계약 §2b·NX-01): 이벤트 = timestamp 시리즈의 **값 전환**, dedupe 키 =
 * (전체 라벨셋, 종료 epoch 값), duration은 같은 평가시각 샘플로 결합(없으면 드롭).
 */
import type { PromSeries } from "../src/api/prom";
import { FAILURE_STAGES, failureStageOf } from "../src/lib/failureStages";
import {
  ALL_QUERY_TYPES,
  defaultKindFilter,
  filterByKind,
  filterByDuration,
  filterEvents,
  isKindFilterActive,
  restoreEvents,
  summarize,
  typeOfQuery,
} from "../src/lib/xview";

const BASE = {
  env: "production",
  node: "gpu-server-01",
  gpu: "0",
  mig: "1",
  stmt_id: "100411",
  query_id: "Q-88003",
  sqream_user: "analyst2",
  query_name: "Customer_Join",
  status: "success",
  reason: "",
};

function series(
  metric: Record<string, string>,
  values: Array<[number, string]>,
): PromSeries {
  return { metric, values };
}

describe("restoreEvents — (라벨셋, 값) 전환 복원", () => {
  it("연속 동일값은 한 이벤트, 값 전환마다 새 이벤트다", () => {
    const ts = [series(BASE, [[10, "1000"], [70, "1000"], [130, "1060"]])];
    const dur = [series(BASE, [[10, "45"], [70, "45"], [130, "52"]])];
    const events = restoreEvents(ts, dur);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      queryName: "Customer_Join", status: "success", endMs: 1000_000, durationSec: 45,
    });
    expect(events[1]).toMatchObject({ endMs: 1060_000, durationSec: 52 });
  });

  it("NX-01: duration 값이 연속 동일해도 timestamp 전환 기준으로 별개 이벤트가 된다", () => {
    // 같은 소요초(45s)의 쿼리가 잇달아 끝나면 duration 시리즈에는 전환이 없다 —
    // timestamp 전환만 보므로 두 이벤트 다 살아야 한다.
    const ts = [series(BASE, [[10, "1000"], [70, "1100"]])];
    const dur = [series(BASE, [[10, "45"], [70, "45"]])];
    const events = restoreEvents(ts, dur);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.durationSec)).toEqual([45, 45]);
  });

  it("NX-01: 전환 시각에 duration 샘플이 없으면 그 이벤트는 버린다 (짝 없는 전환)", () => {
    const ts = [series(BASE, [[10, "1000"], [70, "1100"]])];
    const dur = [series(BASE, [[10, "45"]])]; // t=70 샘플 없음
    const events = restoreEvents(ts, dur);
    expect(events).toHaveLength(1);
    expect(events[0].endMs).toBe(1000_000);
  });

  it("dedupe: 같은 라벨셋의 같은 종료 epoch가 다시 나타나도 한 이벤트다", () => {
    const ts = [series(BASE, [[10, "1000"], [70, "1060"], [130, "1000"]])];
    const dur = [series(BASE, [[10, "45"], [70, "52"], [130, "45"]])];
    expect(restoreEvents(ts, dur)).toHaveLength(2);
  });

  it("status=failed·reason이 이벤트에 실리고, 시리즈가 달라도 시각순 정렬된다", () => {
    const failed = { ...BASE, stmt_id: "100548", status: "failed", reason: "lock_timeout" };
    const ts = [
      series(BASE, [[10, "1200"]]),
      series(failed, [[10, "1100"]]),
    ];
    const dur = [
      series(BASE, [[10, "45"]]),
      series(failed, [[10, "160"]]),
    ];
    const events = restoreEvents(ts, dur);
    expect(events.map((e) => e.endMs)).toEqual([1100_000, 1200_000]);
    expect(events[0]).toMatchObject({ status: "failed", reason: "lock_timeout", durationSec: 160 });
  });

  it("숫자가 아닌 샘플은 무시한다", () => {
    const ts = [series(BASE, [[10, "NaN"], [70, "1000"]])];
    const dur = [series(BASE, [[10, "45"], [70, "45"]])];
    const events = restoreEvents(ts, dur);
    expect(events).toHaveLength(1);
    expect(events[0].endMs).toBe(1000_000);
  });
});

describe("restoreEvents — phase 결합 (X3)", () => {
  const phaseSeries = (phase: string, values: Array<[number, string]>) =>
    series({ ...BASE, phase }, values);

  it("phase 4종이 같은 평가시각에 있으면 phases가 채워진다", () => {
    const ts = [series(BASE, [[10, "1000"]])];
    const dur = [series(BASE, [[10, "45"]])];
    const phases = [
      phaseSeries("compile", [[10, "1.2"]]),
      phaseSeries("queued", [[10, "3.5"]]),
      phaseSeries("initializing", [[10, "0.8"]]),
      phaseSeries("executing", [[10, "45"]]),
    ];
    const events = restoreEvents(ts, dur, phases);
    expect(events).toHaveLength(1);
    expect(events[0].phases).toEqual({
      compileSec: 1.2, queuedSec: 3.5, initializingSec: 0.8, executingSec: 45,
    });
  });

  it("phase가 하나라도 빠지면 phases=null — 이벤트(점)는 유지된다 (산점도 무영향)", () => {
    const ts = [series(BASE, [[10, "1000"]])];
    const dur = [series(BASE, [[10, "45"]])];
    const phases = [
      phaseSeries("compile", [[10, "1.2"]]),
      phaseSeries("queued", [[10, "3.5"]]),
      phaseSeries("initializing", [[10, "0.8"]]),
      // executing 누락
    ];
    const events = restoreEvents(ts, dur, phases);
    expect(events).toHaveLength(1);
    expect(events[0].phases).toBeNull();
  });

  it("phase 인자를 생략해도 동작한다 (하위 호환) — phases=null", () => {
    const ts = [series(BASE, [[10, "1000"]])];
    const dur = [series(BASE, [[10, "45"]])];
    const events = restoreEvents(ts, dur);
    expect(events[0].phases).toBeNull();
  });
});

describe("filterByKind — 표시 필터 (X4: 상태 2 + 유형 6)", () => {
  const mk = (queryName: string, status: "success" | "failed") => ({
    ...restoreEvents(
      [series({ ...BASE, query_name: queryName, status,
        reason: status === "failed" ? "lock_timeout" : "" }, [[10, "1000"]])],
      [series({ ...BASE, query_name: queryName, status,
        reason: status === "failed" ? "lock_timeout" : "" }, [[10, "45"]])],
    )[0],
  });
  const evs = [
    mk("Customer_Join", "success"),      // join
    mk("Sales_Aggregation", "success"),  // aggregation
    mk("Customer_Join", "failed"),       // join, 에러
    mk("Vacuum_Maintenance", "success"), // other
  ];

  it("typeOfQuery — 카탈로그 매핑·모르는 이름은 other", () => {
    expect(typeOfQuery("Customer_Join")).toBe("join");
    expect(typeOfQuery("Nope")).toBe("other");
    expect(ALL_QUERY_TYPES).toHaveLength(6);
  });

  it("기본 필터는 전부 통과·비활성이다", () => {
    const f = defaultKindFilter();
    expect(isKindFilterActive(f)).toBe(false);
    expect(filterByKind(evs, f)).toHaveLength(4);
  });

  it("에러 off → 실패 이벤트만 빠진다", () => {
    const f = { ...defaultKindFilter(), failed: false };
    const out = filterByKind(evs, f);
    expect(out).toHaveLength(3);
    expect(out.every((e) => e.status === "success")).toBe(true);
    expect(isKindFilterActive(f)).toBe(true);
  });

  it("완료 off → 성공 이벤트만 빠진다 (에러는 남는다)", () => {
    const out = filterByKind(evs, { ...defaultKindFilter(), success: false });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("failed");
  });

  it("유형 off → 해당 유형 제외 (상태와 AND 결합)", () => {
    const types = new Set(ALL_QUERY_TYPES.filter((t) => t !== "join"));
    const out = filterByKind(evs, { success: true, failed: true, types });
    expect(out.map((e) => e.queryName)).toEqual(["Sales_Aggregation", "Vacuum_Maintenance"]);
    const combined = filterByKind(evs, { success: false, failed: true, types: new Set(["join"]) });
    expect(combined).toHaveLength(1); // 에러이면서 join인 것만
  });

  it("전부 off → 빈 집합", () => {
    expect(filterByKind(evs, { success: false, failed: false, types: new Set() })).toHaveLength(0);
  });
});

describe("failureStages — 실패 유형 ↔ 발생 시점 매핑 (X3, SQream 가이드)", () => {
  it("목업 reason 5종이 가이드 유형·단계로 매핑된다", () => {
    expect(failureStageOf("lock_timeout")).toMatchObject({
      typeLabel: "Execution Error", stage: "Executing", phaseKey: "executingSec",
    });
    expect(failureStageOf("out_of_memory").typeLabel).toBe("Resource Error");
    expect(failureStageOf("spool_limit").typeLabel).toBe("I/O / Storage Error");
    expect(failureStageOf("connection_lost")).toMatchObject({
      stage: "실행 전후", phaseKey: null,
    });
    expect(failureStageOf("killed_by_admin").friendly).toContain("의도적 중단");
  });

  it("가이드 참조 항목(사전 단계 실패)도 수록돼 있다 — 실데이터 연동 대비", () => {
    expect(FAILURE_STAGES.syntax_error.stage).toBe("Compile"); // v4.7 어휘 개정
    expect(FAILURE_STAGES.compile_error.stage).toBe("Compile");
    expect(FAILURE_STAGES.init_error.stage).toBe("Initializing");
    expect(FAILURE_STAGES.execution_error.stage).toBe("Executing");
  });

  it("모르는 reason은 실행 단계 실패로 보수적 폴백한다", () => {
    expect(failureStageOf("mystery_code")).toMatchObject({
      typeLabel: "Execution Error", stage: "Executing", phaseKey: "executingSec",
    });
  });
});

describe("filterEvents / summarize — 표시 집합과 요약행이 같은 집합이다 (XR-04)", () => {
  const ts = [
    series(BASE, [[10, "1000"], [70, "1100"], [130, "1200"]]),
    series({ ...BASE, stmt_id: "100548", status: "failed", reason: "out_of_memory" },
      [[10, "1100"]]),
  ];
  const dur = [
    series(BASE, [[10, "40"], [70, "60"], [130, "80"]]),
    series({ ...BASE, stmt_id: "100548", status: "failed", reason: "out_of_memory" },
      [[10, "100"]]),
  ];
  const events = restoreEvents(ts, dur); // endMs: 1000k, 1100k(성공), 1100k(실패), 1200k

  it("구간 필터는 경계 포함이다", () => {
    const shown = filterEvents(events, 1100_000, 1200_000);
    expect(shown).toHaveLength(3);
    expect(filterEvents(events, 0, 1000_000)).toHaveLength(1);
  });

  it("요약은 표시 집합에서 계산된다 — 건수·에러·평균 소요", () => {
    const shown = filterEvents(events, 1100_000, 1200_000); // 60·80(성공)+100(실패)
    const sum = summarize(shown);
    expect(sum.count).toBe(3);
    expect(sum.failedCount).toBe(1);
    expect(sum.avgDurationSec).toBeCloseTo((60 + 80 + 100) / 3);
  });

  it("빈 집합의 평균은 NaN (화면 표기 '-')", () => {
    const sum = summarize([]);
    expect(sum.count).toBe(0);
    expect(Number.isNaN(sum.avgDurationSec)).toBe(true);
  });
});

describe("filterByDuration — 2D 드래그의 소요시간(y) 범위 (인간 지시 2026-09-04)", () => {
  const ts = [series(BASE, [[10, "1000"], [70, "1100"], [130, "1200"]])];
  const dur = [series(BASE, [[10, "40"], [70, "60"], [130, "80"]])];
  const events = restoreEvents(ts, dur);

  it("경계 포함으로 durationSec 를 거른다", () => {
    expect(filterByDuration(events, { minSec: 40, maxSec: 60 }).map((e) => e.durationSec))
      .toEqual([40, 60]);
    expect(filterByDuration(events, { minSec: 61, maxSec: 200 }).map((e) => e.durationSec))
      .toEqual([80]);
    expect(filterByDuration(events, { minSec: 0, maxSec: 10 })).toHaveLength(0);
  });

  it("범위가 없으면(가로 전용 드래그) 원본을 그대로 돌려준다", () => {
    expect(filterByDuration(events, undefined)).toBe(events);
    expect(filterByDuration(events, null)).toBe(events);
  });
});
