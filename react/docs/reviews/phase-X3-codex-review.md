# Phase X3 구현 — codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: 커밋 `a6ee440`(X3 — phase 메트릭 + 툴팁 개편) 반영 워킹트리
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=medium`, sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-14 (KST 새벽)
- **검사 불변식**: ① 산점도·타임라인·시뮬 거동 무변경 ② reason 열거형 불변(5종) ③ additive-only ④ phase 링 동반 퇴출(참조계수) ⑤ web 계층 규칙

## 지적 사항 (원문)

| ID | severity | file:line | failure | evidence | fix |
|---|---|---|---|---|---|
| CDX-X3-01 | major | web/src/hooks/useXViewEvents.ts:40 | 선택적 phase 조회 장애가 기존 산점도까지 중단시켜 "산점도 거동 무변경" 및 `phases=null·이벤트 유지` 조건을 위반한다. | 세 조회를 하나의 `Promise.all`로 묶어 phase 요청 하나만 실패해도 `restoreEvents`가 호출되지 않는다. 반복되면 `failStreak`이 증가하고 58행에서 기존 이벤트까지 제거된다. 관련 테스트도 phase 성공/전체 실패만 다루며 phase 단독 실패를 검증하지 않는다. | timestamp·duration만 필수 실패로 처리하고 phase 실패는 `[]`로 격리해 `restoreEvents(ts, dur, [])`를 호출한다. phase 단독 실패 시 점은 유지되고 `phases=null`인지 훅 테스트를 추가한다. |

**총평 (원문)**: 미해결 blocking: **0건**. 미해결 major: **1건**으로, 현재 X3 종료 게이트는 미통과입니다. Exporter는 `ruff` 및 101개 테스트가 통과했고, web은 lint·typecheck가 통과했습니다. web Vitest는 읽기 전용 환경에서 Vite 임시 파일 생성이 차단되어 재실행하지 못했습니다. `submit_t` 계산, reason 5종, additive 계약, phase 참조계수 동반 퇴출에서는 blocking/major 결함을 발견하지 못했습니다.
