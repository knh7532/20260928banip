# Phase X10 구현 후 codex 리뷰 (AGENTS §6.2-3 종료 게이트 — 계약 v4.8 개정 포함)

- **검토 대상**: X10 워킹트리 미커밋 변경분 — Table Usage 개편(청크 정합 상한 1,048,576·유지보수 기준 실판정·행 틴트) + **계약 TV-C1 v4.8 additive 4종**
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열(gpt-5.6-sol), `model_reasoning_effort=high`(계약 개정 정밀 대조), sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-19 (KST 낮)
- **검토 불변식**: 기존 8종 테이블 메트릭 이름·라벨·타입 불변(additive만) · Timeline·타 화면 무수정 · SnapshotLock cleanupCommand 하위호환 · `_tick_tables` 접근 버스트·last_access 단조(U5-01) 불변
- **비고**: read-only 환경이라 vitest 재실행·시각 캡처는 미수행(정적 검토 + 실 Prometheus 조회·exporter 대상 pytest 22개 실행). 실행 게이트는 Implementor 쪽 결과(exporter 127·web 727) 참조.

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| X10-01 | major | drilldown_sim.py:111 | audit_trail·fraud_events의 충전율 분포가 rows와 물리적으로 양립 불가 — 최소 필요 행 수(cap×(0.9×filled90+0.8×중간))가 설정 rows를 초과. 기존 불변식(`filled90+under80 ≤ chunks`)은 이 모순을 못 잡음 |
| X10-02 | major | cleanupCommands.ts:47 | "Parallel 실행" 선언과 단계 순서 양립 불가 — RECHUNK·EXTENTS·reindex를 평면 SELECT 목록으로 내면 병렬 디스패치 시 Extents/reindex가 Rechunk를 앞지를 수 있음 |
| X10-03 | major | TableUsage.tsx:311 | 행 단위 RECHUNK에 전역 reindexTargets 부착 — "한 테이블만 손보기"가 최대 5개 테이블을 건드리는 명령문 생성 |
| X10-04 | minor | TableUsage.tsx:163 / drilldown.css | 안내 카드와 표 카드 사이 여백 없음(.sqm-card 기본 외부 여백 없음) |

**총평(1차)**: blocking 0 · major 3 · minor 1. 확인된 정합: **계약 4종의 이름·라벨·타입이 문서·CONTRACT·Python 기대값·web MANIFEST 4자 일치, 기존 8종 불변**, Rechunk 4임계 경계 방향·chunks=0 가드 정확, Cleanup=deleted>0·일괄 버튼 판정 기반, Prometheus 신규 4종 8시리즈 실측, git diff --check 통과.

→ 처리: `phase-X10-codex-resolution.md`

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=medium · X10-01~04 처리분 확인(분포 재검산 포함) | **4건 전부 resolved · 신규 지적 없음 — 수렴, 종료 게이트 통과** (상세: resolution 문서) |

## X10-f2 회차 (Cleanup/Rechunk 목업 반영·상태 설명 모달, 2026-08-19)

- **검토 대상**: X10-f2 워킹트리 미커밋 변경분(HEAD=ccd87c0) — exporter 테이블 유지보수 명령 API(§0.1 상태 변경 3호, 인간 승인 "ㅇㅇ 필요해") + TableStatusModal(신규) + 유지보수 열 개편(Cleanup→Rechunk 순서·Idx/n/4 폐기)
- **reviewer**: 동일 구성(codex exec, reasoning=medium, read-only)

| ID | severity | file:line | failure |
|---|---|---|---|
| X10F2-01 | 중간 | TableStatusModal.tsx:29 | "Cleanup 선행 필요" 결론이 `!checks[2].pass`만 봄 — 다른 임계도 실패한 테이블에 "Cleanup 후 Rechunk 대상 가능"이라는 잘못된 약속 |
| X10F2-02 | 중간 | drilldown_sim.py:288 | 반영 전 동일 명령 중복 접수(재현됨) — 상태 변화는 1회인데 HTTP 200·감사 로그·UI 접수 건수는 2회 |

**총평(1차)**: 확인된 정합: 생산 규약(deleted==0⇔nodel==chunks) 유지, LOCK 직렬화, allSettled 부분 실패 요약, pin 비활성, 문서 표현. untracked TableStatusModal.tsx 커밋 포함 지적.

→ 처리: resolution 문서 X10-f2 절.

## X10-f3 회차 (단편화율 표기·유지보수 진행도 — 계약 v4.9, 2026-08-19)

- **검토 대상**: X10-f3 워킹트리 미커밋 변경분(HEAD=38fb84b) — 계약 v4.9(`sqm_table_maintenance_progress_ratio`)·기간형 실행 상태 기계·Progress/진행단계 열·3상태 배지·단편화율 어휘
- **reviewer**: 동일 구성(codex exec, **reasoning=high** — 계약 개정)

| ID | severity | file:line | failure |
|---|---|---|---|
| X10F3-01 | minor | TableUsage.tsx:62 | 상태 모달이 클릭 당시 행 **객체**를 들고 있음 — 폴링이 rows를 갈아끼우므로 열린 모달의 진행도가 고정되고 완료 후에도 "진행 중" 잔존 |
| X10F3-02 | minor | drilldown_sim.py:104 외 3곳 | 비이력 주석에 구 용어 "충전율" 잔존(계획: 비이력 표기 전부 교체) |

**총평(1차)**: blocking/major 0 · minor 2. 확인된 정합: 계약 4자 대조·"실행 중에만 존재" 수명 규약, 상태 기계 단계 경계·전체 진행률·완료 시 효과 적용·시리즈 제거, 대기/실행 중 중복 거부·LOCK 배선.

→ 처리: resolution 문서 X10-f3 절.
