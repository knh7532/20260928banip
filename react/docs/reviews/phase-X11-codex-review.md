# Phase X11 구현 후 codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: X11 워킹트리 미커밋 변경분(HEAD=4280a54) — Worker Restart 3단계
  절차(§0.1 해제 4·5호: graceful shutdown·remove_lock), 장애 2-플레이버(crash/hang),
  orphaned lock 시뮬(계약 무변경 — `sqm_lock_held_seconds` 값·수명만), kill의 CLE
  거부, RestartGuideDialog·SnapshotLock orphan UI
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열(gpt-5.6-sol),
  `model_reasoning_effort=medium`(계약 무변경), sandbox read-only
  (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-19 (KST 밤)
- **검토 불변식**: 계약 v4.9 이름·라벨·타입·reason enum 5종 불변 ·
  worker_up 24시리즈 remove 금지 · Timeline 무수정 · X6 세대 토큰 ·
  X10 유지보수 기계 · HTTP 예약→tick 소비·CORS 전 응답
- **비고**: read-only — exporter 대상 pytest 52개 독립 재실행(52 passed),
  X11-01 재현 실측 포함(239초 후 stmt_id 재사용 관찰).

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| X11-01 | blocking | query_sim.py:250 · drilldown_sim.py:646 · SnapshotLock.tsx:170 | orphan 락의 `stmt_id`가 신원 풀로 즉시 반환 — 같은 id가 새 문장에 재배정되면 exporter는 live 락 발행을 억제하고, 웹은 running 조인 성공을 이유로 orphan을 정상 락으로 오판(Remove 숨김), remove_lock API는 반대로 orphan을 우선 발견해 live 문장이 있는데도 수락. 기존 집합 비교 테스트는 동일 키 병합으로 미검출 |
| X11-02 | minor | qidSeries.ts:12 · RestartGuideDialog.tsx:77 | EXP는 롤업상 ingest라 다이얼로그가 "트랜잭션 롤백" 쓰기 경고를 내지만, exporter `LOCK_CODES`는 EXP를 제외 — 백엔드 "락 없음" 모델과 UI 카피 불일치 |

**총평(1차)**: blocking 1 · minor 1. 검증 재실행 exporter 관련 52 passed.

→ 처리: `phase-X11-codex-resolution.md`

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=medium · 독립 세션 · 처리 2건 판정 | **X11-01 resolved**(격리 배선·1회 반납·경합 가드·LOCK 직렬화·슬롯 정지=의도된 차단 확인, exporter 143 passed 재실행) · **X11-02 resolved**(락 코드 7종 일치·EXP 거짓 경고 제거 확인) · git diff --check 통과 · **신규 지적 없음 — 수렴, 종료 게이트 통과** (상세: resolution 문서) |
