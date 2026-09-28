# Phase R1 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, codex-cli 0.144.1, `codex exec` read-only)
- 세션: `019f61d3-c6d8-7fe3-890d-acadc05c2ea3` (압축 재요약 회차) / 선행 상세 회차 동일 대상
- 검토 시각: 2026-07-15T18:0x UTC
- 대상: `docs/AGENTS.md`, `docs/plan.md`, `docs/adr/R-0001~0004`, `docs/design-tokens.md`, `docs/architecture/system.md`, `src/styles/tokens.css`, `package.json`, `tsconfig.json`, `vite.config.ts`, `.eslintrc.cjs`, `.gitignore`, `.env.example`, `src/*`, `tests/*`
- 기준: ① 문서 간 일관성 ② 설정 결함 ③ 보안 ④ 계약 소비자 설계 ⑤ 토큰 대사 테스트 ⑥ 무-Node 실행 모델

## 결과 요약: Blocking 1 / Major 4 / Minor 3 (+ 상세 회차 보강 지적 5건)

| ID | Severity | 파일/위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-R1-01 | **Blocking** | AGENTS.md §3.1 / plan.md §6 | 구현 전 독립 교차검증의 감사값(reviewer_id·model_id·session_id·draft SHA-256·시각)과 이의 처리 기록이 없고 "미래 phase 리뷰로 대체"로 선언 — 계획 완료 게이트 미충족 |
| CDX-R1-02 | Major | tests/tokens.contract.test.ts | 계약 테스트가 색상만 비교 — 타이포·간격·라운드·사이드바 폭이 문서와 달라도 통과 |
| CDX-R1-03 | Major | docs/architecture/system.md | mermaid에서 `exporter → Prometheus`로 scrape 방향을 표기 — 실제는 Prometheus가 pull |
| CDX-R1-04 | Major | system.md / package.json | "계약 위반 시 빌드 실패"라고 문서화했으나 build가 tsc+vite뿐이라 계약 테스트 실패해도 dist 생성 가능 |
| CDX-R1-05 | Major | tsconfig.json | Node·Vitest 전역 타입이 브라우저 `src/`에도 노출 — `process`/`Buffer` 오용이 타입검사를 통과, 무-Node 계약 미강제 |
| CDX-R1-06 | Minor | system.md | "Docker 없음" 서브그래프 안에 nginx 대안을 함께 배치 — 환경 경계 모순 |
| CDX-R1-07 | Minor | .gitignore | `.env.local`·`.env.production` 등 Vite가 읽는 변형이 무시되지 않아 커밋 위험 |
| CDX-R1-08 | Minor | src/App.tsx, app.css | 제목이 2열 그리드의 사이드바 열에 배치됨 — 스캐폴딩 화면 레이아웃 오류 |
| CDX-R1-10 | Major | ADR R-0004 / plan R5 | 반출 단위가 불명확(dist만 vs 스크립트 포함), 정적 서버 등록·기동 주체 불명. verify가 브라우저 origin CORS를 검증 못함 |
| CDX-R1-12 | Minor | vite.config.ts / RXC-1 | 커버리지가 패키지 전체 합산 — 후속 phase의 미테스트 모듈이 기존 파일에 가려짐 |
| CDX-R1-13 | Minor | .eslintrc.cjs | 타입 비인지 규칙만 사용 — floating promise·misused promise가 lint를 통과(R2 폴링 코드 위험) |
| CDX-R1-14 | Minor | vite.config.ts | dev 서버 `host: true`로 LAN 노출 — 요구는 현장 정적 서버에만 해당 |

양호 판정: `strict: true`, Vite `base: "./"`, 커버리지 수치, 정확 버전 핀(C3 0.7.20 ↔ D3 5.16.0 deduped).
