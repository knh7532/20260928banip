# ADR R-0004: 정적 산출물 배포 — 현장에 Node.js·Docker 없음

- 상태: Accepted
- 날짜: 2026-07-15

## 컨텍스트

인간 확인 사항: **배포 현장(망분리 서버)에는 Docker가 없고 Node.js도 없다.** 형제 프로젝트가 네이티브 모드(portable Prometheus/Grafana + venv python)를 제공하는 것도 같은 이유다. 반면 개발 PC는 온라인이며 node 24 / npm 11이 설치되어 있다.

## 결정

**빌드는 개발 PC, 실행은 정적 파일**로 분리한다.

1. 개발 PC: `npm run build` → `dist/`(HTML/JS/CSS 정적 자산, 상대 경로 `base: "./"`)
2. 현장 실행(1순위, 무-Docker): 형제 프로젝트 네이티브 모드의 **venv python `http.server`** 가 `dist/`를 서빙한다(`:8082`). 현장에는 이미 python이 있다(exporter 실행에 필요). **Node.js 불필요.**
3. Docker 실행(병행 제공): `nginx:alpine`이 `dist/`를 서빙(`:8082`). compose 서비스로 추가.
4. 망분리 반출: **`dist/` 폴더만** 옮기면 된다. npm 오프라인 번들·node_modules 반출 절차가 불필요하다.

런타임에 Node.js를 요구하는 구성(SSR, Next.js 서버, BFF 프록시, dev 서버 상시 구동)은 **금지**한다.

## 대안

- **Vite dev 서버를 현장에서 상시 구동**: node가 없어 불가. 기각.
- **Node 서버(Express) BFF로 Prometheus 프록시**: 런타임 node 필요 + CORS가 이미 열려 있어 불필요. 기각(ADR R-0001).
- **Grafana에 정적 앱을 얹기**: 불필요한 결합. 기각.

## 결과

- 환경 설정(`VITE_PROM_URL`)은 **빌드 시점에 번들로 인라인**된다. 현장에서 Prometheus 주소를 바꾸려면 재빌드가 필요하다 — 이를 피하기 위해 **기본값을 "앱이 서빙되는 호스트의 :9091"로 동적 결정**하여, 같은 서버에 함께 배포하는 일반적인 경우 재빌드 없이 동작하게 한다.
- 정적 서버는 SPA 단일 진입점만 제공하면 되므로 라우터를 쓰지 않는다(단일 화면).
- 빌드 산출물(`dist/`)은 git에 커밋하지 않는다(§7) — 반출은 별도 전달.

## 보강 (2026-08-27) — 런타임 설정 주입 (재빌드 → 재기동)

빌드 인라인의 마지막 예외(호스트 분리 배치에서 `VITE_*` 변경 = 재빌드·재반입)를
제거한다. **web-serve(.ps1/.sh)가 기동할 때마다 `web/.env` 를 읽어
`dist/runtime-config.js`(`window.__TVM_CONFIG__`)를 재생성**하고, 앱은
런타임 > VITE_(빌드) > 페이지 호스트 기본값 순으로 주소를 결정한다
(`web/src/runtimeConfig.ts`). 정적 파일 생성이므로 "런타임 Node 금지" 원칙은
그대로다. 같은 날 복원: `promBaseUrl()` 기본값이 어느 시점에 `"/prometheus"`
상대경로로 표류해 있었다 — 프록시 없는 정적 서빙에서 404가 되는 본 ADR 위반이며,
개발 PC의 `web/.env` 가 기본 분기를 가려 회귀 테스트도 통과해 버린 상태였다
(테스트는 빈 값 명시 스텁으로 고정).
