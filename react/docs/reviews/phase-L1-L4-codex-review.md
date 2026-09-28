# Phase L1~L4 codex 통합 리뷰 (EXC-U4 방식 — 간소 게이트, 통합 1회)

- 대상: LLM 화면 기능 커밋 `97dd83d..41c7193` (L0 문서 → L1 계약+시뮬 → L2 Grafana → L3 React → L4 마감)
- 리뷰어: OpenAI Codex (codex-rescue 플러그인 경유, Claude `claude-fable-5`와 상이한 모델·실행 주체)
- 일시: 2026-07-19. 범위: 핵심 결합점 6항목 축소 리뷰(U2~U4 리뷰의 타임아웃 교훈 적용 — 광범위 1차 시도 없이 처음부터 축소 범위로 수행). 잔여 위험은 기계 게이트(양 스택 테스트·계약 3자 대사·드리프트 0·E2E ALL CHECKS PASSED)가 보완한다.

## 판정 (원문 요지)

| ID | 항목 | 판정 | severity |
| --- | --- | --- | --- |
| CDX-L-01 | llm_sim.py 요청 수 적분 — 상태 전이 tick에서 직전 dt 전체를 현재 phase로 적분해 세그먼트 종료 시 부분 구간 누락·재개 시 과계상 (불변식 (a)~(c)는 정상) | **문제** | Major |
| CDX-L-02 | useFilters — 해시 내비게이션이 만든 히스토리를 뒤로가기로 되돌아올 때 변경된 쿼리스트링을 상태로 재수화하지 않아 URL↔상태 불일치 (해시 보존·`#` 잔재 제거는 정상) | **문제** | Major |
| CDX-L-03 | Timeline 파라미터화 — 기본값·콜백 ref는 안전하나 colorOf·rowLabelOf만 바뀌면 redraw 의존성에서 빠져 이전 SVG가 남을 수 있음 | **문제** | Minor |
| (2) | main.py max 부하 결합의 mig 시그니처 정합 | OK | — |
| (5) | web llm 팩토리 6종의 PromQL·라벨 계약 정합, llmRangeDetail instant/창 규칙 | OK | — |
| (6) | gen_llm ↔ check_llm 자기모순 여부, 기존 gen_dashboard 무수정 | OK | — |

**Blocking 잔존 여부 (1차): 있음** → 3건 전건 수정 후 기계 게이트 재통과 (처리 기록 참조).
