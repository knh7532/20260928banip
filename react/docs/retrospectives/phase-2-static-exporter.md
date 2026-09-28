# Phase 2 회고 — 정적 exporter + 스택 기동

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 코드/테스트 경로와 증거 |
| --- | --- |
| 계약 대사 exit 0 | `exporter/tests/test_contract.py` — CONTRACT↔EXPECTED, 게이지 생성, 문서 라벨셋 양방향 파싱 대사, 역방향 메트릭 대사. `23 passed`에 포함 |
| 정적 수치 대사 exit 0 | `exporter/tests/test_static_data.py` — 골든 상수(G_*) 전수 대사(앵커/배분값/statement 5건/카탈로그·성능 6행/타임라인 12셀) |
| 커버리지 80% + 린트/타입 0건 | `pytest --cov=exporter --cov-fail-under=80` → **100%** (67 stmts, 0 miss), `ruff` All checks passed, `mypy` no issues (9 files) |
| compose 기동 + 시리즈 존재 | `docker compose up -d --build top-view-exporter prometheus` → 타깃 1/1 `up`, `DCGM_FI_DEV_GPU_UTIL` 12 / `sqm_gpu_timeline_state` 12 / `sqm_statement_running` 5 / `sqm_query_rows_per_second` 6 시리즈 (curl 실측) |
| 0.0.0.0 리스닝 | `netstat -an` — `0.0.0.0:9801`·`0.0.0.0:9091` LISTENING (ADR-0004) |
| 비밀번호 미설정 기동 거부 | `.env` 부재 → `docker compose config` exit 1, 빈 값 → exit 1 (CDX-P1-14/CDX-P1R2-02 이관분 해소) |

## 잘된 점

- 게이지를 `CONTRACT` dict 한 곳에서 생성하는 설계로 코드 내 이름·라벨 불일치가 구조적으로 불가능해졌고, 계약 테스트가 문서만 대사하면 되게 단순해졌다.
- 정적 데이터라 tick 루프 없이 기동 시 1회 set으로 충분 — main()이 7줄로 끝나고 전량 단위 테스트됐다.

## 어려웠던 점

- PPTX 자체의 카드↔차트 수치 불일치 — 카드 앵커를 기준으로 GPU별 배분값을 재구성하는 정규화 결정이 필요했다(HCI-2-1).
- NamedTuple 필드명 `index`가 tuple 내장 메서드와 충돌해 mypy가 잡아냄 — `idx`로 회피.

## 다음 phase에 반영할 개선점

- Phase 3 생성기의 PromQL은 test_contract가 파싱하는 라벨셋과 동일한 소스(db-schema.md)를 참조하므로, 생성기에도 라벨 오타를 잡는 검증 테스트를 둔다.
- codex 리뷰 지적이 테스트 엄밀성에 집중됐다 — Phase 3 JSON 검증 테스트도 "패널 수 세기"를 넘어 쿼리 표현식·매핑 값 대사까지 포함한다.

## codex 리뷰 지적과 그 처리 결과

- 1차: 4건 (Major 2 — 문서 라벨셋 대사 부재·골든 값 비독립 / Minor 2 — statement 시리즈 검증 공백·main 미테스트) → 전건 Accepted·Fixed.
- 확인 리뷰: `docs/reviews/phase-2-codex-resolution.md` 확인 리뷰 절 참조.
- 상세: `docs/reviews/phase-2-codex-review.md`, `docs/reviews/phase-2-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-2-1 | Other | PPTX 내부의 카드(⑤)↔차트(④) 수치 불일치를 **카드 앵커 기준으로 정규화**하고 GPU별 배분값을 재구성함 (db-schema.md §5) | 정규화 기준(카드 우선)이 의도와 맞는지 — Phase 3 정적 화면 검토 시 함께 확인 | 비차단 |
| HCI-2-2 | Other | PPTX에 없는 값의 임의 배정: server-02/03 타임라인 상태, Group_By_Region(QUEUED)·Vacuum_Maintenance(IDLE)의 상태/P95 | 임의 배정값이 시연 목적에 적합한지 — Phase 3 정적 화면 검토 시 함께 확인 | 비차단 |
