# Phase X9 구현 후 codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: X9 워킹트리 미커밋 변경분 — Worker Monitoring 개편(고정 맵 8슬롯·VRAM 71GB 분모·MIG 사용률 조인·아코디언·Down 값 유지·수집 누락 판정·564GB 표기 삭제)
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열(gpt-5.6-sol), `model_reasoning_effort=medium`, sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-19 (KST 새벽)
- **검토 불변식**: TV-C1 무변경(migUtil은 계약 시리즈 소비만) · Timeline 계열·exporter·타 화면 무수정 · workerName 정방향 조인(frontend/exporter 규칙 일치) · 빈 상태/필터/폴백 기존 테스트 유지 · `sqm-grid--stack`(X8-f3) 유지
- **비고**: reviewer는 read-only 샌드박스에서 Vite 임시 파일 생성이 막혀 테스트를 직접 실행하지 못함 — 게이트 결과는 정적 검토로 확인(실행은 Implementor 게이트에서 수행: vitest 717 green).

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| X9-01 | major | WorkerMonitoring.tsx:120 | 빈 상태 게이트 `seen`이 `sqm_worker_up` 외 nodeCpu·DCGM 시리즈 포함 — worker_up 전무 + 노드 지표 존재 시 고정 맵 24행이 전부 "수집 누락(이상)"으로 펼쳐짐. 게이트를 workers 관측만으로 좁히고 해당 케이스 테스트 추가 권고 |
| X9-02 | minor | WorkerMonitoring.tsx:218 / drilldown.css:543 | all-missing 카드에 빨강 `sqm-wnode--down` 부착 — 행 수위의 회색 "수집 누락"과 카드 수위 빨강이 어긋나고, 반대로 전 슬롯 실제 down 카드에는 강조 없음 |

**총평(1차)**: blocking 0 · major 1 · minor 1. 확인된 정합: diff=코드·테스트 5파일+plan.md, TV-C1·exporter·Timeline·타 화면 무수정, workerName 양측 `sqream{node}{gpu}{mig+1}` 일치, 고정 8슬롯·71GiB 분모·MIG 조인·Down 값 유지·다중 아코디언·정렬·폴링 redraw 열림 상태 보존 정상, 접근성 blocking 없음.

→ 처리: `phase-X9-codex-resolution.md`

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · X9-01(Rejected+의도 잠금 테스트)·X9-02(Fixed) 처리분 확인 | **X9-01·X9-02 양건 resolved(Reject 근거 타당 판정) · 신규 코드 결함 0 · 신규 minor 1(X9-N01 — plan.md 수치 716→717, 즉시 정정) — 수렴, 종료 게이트 통과** (상세: resolution 문서) |

## X9-f1 회차 (표 재배치 — GPU 병합 셀·정렬/아코디언 제거·막대 복원, 2026-08-19)

- **검토 대상**: X9-f1 워킹트리 미커밋 변경분(HEAD=867056b) — WorkerMonitoring.tsx 렌더부·drilldown.css·drilldownScreens.test.tsx
- **reviewer**: 동일 구성(codex exec, reasoning=medium, read-only — 테스트 직접 실행은 Vite 임시 파일 EPERM으로 불가, 정적 검토)

| ID | severity | file:line | failure |
|---|---|---|---|
| X9F1-01 | major | WorkerMonitoring.tsx:142 | `util`이 관측 여부(`o`) 무관하게 utilMap에서 채워짐 — worker_up 누락 슬롯에 DCGM 시리즈만 있으면 missing 행에 GPU Usage 막대가 표시("missing 3칸 --" 규약 위반) |
| X9F1-02 | minor | drilldownScreens.test.tsx:405 | 평면 표 테스트가 버튼 부재만 확인 — 행 클릭 상세 회귀를 잠그지 않음 |

**총평(1차)**: blocking 0 · major 1 · minor 1. 확인된 정합: 7열 헤더·GPU rowSpan=2 구조, `:not(.sqm-wgpu)` 병합 셀 보호, VRAM 비율·BarCell clamp, 삭제 CSS 클래스 타 화면 미사용, useTableSort/SortReset 공용 구현 무영향.

→ 처리: resolution 문서 X9-f1 절.

## X9-f2 회차 (VRAM 힌트 삭제·MIG 열 제거·RAM Memory 열 368GB, 2026-08-19)

