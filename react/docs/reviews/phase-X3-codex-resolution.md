# Phase X3 구현 — codex 리뷰 처리 기록 (AGENTS §6.2-4)

대응 리뷰: `phase-X3-codex-review.md` (커밋 `a6ee440` 반영 트리, blocking 0·major 1)

| ID | severity | 처리 | 반영 위치 / 근거 |
| --- | --- | --- | --- |
| CDX-X3-01 | major | **Fixed** (커밋 `3bce05b`) | phase 쿼리에 즉시 catch를 붙여 빈 배열로 격리 — 필수 2종(timestamp·duration) 성공 시 tick은 성공이고 `phases=null`로 점이 유지된다. 행동 테스트 추가(`xviewHook.test.tsx` — phase만 장애 시 점 유지·phases=null·failStreak 0) |

- **후속 실측 수정** (커밋 `cfd1f9f`): 캡처 실측에서 커진 툴팁이 패널 overflow에 잘리는 문제 발견 → body 포털(`position:fixed`) + 뷰포트 여백 기준 flip으로 전환. 리뷰 지적 외 시각 결함의 자체 발견·수정이다.
- **후속 기능** (커밋 `d0b54a8`, 인간 지시): 툴팁 클릭 고정/해제.
- **수정 후 재확인 (AGENTS §6.2-4, codex 독립 세션)**: "CDX-X3-01: resolved (useXViewEvents.ts:47 격리 + xviewHook.test.tsx:97 행동 테스트) / 후속 2건(포털·클릭 고정): 지적 없음 — 좌표계 일치·재고정 승계·데이터 갱신 승계·리스너 cleanup·포털 언마운트 확인 / **미해결 blocking·major: 0건**"
- Rejected / Escalated: 없음
