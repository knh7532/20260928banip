/**
 * exporter 명령 API 클라이언트 (X6) — 브라우저가 :9090에 직접 POST 한다.
 *
 * 이 목업에서 **유일한 상태 변경 경로**다(AGENTS.md §0.1 X6 예외, 인간 승인 2026-08-18,
 * docs/architecture/command-api.md). 기본 주소는 앱이 떠 있는 호스트의 :9090 —
 * 번들에 호스트를 하드코딩하지 않는다(`agentUrl.ts`와 같은 규칙, web-verify가 검사).
 * 다른 호스트/포털 프록시 뒤라면 `VITE_EXPORTER_URL`로 지정한다.
 *
 * reason은 요청 본문으로만 보낸다 — exporter는 stdout 기록까지만 하고 라벨에는
 * 싣지 않는다(자유 문자열 카디널리티 금지).
 */

import { runtimeOverride } from "../runtimeConfig";

const DEFAULT_PORT = 9090;
const TIMEOUT_MS = 4000; // prom.ts INSTANT_TIMEOUT_MS와 같은 감각

export type ExporterCmdErrorKind = "http" | "network" | "timeout";

export class ExporterCmdError extends Error {
  constructor(
    message: string,
    readonly kind: ExporterCmdErrorKind,
    /** kind === "http"일 때의 상태 코드 — 404(이미 종료·미존재)는 문구가 다르다. */
    readonly status?: number,
    /** 응답 본문의 error 문구(X11) — 409의 절차 위반 사유를 UI가 그대로 보여 준다
        (fail-closed 이중화: UI 게이트를 우회해도 서버 사유가 토스트에 나온다). */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ExporterCmdError";
  }
}

export function exporterBaseUrl(): string {
  const runtime = runtimeOverride("exporterUrl");
  if (runtime) return runtime.replace(/\/+$/, "");
  const configured: string | undefined = import.meta.env.VITE_EXPORTER_URL;
  if (configured && configured.trim() !== "") return configured.replace(/\/+$/, "");
  // SSR·테스트 등 location이 없을 수 있다.
  if (typeof location === "undefined") return `http://localhost:${DEFAULT_PORT}`;
  const proto = location.protocol === "https:" ? "https:" : "http:";
  return `${proto}//${location.hostname}:${DEFAULT_PORT}`;
}

/**
 * 실행 중 statement의 kill 요청. **200은 "접수"다** — 반영은 exporter의 다음
 * tick(≤1초)이라, 호출자는 낙관적 제거 + 폴링 억제로 화면을 맞춘다.
 *
 * startTime(시작 epoch 초)은 **세대 토큰**이다(X6-R1): stmt_id는 exporter 신원
 * 풀에서 재사용되므로, 팝업이 본 문장이 끝나고 같은 id가 새 문장에 배정된 뒤
 * 늦게 누른 kill이 엉뚱한 문장을 죽일 수 있다. exporter가 대조해 다르면 404,
 * 토큰이 없으면 400으로 거부한다(fail-closed, X6-R4) — UI는 토큰이 유한하지
 * 않으면 Kill 버튼 자체를 비활성한다(QueryDetailModal).
 */
export async function killStatement(
  stmtId: string, reason: string, startTime?: number,
): Promise<void> {
  await postCommand(
    `/api/v1/statements/${encodeURIComponent(stmtId)}/kill`,
    startTime !== undefined && Number.isFinite(startTime)
      ? { reason, start_time: startTime } : { reason });
}

/**
 * Unhealthy(다운) 워커의 재시작 요청 (X9-f3, 인간 승인 2026-08-19). **200은 "접수"**
 * — 복구 반영은 exporter의 다음 tick(≤1초, 자동 복구와 같은 경로)이다.
 *
 * kill과 달리 세대 토큰이 없다: 워커 이름은 고정 GPU–MIG–워커 맵이라 재사용 ABA가
 * 성립하지 않고, exporter가 "지금 다운인가"를 대조해 아니면 404로 거부한다
 * (fail-closed — 그 사이 자동 복구됐으면 404가 정답이다).
 */
export async function restartWorker(worker: string, reason: string): Promise<void> {
  await postCommand(
    `/api/v1/workers/${encodeURIComponent(worker)}/restart`, { reason });
}

/* 구 shutdownWorker(X11 graceful shutdown ②)는 X15에서 삭제 — 자동 기동
   스크립트 모델에서 UI가 shutdown을 부르지 않는다(codex X15-02 dead surface).
   exporter의 `POST /workers/{w}/shutdown` API 자체는 존치한다(§0.1 해제 4호,
   외부 호출 대비 — stopped 방어 분기는 RestartGuideDialog 참조). */

/**
 * orphaned lock 제거 요청 (X11) — SQream `REMOVE_LOCK` 상당. 죽은 워커가 남긴
 * 락만 지울 수 있다 — 실행 중 문장의 락은 exporter가 409로 거부한다(위험).
 * **200은 "접수"** — 시리즈 제거는 다음 tick, 화면은 낙관 제거+TTL로 맞춘다.
 */
export async function removeLock(lockId: string, reason: string): Promise<void> {
  await postCommand(
    `/api/v1/locks/${encodeURIComponent(lockId)}/remove`, { reason });
}

/**
 * 테이블 유지보수 요청 (X10-f2, 인간 승인 2026-08-19) — Cleanup Chunk/Rechunk가
 * exporter 합성 통계를 실제로 바꾼다(상태 변경 3호). **200은 "접수"** — 반영은
 * 다음 tick이고 화면은 폴링 실측으로 따라간다(낙관적 갱신 없음).
 *
 * fail-closed: exporter가 배치 판정과 같은 규칙으로 대조한다 — cleanup은
 * deleted>0, rechunk는 4임계 충족 테이블만. 아니면 404.
 */
export async function tableMaintenance(
  db: string, schema: string, table: string,
  kind: "cleanup" | "rechunk", reason: string,
): Promise<void> {
  await postCommand(
    `/api/v1/tables/${encodeURIComponent(db)}/${encodeURIComponent(schema)}`
    + `/${encodeURIComponent(table)}/${kind}`,
    { reason });
}

async function postCommand(path: string, body: object): Promise<void> {
  const url = `${exporterBaseUrl()}${path}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // 본문의 error 문구(X11 — 409 절차 위반 사유)를 실어 UI가 그대로 보여 준다.
      let detail: string | undefined;
      try {
        const parsed: unknown = await res.json();
        if (parsed !== null && typeof parsed === "object"
            && typeof (parsed as { error?: unknown }).error === "string") {
          detail = (parsed as { error: string }).error;
        }
      } catch { /* 본문이 JSON이 아니면 상태 코드만으로 충분하다 */ }
      throw new ExporterCmdError(
        detail !== undefined
          ? `exporter HTTP ${res.status} — ${detail}` : `exporter HTTP ${res.status}`,
        "http", res.status, detail);
    }
  } catch (e) {
    if (e instanceof ExporterCmdError) throw e;
    if (e instanceof DOMException && e.name === "AbortError" && timedOut) {
      throw new ExporterCmdError(`exporter timeout (${TIMEOUT_MS}ms)`, "timeout");
    }
    throw new ExporterCmdError(e instanceof Error ? e.message : String(e), "network");
  } finally {
    clearTimeout(timer);
  }
}
