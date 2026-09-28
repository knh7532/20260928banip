# ADR R-0001: Prometheus 직접 조회 (Grafana iframe 임베드 금지)

- 상태: Accepted
- 날짜: 2026-07-15

## 컨텍스트

형제 프로젝트(`../top_view_mockup`)는 화면 전체를 Grafana로 렌더한다. 상위 프로젝트(`../mockup`)는 정적 HTML 셸이 Grafana `d-solo` 패널을 iframe으로 임베드하는 병행 구조를 쓴다. 이번 React 구현은 인간 지시로 **iframe을 쓰지 않는다**.

확인 사항: 이 스택의 Prometheus는 `Access-Control-Allow-Origin: *`를 반환한다(실측). 따라서 브라우저에서 직접 `/api/v1/query`·`/api/v1/query_range`를 호출할 수 있으며 프록시 서버가 필요 없다.

## 결정

React 앱이 **브라우저에서 Prometheus HTTP API를 직접 호출**한다. Grafana는 이 프로젝트의 런타임 의존이 아니다(형제 프로젝트가 계속 별도로 존재할 뿐).

- 저수준 클라이언트 `src/api/prom.ts` — instant/range/label_values, AbortController 타임아웃
- PromQL 정의는 `src/api/queries.ts` 한 곳에만 둔다(컴포넌트 하드코딩 금지)
- Base URL 기본값은 앱이 서빙되는 호스트의 `:9091` — 하드코딩된 호스트명을 번들에 넣지 않는다(`VITE_PROM_URL`로 오버라이드 가능)

## 대안

- **Grafana d-solo iframe 임베드**: 차트 구현 비용이 0에 가깝지만 인간이 명시적으로 배제. 또한 Grafana 세션 쿠키·CSP 문제와 시각 커스터마이즈 한계가 있다. 기각.
- **백엔드 프록시(BFF)**: CORS를 우회하고 쿼리를 서버에서 관리할 수 있으나, **현장에 Node.js/Docker가 없다**(ADR R-0004)는 제약과 정면 충돌. 기각.

## 결과

- 런타임 구성이 단순해진다: 정적 파일 + Prometheus만 있으면 동작.
- Prometheus가 브라우저에 노출되므로(무인증) **사설망 전제**가 필수다 — 형제 프로젝트와 동일한 보안 전제를 계승하며 README에 명시한다.
- Prometheus의 CORS 설정을 좁히면 앱이 깨진다 — 운영 변경 시 §4 이스케이프 대상.
