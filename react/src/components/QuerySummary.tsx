/**
 * 쿼리 개수 요약 (X8 — 피드백 #5) — X16: 상태 축 5장(In Queue · Preparing ·
 * Initializing · Executing · Stopped, 순서는 STATUS_META = 인간 나열 순서).
 *
 * 표시 전용 카드. 파생(단계 판정·중단 집계)은 GpuDashboard가 하고 여기는 숫자만
 * 받는다 — components/ 계층이 screens/drilldown의 판정 로직을 직접 물지 않게(레이어링).
 *
 * 축이 섞이지 않게 힌트로 명시한다:
 *  - "대기"는 **배정 전 statement 수**(sqm_statement_queued — 계약 라벨에 gpu/mig가
 *    없어 인스턴스 필터만 적용). 합성 In Queue 단계 행은 어느 카드에도 넣지 않는다
 *    (섞으면 이중계상, codex X8-01).
 *  - 준비/초기화/실행은 **실행 슬롯 위** 문장을 currentPhase로 나눈 행 수다.
 *  - "중단"은 **문장 축**(kill된 statement)이다 — 드릴다운 Node Health의 워커
 *    Stopped와 무관하므로 힌트에 대상(문장)을 박아 둔다.
 */
export function QuerySummary({ queued, preparing, initializing, running, stopped, stoppedWindow }: {
  /** 대기(In Queue) statement 수 — NaN이면 "-"(조회 실패·데이터 없음). */
  queued: number;
  /** 표의 행 중 Preparing(compile) 단계 수. */
  preparing: number;
  /** 표의 행 중 Initializing 단계 수. */
  initializing: number;
  /** 표의 행 중 Executing 단계 수. */
  running: number;
  /** 표시 구간 내 중단(kill)된 문장 수 — NaN이면 "-"(첫 조회 전·끊김·필터 변경 직후). */
  stopped: number;
  /** 중단 카드의 창 표기 (예: "30분", "1시간") — 표시 구간과 동일. */
  stoppedWindow: string;
}) {
  const num = (v: number) => (Number.isFinite(v) ? Math.trunc(v).toLocaleString("ko-KR") : "-");
  /* 2026-09-04 (인간 지시): 카드를 세로 구성으로 — 상태 점 + 라벨 / 큰 값 / 힌트.
     색은 상태 축(statusMeta) 톤을 그대로 쓴다(대기 주황·준비 회색·초기화 파랑·실행 초록·중단 빨강). */
  // ===== 20260916 추가 시작 : server_status.statement_status COUNT 표기 문구 통일 =====
  const cards: Array<{ tone: string; label: string; value: number; hint: string }> = [
    { tone: "queue", label: "대기 (In Queue)", value: queued, hint: "statement_status COUNT" },
    { tone: "compile", label: "준비 (Preparing)", value: preparing, hint: "statement_status COUNT" },
    { tone: "init", label: "초기화 (Initializing)", value: initializing, hint: "statement_status COUNT" },
    { tone: "run", label: "실행 중 (Executing)", value: running, hint: "statement_status COUNT" },
    { tone: "stopped", label: `중단 (Stopped · 최근 ${stoppedWindow})`, value: stopped, hint: "statement_status COUNT" },
  ];
  // ===== 20260916 추가 끝 : server_status.statement_status COUNT 표기 문구 통일 =====
  return (
    <section className="dashboard-qsummary" aria-label="쿼리 개수 요약">
      {cards.map((c) => (
        <div key={c.tone} className={`qsummary-card qsummary-card--${c.tone}`}>
          <span className="qsummary-card__label">
            <i className="qsummary-card__dot" aria-hidden="true" />{c.label}
          </span>
          <span className="qsummary-card__value">{num(c.value)}</span>
          <span className="qsummary-card__hint">{c.hint}</span>
        </div>
      ))}
    </section>
  );
}
