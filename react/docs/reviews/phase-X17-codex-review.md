# Phase X17 codex 리뷰 — X16 수렴 확인 묶음 (2026-08-21)

- reviewer: codex exec / codex-cli (GPT-5 계열, reasoning=high, sandbox read-only, 독립 실행 주체)
- 대상: 워킹트리 전체 diff 패킷(X16 수정분 + X17, 2,153줄) + 저장소 원본 대조.
  X16 1차 리뷰(blocking 3)의 수렴 확인을 묶어 실행 (X15 묶음 선례) — 1차 실행분은
  프롬프트의 셸 치환(`${…}`) 오류로 미실행, 구문 제거 후 재실행.
- 불변식 8종 명시: 타임라인 미접촉·CATALOG 해석, 계약 수치 정합(8종·192·1~8·342/1,368),
  query_type 6종·워커 축 무변경, qid 채번 규칙, 표시 파생 일관성(phase 공유·행 key),
  Statement ID 통일 누락, X16 축 불변, 신규 테스트 결정론·표류 가드 실효성

## 과제 1 — X16 수렴 판정

| ID | 판정 | 근거 |
| --- | --- | --- |
| X16-01 | **NOT-RESOLVED** | `xviewAt < xviewFreshSince` 비교가 **같은 밀리초** 경계에서 이전 세대 성공을 fresh로 통과시킨다. 재현 테스트도 새 세대 응답 보류만 다루고 이전 세대 성공 경쟁은 미재현 |
| X16-02 | RESOLVED | Status 테스트가 4상태 구성·클릭/재클릭의 실제 tbody 순서를 statusOrdinal 기대열과 대사 |
| X16-03 | RESOLVED | Kill 테스트가 카드 5슬롯 `["2","1","1","1","1"]` 일치·Kill 후 무증분 단언 |

## 과제 2 — X17 지적 (2건 — blocking 2)

| ID | 수위 | 위치 | 요지 |
| --- | --- | --- | --- |
| X17-01 | blocking | web/tests/qidService.test.ts (SERIES 표류 가드) | 파서가 3자 **키만** 추출 — exporter에서 코드의 계열이 이동해도(예: DEL을 적재·추출로) 키 집합이 같아 통과. QidPill 계열이 표류한다 |
| X17-02 | blocking | web/tests/queries.contract.test.ts (카탈로그 대사) | **단방향**(CATALOG 항목을 문서에서 찾기)이라 CATALOG에서 idx 7·8을 지워도 통과 — 타임라인 7·8이 "#7/#8 · other"로, X-View 유형도 "other"로 샌다 |

## 판정·반영 (Adjudication)

| ID | 판정 | 반영 |
| --- | --- | --- |
| X16-01(재) | **Accepted** | 판정을 순수 함수 `stoppedCountReady(lastSuccessAt, freshSince)`로 추출하고 **strict `>`** 비교로 전환(statusMeta.ts) — 이전 세대 성공의 stamp **값**은 변경 시각 이하이므로 플러시 순서와 무관하게 경계가 stale로 처리된다. 같은 밀리초의 진짜 새 성공은 한 주기 늦게 반영(안전한 방향 — 다음 폴링 자연 회복). 마운트 세대는 `-Infinity` + 첫 effect skip(첫 성공 무지연). 경계 단위 테스트 5건 신설(같은 ms=false·직후=true·마운트·null) — 이전 세대 경쟁의 본질(경계값 판정)을 결정론으로 잠근다 |
| X17-01 | **Accepted** | `"코드":"한글계열"` 쌍 전체를 파싱, 한글 계열을 read/ingest/modify/ddl/util로 정규화해 `QID_SERIES` 전체 객체와 `toEqual` 대사(14쌍 — 계열 이동도 잡는다) |
| X17-02 | **Accepted** | 문서 §3·§5.4 표 전량 파싱 → 키 정확히 `[1..8]`·CATALOG 양방향 완전 일치·문서 내 두 표 상호 일치·`typeOfQuery(신규 2종)="etl"` 단언으로 재작성 |

반영 후 게이트: web lint 0·tsc 0·vitest **779** green. 수렴 재확인: `phase-X16-codex-resolution.md`·아래 수렴 기록.

## 수렴 재확인 (r2·r3 — reasoning=medium, 독립 세션)

- **r2**: X16-01 RESOLVED(strict `>` 판정 + 경계 테스트 5건이 동일 밀리초 stale 차단) ·
  X17-01 RESOLVED(14쌍 정규화 전체 대사) · X17-02 **NOT-RESOLVED**(두 표를 하나의 Map으로
  합쳐 한 표 전체 누락을 못 잡음 — 절별 파싱 요구).
- X17-02 재반영: `parseCatalog(절 제목)` — 절 존재 단언 + 다음 헤딩까지 슬라이스로
  §3·§5.4를 **독립 파싱**, 각각 `[1..8]` 완전성·표 간 동일성·CATALOG 양방향 일치 단언.
- **r3**: X17-02 RESOLVED — **미해결 blocking 0 (수렴)**. 최종 게이트: web vitest **779** green.
