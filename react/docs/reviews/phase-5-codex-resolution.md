# Phase 5 codex 리뷰 처리 기록 (Resolution)

전 16건 **Accepted → Fixed**. Rejected/Escalated 없음.

| ID | 처리 | 수정 내용 (증거) |
| --- | --- | --- |
| CDX-P5-01 | Fixed | 상세 C를 현재 시점 selector로 교체 — `sum(sqm_statement_memory_bytes * on(stmt_id) group_left() sqm_statement_running{F})`. 실측: 1개 시리즈 정상(오류 없음, 이전엔 many-to-many) |
| CDX-P5-02 | Fixed | `docs/plan.md`에 **Phase 5 절**(목표·인간 확정사항·작업·수락 기준 5개) 신설, **DEF-1 해제(2026-07-15)**, 계약 표에 **v1.2** 행, §7 인간 승인 기록 추가. `docs/adr/0008-dynamic-simulation.md` 신규 |
| CDX-P5-03 | Fixed | 도착을 **노드별 포아송 과정**(슬롯 무관)으로 재설계 — `arrival_mean_s` 22/35/60초(이용률 0.85/0.54/0.31), 노드 큐(상한 4, 초과분 드롭). 테스트 `test_queue_actually_occurs_on_busy_node`로 **In Queue 실제 발생** 검증 |
| CDX-P5-04 | Fixed | 신원을 **슬롯(GPU)에 고정된 3종**으로 결정론 배정(`slot_identities()`) — `stmt_id`가 GPU를 떠돌지 않아 누적 라벨셋 **12×3=36 상한**. 테스트 `test_cumulative_labelsets_bounded`(1시간 시뮬레이션, 슬롯 이동 0건, 누적 ≤36) |
| CDX-P5-05 | Fixed | `QuerySimulator.__init__`에서 **Counter 12자식을 `inc(0)`으로 사전 생성**. 테스트 `test_executions_counter_children_preinitialized` |
| CDX-P5-06 | Fixed | 상세 F를 `max by(query_id) (sqm_statement_running{F})`로 바꾸고, **상세 패널 전 타깃을 instant**로 전환(range 모드면 끝난 쿼리가 lastNotNull로 되살아남). 검증기가 instant 플래그를 검사 |
| CDX-P5-07 | Fixed | 상세 E/G를 **`by(node, gpu)`** 로, G displayName에 `node`·`gpu` 보간 |
| CDX-P5-08 | Fixed | 타임라인 데이터 링크 `time.window` 600000 → **120000**(2분, 세그먼트 30~180초 대응) |
| CDX-P5-09 | Fixed | `system.md`의 정적 서술 제거 — 동적 데이터 흐름(조정자·1초 tick·부하 결합·LockedRegistry) + mermaid 추가 |
| CDX-P5-10 | Fixed | `metrics.py`에서 **`disable_created_metrics()`**. 테스트 `test_no_created_series_exposed` |
| CDX-P5-11 | Fixed | `db-schema.md`에 **메트릭 타입 표**(15행) 신설, `test_contract._doc_types()`가 행별 파싱해 **문서 ↔ CONTRACT ↔ 실제 노출 타입** 3자 대사 |
| CDX-P5-12 | Fixed | `test_query_load_raises_all_four_metrics` — util·memory·temp·power **4지표 모두** 상승 검증 |
| CDX-P5-13 | Fixed | `DURATION_MEAN_S` → **`DURATION_MEDIAN_S`**, `sample_duration(median_s)`, 문서도 "중앙값 75초"로 정정 |
| CDX-P5-14 | Fixed | `db-schema.md` §3 — "동시 노출 6개 / **TSDB 누적 최대 72개**" 구분 명기(헤더 문구도 정정) |
| CDX-P5-15 | Fixed | 마이그레이션 절 재작성 — v1.0/v1.1/**v1.2** 이력과 Counter 전환 시 소비자 영향(리셋·전환 구간) 기술 |
| CDX-P5-16 | Fixed | **`metrics.LOCK` + `LockedRegistry.collect()`** — tick과 scrape를 같은 락으로 직렬화. db-schema §5.5-7에 명기 |

## 수정 후 게이트 증거

```
ruff: All checks passed!      mypy: no issues (14 files)
pytest: 41 passed             coverage: 98.6% (fail-under 80)
gen_dashboard.py → 12 panels  check_dashboard.py → OK (계약 메트릭 15종 대사)
실스택 실측:
  상세 C (메모리 조인): 1개 시리즈 정상 (many-to-many 해소)
  상세 E/G: 12개 시리즈 (node·gpu 분리)   상세 F: 6개   상세 D(increase 10m): 38.2건
  쿼리 상태: In Process / Initializing 혼재, In Queue 관측됨
  10분간 타임라인 전이 60회 (세그먼트 생성)
```

## 확인 리뷰 (re-review)

- 리뷰어: gpt-5.6-sol (codex exec, read-only), 2026-07-15
- 1차 판정: **14/16 Resolved**, 잔여 2건 — CDX-P5-06(상세 타깃에 instant 미지정), CDX-P5-14(§3 헤더의 "상한 6" 문구가 새 설명과 모순). **"Blocking 잔존 여부: 없음"**
- 추가 수정: ① 상세 패널 7개 타깃 전부 `instant: true`(+ 검증기가 이를 강제) ② §3 헤더 문구를 "동시 노출 6 / 누적 최대 72"로 정정
- 최종 게이트: ruff/mypy 0, pytest 41 passed, check_dashboard 통과 — **Blocking 잔존 없음**, Phase 5 종료
