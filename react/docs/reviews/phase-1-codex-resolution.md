# Phase 1 codex 리뷰 처리 기록 (Resolution)

전 15건 **Accepted → Fixed**. Rejected/Escalated 없음. 1차 수정 후 재검증(2차)에서 4건 잔여 판정 → 추가 수정 → 최종 검증(3차). 회차별 결과는 하단 참조.

| ID | 처리 | 수정 내용 (파일 증거) |
| --- | --- | --- |
| CDX-P1-01 | Fixed | `docs/AGENTS.md` 서두를 실제 조정 범위(§0.1/§2/§3.4 면제/§4-6·7/§5/§6.1/스니펫 경로) 기술로 교체, "규범 본문 강도 유지" 명시 |
| CDX-P1-02 | Fixed | 경로 규약에 형제 폴더 `../` 접두사 규칙 추가. 2차 재검증에서 잔존 지적된 `plan.md`·`system.md`·ADR 3건의 무접두 표기까지 전수 수정(`../서류/…`, `../mockup/…`) |
| CDX-P1-03 | Fixed | `docs/plan.md` §6.2를 회차별 감사표로 확장 — 구체 model_id(`gpt-5.6-sol`, xhigh), 회차별 session_id·draft SHA-256·시각 기록. §6.3에 인간 재승인 판단 명시(승인 결정·수락 기준 의미 무변경 → Phase 2 비차단, HCI-1-1로 다음 인간 접점에서 재확인) |
| CDX-P1-04 | Fixed | `docs/plan.md` §2 ④행 "원천 메트릭 5종(표시 패널 4종)"으로 수정 |
| CDX-P1-05 | Fixed | `docs/architecture/db-schema.md` 서버 카드 PromQL을 실제 노드명 예시로 교체, 필터 연동 쿼리는 `$env/$instance/$gpu` 매처 명시 |
| CDX-P1-06 | Fixed | `docs/architecture/db-schema.md`에 TSDB 누적 카디널리티 주의 블록 추가 — `remove()`≠TSDB 삭제, 동적 단계 유한 ID 풀(상한 32) 계약화 |
| CDX-P1-07 | Fixed | `docs/AGENTS.md` §2에 "바인딩 발효 시점" 노트 — RUN_CMD는 Phase 2 발효, Phase 1 명령어 존재 게이트에서 제외 |
| CDX-P1-08 | Fixed | `docs/AGENTS.md` §3.2-1 보조 점검을 현재 phase 섹션 한정 awk + `exit 1`로 교체, §3.2-2 임시코드·§3.2-3 스코프 위반 분기에 `exit 1` 추가 |
| CDX-P1-09 | Fixed | `docs/AGENTS.md` §5.1 TV-C1 드리프트 명령 `(cd exporter && pytest tests/test_contract.py)`로 수정 |
| CDX-P1-10 | Fixed | `docs/plan.md` Phase 3 수락 기준 명령 `git -C .. diff --exit-code -- top_view_mockup/grafana/provisioning/dashboards/json/`으로 수정 |
| CDX-P1-11 | Fixed | `docs/AGENTS.md` §6.2 게이트 1)에 `ruff check . && mypy .` 추가 |
| CDX-P1-12 | Fixed | `exporter/requirements-dev.txt` 신설 — pytest==9.1.1, pytest-cov==7.1.0, ruff==0.15.20, mypy==2.1.0 고정 |
| CDX-P1-13 | Fixed | §3.3-3이 허용하는 **명시적 예외**로 전환 — `docs/plan.md` §10 EXC-1에 예외·근거 기록, AGENTS.md §2 바인딩 노트가 이를 참조 (2차 재검증 지적 반영: 전체 커버리지 게이트로는 변경 라인 80%를 기계 강제할 수 없음을 인정하고 예외로 선언) |
| CDX-P1-14 | Fixed | 2차 재검증 지적 반영 — `.env.example`의 비밀번호를 **빈 값**으로 배포(compose `${VAR:?}`는 빈 값을 거부하므로 미설정 시 기동 실패가 실제로 강제됨). native start 스크립트도 빈 값 거부 예정(Phase 4) |
| CDX-P1-15 | Fixed | `exporter/error.log` 삭제(codex CLI 자체 생성 로그), `.gitignore`에 `*.log` 추가 |

