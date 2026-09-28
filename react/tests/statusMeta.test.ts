/**
 * X16: 상태(Status) 축 — 누적 그래프 축(PHASE_META)과 별개의 표기 어휘.
 * 카드·표 상태 표시의 라벨·서수·Stopped 파생을 잠근다.
 */
import { describe, expect, it } from "vitest";

import { PHASE_META } from "../src/components/detail/phaseMeta";
import { FAILURE_STAGES } from "../src/lib/failureStages";
import {
  STATUS_META, STOPPED_REASONS, countStopped, statusOf, statusOrdinal, stoppedCountReady,
} from "../src/lib/statusMeta";
import type { XViewEvent } from "../src/lib/xview";

const ev = (reason: string, endMs: number): XViewEvent => ({
  node: "gpu-server-01", gpu: "0", mig: "0", stmtId: "100137", queryId: "Q-1",
  user: "dba1", queryName: "JOIN_MART", status: reason === "" ? "success" : "failed",
  reason, endMs, durationSec: 10, phases: null,
});

describe("STATUS_META — 상태 축 어휘 (X16)", () => {
  it("4단계 키는 PHASE_META와 같고(축은 달라도 단계 집합은 동일), 라벨은 상태 축이다", () => {
    expect(STATUS_META.map((s) => s.key).sort())
      .toEqual(PHASE_META.map((m) => m.key).sort());
    expect(STATUS_META.map((s) => s.label))
      .toEqual(["In Queue", "Preparing", "Initializing", "Executing"]);
    // 누적 그래프 축은 v4.7 어휘 그대로다 — 상태 축 신설이 그래프 어휘를 바꾸지 않는다
    expect(PHASE_META.find((m) => m.key === "compileSec")!.label).toBe("Compile");
  });

  it("statusOf는 compile 단계를 Preparing으로 읽는다 — 배지 클래스는 기존 유지", () => {
    expect(statusOf("compileSec")).toMatchObject({
      label: "Preparing", badgeClass: "state--compile", tone: "grey",
    });
    expect(statusOf("executingSec")).toMatchObject({ label: "Executing", tone: "green" });
  });

  it("정렬 서수는 STATUS_META 순서다 — In Queue가 Preparing보다 앞 (X16)", () => {
    expect(["queuedSec", "compileSec", "initializingSec", "executingSec"]
      .map((k) => statusOrdinal(k as never))).toEqual([0, 1, 2, 3]);
  });
});

describe("STOPPED_REASONS — failureStages와 대사 (표류 가드)", () => {
  it("'Stopped / Cancelled' 유형인 reason 집합과 정확히 일치한다", () => {
    const fromStages = Object.entries(FAILURE_STAGES)
      .filter(([, info]) => info.typeLabel === "Stopped / Cancelled")
      .map(([reason]) => reason)
      .sort();
    expect([...STOPPED_REASONS].sort()).toEqual(fromStages);
  });
});

describe("countStopped — 표시 구간 내 중단 문장 수", () => {
  it("창 경계는 endMs >= sinceMs 포함이고, 중단 reason만 센다", () => {
    const events = [
      ev("killed_by_admin", 1_000), // 경계 정확히 — 포함
      ev("killed_by_admin", 999), // 창 밖 — 제외
      ev("killed_by_admin", 5_000),
      ev("out_of_memory", 5_000), // 실패지만 중단 아님 — 제외
      ev("", 5_000), // 성공 — 제외
    ];
    expect(countStopped(events, 1_000)).toBe(2);
  });

  it("빈 배열은 0이다", () => {
    expect(countStopped([], 0)).toBe(0);
  });
});

describe("stoppedCountReady — 조건 세대 게이트 경계 (codex X16-01)", () => {
  it("변경과 **같은 밀리초**의 성공은 stale로 본다(strict >) — 이전 세대 성공이 경계에서 통과하지 못한다", () => {
    expect(stoppedCountReady(null, Number.NEGATIVE_INFINITY)).toBe(false); // 첫 성공 전
    expect(stoppedCountReady(1_000, Number.NEGATIVE_INFINITY)).toBe(true); // 마운트 세대
    expect(stoppedCountReady(999, 1_000)).toBe(false); // 변경 전 성공
    expect(stoppedCountReady(1_000, 1_000)).toBe(false); // 경계 — 이전 세대 성공일 수 있다
    expect(stoppedCountReady(1_001, 1_000)).toBe(true); // 변경 후 성공만 fresh
  });
});
