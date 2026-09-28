# Phase X9 codex 지적 처리 (Adjudication)

원본: `phase-X9-codex-review.md` (2026-08-19). 각 건을 Accepted / Rejected / Escalated로 분류 — Rejected는 근거 필수(AGENTS §6.3).

## X9-01 (major) — 빈 상태 게이트가 nodeCpu·DCGM 관측까지 포함

**판정: Rejected (의도된 동작) + 권고 일부 수용(의도 잠금 테스트 추가)**

- **근거**: 인간 피드백 원문이 "워커 사망 표시 — … 수집 시 워커 없으면 이상 판단"이다. 노드 지표(nodeCpu·DCGM FB)가 관측되는데 `sqm_worker_up` 시리즈만 없다면 그것이 바로 "수집에 워커가 없음" — 고정 맵 24슬롯을 "수집 누락(이상)"으로 채워 **드러내는 것**이 이 기능의 목적이다. 게이트를 workers 관측만으로 좁히면 이 이상 상황이 기존 빈 상태 메시지 뒤로 숨는다.
- "유령 24행 금지"(계획 문구)는 **전 쿼리 무관측**(exporter 자체 사망·Prometheus 불통) 케이스를 가리키며, 그 케이스는 현행 게이트가 그대로 빈 상태 메시지를 낸다(기존 테스트 "수집이 전혀 없으면 그렇게 말한다" green 유지).
- 배포 목업에서는 두 계열이 같은 exporter 스크레이프에서 나오므로 "worker_up만 부재"는 실주행에서 발생하지 않는다 — 의미론 선택의 문제이고, 위 인간 규칙을 따른다.
- **수용분**: 권고된 테스트를 의도 방향으로 추가 — `drilldownScreens.test.tsx` "워커 시리즈만 전무하고 노드 지표가 살아 있으면 — 24슬롯 전부 수집 누락(이상)이다 (codex X9-01 의도 잠금)": nodeCpu만 있는 픽스처 → 빈 상태 메시지 부재 + "수집 누락(이상)" 24건 단언(테스트 주석에 두 케이스의 경계 명시).

## X9-02 (minor) — all-missing 카드에 빨강 `--down` 부착

**판정: Accepted — Fixed**

- `WorkerCard`: 카드 수위 강조를 행 상태 의미에 정렬 — `allDown`(관측된 8슬롯 전부 down) → `sqm-wnode--down`(빨강), `allMissing` → 신설 `.sqm-wnode--missing`(회색 테두리 + dim 0.85, `drilldown.css`).
- 테스트: 첫 테스트에 전 슬롯 missing인 card02가 `--missing`이고 `--down`이 아님을 단언 추가.

## 처리 후 게이트 재실행

- eslint 0 · tsc 0 · **vitest 717 passed / 10 skipped** (+1 — X9-01 의도 잠금) · 파일별 커버리지 신규 미달 0(미달 17건 = 기존 기준선, WorkerMonitoring·toolbarModel 충족) · build · 재배포 후 화면 실측 정상.

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 · 처리 2건 판정 요청 | **X9-01 resolved — Rejected 판정 타당**("원 지적대로 빈 상태로 바꾸면 '수집 시 워커 부재 = 이상' 확정 요구사항을 위반"으로 명시 동의) · **X9-02 resolved**(구현·CSS·card02 단언 일치 확인) · **신규 코드 결함 없음** · 신규 minor 1: **X9-N01** — plan.md 검증 수치 716→717 불일치 → 즉시 정정(717·순증 3 반영). **수렴 — 종료 게이트 통과** |

## X9-f1 처리 (표 재배치 회차, 2026-08-19)

원본: `phase-X9-codex-review.md` X9-f1 절.

### X9F1-01 (major) — missing 슬롯에 DCGM util 막대 누출

**판정: Accepted — Fixed.** `util: o ? utilMap.get(worker) : undefined` — 수집 누락 행은 세 수치 모두 `--`가 규약(주석 명시). 테스트: 워커 없는 슬롯(gpu3·mig1)에 migUtil 44 픽스처 추가 → `queryByText("44%")` null 단언. (참고: X9의 `수집 누락` 규약을 표 재배치 과정에서 일관되게 강제한 것 — X9 본편에서는 util이 조건 없이 채워졌으나 텍스트 셀이라 동일 문제가 잠재했다.)

### X9F1-02 (minor) — 행 클릭 상세 회귀 미잠금

**판정: Accepted — Fixed.** 평면 표 테스트에 행 클릭 후 tbody 8행 유지 + `.sqm-wrow-detail` 부재 + `[aria-expanded]` 부재 단언 추가.

### 처리 후 게이트

eslint 0 · tsc 0 · **vitest 716 passed / 10 skipped**(X9 717 대비 −1: 아코디언·정렬 테스트 2건 삭제, 평면 표 테스트 1건 신설) · 파일별 커버리지 신규 미달 0(기준선 17 불변) · build · 재배포 실측(병합 셀·막대·Down 에피소드에서 병합 셀 틴트 제외).

### 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 | **X9F1-01 resolved**(util undefined 처리·44% 미표시 회귀 테스트 확인) · **X9F1-02 resolved**(8행 유지·상세 미생성·aria-expanded 부재 검증 확인) · **신규 지적 없음 — 수렴, 종료 게이트 통과** |

## X9-f2 처리 (RAM Memory 열 회차, 2026-08-19)

