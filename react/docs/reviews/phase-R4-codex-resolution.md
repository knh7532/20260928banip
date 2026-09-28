# Phase R4 codex 리뷰 처리 기록 (Resolution)

전 10건 **Accepted → Fixed**. 확인 리뷰 잔여 2 Minor도 Fixed. Rejected 없음.

| ID | 처리 | 증거 |
| --- | --- | --- |
| CDX-R4-01 | Fixed | `toTimeSeries(series, SeriesKey{id,label,colorKey})`로 재설계 — id/label은 `(node,gpu)` 복합키(유일), colorKey는 gpu 번호(색 공유). `useCharts.GPU_KEY`(id=`node/gpu`·label=`S01·GPU0`), `lineLoadData`는 colorKey로 색. **다중 노드 라인 유지 테스트**로 컬럼 ID 유일성 검증 |
| CDX-R4-02 | Fixed | Timeline 렌더에서 세그먼트 양끝을 `[left,right]=px(domain)`으로 clamp, `b<=a`면 미렌더, 최소 1px는 우측 경계에서 당겨 돌출 제거 |
| CDX-R4-03 | Fixed | `gpuState = max by(node,gpu)(sqm_gpu_timeline_state{s}) > 0` — 끝 시각 활성 GPU만. instant 유지(계약 규칙) |
| CDX-R4-04 | Fixed | `p95 = avg(avg_over_time(p95{env}[win]) and on(query_name) (max by(query_name)(rows{s}) > 0))` — 활동 쿼리만 창평균 |
| CDX-R4-05 | Fixed | `databases = max by(database)(sqm_query_rows_per_second{s}) > 0` — 활동 DB만 |
| CDX-R4-06 | Fixed | tick 시작 시 `evalMs`를 한 번 정해 7개 instant 요청·표시 start/end 공통 사용 |
| CDX-R4-07 | Fixed | `endMs = floor(Date.now()/1000)*1000` — 쿼리 구간과 domain을 초 경계로 일치 |
| CDX-R4-08 | Fixed | `series.test`에 같은 gpu·다른 node fixture 추가 — 라인 2개 유지·라벨 유일·colorKey 공유 검증 |
| CDX-R4-09 | Fixed | 브러시 end 매핑을 순수 `brushRange(selection,invert,ds,de)`로 분리해 `timeline.test`에서 검증. `.on("end")`가 이를 호출 + `sourceEvent` 가드(프로그램적 이동 무시=루프 방지)는 selection-prop 테스트로 커버. (d3-brush 드래그 자체는 jsdom 재현 불가 → HCI) |
| CDX-R4-10 | Fixed | c3 목이 generate마다 **새 스텁** 반환. MetricChart·Gauge 각 언마운트 destroy 1회 + **2개 동시 렌더 후 각각 1회** destroy 검증 |

## 계약·설계 판단

- rangeDetail 활성 필터를 `> 0` **끝 시각 instant**로 한 것은 계약의 "상태·신원=instant(구간 함수 금지)" 규칙과 화이트리스트(`max_over_time` 미허용)를 지키기 위함이다. `serverStatus.gpuBusy`가 이미 쓰는 방식(`count(... > 0)`)과 동일하다. **절충**: 구간 중간에 끝난 쿼리는 미포함 — 확인 리뷰가 "합리적 절충, 계약과 상충 없음"으로 판정. (fidelity 한계는 회고 HCI)
- P95 `and on(query_name)` 조인: 우변이 `max by(query_name)`으로 query_name당 1 시리즈라 다대일 매칭이 정확. `> 0`은 `bool` 없이 필터로 동작(확인 리뷰가 Prometheus 문서로 확인).

## 최종 게이트 증거

```
eslint 0 · tsc(app+node) 0
vitest 168 passed (+9 라이브 skip) · 커버리지 99.43% (분기 90.56%, perFile 통과)
build 성공(계약 26 통과 경유) · dist js 636KB(gzip 192KB, C3+D3) / css 11.7KB
탐침: 다중노드 라인 유일 / NaN·null 채움 / 세그먼트 병합·Idle 제외 / brushRange 매핑 / 인스턴스별 destroy
```

**확인 리뷰 결과: 해소 8 / 부분해소 2 → 잔여 2 Minor까지 Fixed. Blocking·Major·회귀 없음** — R4 종료.
