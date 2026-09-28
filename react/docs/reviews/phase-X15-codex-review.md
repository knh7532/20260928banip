# Phase X13·X14·X14-f1·X15 묶음 codex 리뷰 (2026-08-20)

- reviewer: codex exec / codex-cli (GPT-5 계열, reasoning=medium, sandbox read-only, 독립 실행 주체)
- 대상: 커밋 `6e63647`(X13) · `2247761`(X14) · `b5cb626`(X14-f1) + X15 워킹트리
  (X13·X14는 리뷰 시점 codex 사용량 한도로 차기 게이트 위임됐던 분 — 이번에 이행)
- 실행: 2026-08-20 16:5x, 게이트: tsc·eslint는 codex가 자체 통과 확인, pytest·vitest는
  read-only 샌드박스 제약으로 미실행(우리 게이트가 별도 green)

## 지적 (5건 — blocking 1 · major 2 · minor 2)

| ID | 수위 | 위치 | 요지 |
| --- | --- | --- | --- |
| X14F1-01 | blocking | exporter/drilldown_sim.py request_restart | hang 즉사 예약이 tick 경유 2단계 전달이라, 전달 전 tick에 문장이 종료(admin kill·tick 지연 자연 종료)되면 예약이 query_sim에 늦게 도착해 소거 기회를 잃고 **재사용 stmt_id의 새 문장을 죽인다**(X11 신원 격리 규약 위반) |
| X14-01 | major | MainDashboard.tsx·WorkerMonitoring.tsx alertKind | 워커별 알람을 단일 Map에 덮어써 WorkerDown·WorkerUnresponsive 동시 관측 시(전환·stale) 유형이 **응답 순서**에 따라 비결정적으로 갈린다 |
| X15-01 | major | RestartGuideDialog.tsx kill 명령 | `grep {worker}`가 부분 문자열 일치라 sqream101이 sqream1010 등도 매치 — 여러 sqreamd를 kill할 수 있다 |
| X13-01 | minor | drilldown.css `.sqm-chart--grafana` | 근거(fillOpacity 15) 대비 구현이 0.22 — 원본 일치 요구라면 0.15로 |
| X15-02 | minor | web/src/api/exporterCmd.ts shutdownWorker | Graceful Shutdown UI 폐기 후 dead export(테스트에서만 참조) |

## 판정·반영 (Adjudication)

| ID | 판정 | 반영 |
| --- | --- | --- |
| X14F1-01 | **Accepted** | 예약 전달을 **HTTP 접수 시점 즉시**로 이동 — `main.Simulation.request_restart` 래퍼가 verdict 직후 `take_crash_victims()`를 소비해 `query_sim.request_worker_crash`에 등록(metrics.LOCK 하). 문장이 어떤 경로로든 종료되면 `_finish_expired`가 예약을 반드시 소거(자연 종료 우선 규약) — 잔존 창 소멸. crash 에피소드의 미전달 victims가 함께 당겨져도 무해(같은 배선의 조기 실행). 회귀 테스트 `test_hang_restart_reservation_immediate_and_always_consumed` 신설 (pytest 146) |
| X14-01 | **Accepted** | 두 화면의 alertKind 조립에 **WorkerDown 우선** 규칙(기존 값이 WorkerDown이면 덮지 않음) — 순서 무관 결정론. 회귀 테스트(픽스처가 Unresponsive를 먼저 줌) 신설 |
| X15-01 | **Accepted(부분)** | `grep -w {worker}`로 단어 경계 보강(awk 공백 정정과 같은 결 — 현장 원문 최소 정정, 주석·테스트 동조). 워커명은 exporter 채번 고정 집합이라 메타문자 유입 없음(주석 근거). "kill -- $pid 직접" 재작성안은 현장 원문 구조 존중 차원에서 불채택 |
| X13-01 | **Rejected(의도)** | X13 승인 플랜 원문이 "면 채움 **0.22**(Grafana 15~25 구간 — 스택 밴드 구분)"로 원본 15와의 차이를 명시 확정 — 0.15로 내리면 스택 밴드가 흐릿해진다. CSS 주석에 Rejected 근거를 박아 재발 방지 |
| X15-02 | **Accepted** | `shutdownWorker` 함수·전용 테스트 삭제(409 detail 보존 테스트는 removeLock으로 전환). exporter shutdown API는 존치(§0.1 해제 4호 — 주석에 근거) |

재확인 리뷰(수렴 규칙): `phase-X15-codex-resolution.md`.