- **검토 대상**: X9-f2 워킹트리 미커밋 변경분(HEAD=a9b806d) — queries.ts(`workerRam` 조인 키)·WorkerMonitoring.tsx·drilldownScreens.test.tsx
- **reviewer**: 동일 구성(codex exec, reasoning=medium, read-only — vitest 재실행은 EPERM으로 불가, 정적 검토 + 실 Prometheus 조회로 workerRam 결과 확인)

| ID | severity | file:line | failure |
|---|---|---|---|
| X9F2-01 | minor | WorkerMonitoring.tsx:294 | RAM 단위 불일치 — exporter는 `GB_BYTES=1e9`(10진 GB)로 생성하는데 화면이 GiB(1024³)로 환산해 ~7% 과소 표시. 테스트 픽스처(`30*GiB`)가 오류를 가림 |

**총평(1차)**: blocking/major 0 · minor 1. 확인된 정합: `workerRam` `group_left(worker)` 방향·stmt_id 1:1 계약 정합(실 Prometheus 워커별 결과 정상), 7열 구조·기본 colSpan, MIG/힌트 제거, Down·missing 게이트.

→ 처리: resolution 문서 X9-f2 절.

## X9-f3 회차 (Healthy/Unhealthy·Restart 목업 반영·Query ID 열+팝업, 2026-08-19)

- **검토 대상**: X9-f3 워킹트리 미커밋 변경분(HEAD=4f8ca4e) — exporter 3파일+테스트 3파일(restart 명령 API), web 4파일(exporterCmd·queries·WorkerMonitoring·테스트), 문서 4종(§0.1 부분 해제 확대)
- **reviewer**: 동일 구성(codex exec, reasoning=medium, read-only)

| ID | severity | file:line | failure |
|---|---|---|---|
| X9F3-01 | major | WorkerMonitoring.tsx:347 | Restart 다이얼로그 경고문("statement 모두 중단·처리량 0")이 실제 목업 거동과 모순 — 구현은 worker_up·알람 복구만, statement는 비결합으로 유지 |
| X9F3-02 | minor | WorkerMonitoring.tsx:348 / http_api.py | "ADMIN 전용, 실행·거부 모두 감사 기록" 과장 — 서버는 무인증·접근 로그 꺼짐·성공 요청만 stdout 기록 |
| X9F3-03 | minor | drilldown_sim.py:219 | 수동 복구를 소비한 tick에 `_outage_next`가 이미 도달해 있으면 신규 추첨이 같은 워커를 즉시 재다운시켜 200 응답의 "다음 갱신에 Healthy" 약속을 깰 수 있음 |

**총평(1차)**: blocking 0 · major 1 · minor 2. 확인된 정합: `_read_payload` 리팩터가 kill의 400/404/413/405·CORS 보존, restart 대조·예약의 LOCK 직렬화, Query ID 조인·토큰 결측 Kill 비활성·pin 차단·15s 억제·pollLive 기존 계약 정합.

→ 처리: resolution 문서 X9-f3 절.

## X9-f4 회차 (카드 접기·MainDashboard Restart 통합, 2026-08-19)

- **검토 대상**: X9-f4 워킹트리 미커밋 변경분(HEAD=9e1a64d) — WorkerMonitoring(접기)·restartAction.tsx 신설·MainDashboard 통합·ActionDialog 주석·테스트
- **reviewer**: 동일 구성(codex exec, reasoning=medium, read-only)

| ID | severity | file:line | failure |
|---|---|---|---|
| X9F4-01 | major | MainDashboard.tsx:475 | 고정 시점(pinnedMs)에서 Restart가 활성 — 과거 스냅숏의 Unhealthy로 **현재** exporter에 명령 가능. Worker 화면·Kill의 pin 잠금과 불일치(exporter 404는 "지금도 다운"이면 수락하므로 stale-context를 못 막음) |
| X9F4-02 | nit | ActionDialog.tsx:38 | onConfirm 주석 "실제 실행은 하지 않는다" — 구 "기록만" 잔재 |

**총평(1차)**: blocking 0 · major 1 · nit 1. 확인된 정합: 접기 상태 유지·aria(expanded/controls/id)·ACTIVE 요약, 공용 Restart 문구·404/네트워크 분기, `.sqm-workerhealth` 4칸 계약 보존.

→ 처리: resolution 문서 X9-f4 절.
