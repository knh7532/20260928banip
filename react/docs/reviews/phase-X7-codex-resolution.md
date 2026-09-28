# Phase X7 codex 지적 처리 (Adjudication)

리뷰: `phase-X7-codex-review.md` (X7-01 major · X7-02 major → 재확인 1회차 수렴)

| ID | 판정 | 처리 |
|---|---|---|
| X7-01 | **Accepted → Fixed** | ① `useRangeSeries`: spec 키 변경 시 **렌더 중 `setData(EMPTY)`**(파생 상태 재설정 관용구)로 이전 지표 데이터를 즉시 비움 → MetricChart가 빈 상태를 거쳐 새 응답으로 **fresh generate**(축 단위·상한·그룹 재확정). 이전 요청은 usePolling cleanup이 abort. ② `DrilldownChart`: stacked면 MetricChart에 `key=stack|{yMax}|{라벨 join}` — 폴링으로 합이 깔끔수 경계를 넘거나 노드 멤버십이 바뀌면 리마운트로 재생성(yMax는 양자화 값이라 드묾). 비-stacked는 `key="line"` 고정(무변화). 테스트: "지표 전환 fresh generate"(CPU 생성 후 Disk 클릭 → 마지막 generate `axis.y.max=7e9`·groups 단언 — 옛 110이 남으면 실패) |
| X7-02 | **Accepted → Fixed** | x축을 **그릴 시리즈 전체의 타임스탬프 합집합·오름차순**으로 교체 — splitBy는 `results[i]` 전부, 비-split은 첫 시리즈만 합집합에 기여(안 그리는 시리즈의 시점으로 구멍을 만들지 않음). 결측 시점은 기존 byTime null 채움이 처리. 테스트: 스택 fixture를 노드별 어긋난 시점으로 교체 — x=합집합 3점, 결측 컬럼 `[..., null, 21, 30]`/`[..., 30, null, 32]` 단언 |

## 처리 후 게이트 재실행 (최종)

- web: lint 0 · typecheck 0 · vitest **694 passed** · build(계약 테스트 포함) green · 파일별 커버리지 미달 17건 = 기존 기준선(19건)의 **부분집합**(신규 0 — MainDashboard statements·DrilldownChart functions는 개선으로 이탈)
- exporter: 무변경 — ruff 0 · mypy 0 · pytest 119 passed · cov 99.22%
- verify-native ALL CHECKS PASSED(재기동 스택) · dist 재빌드·재배포

재확인 1회차: 신규 0 · blocking 0 · major 0 — 수렴 (`phase-X7-codex-review.md` 하단).
