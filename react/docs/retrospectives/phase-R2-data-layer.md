# Phase R2 회고 — 데이터 계층

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 코드·증거 |
| --- | --- |
| fetch 모킹 테스트(성공/오류/타임아웃/취소/비정상) | `tests/prom.test.ts` — http·status·network·timeout·malformed·PromAbortError 분류, 응답 봉투·샘플 튜플 검증 |
| 계약 대사(사용 메트릭·라벨 ⊆ TV-C1) | `tests/queries.contract.test.ts` — `queryRegistry()` 전수 검사 + 타입 인지 + 무명 selector 차단. **변조 탐침 3종 CAUGHT** |
| 폴링 훅(겹침 방지·취소·연속 실패) | `tests/hooks.test.tsx` — 겹침 방지, 언마운트 취소, 세대 겹침 차단, failStreak |
| 커버리지 게이트 | 97.7% (분기 84.7%), perFile 임계값 통과 |
| 라이브 검증 (opt-in) | `tests/live.integration.test.ts` — 실 Prometheus 9건: 조인 정합·중복 없음·구간 rows/s 스케일 확인 |

## 잘된 점

- **PromQL 유일 정의처 + 레지스트리**로 계약 대사가 우회 불가해졌다. 새 쿼리를 추가하면 자동으로 검사 대상이 되고, 미계약 메트릭·무명 selector·Counter 함수 오용을 변조 탐침으로 실증했다.
- 형제 프로젝트 **Phase 5 교훈을 코드에 반영**했다: 상태·신원은 instant, 집계는 `[window]` 창, rows/s는 시점별 sum 후 평균(라벨셋 교체 과대계상 방지). 라이브 테스트로 실제 값 스케일까지 확인했다.
- 브라우저에서 실제 Prometheus에 붙는 라이브 테스트를 opt-in(`PROM_LIVE=1`)으로 두어, CI·오프라인은 깨지지 않으면서 실연동을 검증할 수 있게 했다.

## 어려웠던 점

- **PromQL 주입**을 리뷰가 Blocking으로 잡았다 — 필터 값이 URL에서 오므로 신뢰 불가 입력인데, 정규식 이스케이프만 하고 문자열 리터럴 이스케이프를 빠뜨렸다. 이스케이프를 2계층으로 분리했다.
- 제어문자 제거 정규식이 소스에 리터럴 제어문자로 박혀 lint가 막았다 — 문자 코드 기반 필터로 우회.
- jsdom의 AbortSignal과 Node fetch가 충돌해 라이브 테스트만 `@vitest-environment node`로 분리했다(브라우저 런타임은 무관).

## 다음 phase에 반영할 개선점

- R3 컴포넌트는 `queryRegistry()`/각 팩토리를 통해서만 쿼리를 얻는다(PromQL 하드코딩 금지 — 계약 계층 규칙).
- 타임라인 range 쿼리는 `maxStepSec`로 세그먼트 해상도를 지켜야 한다(R4 D3 간트에서 중요).

## codex 리뷰 지적과 처리 결과

- 1차: 13건 (Blocking 1 / Major 9 / Minor 3) → 전건 Accepted·Fixed.
- 확인 리뷰: 9/13 Resolved, 잔여 4건 추가 수정(샘플 튜플·레지스트리 전수·무명 selector·중첩 함수) → **"Blocking 잔존 없음"**.
- 상세: `docs/reviews/phase-R2-codex-review.md`, `docs/reviews/phase-R2-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-R2-1 | Security | Prometheus를 브라우저가 무인증으로 직접 호출한다(ADR R-0001). 필터 값 주입은 이스케이프로 막았으나, Prometheus 자체는 사설망 전제다 | 실제 배포망이 사설망인지 확인(R5 README에 명시 예정) | 비차단 |
| HCI-R2-2 | Design | 라이브 통합 테스트는 `PROM_LIVE=1`일 때만 돈다 — 개발 PC에 형제 스택이 떠 있어야 한다. CI에서는 skip | CI 도입 시 라이브 테스트를 어떻게 다룰지(별도 스테이지) | 비차단 |
| HCI-R2-3 | Scope | R2는 UI가 없다(데이터 계층만). 화면 검증은 R3~R4에서 | R3 이후 육안 검토 | 비차단 |
