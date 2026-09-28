# Phase X4 구현 — codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: 커밋 `0ca97d1`(X4-a 필터) + `b3abf6e`(X4-b 팬·줌) 반영 워킹트리
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=medium`, sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-14 (KST 오전)
- **검사 불변식**: ① 타임라인 부분 해제 범위 준수 ② PromQL 표현식 무변경 ③ LLM 화면 회귀 0 ④ 요약행=표시 집합 ⑤ 계층 규칙 + 팬/줌/필터/선택 상호작용·폴링 경합

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| CDX-X4-01 | blocking | web/tests/xviewRender.test.tsx:329 | 신규 테스트의 불필요 타입 단언으로 `npm run lint` 실패 |
| CDX-X4-02 | major | XViewPanel.tsx:59 | 선택 중 줌·팬 시 onClose→재렌더의 selKey 효과가 방금 만든 수동 뷰를 초기화 |
| CDX-X4-03 | major | GpuDashboard.tsx:129 | 타임라인 팬이 브러시 선택을 남겨 타임라인·X-View가 다른 시간대 표시 |
| CDX-X4-04 | major | XViewPanel.tsx:101 | 줌 폭으로 우측 끝 도달 시 절대 시각 저장 → 5s 폴링 미추적 |
| CDX-X4-05 | major | XViewPanel.tsx:63 | 시간 범위 변경 시 이전 줌 창이 새 3× 조회 밖에 잔존 |
| CDX-X4-06 | major | PanScrollbar.tsx:53 | boolean 프로그램적 플래그가 경합 사용자 스크롤을 무조건 삼킴 |

**총평 (원문)**: 미해결 blocking 1건·major 5건 — 종료 게이트 미통과. PromQL 정의와 lib/timeline.ts diff 0, 소스 lint·typecheck 통과. (Vitest는 read-only 샌드박스 EPERM으로 리뷰어 재실행 불가 — Implementor 실행 증거로 갈음.)
