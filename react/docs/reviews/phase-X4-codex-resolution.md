# Phase X4 구현 — codex 리뷰 처리 기록 (AGENTS §6.2-4)

대응 리뷰: `phase-X4-codex-review.md` (blocking 1·major 5) — 전건 **Fixed** (커밋 `7efa432`)

| ID | 처리 | 반영 / 회귀 테스트 |
| --- | --- | --- |
| CDX-X4-01 | Fixed | 테스트 불필요 단언 6건 제거(eslint --fix) — lint 0 |
| CDX-X4-02 | Fixed | 자기 유발 선택 해제는 `skipSelReset` ref로 selKey 리셋 효과를 1회 건너뜀 — controlled 부모 재렌더 테스트 추가 |
| CDX-X4-03 | Fixed | 타임라인 팬 onPan에서 `clearSelection()` — 화면 레벨 테스트 `gpuPan.test.tsx` 신설 |
| CDX-X4-04 | Fixed | 수동 뷰를 `{widthMs, anchorEndMs\|null}`로 분리 — 추적(null)이면 매 폴링 최신 끝을 같은 폭으로 따라감. 폴링 전진 재렌더 테스트 |
| CDX-X4-05 | Fixed | `baseWindowMs` 변경 시 수동 뷰 리셋(폴링 갱신과 구분) + 파생 시 panLimit 재클램프 — 범위 축소 테스트 |
| CDX-X4-06 | Fixed | `pendingTarget`(목표 scrollLeft) 대조 — 값이 일치하는 이벤트만 프로그램적으로 무시. 경합 테스트 추가 |

- 수정 후 게이트: lint 0 · typecheck 0 · **전체 636 passed** · build 성공
- **수정 후 재확인 (AGENTS §6.2-4, codex 독립 세션)**: CDX-X4-01~06 **전건 resolved** (각 근거 파일:라인 확인 — lint 실측 0, skipSelReset, clearSelection, widthMs/anchorEndMs 분리, baseWindowMs 리셋, 목표 위치 대조) / **미해결 blocking·major: 0건**
- Rejected / Escalated: 없음
