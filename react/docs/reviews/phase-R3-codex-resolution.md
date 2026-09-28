# Phase R3 codex 리뷰 처리 기록 (Resolution)

전 14건 **Accepted → Fixed**. Rejected 없음. Blocking 1건은 "계약상 미발생이나 조용한 삼킴 방지"로 부분 재해석해 방어 코드로 처리.

| ID | 처리 | 증거 |
| --- | --- | --- |
| CDX-R3-01 | Fixed | TV-C1이 `stmt_id`(슬롯 고정, 누적 36)·`query_name`(rows 라벨셋 항상 1개) 유일성을 **보장**함을 db-schema로 확인. 값 메트릭이 `stmt_id`만 캐리어라 복합키 조인은 설계상 불가 → `indexBy`가 **중복 키를 첫 시리즈 유지 + `console.warn`**으로 드러냄(조용한 덮어쓰기 제거). 충돌 탐침 테스트 CAUGHT |
| CDX-R3-02 | Fixed | `cmpNumDesc(a,b)` — 유한/비유한 분리 total order(반대칭·전이성). 2차 키(`stmt_id`/`query_name`)로 안정 tie-break. NaN-최하위·입력순서-무관 테스트 추가 |
| CDX-R3-03 | Fixed | `MultiSelect`를 체크박스 드롭다운(`<details>`+`role=group`)으로 교체 — 다중 체크·`gpu=0,2` URL 왕복 복원. 2개 선택·URL 복원 테스트 |
| CDX-R3-04 | Fixed | 테이블 key를 `node/gpu/stmtId`·`node/gpu/queryName` 복합키로 |
| CDX-R3-05 | Fixed | instance 변경 시 `setGpus([])`로 선(先)비우기 + `signal.aborted` 가드로 최신 세대만 반영. 늦게 온 stale 응답 무시 **경합 테스트**(수동 resolver, 타이머 없음) |
| CDX-R3-06 | Fixed | `Intl.DateTimeFormat({timeZone:"Asia/Seoul", hourCycle:"h23"})`로 실제 KST 계산. `formatDateKST` 추가, Header가 사용. 자정·날짜경계 테스트 |
| CDX-R3-07 | Fixed | `toValidDate()`가 비유한·Invalid Date를 `"-"`로. `formatClock(Number.MAX_VALUE)="-"` 테스트 |
| CDX-R3-08 | Fixed | `formatRowsPerSec` 비유한 → 단위 없는 `"-"`; `formatCompact` 음수는 절댓값 축약+부호 |
| CDX-R3-09 | Fixed | Panel 제목 `<h2 id>` + section `aria-labelledby` → heading(level 2)·region 탐색 가능. role 기반 테스트 |
| CDX-R3-10 | Fixed | 도움말을 포커스 가능 `<button aria-expanded>` + 클릭 시 `role="tooltip"` 팝오버, `aria-describedby` 연결, Escape·바깥클릭 닫기 |
| CDX-R3-11 | Fixed | `colSpan=7` 빈 상태 행("표시할 쿼리가 없습니다") — RunningQueries와 일관 |
| CDX-R3-12 | Fixed | dashboardData·join 테스트에 충돌(첫 시리즈 유지+경고)·NaN 최하위·입력순서 뒤집기·`cmpNumDesc` 전이성 추가 |
| CDX-R3-13 | Fixed | app 테스트에 GPU 2개 선택·URL 복원·instance 변경 시 GPU 초기화·stale 경합 검증 |
| CDX-R3-14 | Fixed | app 통합 테스트가 **서버별 상이한 total/busy**(01:2/4, 02:1/4, 03:0→중단)로 Sidebar 산출 검증 |

## 확인 리뷰(re-review) — 잔여 Minor 3건 추가 처리

1차 확인: 11개 런타임 지적 **해소**, 잔여 3 Minor(부분해소).

| 잔여 | 처리 | 증거 |
| --- | --- | --- |
| Panel 도움말 "활성화 동작 없음" | Fixed | 위 CDX-R3-10을 실제 팝오버(useState+useId, Escape/바깥클릭)로 구현 — 열림/닫힘·`aria-describedby`·바깥클릭 테스트 |
| app 경합 미검증 | Fixed | 수동 resolver로 응답 순서를 뒤집어 stale(`["9"]`) 무시 검증 |
| format 테스트가 KST 런타임서 회귀 미검출 | Fixed | `vite.config` `test.env.TZ="UTC"` 고정 + "런타임 TZ=UTC" 전제 검증 테스트(로컬-시간 회귀 시 실패) |

## 최종 게이트 증거

```
eslint 0 · tsc(app+node) 0
vitest 121 passed (+9 라이브 skip) · 커버리지 98.78% (분기 92.26%, perFile 게이트 통과)
build 성공(계약 테스트 26 통과 경유) · dist 산출 (js 161KB / css 6.7KB)
탐침 CAUGHT: 조인 키 충돌(첫 시리즈 유지+warn) / NaN 정렬 최하위 / stale GPU 옵션 무시 / KST 로컬-시간 회귀
```

**Blocking 잔존 없음** — R3 종료.