원본: `phase-X9-codex-review.md` X9-f2 절.

### X9F2-01 (minor) — RAM 단위 불일치 (GiB 환산 ~7% 과소)

**판정: Accepted — Fixed.** exporter `query_sim.GB_BYTES = 1_000_000_000` 실측 확인 → 화면 환산을 `row.ram / 1e9`로 교체(주석: VRAM(GiB, DCGM MiB 계열)과 단위 기준이 다름을 명시). 테스트 픽스처를 exporter 실단위(30e9·12e9·50e9)로 교체 + 단위 주석 — GiB 픽스처가 단위 오류를 가리던 문제 해소.

### 처리 후 게이트

eslint 0 · tsc 0 · **vitest 716 passed / 10 skipped** · 파일별 커버리지 신규 미달 0(기준선 17 불변) · build · 재배포.

### 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 | **X9F2-01 resolved**(1e9 환산=exporter GB_BYTES 일치·실단위 픽스처가 GiB 회귀 탐지·VRAM GiB 유지와 단위 차이 주석 확인) · **신규 지적 없음 — 수렴, 종료 게이트 통과** |

## X9-f3 처리 (Restart 목업 반영·Query ID 팝업 회차, 2026-08-19)

원본: `phase-X9-codex-review.md` X9-f3 절.

### X9F3-01 (major) — 다이얼로그 경고문이 목업 거동과 모순

**판정: Accepted — Fixed.** 경고문을 실제 반영 범위로 교체: "목업 반영 범위는 **worker_up 복구와 WorkerDown 알람 해제**까지 — 실행 중 statement는 유지(워커 건강과 비결합, X7-c)". restart 테스트에 경고문 2구절 단언 추가로 잠금.

### X9F3-02 (minor) — 감사 기록 과장 문구

**판정: Accepted — Fixed.** 같은 경고문 교체에 포함 — "운영상 ADMIN 전용 명령이며, 목업은 접수 요청만 exporter stdout에 기록합니다"(무인증·성공만 기록이라는 실구현과 일치).

### X9F3-03 (minor) — 수동 복구 tick의 신규 장애 재추첨 경합

**판정: Accepted — Fixed.** `drilldown_sim`: `until==0.0`을 수동 복구 표지로 사용(자연 복구 시각은 epoch라 무충돌), 수동 복구를 소비한 tick에는 신규 개시를 건너뛰고 `_outage_next`를 다음 창으로 재예약. 결정론 테스트 신설(`test_worker_restart_not_raced_by_pending_outage` — `_outage_next` 도달 상태 강제 후 전원 up + 재예약 단언).

### 처리 후 게이트·E2E

- exporter ruff·mypy 0 · **pytest 125**(+1) · web lint·tsc 0 · **vitest 719** · 커버리지 신규 미달 0(기준선 17) · build · 재배포(verify ALL PASS).
- **E2E 실측**: 실제 X7-c 에피소드(sqream201 다운) 중 Restart 버튼 → 다이얼로그(신규 경고문) → HTTP 200 접수 토스트 → exporter stdout `[restart] worker=sqream201 reason='X9-f3 E2E 실측 — WorkerDown 장애 조치'` **감사 기록 확인**(자연 복구 아님) → 다음 갱신에 Healthy 복귀·8/8·클러스터 HEALTHY.

### 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 | **X9F3-01 resolved**(경고문 범위 한정·비결합 근거·2구절 단언 확인) · **X9F3-02 resolved**(운영상 한정·stdout 접수 기록 표현 정확) · **X9F3-03 resolved**(0.0 표지·건너뛰기·재예약·강제 경합 테스트 확인) · **신규 지적 없음 — 수렴, 종료 게이트 통과** |

## X9-f4 처리 (카드 접기·MainDashboard Restart 통합 회차, 2026-08-19)

원본: `phase-X9-codex-review.md` X9-f4 절.

### X9F4-01 (major) — 고정 시점에서 MainDashboard Restart 미차단

**판정: Accepted — Fixed.** `disabled={i.healthy || pinnedMs !== null}` + pin용 title `RESTART_PINNED_TITLE`(restartAction 공용 상수 — QueryDetailModal Kill 잠금과 같은 어휘). 테스트 신설: pinnedMs 렌더에서 Unhealthy 행 Restart disabled + title `/고정 시점/` 단언.

### X9F4-02 (nit) — ActionDialog onConfirm 주석 잔재

**판정: Accepted — Fixed.** "기본 작업은 감사 기록 문구까지만이고, 승인된 예외(Kill X6 · Restart X9-f3/f4)의 콜백은 exporter 합성 상태를 변경할 수 있다"로 교체.

### 처리 후 게이트

lint·tsc 0 · **vitest 723 passed / 10 skipped**(+1) · 커버리지 신규 미달 0(기준선 17 — restartAction 충족, MainDashboard는 기존 기준선 멤버로 65.57→68.85% 소폭 개선) · build · 재배포. (untracked restartAction.tsx는 커밋 스테이징 포함 — reviewer 참고 지적 수용.)

### 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 | **X9F4-01 resolved**(disabled 조건·RESTART_PINNED_TITLE·pin 테스트 확인) · **X9F4-02 resolved**(주석이 기본/예외를 정확히 구분) · untracked restartAction.tsx 포함 검토 — 두 화면 문구·요청·오류 처리 일관 공용화 확인 · **신규 지적 없음 — 수렴, 종료 게이트 통과** |
