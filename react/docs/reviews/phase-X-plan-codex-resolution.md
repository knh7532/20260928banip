# Phase X1/X2 계획 초안 — codex 리뷰 처리 기록 (AGENTS §6.2-4 준용, 계획 단계)

대응 리뷰: `phase-X-plan-codex-review.md` (1차, draft `74cef166…` @ 60ccca4) + 재검증 X-plan-2 (2차, XR 반영 워킹트리).

## 1차 지적 처리 (XR-01~08)

| ID | severity | 처리 | 반영 위치 / 근거 |
| --- | --- | --- | --- |
| XR-01 | blocking | **Fixed(계획 반영)** | plan.md X1 산출물에 `_HELP` 2건 + import/수집 테스트 명시 |
| XR-02 | blocking | **Fixed(계획 반영)** | plan.md X1 "소비 의미론" 절 신설 — instant 금지, `/query_range` (라벨셋,값) 전환 복원. KEEP=60은 노출 상한(링 한 바퀴 ~5.6분 ≫ 스크레이프 5s) |
| XR-03 | blocking | **Fixed(계획 반영)** | 동일 절 — range 복원으로 덮어쓰기 무해화, dedupe=(전체 라벨셋, 종료 epoch), 동일 라벨셋 퇴출 참조계수/재등록 스킵 |
| XR-04 | major | **Fixed(계획 반영)** | plan.md X2 — `useRangeDetail` 재사용 폐기, 신규 `useXViewEvents` 훅 + 요약행은 표시 이벤트 집합에서 계산, 기존 rangeDetail 폴링 중단 |
| XR-05 | major | **Fixed(계획 반영)** | plan.md X1 "행동 테스트" 절 — 동시 발행·값 정확성·reason·상한·양쪽 remove·퇴출 경합 |
| XR-06 | minor | **Fixed(구현 지침으로 전환)** | 목업 파일은 제안 시각화 증거로 동결. X2 구현은 실데이터 사용이라 미해당 — 구현 시 "목업 데이터 규칙 재현 금지" 지침으로 기록 |
| XR-07 | minor | **Fixed(구현 지침으로 전환)** | 실제 구현은 Timeline.tsx 고정 viewBox 패턴(비율 보존)이라 미해당. 목업 동결 |
| XR-08 | minor | **Fixed(구현 지침으로 전환)** | X2 구현은 d3.brushX(extent로 plot 경계 강제) 사용이라 미해당. 학습용 데모 동결 |

## 2차 재검증 결과 (X-plan-2)

- XR-01~05: **전건 resolved** 판정 (근거 파일:라인 포함 — 리뷰 원문 참조)
- **미해결 blocking: 0건**
- 신규 major 3건 → 아래 처리

| ID | severity | 처리 | 반영 위치 |
| --- | --- | --- | --- |
| NX-01 | major | **Fixed(계획 반영)** | plan.md X2 "재검증(X-plan-2) 반영" ① — 두 range 쿼리 공통 endMs·stepSec·signal + timestamp 전환 기준 결합 규칙 + 테스트 |
| NX-02 | major | **Fixed(계획 반영)** | 동 절 ② — `failStreak`·`lastSuccessAt` 승계, 3연속 실패 클리어 + 행동 테스트 |
| NX-03 | major | **Fixed(계획 반영)** | 동 절 ③ — `.detail-col--xview` GPU 전용 1행 modifier, LLM 2행 단언 별도 유지 |

## 수렴 규칙

NX-01~03 반영으로 draft가 다시 변경되었으므로(신선도 바인딩), **X1 구현 착수 직전(인간 승인 시점)에 최종 draft 해시 기준 확인 리뷰 1회를 재실행**해 미해결 blocking 0건을 재확인한다.

## 수렴 확인 (X-plan-3, 2026-08-13)

인간 승인(§7, "착수하고 다되면 스크린샷") 직후 최종 draft 해시 `9c238a6f…dbac485` 기준으로 확인 리뷰를 재실행했다 (codex exec / codex-cli 0.147.0, reasoning=medium — 확인 목적 경량 구성, 독립 세션).

- **판정**: XR-01~05·NX-01~03 **전건 resolved 유지** (plan.md 181~183·193~194행 근거)
- **신규 blocking**: 없음 — `_finish_expired`/`_failed` 패턴·`CONTRACT`/`_HELP` 구조·도착률 합계·72개 stmt_id 풀과 대조해 모순 없음
- **결론**: 미해결 blocking **0건** → X1 구현 착수 게이트 통과. 상태: **인간 승인 완료 · 구현 진행**
