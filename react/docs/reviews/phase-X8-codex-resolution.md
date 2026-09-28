# Phase X8 codex 지적 처리 (Adjudication)

리뷰: `phase-X8-codex-review.md` (1차 major 3·minor 3 → 재확인 1회차 수렴, 신규 minor 1 즉시 정정)

| ID | 판정 | 처리 |
|---|---|---|
| X8-01 | **Accepted → Fixed** | `phaseCounts.preparing`을 compileSec·initializingSec **명시 집계**로 교체 — 합성 In Queue 단계 행은 어느 카드에도 미포함(대기 카드는 배정 전 메트릭 축 — 이중계상 방지 주석) |
| X8-02 | **Accepted → Fixed** | `queuedCount` 앵커를 `or vector(0)` → `or (0 * count(sqm_worker_up{node=~...}))` — 상시 존재(워커 24종) 인벤토리 계열. exporter 부재 → 양쪽 빈 결과 → `firstScalar([])`=NaN("-"), 큐만 빔 → 0. sqm_worker_up 라벨(node/worker/service) 중 node 매처만 사용 — 계약 합법(재확인 회차 검증) |
| X8-03 | **Accepted → Fixed** | `.sqm-toast` z-index 50→70(+주석) — 모달 백드롭(60)·ActionDialog 위. 드릴다운의 기존 동일 문제(모달 열린 채 복사·Kill 실패 토스트 가려짐)도 함께 해소 |
| X8-04 | **Accepted → Fixed** | usePolling deps에서 함수 제거 → `Boolean(pollLive)`(켜짐/꺼짐 전환만 재예약 트리거). 콜백 최신화는 usePolling의 매 렌더 `fnRef.current` 갱신이 보장(주석 명기) |
| X8-05 | **Accepted → Fixed** | planSteps.test 보강 — 명시 NaN 동등성·예산 정확 경계(elapsed==leaf 예산 → leaf done·다음 running 0s)·다중 시드 불변식 175조합(5 id×7 qid×5 elapsed: 소요 합==elapsed·running 정확 1개·done/pending 순서 — root 병목 시드 포함 성립) |
| X8-06 | **Accepted → Fixed** | plan.md 테스트 수치 정정(신규 28 → 순증, 최종 714 반영) |
| X8-N01 (재확인 신규, minor) | **Accepted → Fixed** | plan.md a)의 `or vector(0)` 잔재 서술을 인벤토리 앵커로 정정 + 게이트 총계 714로 갱신 |

## 처리 후 게이트 재실행 (최종)

- web: lint 0 · typecheck 0 · vitest **714 passed** · build(계약 75 포함) green · 파일별 커버리지 미달 17건 = 기존 기준선 부분집합(신규 파일 전부 충족) · 재빌드 배포
- exporter: 무변경(119 passed 유지)
- 시각 실측: 탑뷰 행 클릭→플랜 탭 기본·구조화 표(LOA 계열 4단계)·라이브 증가(25.0s→45.1s)·자연 종료 시 배너+Kill 잠금·요약 카드 3장·리스트 336px — 배포 스택에서 확인

재확인 1회차: X8-01~06 전부 resolved · 신규 blocking/major 0 · minor 1(X8-N01) 즉시 정정 — 수렴.
