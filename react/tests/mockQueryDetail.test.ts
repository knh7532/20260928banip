/*
 * X6 — Query 상세 목업 생성기(explainPlan·mockLogs) 검증.
 *
 * 잠그는 것: ① 결정론(같은 입력 = 같은 출력 — 새로고침마다 바뀌면 못 믿는다),
 * ② qid 없는 호출은 QueryAnalytics 이관 전과 같은 출력(EXPLAIN 모달 회귀 방지),
 * ③ qid 계열 변주가 mockSql의 SQL 계열과 어긋나지 않는다, ④ 로그는 시간순이다.
 */
import { describe, expect, it } from "vitest";

import {
  currentPhase, explainPlan, mockLogs, mockPhases,
} from "../src/screens/drilldown/mockQueryDetail";

const MiB = 1024 * 1024;

describe("explainPlan", () => {
  it("같은 입력이면 같은 계획이다", () => {
    const a = explainPlan({ id: "100137", worker: "sqream101", qid: "JOI-14H" });
    expect(explainPlan({ id: "100137", worker: "sqream101", qid: "JOI-14H" })).toBe(a);
  });

  it("qid 없으면 기존 QueryAnalytics 형태 그대로다 — 640MiB는 chunks 10", () => {
    const plan = explainPlan({ id: "2", worker: "sqream101", scan: 640 * MiB });
    expect(plan).toContain("chunks_scanned=10"); // 640MiB / 64MiB
    expect(plan).toContain("table=public.web_traffic"); // MOCK_TABLES[2 % 4]
    expect(plan).toContain("PushToNetworkQueue");
    expect(plan).not.toContain("목업"); // 말미 고지는 X12에서 제거
  });

  it("qid 없고 scan도 없으면 chunks는 '-'다 (기존 동작 보존)", () => {
    expect(explainPlan({ id: "1", worker: "w" })).toContain("chunks_scanned=-");
  });

  it("qid 계열에 맞는 변주를 낸다 — SQL 탭과 다른 쿼리처럼 보이면 안 된다", () => {
    expect(explainPlan({ id: "1", qid: "JOI-14H" })).toContain("GpuJoin");
    expect(explainPlan({ id: "1", qid: "JOI-14H" })).toContain("sales.public.orders");
    expect(explainPlan({ id: "1", qid: "AGG-04M" })).toContain("sales.public.order_items");
    expect(explainPlan({ id: "1", qid: "DEL-05M" })).toContain("DeleteRows");
    expect(explainPlan({ id: "1", qid: "UPD-03L" })).toContain("UpdateRows");
    expect(explainPlan({ id: "1", qid: "LOA-12H" })).toContain("WriteTable");
    // 모르는 계열은 일반형으로 떨어진다
    expect(explainPlan({ id: "1", qid: "UTI-01L" })).toContain("PushToNetworkQueue");
  });

  it("qid가 있고 scan이 없으면 해시로 그럴듯한 chunks를 만든다 (40~400)", () => {
    const m = explainPlan({ id: "100137", qid: "JOI-14H" }).match(/chunks_scanned=(\d+)/);
    expect(m).not.toBeNull();
    const n = Number(m![1]);
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(400);
  });
});

describe("mockLogs", () => {
  const row = {
    id: "100137", qid: "JOI-14H", user: "dba1", node: "gpu-server-01",
    worker: "sqream101", service: "etl_service", elapsed: 125, prog: 0.4,
  };

  it("같은 입력이면 같은 로그다", () => {
    expect(mockLogs(row)).toEqual(mockLogs(row));
  });

  it("생애주기를 따른다 — 접수·컴파일·배정·GPU 초기화가 앞머리다", () => {
    const msgs = mockLogs(row).map((l) => l.msg);
    expect(msgs[0]).toContain("Statement 100137 received");
    expect(msgs[0]).toContain("user=dba1");
    expect(msgs[1]).toContain("Compile finished");
    expect(msgs[2]).toContain("worker sqream101");
    expect(msgs[2]).toContain("node gpu-server-01");
    expect(msgs[3]).toContain("GPU context initialized");
  });

  it("진행률 이정표는 도달한 것까지만 — 40%면 25%만 있다", () => {
    const msgs = mockLogs(row).map((l) => l.msg);
    expect(msgs.some((m) => m.includes("progress 25%"))).toBe(true);
    expect(msgs.some((m) => m.includes("progress 50%"))).toBe(false);
    expect(mockLogs(row).some((l) => l.level === "Warning")).toBe(false);
  });

  it("진행률 72%를 넘으면 스풀 경고가 뜬다 — 그리고 시간순이다", () => {
    const lines = mockLogs({ ...row, prog: 0.8 });
    const warn = lines.filter((l) => l.level === "Warning");
    expect(warn).toHaveLength(1);
    expect(warn[0].msg).toContain("Spool");
    // T+MM:SS.d 오프셋이 역행하지 않는다 (스풀 0.72가 75% 이정표보다 먼저다)
    const secs = lines.map((l) => {
      const m = l.at.match(/^T\+(\d+):(\d+\.\d)$/);
      expect(m, `오프셋 형식 오류: ${l.at}`).not.toBeNull();
      return Number(m![1]) * 60 + Number(m![2]);
    });
    for (let i = 1; i < secs.length; i += 1) {
      expect(secs[i], `로그가 시간 역행: ${lines[i - 1].at} → ${lines[i].at}`)
        .toBeGreaterThanOrEqual(secs[i - 1]);
    }
  });

  it("결측 필드는 '-'로 낸다 — 지어내지 않는다", () => {
    const msgs = mockLogs({ id: "9" }).map((l) => l.msg);
    expect(msgs[0]).toContain("user=-");
    expect(msgs[2]).toContain("worker -");
  });
});

