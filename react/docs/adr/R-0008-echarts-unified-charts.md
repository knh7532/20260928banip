# ADR R-0008: 차트 엔진을 Apache ECharts 하나로 통일 (C3·D3 제거)

- 상태: **Accepted** (인간 승인 — 차트별 시안 승인 4건, 2026-09-07)
- 날짜: 2026-09-07
- 대체: **ADR R-0002**(C3 + D3, d3 v5/v7 격리 규칙)를 Superseded 로 만든다.

## 컨텍스트

E1(2026-08-24)에서 시계열 라인 차트가 ECharts 5.6 으로 옮겨진 뒤에도 화면에는 차트 엔진이
셋 공존했다: ECharts(라인), C3 0.7.20(서버 게이지 12개), D3 v7(타임라인 간트·X-View 산점도·
드릴다운 미니맵 브러시). 그 결과 ① 번들에 d3 가 두 벌(앱 v7 + C3 중첩 v5) ② 툴팁·축·
crosshair 규약이 엔진마다 달라 통일 스펙(E4)이 라인 차트에만 적용 ③ 테스트가 세 방식
(C3 config 캡처·SVG DOM·ECharts 스텁)으로 갈라져 있었다. 인간이 "llm_gpu_top_view_mockup 의
그래프를 현재 디자인 그대로 apache-echarts 로" 바꾸되 **시안을 먼저 보고 승인**하는 절차를
요구했다(작업 대상은 `transplant/react`).

## 결정

1. **단일 엔진**: 모든 차트는 Apache ECharts 5.6, **canvas 렌더러**. C3·D3 는 의존성에서 제거한다.
2. **옵션은 순수 빌더, 컴포넌트는 얇게**: `lib/echartsOption.ts`(라인) 패턴을 따라
   `gaugeOption.ts`·`xviewOption.ts`·`timelineOption.ts`·`chartBrushModel.ts` 가 `EChartsOption` 을
   만들고 단위 테스트가 옵션 객체를 대사한다. 컴포넌트는 `useEchart`(init 1회·dispose·resize)
   + `setOption(…, {replaceMerge:["series"]})`, `animation:false`(5s 폴링).
3. **색·타이포는 기존 토큰만**: canvas 는 CSS 변수를 못 읽으므로 `lib/echartsTheme.ts` 가
   `tokens.css` 값을 런타임에 1회 읽고, 폴백은 같은 hex. 신규 색 토큰 없음(design-tokens.md).
4. **현행 디자인 픽셀 재현**: SVG viewBox 스케일(X-View 460×200 meet, 타임라인 1000 폭 비례)을
   k 계수로 재현해 글자·점·행 높이·여백이 같은 픽셀에 놓이게 한다. d3 축 눈금은 `niceTicks`
   (1·2·5 배수, 값 축은 상한 미포함)로 재현하고 `axisLabel.customValues` 로 명시한다.
5. **상호작용 규약**: 툴팁은 ECharts 내장 대신 기존 포털(X-View)·네이티브 title(타임라인,
   A안)을 유지. 구간 선택은 ECharts `brush lineX`(툴박스 없이 `takeGlobalCursor`), 외부 선택
   반영은 `dispatchAction brush areas`(brushEnd 는 사용자 mouseup 에만 와 재발화 없음).
   X-View 2D 드래그는 문서 레벨 상태기계 + HTML 오버레이(영역·건수 라벨) 그대로.
6. **지연 마운트 규칙**: 데이터가 늦게 오는 차트(드릴다운 브러시·타임라인)는 canvas 를
   **데이터가 생긴 뒤 마운트되는 내부 컴포넌트**가 만든다 — `useEchart` init 은 마운트 1회라
   바깥에서 null 을 먼저 반환하면 영영 만들어지지 않는다(D3 판의 "g 마운트 뒤 브러시 생성"과
   같은 함정, D3 단계에서 실사고).
7. **테스트 규약**: jsdom 은 canvas 가 없어 `tests/setup.ts` 의 전역 echarts 스텁(`on/emit`·
   `getZr`·`dispatchAction`·`lastOption`)으로 배선을 보고, "무엇을 그리나"는 옵션 빌더 테스트가
   본다. 렌더 테스트는 시리즈 데이터·renderItem 도형·스텁 이벤트 단언으로 재작성했다.

## 진행 (시안 우선)

| 단계 | 내용 | 승인 | 커밋 |
| --- | --- | --- | --- |
| D0 | 공용 기반(echartsTheme·useEchart·스텁 확장) + 시안 페이지 `#/design/echarts` | — | E5 D0 |
| D1 | 서버 게이지 | 2026-09-07 | E5 D1 |
| D2 | X-View 산점도 (letterbox 기하·d3 눈금·2D 드래그) | 2026-09-07 | bf5e068 → 848a686 |
| D3 | 드릴다운 브러시 (지연 마운트·미니맵 잘림 수정 포함) | 2026-09-07 | 22f1c5b → b706f3b·5431519 |
| D4 | 타임라인 GPU/SQream·GPU/LLM (타임라인 불가침 해제) | 2026-09-07 | f7b11b9 → 302da23 |
| D5 | 시안 페이지·C3/D3·CSS·목 제거, 문서 | — | 본 ADR 커밋 |

## 결과

- 의존성: `c3`·`d3`·`@types/c3`·`@types/d3` 제거. 번들 `index.js` 1,421 kB(gzip 458 kB) — d3 두 벌·C3 가 빠졌고
  ECharts 는 이미 포함돼 있었다.
- 테스트 57 파일 855 통과(시안 관련 테스트 제거 후), 파일별 커버리지 미달은 기존 10파일 그대로
  (신규 차트 파일은 전부 임계 이상).
- 알려진 시각 차이(승인 시 고지): 게이지의 C3 옅은 외곽 호 없음·전력 값 가운데 정렬 / 브러시·
  타임라인 선택 영역 테두리가 사각 전체(d3 는 좌우만)·d3 손잡이 글리프 없음(양끝 끌기는 가능) /
  타임라인 막대 위에서 드래그를 시작하면 구간 선택이 시작됨(d3 는 무시).
- 함께 고친 기존 문제: 드릴다운 260px 차트 상자 안에서 미니맵이 잘려 보이지 않던 레이아웃
  (`.sqm-chart:has(> .sqm-brush) > .metric-chart { height: calc(100% - 48px) }`).

## 대안 검토

- **ECharts dataZoom(inside/slider)**: X-View 줌·팬 모델(XViewPanel 이 절대 ms 창을 소유)과
  드릴다운 zoom 모델과 충돌해 기각 — brush + 외부 상태 유지.
- **SVG 렌더러**: DOM 테스트 이점이 없고(클래스 미부여) 12 게이지·24행 간트에 canvas 가 유리 — 기각.
- **yAxis category 로 행 배치**: d3 scaleBand(padding .25) 와 3% 어긋나 픽셀 재현이 깨짐 — custom
  시리즈가 행 y 를 직접 계산.

## 영향

- AGENTS.md §0.1 기술 스택 문구·§4-9 런타임 의존 규칙 갱신(d3 격리 규칙 폐기 → "차트 의존성은
  ECharts 하나, 추가 엔진 도입은 이스케이프").
- plan.md: Phase E5 절 + §7 승인 4행(타임라인 불가침 해제 포함).
- design-tokens.md: canvas 차트는 `echartsTheme.ts` 로 토큰을 읽는다(신규 색 없음).
