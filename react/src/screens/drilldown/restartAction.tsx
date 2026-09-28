/**
 * Worker Restart 공용 조각 (X9-f4 · X11) — Worker Monitoring과 Main Dashboard가
 * 같은 다이얼로그 문구·요청 로직을 쓴다.
 *
 * X9-f3에서 Worker 화면에 exporter 명령 API(`POST /workers/{w}/restart`, §0.1
 * 부분 해제 2호)를 배선하며 경고문을 목업 반영 범위와 일치시켰는데(codex
 * X9F3-01/02), MainDashboard의 다이얼로그는 "기록만"으로 남아 문구·거동이
 * 갈라졌다(HCI). 인간 지시(2026-08-19)로 통합 — 두 화면이 이 모듈 하나를 쓰면
 * 같은 모순이 재발할 수 없다.
 *
 * X11 (인간 확정 — SQream 가이드 절차): 재시작은 3단계 절차의 마지막이었다 —
 * ① STOP_STATEMENT ② graceful shutdown ③ restart. **X14-f1 (인간 지시
 * 2026-08-20)이 강제를 폐기**: 조치는 운영자 판단이고, hang 직행 재기동도
 * 서버가 접수한다(실행 문장은 connection_lost로 강제 종료 — 실행 전 안내가
 * 확인 다이얼로그의 몫이다). CLE 실행 중만 차단 유지(인간 재확인).
 *
 * X12 (인간 지시 2026-08-19): 화면 문자열에서 메타 멘트(목업 반영 범위·"목업 —
 * 합성 데이터에 반영"·stdout 감사·가이드 출처 표기)를 제거했다 — 반영 범위와
 * 근거는 이 주석과 command-api.md가 담는다(반영 = worker_up 복구·장애 알람
 * (WorkerDown/WorkerUnresponsive) 해제, 감사 = exporter stdout, 절차 근거 =
 * SQream 가이드).
 *
 * X15 (인간 현장 확인 2026-08-20): 실제 현장은 **자동 기동 스크립트**가 상시
 * 실행 중이라, 조치의 실체는 해당 워커 서버에서의 프로세스 kill 하나다 —
 * 재기동은 스크립트 몫(목업의 자연 복구·restart API 수동 복구가 그 재현).
 * 이에 따라 Graceful Shutdown UI(구 SHUTDOWN_WARNING·requestShutdown)를
 * 폐기했다 — exporter shutdown API(§0.1 해제 4호)는 존치하되 화면이 부르지
 * 않는다(RestartGuideDialog 헤더 주석 참조).
 */
import type { ReactNode } from "react";

import { ExporterCmdError, restartWorker } from "../../api/exporterCmd";

/** 재기동 경고문(stopped) — 정지 완료 상태라 위험 요소가 없다. */
export const RESTART_WARNING: ReactNode = (
  <>
    정지된 워커를 재기동합니다. 접수되면 다음 갱신에 Healthy로 복귀합니다.
    ADMIN 전용 명령입니다.
  </>
);

/** crash 전용 재기동 경고문(X14 → X15 자동 기동 서사) — 프로세스가 이미
    죽었으니 kill 대상이 없고, 이 버튼은 스크립트가 못 살릴 때의 수동
    트리거다. */
export const CRASH_RESTART_WARNING: ReactNode = (
  <>
    다운된 워커를 수동 재기동합니다. 실행 중이던 쿼리는 이미{" "}
    <b>connection_lost로 실패 처리</b>됐습니다 — 재기동 후 해당 배치를
    재실행하세요. ADMIN 전용 명령입니다.
  </>
);

/** Healthy 워커의 Recovery 비활성 사유 — exporter가 404로 거부하는 fail-closed와 일치. */
export const RESTART_HEALTHY_TITLE =
  "Down·No response·Stopped 워커만 Recovery할 수 있습니다";

/** 고정 시점(pin) 비활성 사유 — 과거 스냅숏의 Unhealthy로 **현재** exporter에
    명령을 보내면 안 된다(codex X9F4-01, QueryDetailModal의 Kill 잠금과 같은 규약). */
export const RESTART_PINNED_TITLE =
  "고정 시점에서는 재시작할 수 없습니다 — 실시간 화면에서 실행하세요.";

/** 409(절차 위반) 등 실패의 공통 문구 — 서버가 준 사유(detail)를 그대로 보인다. */
function failDetail(e: unknown, notFoundText: string): ReactNode {
  if (e instanceof ExporterCmdError && e.status === 404) return notFoundText;
  if (e instanceof ExporterCmdError && e.status === 409 && e.detail !== undefined) {
    return <>절차 위반으로 거부됨 — <code>{e.detail}</code></>;
  }
  return `요청 실패 — ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * 재시작 요청 + 결과 토스트. 200은 "접수"다 — 복구는 exporter 다음 tick이라
 * 낙관적 갱신 없이 다음 폴링(worker_up 실측)이 보여 준다.
 */
export function requestRestart(
  worker: string, reason: string,
  showToast: (message: ReactNode, ms?: number) => void,
): void {
  restartWorker(worker, reason).then(() => {
    showToast(
      <>
        ✅ <b>{worker}</b> 재기동 접수 — 다음 갱신에 Healthy로 복귀합니다
        <br />사유: {reason}
      </>, 8000);
  }).catch((e: unknown) => {
    showToast(<>⚠ <b>{worker}</b> Recovery:{" "}
      {failDetail(e, "이미 복구됐거나 다운 상태가 아닙니다")}</>, 8000);
  });
}

/* requestShutdown·SHUTDOWN_WARNING은 X15에서 삭제 — 자동 기동 스크립트
   모델에서 UI가 graceful shutdown을 제공하지 않는다(exporter API는 존치). */
