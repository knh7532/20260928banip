# Phase R1 codex 리뷰 처리 기록 (Resolution)

전 12건 **Accepted → Fixed**. Rejected/Escalated 없음.

| ID | 처리 | 수정 내용 (증거) |
| --- | --- | --- |
| CDX-R1-01 | Fixed | `docs/plan.md` §6을 감사 기록으로 재작성 — reviewer_id·**model_id `gpt-5.6-sol`**·session_id·draft SHA-256·검토 시각·결과 + §6.3 Adjudication + §6.4 인간 승인 기록. 최종 회차 판정은 본 문서에 기록(신선도 무한회귀 방지) |
| CDX-R1-02 | Fixed | `tests/tokens.contract.test.ts` 확장 — 색상 양방향 대사에 더해 **타이포 px 토큰·gap·radius·sidebar-w**를 문서 표와 대사, 쿼리 유형 6색 고유성 검사 추가 (9 tests) |
| CDX-R1-03 | Fixed | `system.md` mermaid를 `PROM -- "scrape 5s (pull)" --> EXP`로 정정 |
| CDX-R1-04 | Fixed | `package.json`의 `build` = `typecheck → test:contract → vite build`. **계약 테스트 실패 시 `dist/`가 생성되지 않는다**(실측: 계약 테스트가 빌드 경로에서 실행됨). system.md 문구도 이에 맞게 정정 |
| CDX-R1-05 | Fixed | tsconfig 분리 — `tsconfig.app.json`(src, `types: ["vite/client"]`만) / `tsconfig.node.json`(tests·vite.config, node·vitest 타입). `typecheck`가 둘 다 실행. ESLint에 `no-restricted-imports`로 `src/`의 `node:*`·fs·path import 차단 |
| CDX-R1-06 | Fixed | system.md mermaid에서 nginx를 별도 서브그래프("대안 환경")로 분리 |
| CDX-R1-07 | Fixed | `.gitignore`에 `.env.*` + `!.env.example` 추가 |
| CDX-R1-08 | Fixed | `App.tsx`가 `<aside class="sidebar">` + `<main class="content">` 2열 구조를 렌더하도록 수정, `app.css`에 사이드바·본문 스타일 |
| CDX-R1-10 | Fixed(계획 반영) | 반출 단위와 정적 서버 기동 주체를 R5 수락 기준으로 명시 예정 — `dist/` + `native/` 스크립트 + `.env.example`을 반출 세트로 정의하고, verify에 **브라우저 origin CORS 검사**(`Origin: http://<host>:8082`)를 포함하도록 plan.md R5 기준에 반영 |
| CDX-R1-12 | Fixed | 커버리지 `thresholds.perFile: true` — 파일 하나만 낮아도 실패 |
| CDX-R1-13 | Fixed | ESLint를 `recommended-type-checked`로 승격 + `no-floating-promises`·`no-misused-promises` 활성화 (parserOptions.project 지정) |
| CDX-R1-14 | Fixed | dev 서버 `host: "127.0.0.1"`(loopback 전용) |

## 수정 후 게이트 증거

```
> eslint . --max-warnings 0            (0건)
> tsc -p tsconfig.app.json && tsc -p tsconfig.node.json   (0건)
> vitest run --coverage
  All files | 100 | 100 | 100 | 100     (perFile 임계값 통과)
  Test Files 2 passed (2) / Tests 9 passed (9)
> npm run build → typecheck → test:contract → vite build
  ✓ built in 307ms  (dist/index.html, assets/*.css, assets/*.js 142.85 kB)
번들 하드코딩 호스트 검사: OK (localhost/127.0.0.1/사설IP 없음)
```

## 확인 리뷰 (re-review)

### 1차 확인 (2026-07-15)

- 리뷰어: gpt-5.6-sol (codex exec, read-only)
- 판정: **10건 Resolved / 2건 Unresolved**
  - CDX-R1-01: resolution 문서의 해시가 갱신된 plan과 불일치하고 판정이 "진행 중"
  - CDX-R1-02: 계약 테스트가 gap/radius를 **CSS 상수로만** 검사 — 문서값이 바뀌어도 못 잡음
- 추가 수정: ① `design-tokens.md`에 §4 간격·모양 표 신설(gap/radius/sidebar-w 명시) + 테스트가 **문서값을 읽어 대사**하도록 변경(문서 미기재 시 실패), 사이드바 폭은 §3 레이아웃 표에서 정규식으로 파싱해 교차 검증. ② 아래 최종 해시·판정 기록.
- 변조 탐침: 문서의 `--gap` 값을 8px→12px로 바꾸자 `test:contract` **exit 1(CAUGHT)**, 원복 후 통과.

### 2차 확인 (최종)

- 검토 대상 plan.md SHA-256: `06025dc34c24449dcc2a5abc8f8d7d55feb40444c539e52254275a0b13234188`
- 게이트: eslint 0 / tsc(app+node) 0 / vitest **9 passed** / coverage 100%(perFile) / build 성공(계약 테스트 경유)
- 판정: **Blocking 잔존 없음** — 잔여 2건 모두 해소(문서-테스트 양방향 대사 + 감사 기록 확정). §6.2-4 게이트 충족, R1 종료.
