# Phase R1 회고 — 거버넌스·설계 문서 + 스캐폴딩

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 산출물·증거 |
| --- | --- |
| 문서 전부 존재 + mermaid | `docs/AGENTS.md`(신규 거버넌스)·`plan.md`·ADR R-0001~0004·`design-tokens.md`·`architecture/system.md`(mermaid 포함, pull 방향 정정) |
| lint/typecheck/test 0 fail | `eslint --max-warnings 0` 0건 · `tsc -p app + node` 0건 · vitest **9 passed** · coverage **100%**(perFile 임계값) |
| C3 ↔ D3 단일 버전(v5) | `npm ls` — `c3@0.7.20` → `d3@5.16.0 deduped` |
| 토큰 ↔ 문서 대사 | `tests/tokens.contract.test.ts` — 색상 양방향 + 타이포 px + gap/radius/sidebar-w + 유형 6색 고유성. **문서 변조 탐침 CAUGHT** |

부수 성과: `build`가 계약 테스트를 강제(계약 위반 시 `dist/` 생성 불가), 번들에 하드코딩 호스트 없음 확인.

## 잘된 점

- 시안(PPTX)에서 **색·좌표·범례색을 프로그램으로 추출**해 토큰화하고, 문서-CSS를 테스트로 묶어 "디자인이 조용히 어긋나는" 경로를 차단했다.
- 무-Node 배포 제약을 tsconfig 분리 + ESLint `no-restricted-imports`로 **기계적으로 강제**했다(문서 약속이 아니라 게이트).

## 어려웠던 점

- 시안의 타임라인 막대 색과 메트릭 계약의 `query_type`이 서로 어긋난다(Sales_Aggregation ↔ Group_By_Region). 계약을 바꾸면 형제 프로젝트 개정 절차가 필요해 **표시 규칙만 정하고 인간 판단으로 남겼다**(DES-1).
- 커버리지·빌드 게이트가 처음엔 "선언만" 있고 실제로는 우회 가능했다 — 리뷰가 이를 정확히 짚었다.

## 다음 phase에 반영할 개선점

- R2 착수 전 **형제 프로젝트 Phase 5(동적 시뮬레이션)** 를 먼저 끝낸다. 정적 데이터로는 시계열·타임라인·브러시를 검증할 수 없다.
- 폴링·fetch 코드는 `no-floating-promises`가 켜져 있으므로 처음부터 await/void를 명시한다.

## codex 리뷰 지적과 처리 결과

- 1차: 12건 (Blocking 1 / Major 4 / Minor 3 + 보강 4) → 전건 Accepted·Fixed.
- 확인 리뷰: 10건 Resolved / 2건 잔여(감사 해시·문서값 대사) → 추가 수정 후 **"Blocking 잔존 없음"**.
- 상세: `docs/reviews/phase-R1-codex-review.md`, `docs/reviews/phase-R1-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-R1-1 | Design | **DES-1** — 시안 타임라인은 `Sales_Aggregation`을 SELECT색(초록), `Group_By_Region`을 집계색(보라)으로 칠했으나 메트릭 계약의 `query_type`은 정반대다. 현재 구현 방침은 **계약 라벨 기준으로 색 결정**(범례 색 자체는 시안과 동일) | 계약을 시안에 맞춰 바꿀지(형제 프로젝트 개정 필요), 아니면 현재 방침 유지할지 | 비차단 (R4 차트 구현 전까지 결정하면 됨) |
| HCI-R1-2 | Scope | R1 리뷰 반영으로 `plan.md`가 갱신됨(빌드 게이트·tsconfig 분리·R5 반출 세트 명시 등). 승인된 결정 사항의 **의미는 무변경** | 갱신본(SHA-256 `06025dc3…`) 재확인 | 비차단 |
| HCI-R1-3 | Architecture | 형제 프로젝트 **Phase 5(동적 시뮬레이션)** 를 R2보다 먼저 진행하기로 함 — Grafana판 대시보드도 함께 보정 필요(상세 패널 `last_over_time`, 쿼리 수 `increase`, 기본 30분 창) | 착수 승인 (2026-07-15 확정됨) | R2 착수의 선행 조건 |