describe("mockPhases (X6-f1 — 로그 탭 누적 막대의 수치 원천)", () => {
  const row = { id: "100137", qid: "JOI-14H", elapsed: 125 };

  it("고정 입력의 정확한 값 고정 — 자기 비교가 아니라 fixture다 (codex X6-f1-R1)", () => {
    /* 해시·salt·공식이 범위 안에서 조용히 바뀌면 화면의 수치가 커밋마다 달라진다 —
       재현성(같은 QID = 같은 값)이 이 목업의 신뢰 근거라 정확값으로 잠근다. */
    const p = mockPhases(row);
    expect(p.compileSec).toBeCloseTo(2.2485708574855, 10);
    expect(p.queuedSec).toBeCloseTo(3.5214871077353, 10);
    expect(p.initializingSec).toBeCloseTo(1.3565660603637, 10);
    expect(p.executingSec).toBe(125);
    // 합성 범위(exporter COMPILE/INITIALIZING_RANGE_S 미러)도 함께 문서화한다
    expect(p.compileSec).toBeGreaterThanOrEqual(0.4);
    expect(p.compileSec).toBeLessThanOrEqual(2.5);
    expect(p.queuedSec).toBeGreaterThanOrEqual(0);
    expect(p.queuedSec).toBeLessThanOrEqual(4);
    expect(p.initializingSec).toBeGreaterThanOrEqual(0.3);
    expect(p.initializingSec).toBeLessThanOrEqual(1.5);
  });

  it("로그 첫 구간의 at 오프셋도 같은 수치에서 나온다 — T+ 오프셋 fixture", () => {
    const logs = mockLogs(row);
    expect(logs[0].at).toBe("T+00:00.0");
    expect(logs[1].at).toBe("T+00:02.2"); // compile 2.248…
    expect(logs[2].at).toBe("T+00:05.8"); // + queued 3.521…
    expect(logs[3].at).toBe("T+00:07.1"); // + init 1.356…
  });

  it("로그 문장과 수치가 일치한다 — 막대와 로그가 어긋나면 못 믿는다", () => {
    const p = mockPhases(row);
    const msgs = mockLogs(row).map((l) => l.msg);
    expect(msgs[1]).toContain(`Compile finished in ${p.compileSec.toFixed(1)}s`);
    expect(msgs[2]).toContain(`after ${p.queuedSec.toFixed(1)}s in queue`);
  });

  it("elapsed 결측이면 executing은 0이다", () => {
    expect(mockPhases({ id: "9" }).executingSec).toBe(0);
  });
});

describe("currentPhase (X7-a — Query Overview Status 열)", () => {
  /* 잠긴 fixture: compile 2.2485… · queued 3.5214…(누적 5.7700…) · init 1.3565…
     (누적 7.1266…). elapsed를 준비 단계 시작점에 겹쳐 읽는다. */
  const row = { id: "100137", qid: "JOI-14H" };

  it("elapsed가 준비 단계 경계를 지나며 단계가 바뀐다", () => {
    expect(currentPhase({ ...row, elapsed: 1 })).toBe("compileSec");
    expect(currentPhase({ ...row, elapsed: 3 })).toBe("queuedSec");
    expect(currentPhase({ ...row, elapsed: 6 })).toBe("initializingSec");
    expect(currentPhase({ ...row, elapsed: 125 })).toBe("executingSec");
  });

  it("경계값은 다음 단계다 (strict <)", () => {
    const p = mockPhases(row);
    expect(currentPhase({ ...row, elapsed: p.compileSec })).toBe("queuedSec");
    expect(currentPhase({
      ...row, elapsed: p.compileSec + p.queuedSec + p.initializingSec,
    })).toBe("executingSec");
  });

  it("elapsed 결측이면 Compile — 이제 막 접수된 행이다", () => {
    expect(currentPhase(row)).toBe("compileSec");
  });
});
