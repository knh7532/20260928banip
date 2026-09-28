# Phase 5 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, codex-cli 0.144.1, `codex exec` read-only)
- 검토 시각: 2026-07-15
- 대상: exporter 동적화(`sim_params`/`simulation`/`query_sim`/`gpu_sim`/`metrics`/`main`, 테스트 5종), `docs/architecture/db-schema.md`·`system.md`, `grafana/gen_dashboard.py`·`check_dashboard.py`
- 기준: ① 시뮬레이터 논리 결함 ② 계약 v1.2(Counter) 전환의 함정 ③ Grafana 쿼리 보정의 정확성 ④ 테스트가 불변식을 실제로 강제하는지 ⑤ 문서-코드 대사

## 결과 요약: 16건 — Blocking 2 / Major 7 / Minor 7

| ID | Severity | 위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-P5-01 | **Blocking** | gen_dashboard.py (상세 C) | 신원 재사용 후 `last_over_time` 우변에 같은 `stmt_id`의 과거 라벨셋이 여럿 남아 조인이 **many-to-many 오류**를 낸다 |
| CDX-P5-02 | **Blocking** | docs/plan.md | Phase 5가 여전히 Deferred이고 인간 승인·수락 기준·TV-C1 v1.2 변경 기록이 없어 닫힌 phase 게이트를 충족하지 않는다 |
| CDX-P5-03 | Major | query_sim.py | 도착을 유휴 슬롯에서만 생성해 정상 경로에서 **큐(In Queue)가 발생하지 않으며** 출발 서버 성격도 보존되지 않는다 |
| CDX-P5-04 | Major | query_sim.py | 재사용 `stmt_id`가 매번 다른 node·gpu·user와 결합해 **TSDB 누적 라벨셋이 문서 상한(5×32)을 초과**해 계속 증가한다 |
| CDX-P5-05 | Major | query_sim.py | Counter 자식이 첫 종료 시 값 1로 처음 생성되어 **0 기준 샘플이 없고** 첫 완료를 `increase()`가 복원하지 못한다 |
| CDX-P5-06 | Major | gen_dashboard.py (상세 F) | 제거된 시계열의 과거 샘플이 `last_over_time`/range 모드에서 살아나 **구간 중 실행됐던 ID를 계속 표시**한다 |
| CDX-P5-07 | Major | gen_dashboard.py (상세 E/G) | `max by(gpu)`가 서로 다른 서버의 같은 GPU 번호를 **한 시리즈로 병합**한다 |
| CDX-P5-08 | Major | gen_dashboard.py (링크) | 30~180초 세그먼트를 클릭해도 **10분 창**을 열어 이웃 쿼리를 상세에 보여줄 수 있다 |
| CDX-P5-09 | Major | docs/architecture/system.md | 필수 아키텍처 문서가 **삭제된 `static_data.py`와 정적 흐름**을 현재 구조로 기술한다 |
| CDX-P5-10 | Minor | metrics.py | Counter가 계약에 없는 **`*_created` 시계열**을 함께 노출한다 |
| CDX-P5-11 | Minor | tests/test_contract.py | 타입 대사가 수기 상수와 전역 문자열 존재만 검사 — **행별 파싱 양방향 대사가 아니다** |
| CDX-P5-12 | Minor | tests/test_gpu_sim.py | 부하 결합 테스트가 **util만** 비교해 memory·temp·power 회귀를 허용한다 |
| CDX-P5-13 | Minor | simulation.py | `mu=log(75)`는 평균이 아니라 **중앙값**을 75초로 만든다(절단 후 평균 ≈82초) |
| CDX-P5-14 | Minor | db-schema.md §3 | rows/s를 "카디널리티 상한 6"으로 기술하지만 GPU 이동으로 **TSDB 누적은 최대 72**다 |
| CDX-P5-15 | Minor | db-schema.md | 마이그레이션 절이 "스키마·대시보드 불변"이라 명시해 **Gauge→Counter 전환과 충돌**한다 |
| CDX-P5-16 | Minor | main.py | scrape가 여러 metric family를 읽는 동안 tick이 remove/set을 수행해 **한 scrape가 반쪽 상태**를 볼 수 있다 |
