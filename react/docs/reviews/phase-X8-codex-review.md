# Phase X8 구현 후 codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: X8 워킹트리 미커밋 변경분 — 탑뷰 피드백 6건(쿼리 클릭→플랜 팝업·라이브 갱신·단계 색상·상태 컬럼·중간 재배치·Kill 통합)
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=medium`, sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-18 (KST 밤)
- **검토 불변식**: TV-C1 무수정(신규 exprs 계약 라벨만) · Timeline/series.ts 무수정 · mockPhases/mockLogs/explainPlan 출력 불변 · LLM 무회귀(.dashboard-top 원문·.panel--running 무스타일) · 기존 app.test/layout.contract/queryDetailModal 단언 무수정 green · 팝업 PromQL 미생성(pollLive 콜백만) · 어휘 v4.7

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| X8-01 | major | GpuDashboard.tsx:84 | "컴파일·초기화" 카드가 합성 In Queue 단계 행까지 셈 — 카드 문구(Compile·Initializing)와 표시 숫자가 어긋남 |
| X8-02 | major | queries.ts:314 | `queuedCount ... or vector(0)`이 exporter 시리즈 부재까지 0으로 위장 — KPI "결측=NaN/-"·`0*count` 원칙과 충돌. 상시 존재 인벤토리 계열 앵커 필요 |
| X8-03 | major | GpuDashboard.tsx:269 | `.sqm-toast`(z 50)가 모달 백드롭(z 60) 아래 — Kill 실패·복사 토스트가 모달 열린 동안 안 보임 |
| X8-04 | minor | QueryDetailModal.tsx:84 | usePolling deps의 pollLive 함수가 JSON.stringify로 null 직렬화 — 무의미한 dep |
| X8-05 | minor | planSteps.test.tsx:66 | 병목 검증이 고정 시드만·예산 정확 경계·명시 NaN 미잠금 |
| X8-06 | minor | plan.md | "신규 28" 수치 불일치(실제 순증 18) |

**총평(1차)**: blocking 0 · major 3 — 게이트 통과 불가. display:contents 래퍼·TTL 재표시·11열 정합·LLM/Timeline 불변은 문제 없음.

→ 처리: `phase-X8-codex-resolution.md`

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · X8-01~06 처리분 확인 | **6건 전부 resolved · 신규 blocking/major 0**. 확인: 앵커 쿼리의 계약 합법성(sqm_worker_up node 매처)과 firstScalar 상호작용(부재→NaN→"-") 정합, preparing 명시 집계의 축 구분, 토스트 z 70, fnRef 콜백 최신화, 불변식 175조합. 신규 **X8-N01(minor)** — plan.md a)의 `or vector(0)` 잔재·712 수치 → 즉시 정정(앵커 서술·714 반영) — **수렴, 종료 게이트 통과** |
