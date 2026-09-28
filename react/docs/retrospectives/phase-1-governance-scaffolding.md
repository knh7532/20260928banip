# Phase 1 회고 — 거버넌스·설계 문서 + 스캐폴딩

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 산출물/검증 증거 |
| --- | --- |
| 문서 세트 존재 + system.md mermaid ≥1 | `docs/AGENTS.md`, `docs/plan.md`, `docs/adr/0001~0004`, `docs/architecture/{system,db-schema}.md` — §3.4 점검 명령 3종 통과 (`OK: 산출물 완비` / `OK: system mermaid 존재` / `OK: TV-C1 + N/A 근거`) |
| db-schema.md TV-C1 전 메트릭 표 + RDB N/A | `docs/architecture/db-schema.md` — 메트릭 12종(DCGM 5 + statement 5... 표 참조), 공통 라벨, 카디널리티 규칙, 정적 기준값(PPTX 유래), TSDB 누적 카디널리티 주의 포함 |
| 계약 표 §5.1 필수 필드 | `docs/plan.md` §3 — TV-C1/TV-C2 8필드 전부 기재 |
| ruff/mypy/pytest 0 fail | `exporter/` 스캐폴딩 — `All checks passed!` / `Success: no issues found in 3 source files` / `1 passed` |

부수 산출물: `.gitignore`(`*.log` 포함), `.env.example`(빈 비밀번호 강제), `exporter/requirements-dev.txt`(검증 도구 4종 고정 핀).

## 잘된 점

- 상위 `../mockup/` 거버넌스 골격을 계승하면서 프로젝트 선언(§0.1)·바인딩(§2)·산출물 축소(§3.4 명시적 면제)를 분리해 교체한 구조가 리뷰에서 유효하게 작동했다.
- 계약 TV-C1을 코드 작성 전에 문서로 확정하고 PPTX 수치의 정규화 기준(서버 카드 앵커)까지 못박아, Phase 2 구현이 대사 테스트로 게이트될 수 있게 됐다.

## 어려웠던 점

- codex 리뷰가 지적한 **신선도 무한회귀**(리뷰 반영 → draft 변경 → 기존 리뷰 무효화): 최종 회차 기록을 plan.md가 아닌 resolution 문서에 두는 방식으로 수렴시켰다.
- 검증 스니펫이 "실패 시 non-zero exit"이라는 자체 철학을 어기고 있었던 것(CDX-P1-08) — 골격을 이식할 때도 기계 검증 가능성을 재확인해야 함을 확인했다.

## 다음 phase에 반영할 개선점

- Phase 2 compose 작성 시 `${GRAFANA_ADMIN_PASSWORD:?}` 필수 변수 + `.env` 빈 값 거부를 실제로 확인하는 검증 단계를 수락 기준에 포함(CDX-P1-14 후속).
- codex 리뷰를 1회차부터 "수정 검증까지 한 세션에서" 요청하도록 프롬프트를 개선해 회차 수를 줄인다.
- §3.2-2 임시 코드 검사는 `docs/AGENTS.md` 자체(검사 규칙 정의 텍스트·awk 스니펫)에 거짓 양성 2건을 낸다 — 규칙이 겨냥하는 "임시 주석·데드 코드"가 아니므로 예외 처리하고 커밋함. 이 문서를 재수정하는 phase에서는 동일 거짓 양성이 재발함을 인지할 것.

## codex 리뷰 지적과 처리 결과

- 1차: 15건 (Blocking 1 / Major 12 / Minor 2) → 전건 Accepted·수정.
- 2차(재검증): 11건 Resolved, 4건 잔여 + 절차성 신규 1건(CDX-P1R-01) → 추가 수정 및 phase 마감 절차로 해소.
- 3차(최종 검증): 최종 draft hash 기준 판정 — 결과는 `docs/reviews/phase-1-codex-resolution.md` 재검증 회차 기록 참조.
- 상세: `docs/reviews/phase-1-codex-review.md`(지적 원문), `docs/reviews/phase-1-codex-resolution.md`(지적별 처리·증거).

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-1-1 | Scope | 계획 승인(2026-07-14) 후 codex 리뷰 반영으로 plan.md 자구가 갱신됨(경로 표기·명령 수정·감사 기록·EXC-1). 승인된 결정 사항과 수락 기준의 **의미는 변경 없음** | 갱신된 `docs/plan.md`(SHA-256 `0f0576ec…`)의 재확인 — 이견 시 해당 절 수정 지시 | Phase 2 착수 비차단. **Phase 3 정적 검토 체크포인트에서 확인 요청** |
| HCI-1-2 | Security | 0.0.0.0 전면 노출(ADR-0004) + Grafana 비밀번호 미설정 시 기동 거부 정책(.env.example 빈 값) 조합 | 사설망 전제·방화벽 운영 방식이 실제 사용 환경과 맞는지 확인 | 비차단 (승인된 결정의 보완 통제 확인) |
| HCI-1-3 | Architecture | §3.4 산출물 축소(명시적 면제): data/security/deployment/sequences를 `../mockup/docs/architecture/*` 참조로 갈음 | 이 목업 문서만 단독 열람하는 독자가 생길 경우 면제 범위를 좁혀야 할지 판단 | 비차단 |
