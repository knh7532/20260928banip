# Phase R4 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, `codex exec` read-only)
- 검토 시각: 2026-07-16
- 대상: `src/lib/{series,timeline,c3config,colors,chartMeta}.ts`, `src/hooks/{useCharts,useRangeDetail}.ts`, `src/components/charts/*`, `src/components/detail/RangeDetail.tsx`, `src/api/queries.ts`(databases 추가), `src/App.tsx`, 테스트 8종
- 기준: ① range→C3 변환 ② 타임라인 세그먼트화·D3 상호작용 ③ C3 수명주기 ④ rangeDetail 의미 ⑤ 폴링·경쟁 ⑥ 테스트 견고성

## 결과 요약: 10건 — Blocking 1 / Major 5 / Minor 4

| ID | Severity | 위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-R4-01 | **Blocking** | useCharts/series | 라인 ID를 `gpu`만으로 — All 필터에서 여러 노드의 같은 GPU 번호가 한 컬럼으로 뭉쳐 C3가 뒤 컬럼으로 덮어써 8/12 라인 유실 |
| CDX-R4-02 | Minor | timeline.ts | 마지막 세그먼트 끝(`last+step`)이 domainEnd를 넘어 막대가 밖으로 돌출 |
| CDX-R4-03 | Major | useRangeDetail | `gpuState.length`가 Idle(값 0) 시리즈까지 세 12개 고정 표시 |
| CDX-R4-04 | Major | queries.ts | P95가 필터·활동 무시하고 카탈로그 6종 전부 평균 |
| CDX-R4-05 | Major | queries.ts | databases가 Idle 0값 시리즈까지 수집해 관여 안 한 DB도 표시 |
| CDX-R4-06 | Minor | useRangeDetail | 선택 없을 때 요청마다 now가 달라 상태·신원·메모리가 다른 순간에서 평가·표시 |
| CDX-R4-07 | Minor | useCharts | range API는 endMs를 초로 내리는데 domain은 ms — 최대 999ms 어긋남 |
| CDX-R4-08 | Major | tests/series | 다중 노드 같은 GPU 덮어쓰기를 검출 못함(고유 gpu fixture만) |
| CDX-R4-09 | Major | tests/timelineRender | 사용자 브러시 end 미검증 — `.on("end")` 삭제해도 통과 |
| CDX-R4-10 | Minor | tests/charts | 인스턴스별 destroy 균형 미검증(공유 스텁), Gauge cleanup 테스트 없음 |

## 재확인(re-review) 잔여 Minor 2건 — 추가 처리
- Timeline 세그먼트: `startMs===domainEnd`인 막대가 min-1px 강제로 1px 돌출 → 양끝 clamp + 우측 경계 당김.
- charts 테스트: 다중 인스턴스 동시 언마운트 격리 미검증 → 2개 동시 렌더 후 각 destroy 1회 검증.
