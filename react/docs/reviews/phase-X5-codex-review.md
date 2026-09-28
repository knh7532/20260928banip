# Phase X5 구현 — codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: 커밋 `188fa0f`(X5 — 드래그·초기화·범례 토글·고정 강조) + `ce4504d`(X5-b — 드래그=구간 쿼리 목록, 인간 정정) 반영 워킹트리
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=low`(파일 한정 경량 — X4에서 확립한 운용: medium+광역은 타임아웃), sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-14 (KST 오전)
- **검사 불변식**: ① 드래그(목록)·클릭(고정)·휠(줌)·팬·타임라인 브러시 상호작용 공존 ② 5s 폴링 경합 ③ 요약행=표시 집합 ④ PromQL·계약 무변경 ⑤ ADR R-0002(Recharts 미도입 — 참고 jsx는 기능만 채택)

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| CDX-X5-01 | major | XViewChart.tsx:161,226-228 · tests/xviewRender.test.tsx:495-512 | 성공한 드래그가 `wasDragRef=true`를 남김 — 후속 click 대상이 보통 점이 아닌 SVG라 `pin()`이 안 돌아 플래그가 잔존, 모달을 닫은 뒤 사용자의 **첫 정상 점 클릭이 무조건 삼켜진다**. 테스트도 이 오동작을 기대값으로 고정 |
| CDX-X5-02 | major | XViewChart.tsx:106-119,187-230,280 | `dragStart`/`dragZone`이 redraw effect **지역 변수** — 드래그 도중 5s 폴링으로 `events`가 갱신되면 SVG 전체가 재생성되며 드래그 상태 소실, 이후 mouseup은 `dragStart===null`로 종료돼 구간 쿼리 목록이 안 열린다. 폴링 중 드래그 회귀 테스트도 부재 |

**총평 (원문)**: 미해결 blocking/major: **2건** (blocking 0, major 2).
