# Phase X5 구현 — codex 지적 처리 (Adjudication + 재확인)

- **처리자**: Claude Code (claude-fable-5) — 수정 커밋 `7a4716e`
- **재확인**: codex exec — codex-cli 0.147.0, `model_reasoning_effort=low`, sandbox read-only, 독립 세션. 커밋 `7a4716e` diff 기준
- **재확인 시각**: 2026-08-14 (KST 오전)

## 판정·반영

| ID | 판정 | 반영 (커밋 `7a4716e`) | 재확인 |
|---|---|---|---|
| CDX-X5-01 | Accepted | `wasDragRef`·`pin()` 억제 분기 **폐기**. 드래그 종료 시 그 드래그가 만드는 click **1회만** document 캡처 단계에서 삼키고(`{capture, once}` + `stopPropagation`) 다음 태스크에서 무장 해제(`setTimeout 0`) — 이후의 정상 클릭은 건드리지 않는다. 오동작을 고정하던 테스트 기대값을 제거하고 "같은 태스크 click은 삼킴·다음 태스크 클릭은 즉시 고정"으로 재작성 | **Fixed** — "`wasDragRef`와 `pin()` 억제를 제거하고, 드래그 직후 발생하는 동일 태스크의 `click`만 캡처 단계에서 1회 삼킨 뒤 타이머로 해제한다" |
| CDX-X5-02 | Accepted | 드래그 상태를 effect 지역에서 **`dragRef`(컴포넌트 수준)로 승격** — 5s 폴링 redraw에도 상태가 살아남고, 새 effect의 `drawZone()`이 새 SVG에 영역을 복원한다. 추적은 document 레벨 mousemove/mouseup(차트 밖 이탈·해제 보장), 좌표는 플롯 영역 clamp. 회귀 테스트 추가: mousedown → events rerender(redraw) → 영역 복원 확인 → document mouseup → 모달 오픈 | **Fixed** — "드래그 상태를 `dragRef`로 승격하고 document 레벨 이벤트 및 redraw 후 영역 복원 로직을 추가했으며, 해당 회귀 테스트도 포함됐다" |

**재확인 신규 결함**: 없음.

## 자체 발견 보강 (동일 커밋)

- **구간 목록 모달 선택 안정화**: 선택을 배열 인덱스가 아닌 안정 키(`stmtId|endMs`)로 저장 — 모달이 열린 동안 폴링으로 목록이 갱신·재정렬돼도 선택이 같은 쿼리를 따라가고, 항목이 사라지면 인접 위치로 보정한다. ↑↓ 키는 ref 경유로 항상 최신 목록 길이를 본다(stale closure 제거 — `eslint-disable exhaustive-deps` 삭제). 회귀 테스트 2종(키 선택 유지·목록 성장 후 ↑↓).

## 게이트 (수정 후)

lint 0 · typecheck 0 · vitest **646 passed**(스위트 39) · X5 계열 파일 커버리지 파일별 임계 충족(XViewChart 94.3/78.7/97.1/97.8 · XViewListModal 98.3/94.7/95.5/98.0) · build green · 계약 diff 0. 파일별 임계 미달 14종은 pre-existing(HCI-X3-1) 그대로.
