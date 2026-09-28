# ADR 0010 — 의존성 무추가 해시 라우팅으로 두 화면 전환

- 상태: 승인 (Phase L3, 2026-07-19)
- 관련: ADR R-0004(정적 빌드·무Node 런타임), docs/plan.md §7 (2026-07-19 인간 확정)

## 컨텍스트

GPU/LLM 화면(시안 llm_dashboard.pptx)이 추가되면서 React 앱이 두 화면을 갖게 됐다.
현장 실행 모델은 정적 파일 서빙(`python http.server`·nginx)이라 서버 측 라우팅이
없고, 새 npm 런타임 의존(react-router 등)은 AGENTS §4-9 이스케이프 대상이다.
또한 필터 상태는 이미 URL 쿼리스트링이 소유한다(`useFilters` —
`history.replaceState`로 동기화).

## 결정

**해시 라우팅**을 자체 훅(`web/src/hooks/useRoute.ts`, ~40줄)으로 구현한다:

- 기본(해시 없음) = GPU/SQream 화면, `#/llm` = GPU/LLM 화면. `hashchange` 구독으로
  뒤로가기를 지원하고, GPU 복귀 시엔 `replaceState`로 `#` 잔재 없이 해시를 지운다.
- **역할 분리**: 쿼리스트링 = 필터 상태(useFilters 소유), 해시 = 화면 식별(useRoute
  소유). 두 축은 직교한다.
- **선행 수정 1줄**: `useFilters`의 replaceState가 URL을 해시 없이 재조립해 필터
  변경마다 `#/llm`이 지워지는 충돌이 있었다 — `${pathname}${search}${location.hash}`로
  해시를 보존한다(회귀 테스트 포함).
- 정적 서버 관점에서 해시는 요청 경로에 포함되지 않으므로 어떤 서빙 모드에서도
  단일 `index.html`로 동작한다(별도 rewrite 불필요).

## 대안

1. **react-router 도입** — 기각: 런타임 의존 추가(번들·망분리 반출·라이선스 검토)가
   두 화면 전환이라는 요구에 과하다. §4-9 이스케이프를 열 사유가 없다.
2. **쿼리 파라미터 라우팅(`?view=llm`)** — 기각: `searchFromState`가 알려진 키만
   재조립하므로 `view`를 DashboardState에 편입해야 하고, 필터 리셋(`reset()`)이
   화면 전환까지 되돌리는 결합이 생긴다. 해시는 이 결합이 없다.
3. **별도 HTML 진입점(2페이지 빌드)** — 기각: 사이드바·필터 상태 공유가 페이지 전환마다
   끊기고, 반출 산출물·서빙 구성이 복잡해진다.

## 결과

- 화면별 훅 분리(`useLlmData`/`useLlmCharts`/`useLlmRangeDetail`)와 결합해
  **비마운트 화면은 폴링하지 않는다**.
- 필터 상태(인스턴스·GPU·시간범위)는 두 화면이 공유한다. LLM 화면은 GPU 단위라
  MIG 필터를 렌더하지 않고 `llm_*` 셀렉터가 mig를 소비하지 않는다 — URL의 `mig=`
  잔존값은 LLM 화면에서 무시된다(문서화된 동작).
- 새 화면 추가 시 `Route` 유니온과 셸 분기만 늘리면 된다 — 상세 화면(GPU 상세 등)
  확장 여지가 열려 있다.
