# Phase X16 codex 리뷰 (2026-08-21)

- reviewer: codex exec / codex-cli (GPT-5 계열, reasoning=high, sandbox read-only, 독립 실행 주체)
- 대상: X16 워킹트리 diff 패킷(611줄 — statusMeta.ts 신설·카드 5장·상태 소비처 전환·테스트·plan.md)
  + 저장소 원본 대조. 불변식 8종(누적 그래프 축 무변경·Timeline 미접촉·계약 무변경·
  카탈로그/워커 축 무변경·Stopped NaN 의미론·정렬 서수·이중계상 금지·테스트 공허)을 명시해 실행
- 실행: 2026-08-21, 게이트: eslint·tsc·vitest는 우리 게이트가 별도 green(리뷰는 read-only)

## 지적 (3건 — blocking 3)

| ID | 수위 | 위치 | 요지 |
| --- | --- | --- | --- |
| X16-01 | blocking | web/src/screens/GpuDashboard.tsx (stoppedCount) | `xviewAt !== null`만 준비 판정에 쓰면 **필터·시간 범위 변경 직후** 새 폴링 성공 전까지 이전 조건의 events로 집계한 건수가 표시된다 — usePolling은 deps 변경 시 `lastSuccessAt`을 초기화하지 않고 useXViewEvents도 기존 events를 유지한다. 새 요청이 지연·실패하면 이전 필터의 수가 수 초간 노출("첫 폴링 성공 전 NaN" 불변식 위반) |
| X16-02 | blocking | web/tests/drilldownScreens.test.tsx (Status 정렬) | Status 헤더 클릭 후 **정렬 결과 순서를 단언하지 않아** 라벨 알파벳 정렬 퇴행을 못 잡는다 — statusMeta 단위 테스트도 순수 함수만 검사하므로 MainDashboard가 라벨 picker로 되돌아가도 양쪽 다 통과 |
| X16-03 | blocking | web/tests/app.test.tsx (통합 배선) | 통합 테스트가 카드 [0]·[3]만 단언 — Preparing·Initializing·Stopped 배선, 합성 In Queue 단계 행의 이중계상 금지, Kill 후 낙관 무증분이 전부 미검증(회귀 허용) |

## 판정·반영 (Adjudication)

| ID | 판정 | 반영 |
| --- | --- | --- |
| X16-01 | **Accepted** | GpuDashboard에 **조건 세대 게이트** 추가 — 필터·범위 키(`xviewDepsKey`) 변경 시 `xviewFreshSince=Date.now()`를 찍고, `xviewAt < xviewFreshSince`면 NaN("-"). usePolling이 세대 교체 시 진행 중 요청을 abort하고 성공 시각을 남기지 않으므로 변경 시각 이후의 성공은 새 조건의 응답임이 보장된다(훅 무변경 — X2 계약 미접촉). 재현 테스트 신설: 응답 보류(deferred fetch) 중 필터 변경 → "-", 보류 해제 후 복귀 |
| X16-02 | **Accepted** | 4행을 서로 다른 단계(경계 중간값 + 의도-판정 가드 단언)에 놓고 Status 클릭(서수 내림차순)·재클릭(오름차순)의 **실제 tbody QID 순서**를 STATUS_META 서수 기대열과 대사 — 라벨 정렬 퇴행이면 순서가 달라져 실패한다 |
| X16-03 | **Accepted** | 통합 테스트를 행 3개(Preparing·Initializing·Executing) + queued 2 + 중단 이벤트 1 픽스처로 확장, 카드 5슬롯 전부 `["2","1","1","1","1"]` 일치 단언(합성 In Queue 행 미계상 포함). Kill 실행 후 중단 카드가 1 그대로임을 단언(낙관 무증분). range 목 오버라이드(`rangeOver`)를 fetch 목에 추가해 완료 이벤트 픽스처 주입 |

재확인 리뷰(수렴 규칙): `phase-X16-codex-resolution.md`.
