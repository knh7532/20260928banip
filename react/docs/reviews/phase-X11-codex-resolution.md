# Phase X11 codex 지적 처리 (Adjudication)

원본: `phase-X11-codex-review.md` (2026-08-19). 각 건을 Accepted / Rejected /
Escalated로 분류 — Rejected는 근거 필수(AGENTS §6.3).

## X11-01 (blocking) — orphan 락 stmt_id의 즉시 재사용

**판정: Accepted — Fixed (신원 격리).** codex의 재현(crash 239초 후 같은 id가 CLE
문장에 재배정 → UI orphan 판정 반전)이 정확했다. 수정: crash가 락 보유 문장을
덮치면 victims를 `(stmt_id, holds_lock)`로 전달하고, `_finish_expired`가 신원을
풀에 반납하는 대신 `_quarantined[stmt_id]=(slot, identity)`로 **격리**한다.
REMOVE_LOCK 소비(tick)가 released stmt_id를 내보내면 Simulation 배선이
`release_identity`로 반납한다. 경합 가드: 문장이 죽기 전에 락이 먼저 제거되는
1-tick 창에서는 `_crash_holds` 예약만 해제해 정상 반납되게 했다. 격리로 인해
웹 orphan 판정(running 조인 실패)·exporter 발행 억제 충돌·remove_lock verdict
순서가 전부 무모순이 된다(재사용 자체가 불가능해짐). 회귀 테스트
`test_crash_orphan_quarantines_identity_until_remove_lock` — crash 후 240 tick
동안 동일 stmt_id 미재등장·orphan 잔존, REMOVE_LOCK 후 격리 해제·신원 풀
복귀·시리즈 제거를 잠근다. 부작용 상한: 슬롯당 신원 3종 중 orphan 보유분만
격리되므로 최악에도 슬롯 정지(테이블 락과 유사한 현실적 결과)이며 카디널리티
상한(72)은 불변.

## X11-02 (minor) — EXP의 거짓 쓰기 경고

**판정: Accepted — Fixed.** 경고 수위의 근거를 계열 롤업에서 **락 보유 판정**으로
교체 — web `qidSeries.ts`에 `QID_LOCK_CODES`(exporter `LOCK_CODES`와 동일 7종)와
`qidHoldsLock`을 신설하고 RestartGuideDialog가 그것을 쓴다. 카피도 "쓰기
계열(락 보유)…"/"락 없음 — 중단해도 안전"으로 정련. 테스트: EXP-03M → 롤백
경고 부재, `qidHoldsLock` 대조표(LOA·CLE·DEL true / EXP·SEL·결측 false).

## 처리 후 게이트·E2E

exporter ruff·mypy 0 · **pytest 143**(+1) · web lint·tsc 0 · **vitest 758**(+2) ·
파일별 커버리지 신규 미달 0(기준선 16→**11** — copyText·SnapshotLock 등 개선
이탈) · build · 전체 재기동 verify ALL PASS.

**E2E 실측**: ① 실 에피소드(sqream201 Unhealthy)에서 3단계 가이드 완주 —
① 문장 없음 통과 → ② graceful shutdown 접수(stdout `[shutdown]` 감사) → 다음
갱신 **Stopped**(WorkerDown 알람 해제·배지 회색) + ③ 개방 → restart(stdout
`[restart]`) → Healthy 복귀·다이얼로그 자동 닫힘 ② CLE 실행 중 kill →
**HTTP 409**(curl 실측, 세대 토큰 동봉) ③ crash→orphan: 시드 탐색(130)으로
결정론 재현 — crash가 etl_svc의 쓰기 문장을 덮쳐 Snapshot & Lock에 **orphan
배지 + Remove(orphan 행에만)**, 신원은 실패 이력 폴백(sqream201), 워커 자연
복구 후에도 락 잔존 → Remove 접수(stdout `[remove_lock]`)→낙관 제거→다음 tick
시리즈 제거. 실측 후 기본 시드(42) 원복.

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=medium · 독립 세션 · 처리 2건 판정(격리 누수·경합·배선 검증 요청) | **X11-01 resolved** — victims 튜플 배선(main.py:51)·격리 신원의 REMOVE_LOCK 전 미반환·해제 시 pop 후 **1회만** 복귀·1-tick 경합의 `_crash_holds.discard()` 정상 반납(누수·중복 삽입 없음)·`metrics.LOCK` 직렬화로 release 경합 안전·슬롯 3신원 전부 격리 시 배정 정지는 "orphan 락에 의한 의도된 차단"으로 판정(해제 후 복구). exporter 전체 **143 passed** + X11-01 집중 3 passed 재실행. **X11-02 resolved** — UI 락 코드 7종이 exporter와 일치, EXP 거짓 롤백 경고 제거, 분기가 실제 락 보유 판정 기반. **신규 지적 없음 — 수렴, 종료 게이트 통과** (vitest/build는 read-only 환경 제약으로 Implementor 결과 758/build 기준 — X6 이래 관례) |
