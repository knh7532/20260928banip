# Phase 1 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex (codex-cli 0.144.1, codex-rescue 플러그인 경유 `codex exec` read-only)
- 세션: thread `019f60b0-0023-7182-b953-57565fe99376` / job `task-mrkniyvi-5jrkom`
- 검토 시각: 2026-07-14T12:52~13:05 UTC
- 대상: Phase 1 산출물 전체 — `docs/AGENTS.md`, `docs/plan.md`, `docs/adr/0001~0004`, `docs/architecture/{system,db-schema}.md`, `exporter/` 스캐폴딩, `.gitignore`, `.env.example`
- 검토 시점 plan.md SHA-256: `2c8a7b0c0322203902e917f9378f982a816804073ff0c51e32df23799374efac`
- 기준: ① 문서 간 일관성 ② 메트릭 스키마 설계 ③ 검증 명령 실행 가능성 ④ 스캐폴딩 설정 ⑤ 보안 (0.0.0.0 자체는 승인된 결정으로 제외)

## 지적 요약: 15건 — Blocking 1 / Major 12 / Minor 2

| ID | Severity | 파일/위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-P1-01 | Major | AGENTS.md:3 외 | "§0.1/§2만 교체" 주장과 달리 §3.4·§4·§5·§6도 실질 개정됨 — 서두 기술이 실제와 불일치 |
| CDX-P1-02 | Major | AGENTS.md:7,24,149 / plan.md:8,50 | 경로 규약(top_view_mockup/ 기준) 하에서 형제 폴더(서류·mockup)를 가리키는 무접두 표기가 존재하지 않는 경로로 해석됨 |
| CDX-P1-03 | **Blocking** | AGENTS.md §3.1 / plan.md §6 | 구현 전 독립 타 모델 교차 검증의 감사 필드(reviewer_id/model_id/session_id/draft hash/시각) 미기록 — codex phase 리뷰로 "대체" 선언만으로는 §3.1 게이트 불충족 |
| CDX-P1-04 | Minor | plan.md:26 / db-schema.md | "DCGM 4계열" 표기 — 실제 원천 메트릭은 5종(FB_USED/FB_FREE 분리) |
| CDX-P1-05 | Major | db-schema.md:34-39 | 집계 PromQL 예시가 미선언 라벨 값(`node="..."`)을 셀렉트 — 실행 시 빈 결과 |
| CDX-P1-06 | Major | db-schema.md:43-53 | `remove()`는 노출 중단일 뿐 TSDB 기저장 시리즈를 삭제하지 않음 — 동적 단계 stmt_id 카디널리티 통제 부재 |
| CDX-P1-07 | Major | AGENTS.md:68,77 | RUN_CMD `python -m exporter.main`이 Phase 1에 존재하지 않아 §2 명령어 존재 확인과 모순 |
| CDX-P1-08 | Major | AGENTS.md:105-130 | 검증 스니펫의 실패 분기가 exit 0으로 종료(수락 기준 grep·임시코드·스코프 위반) + 수락 기준 검사가 전 phase를 스캔 |
| CDX-P1-09 | Major | AGENTS.md:203 | TV-C1 드리프트 명령이 작업 디렉터리 불일치(`tests/` 없음) |
| CDX-P1-10 | Major | plan.md:81 | Phase 3 드리프트 명령이 프로젝트 루트·저장소 루트 경로 혼용 — pathspec이 잘못 해석되어 무검사 통과 가능 |
| CDX-P1-11 | Major | AGENTS.md:232-249 | §6.2 종료 게이트에 ruff/mypy 누락 — 린트·타입 에러가 있어도 게이트 통과 |
| CDX-P1-12 | Major | exporter/pyproject.toml, requirements.txt | 검증 도구(pytest/pytest-cov/ruff/mypy) 의존성 미고정 — 클린 설치에서 선언 워크플로우 재현 불가 |
| CDX-P1-13 | Minor | AGENTS.md §3.3 / pyproject.toml | "신규/변경 라인 80%" 요구와 실제 게이트(패키지 전체 80%)의 의미론 불일치 |
| CDX-P1-14 | Major | .env.example | 0.0.0.0 노출 하에서 알려진 약한 기본 비밀번호(topview123) 복사 유도 — 인증 통제 무력화 |
| CDX-P1-15 | Major | .gitignore / exporter/error.log | `*.log` 미차단 — 도구 생성 error.log(인증 모드·계정 식별자 포함)가 커밋 가능 상태 |

원문 전문은 codex job 로그(`task-mrkniyvi-5jrkom`)에 보존되어 있다.
