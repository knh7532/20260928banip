# Phase R4 회고 — 차트 (C3 시계열/게이지 + D3 타임라인)

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 코드·증거 |
| --- | --- |
| range 결과 → C3 데이터 변환(누락·정렬·색 매핑) | `src/lib/series.ts`(합집합 x·null 채움·복합키 유일·색 공유) + `c3config.ts`. `tests/series.test.ts`·`c3config.test.ts` |
| 타임라인 세그먼트화(연속 병합·경계·Idle 제외) | `src/lib/timeline.ts`(`segmentTimeline`·`brushRange`). `tests/timeline.test.ts` |
| 브러시=시간범위, 막대/라벨 클릭=GPU 필터 | `Timeline.tsx` D3 간트(brush `sourceEvent` 가드·복합 clamp). `tests/timelineRender.test.tsx` |
| 폴링 갱신 시 **재생성 없이 load** | `MetricChart`/`Gauge`(generate 1회·load·unload·destroy). `tests/charts.test.tsx` |
| 커버리지 게이트 / 시각 충실도는 HCI | 99.43%(분기 90.56%), perFile 통과 |

## 잘된 점

- **차트 로직을 순수 함수로 떼어 계약처럼 테스트**했다: matrix→라인(`toTimeSeries`), 세그먼트화(`segmentTimeline`), 브러시 매핑(`brushRange`), C3 설정(`c3config`)을 c3/d3 렌더와 분리해 결정적으로 검증했다. C3는 목, D3 간트는 jsdom 실렌더로 rect·클릭까지 확인했다.
- **C3 색 상수를 tokens와 대사**(`chartColors.contract.test`)해 팔레트 드리프트를 막았다. C3가 CSS 변수를 못 받는 제약을 계약 테스트로 메꿨다.
- **폴링 재생성 금지**를 목으로 실증했다 — generate는 마운트 1회, 갱신은 `load`, 사라진 GPU는 `unload`, 언마운트 `destroy`(다중 인스턴스 격리까지).

## 어려웠던 점

- 리뷰가 **다중 노드 라인 덮어쓰기(Blocking)**를 잡았다 — All 필터에서 3개 노드의 같은 GPU 번호가 한 C3 컬럼으로 뭉쳐 8/12 라인이 사라졌다. `gpu` 단일 키를 `(node,gpu)` 복합 id로 바꾸고 색만 gpu로 공유하게 했다(Grafana가 라벨셋으로 라인을 가르는 것과 동치).
- **rangeDetail이 Idle/카탈로그 상시 시리즈를 활동으로 오인**했다(GPU 12 고정·P95 6종 평균·DB 전량). `> 0` 활성 필터로 고쳤는데, 계약의 "상태·신원=instant" 규칙 때문에 `max_over_time`을 못 써 **끝 시각 instant `> 0`** 로 절충했다(구간 중간 종료 쿼리는 미포함).
- **d3-brush 드래그를 jsdom에서 재현 불가**했다(`view`가 Window로 인정 안 됨). 매핑을 `brushRange` 순수 함수로 분리해 검증하고, 실드래그는 HCI로 넘겼다. `sourceEvent` 가드는 프로그램적 `brush.move`가 콜백을 되불러 무한 루프를 만드는 걸 막는다(루프 방지 테스트로 커버).

## 다음 phase(R5)에 반영할 개선점

- 번들이 636KB(gzip 192KB) — C3+D3가 무겁다. 현장은 로컬 서빙이라 네트워크 지연은 없지만, 필요 시 d3 서브모듈만 임포트해 축소 검토(R5 성능 노트).
- `dist/`를 python `http.server`로 서빙(:8082) + Prometheus(:9091) CORS 도달 확인이 R5 verify의 핵심.
- 차트가 실제 브라우저에서 PPTX와 색·레이아웃이 맞는지 육안 대조(HCI) — R5 README에 절차 명시.

## codex 리뷰 지적과 처리 결과

- 1차: 10건 (Blocking 1 / Major 5 / Minor 4) → 전건 Accepted·Fixed.
- 확인 리뷰: 해소 8 / 부분해소 2 → 잔여 2 Minor(세그먼트 1px 돌출·다중 인스턴스 destroy) 추가 수정 → **"Blocking·Major·회귀 없음"**.
- 상세: `docs/reviews/phase-R4-codex-review.md`, `docs/reviews/phase-R4-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-R4-1 | Design | 차트 색·레이아웃이 PPTX와 일치(시계열 GPU색·타임라인 유형색·게이지)하는지 브라우저 육안 대조 | `npm run dev` 또는 dist로 PPTX와 나란히 확인 | 비차단 |
| HCI-R4-2 | Interaction | 브러시 드래그로 구간 선택·막대 클릭 GPU 필터가 실제 브라우저에서 동작(jsdom 미검증분) | 실브라우저 조작 확인 | 비차단 |
| HCI-R4-3 | Scope | rangeDetail 활성 필터는 **끝 시각 instant `> 0`** — 구간 중간에 끝난 쿼리는 GPU/ID/DB 집계에서 빠진다(계약 instant 규칙 준수 위한 절충). "쿼리 수"만 창(increase)이라 전체 실행을 센다 | 이 절충이 현장 해석과 맞는지 확인 | 비차단 |
| HCI-R4-4 | Design | 타임라인 막대 색: 시안과 `Sales_Aggregation`/`Group_By_Region` 색이 서로 바뀌어 보임(계약 query_type 기준 — design-tokens §1.5 DES-1) | 계약 우선 원칙 유지 여부 | 비차단 |
