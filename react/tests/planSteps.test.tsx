/*
 * X8 — 구조화 실행계획(mockPlanSteps·PlanSteps) 검증.
 *
 * 잠그는 것: ① 결정론(같은 입력 = 같은 출력, 벽시계 미사용), ② 라이브 의미론 —
 * done 단계 시간은 elapsed가 자라도 불변이고 running 단계만 자란다, ③ 임계 상수
 * (100s 빨강·50s 노랑)와 색 클래스, ④ 병목 단계 가중(45~70%), ⑤ 스켈레톤이
 * 같은 계열 explainPlan 텍스트와 어긋나지 않는다(드리프트 가드).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PLAN_TIME_RED_S, PLAN_TIME_YELLOW_S, explainPlan, mockPlanSteps,
} from "../src/screens/drilldown/mockQueryDetail";
import { PlanSteps } from "../src/screens/drilldown/PlanSteps";

const ROW = { id: "100137", qid: "JOI-14H" };

describe("mockPlanSteps", () => {
  it("같은 입력이면 같은 출력이다 (결정론 — Date 미사용)", () => {
    expect(mockPlanSteps({ ...ROW, elapsed: 125 }))
      .toEqual(mockPlanSteps({ ...ROW, elapsed: 125 }));
  });

  it("done 시간은 elapsed가 자라도 불변, running만 자란다 (라이브 의미론)", () => {
    const a = mockPlanSteps({ ...ROW, elapsed: 120 });
    const b = mockPlanSteps({ ...ROW, elapsed: 150 });
    for (let i = 0; i < a.length; i += 1) {
      if (a[i].state === "done" && b[i].state === "done") {
        expect(b[i].seconds).toBe(a[i].seconds); // 재조회에도 완료 단계는 고정
      }
    }
    const runA = a.find((s) => s.state === "running");
    const runB = b.find((s) => s.state === "running");
    expect(runA).toBeDefined();
    expect(runB).toBeDefined();
    // 같은 단계가 계속 실행 중이면 30초만큼 자랐고, 다음 단계로 넘어갔어도
    // 전체 소요 합은 정확히 elapsed와 같다(예산 소비 모델).
    const sum = (steps: typeof a) => steps.reduce((acc, s) => acc + s.seconds, 0);
    expect(sum(a)).toBeCloseTo(120, 6);
    expect(sum(b)).toBeCloseTo(150, 6);
  });

  it("실행 순서는 표시 역순(leaf→root) — done은 아래쪽, pending은 위쪽이다", () => {
    const steps = mockPlanSteps({ ...ROW, elapsed: 60 });
    const states = steps.map((s) => s.state);
    // running은 정확히 1개, 그 아래(뒤 인덱스)는 done, 위(앞 인덱스)는 pending
    expect(states.filter((s) => s === "running")).toHaveLength(1);
    const runIdx = states.indexOf("running");
    expect(states.slice(0, runIdx).every((s) => s === "pending")).toBe(true);
    expect(states.slice(runIdx + 1).every((s) => s === "done")).toBe(true);
  });

  it("elapsed가 총예산을 넘으면 root(1단계)가 running으로 계속 자란다", () => {
    const steps = mockPlanSteps({ ...ROW, elapsed: 100_000 });
    expect(steps[0].state).toBe("running");
    expect(steps.slice(1).every((s) => s.state === "done")).toBe(true);
  });

  it("병목 1단계가 총예산의 45~70%를 가진다 — 임계를 실제로 넘게 하는 설계", () => {
    // 예산 분포는 elapsed와 무관 — 충분히 큰 elapsed로 전 단계 예산을 드러낸다
    const steps = mockPlanSteps({ ...ROW, elapsed: 100_000 });
    const budgets = steps.map((s, i) => (i === 0 ? 0 : s.seconds)); // root는 잔여라 제외
    const total = budgets.reduce((a, b) => a + b, 0);
    const max = Math.max(...budgets);
    // root가 병목으로 뽑힌 시드면 이 검사가 공허해진다 — JOI-14H는 아님(고정 시드)
    expect(max / total).toBeGreaterThanOrEqual(0.45);
    expect(max / total).toBeLessThanOrEqual(0.7);
  });

  it("elapsed 결측은 0 — 첫 실행 단계(leaf)만 running 0초다 (NaN 명시 포함)", () => {
    const steps = mockPlanSteps(ROW);
    expect(steps[steps.length - 1].state).toBe("running");
    expect(steps[steps.length - 1].seconds).toBe(0);
    expect(steps.slice(0, -1).every((s) => s.state === "pending")).toBe(true);
    // 명시적 NaN도 결측과 동일 취급 (codex X8-05)
    expect(mockPlanSteps({ ...ROW, elapsed: Number.NaN })).toEqual(steps);
  });

  it("예산 정확 경계 — elapsed가 leaf 예산과 정확히 같으면 leaf=done, 다음=running 0s", () => {
    // leaf 예산은 elapsed를 크게 줘서 드러난 done 값에서 읽는다 (예산은 elapsed 무관)
    const revealed = mockPlanSteps({ ...ROW, elapsed: 100_000 });
    const leafBudget = revealed[revealed.length - 1].seconds;
    const steps = mockPlanSteps({ ...ROW, elapsed: leafBudget });
    expect(steps[steps.length - 1].state).toBe("done");
    expect(steps[steps.length - 1].seconds).toBe(leafBudget);
    expect(steps[steps.length - 2].state).toBe("running");
    expect(steps[steps.length - 2].seconds).toBe(0);
  });

  it("불변식(다중 시드): 소요 합=elapsed·running 정확히 1개·done 아래/pending 위", () => {
    /* 병목이 root로 뽑히는 시드를 포함해도 성립해야 하는 모델 불변식 —
       특정 시드에서만 통과하는 공허한 검사를 피한다 (codex X8-05). */
    const seeds = ["100137", "105343", "9", "42", "77777"];
    const qids = ["JOI-14H", "AGG-04M", "SEL-01L", "DEL-05M", "LOA-12H", "UTI-01L", ""];
    for (const id of seeds) {
      for (const qid of qids) {
        for (const elapsed of [0, 3, 47, 120, 100_000]) {
          const steps = mockPlanSteps({ id, qid, elapsed });
          const label = `${id}/${qid}/${elapsed}`;
          const sum = steps.reduce((acc, s) => acc + s.seconds, 0);
          expect(sum, label).toBeCloseTo(elapsed, 6);
          const states = steps.map((s) => s.state);
          expect(states.filter((s) => s === "running"), label).toHaveLength(1);
          const runIdx = states.indexOf("running");
          expect(states.slice(0, runIdx).every((s) => s === "pending"), label).toBe(true);
          expect(states.slice(runIdx + 1).every((s) => s === "done"), label).toBe(true);
        }
      }
    }
  });

  it("임계 상수는 피드백 값 그대로다 (100s 빨강 · 50s 노랑)", () => {
    expect(PLAN_TIME_RED_S).toBe(100);
    expect(PLAN_TIME_YELLOW_S).toBe(50);
  });

  it("스켈레톤 연산자가 같은 계열 explainPlan 텍스트에 존재한다 (드리프트 가드)", () => {
    for (const qid of ["JOI-14H", "AGG-04M", "SEL-01L", "DEL-05M", "LOA-12H", "UTI-01L"]) {
      const text = explainPlan({ id: "100137", qid });
      for (const step of mockPlanSteps({ id: "100137", qid, elapsed: 10 })) {
        expect(text, `${qid}의 ${step.op}`).toContain(step.op);
      }
    }
  });
});