## 재검증 회차 기록

### 2차 (re-review)

- 세션: thread `019f60bf-0c2c-7643-87bd-d9f85ade39bc` / job `task-mrko43wk-vmpe6r` (gpt-5.6-sol, read-only), 2026-07-14T13:10~13:20 UTC
- 검토 대상 plan.md SHA-256: `6ceeaee8ecca9d262cba7aaa4940dcd02ac65df8f206c51c78c1e7fe1e95d331`
- 판정: 11/15 Resolved. 잔여 4건 — CDX-P1-02(무접두 경로 잔존), CDX-P1-03(model_id 불특정·hash 신선도·HCI 미존재), CDX-P1-13(전체 커버리지로는 변경 라인 미강제), CDX-P1-14(비어있지 않은 플레이스홀더는 `:?` 통과). 신규 Blocking 1건 — **CDX-P1R-01**: Phase 1 수락 기준 체크박스 미체크(phase 마감 게이트 미완).
- 처리: 잔여 4건 위 표와 같이 추가 수정. CDX-P1R-01은 phase 마감 절차(수락 기준 4건 검증 증거 확보 후 [x] 갱신)로 해소 — plan.md Phase 1 체크박스 갱신 완료.

### 3차 (최종 검증)

- 리뷰어: gpt-5.6-sol (codex-rescue 경유, read-only), 2026-07-14T13:30~13:35 UTC
- plan.md SHA-256 대조: `0f0576ec70059d0436fb80accb7dd5b8f3375b31c8b3dd13fd6755347f36ba8c` — **MATCH** (리뷰어 직접 계산)
- 판정: CDX-P1-03 **Resolved** / CDX-P1-13 **Resolved** / CDX-P1R-01 **Resolved**. 잔여 2건:
  - **CDX-P1R2-01** (CDX-P1-02 잔존): `docs/AGENTS.md` §0.1 스코프 경계 행에 무접두 `mockup/` 1곳 → **Fixed** — `../mockup/`으로 수정, 전수 재검색 결과 `CLEAN: 무접두 형제 경로 없음`
  - **CDX-P1R2-02** (CDX-P1-14 연관): compose 파일 부재로 `${GRAFANA_ADMIN_PASSWORD:?}` 강제를 검증 불가 → **Phase 2 이관** — compose는 Phase 2 산출물이므로 Phase 1에는 검증 대상이 존재하지 않음. Phase 1 범위 조치(빈 값 배포)는 완료했고, 강제 검증을 plan.md Phase 2 수락 기준("Grafana 비밀번호 미설정 기동 거부")으로 등재하여 기계 게이트화

### 4차 (확인 전용)

- 리뷰어: gpt-5.6-sol (codex-rescue 경유, read-only), 2026-07-14T13:40 UTC 경
- 판정: **CDX-P1R2-02 → "Phase 2 이관 적절, Non-blocking" 확인** (plan.md Phase 2 수락 기준 등재 증거 인용). CDX-P1R2-01은 grep이 `docs/reviews/phase-1-codex-review.md`의 **지적 요약 인용 문구**에 걸려 Unresolved 판정 — 규범 문서가 아닌 리뷰 기록 내 인용이므로, 요약 문구를 경로 패턴이 아닌 서술("형제 폴더(서류·mockup)를 가리키는 무접두 표기")로 조정해 해소.

### 5차 (최종 한 줄 판정)

- 리뷰어: gpt-5.6-sol (codex-rescue 경유, read-only), 2026-07-14T13:45 UTC 경
- grep 전수 재검: 매치 20건 전부 정상 표기(`../`·`top_view_mockup/`·저장소 루트 기준 명시)로 제외 — **잔존 히트 0건**
- **최종 판정: "Phase 1 기준 Blocking 잔존 여부: 없음"** — §6.2-4 게이트 충족. Phase 1 종료.
