/**
 * 구조화 실행계획 표 (X8) — 단계·연산자·상세·소요시간·상태.
 *
 * 소요시간 색: ≥100s 빨강 · 50~100s 노랑(`PLAN_TIME_*` 상수) — 병목 단계를
 * 눈으로 즉시 파악한다(피드백 #3). 수치는 `mockPlanSteps`가 만든다:
 * done은 고정, running은 재조회마다 자란다(#2).
 */
import { Pill } from "../../components/drilldown/primitives";
import {
  PLAN_TIME_RED_S, PLAN_TIME_YELLOW_S, type PlanStep,
} from "./mockQueryDetail";

function timeClass(seconds: number): string {
  if (seconds >= PLAN_TIME_RED_S) return "sqm-plansteps__time--red";
  if (seconds >= PLAN_TIME_YELLOW_S) return "sqm-plansteps__time--yellow";
  return "";
}

const STATE_TONE = { done: "green", running: "blue", pending: "grey" } as const;
const STATE_LABEL = { done: "완료", running: "실행 중", pending: "대기" } as const;

export function PlanSteps({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="sqm-plansteps">
      <table>
        <thead>
          <tr><th>#</th><th>연산자</th><th>상세</th><th className="num">소요시간</th><th>상태</th></tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.step} className={s.state === "running" ? "is-running" : undefined}>
              <td>{s.step}</td>
              <td>
                {s.op}
                {s.gpu && <span className="sqm-plansteps__gpu"> [GPU]</span>}
              </td>
              <td className="sqm-dim">{s.detail}</td>
              <td className={`num ${timeClass(s.seconds)}`}>
                {s.state === "pending" ? "—" : `${s.seconds.toFixed(1)}s`}
              </td>
              <td><Pill tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* "목업 실행계획…(M3)" 고지는 X12에서 제거 — 임계 안내만 남긴다. */}
      <p className="sqm-dim sqm-plansteps__note">
        소요시간 {PLAN_TIME_YELLOW_S}s 이상 노랑 · {PLAN_TIME_RED_S}s 이상 빨강.
      </p>
    </div>
  );
}
