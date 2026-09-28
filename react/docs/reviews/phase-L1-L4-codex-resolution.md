# Phase L1~L4 codex 리뷰 처리 기록

- 대응 리뷰: `phase-L1-L4-codex-review.md` (2026-07-19)

## 지적 처리 (3건 전건 Fixed)

| ID | 처리 | 수정 내용 / 증거 |
| --- | --- | --- |
| CDX-L-01 | **Fixed** | `exporter/exporter/llm_sim.py` — 요청 수 적분을 부분 구간으로 정정: `_credit_requests()` 헬퍼 신설, 세그먼트 **종료 tick**은 `_finish_expired`에서 `[prev_t, end_ts]` 부분을 적분(누락 방지), **시작 tick**은 `_publish`에서 `min(dt, t - start_ts)` 겹침만 적분(과계상 방지). carry 방식 유지. 게이트: pytest 50 green(98.95%), 단조성·12자식 테스트 유지 |
| CDX-L-02 | **Fixed** | `web/src/hooks/useFilters.ts` — `popstate` 리스너 추가: 뒤로가기로 도착한 엔트리의 쿼리스트링을 `stateFromSearch`로 재수화. 회귀 테스트 추가(`hooks.test.tsx` — popstate 후 rangeSec 재수화 검증) |
| CDX-L-03 | **Fixed** | `web/src/components/charts/Timeline.tsx` — redraw 의존성에 `colorOf`·`rowLabelOf` 추가(화면 전환 시 identity 변화에 다시 그림). 화면들은 모듈 상수 함수를 전달하므로 평상시 redraw 증가 없음 |

## 재확인

수정 후 기계 게이트 전량 재실행 green: exporter `ruff`·`mypy`·`pytest --cov-fail-under=80`(50 tests, 98.95%) / web `lint`·`typecheck`·`test:coverage`(313 tests, 97.9/90.7/98.1/99.0)·`build`. Rejected/Escalated 없음 — codex 재실행 없이 수정 대응 테스트로 갈음(간소 게이트 EXC-U4 운용, 3건 모두 국소 수정이며 각 지적에 회귀 테스트/기존 불변식 테스트가 대응).