describe("PlanSteps 렌더", () => {
  it("단계 표 + 임계 색 클래스 + 상태 Pill — 목업 고지는 없다 (X12)", () => {
    const { container } = render(
      <PlanSteps steps={[
        { step: 1, op: "PushToNetworkQueue", detail: "rows=all", gpu: false, seconds: 0, state: "pending" },
        { step: 2, op: "GpuReduce", detail: "group_by=region", gpu: true, seconds: 130, state: "done" },
        { step: 3, op: "ReadTable", detail: "table=public.sales_data", gpu: false, seconds: 60, state: "running" },
      ]} />,
    );
    expect(screen.getByText("PushToNetworkQueue")).toBeInTheDocument();
    expect(screen.getByText("[GPU]")).toBeInTheDocument();
    // ≥100s 빨강, 50~100s 노랑, pending은 시간 대신 "—"
    expect(container.querySelector(".sqm-plansteps__time--red")?.textContent).toBe("130.0s");
    expect(container.querySelector(".sqm-plansteps__time--yellow")?.textContent).toBe("60.0s");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("실행 중")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("대기")).toBeInTheDocument();
    expect(container.querySelector(".is-running")).not.toBeNull();
    // 각주에 목업 고지가 없다(X12) — 임계 안내만 남는다.
    expect(container.textContent).not.toContain("목업");
    expect(container.textContent).toContain("이상 노랑");
  });
});
