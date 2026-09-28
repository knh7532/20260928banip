# Dashboard·PPTX Sidebar Visual Realignment Implementation Plan

> **For Hermes:** 인간 승인 후 이 계획을 task-by-task로 구현한다. 승인 전에는 소스·보호 문서·수락 기준을 수정하지 않는다.

**Goal:** `top_view_react`의 본문 대시보드 디자인·카드 배치를 `top_view_mockup` Grafana 대시보드와 맞추고, 좌측 사이드 탭은 `서류/gpu_dashboard.pptx`의 AX Portal 사이드바와 시각적으로 맞춘다.

**Architecture:** 데이터 조회·필터·차트 로직과 TV-C1 계약은 변경하지 않는다. 본문은 Grafana 24-column/34-row 배치 계약을 CSS Grid로 옮기고, 사이드바는 PPTX의 1600×900 기준 폭·라운드 실루엣·탭 계층·서버 카드 스택을 별도 스타일 경계로 재현한다. 외곽 shape와 내부 스크롤을 분리하고, C3 차트는 브라우저 기본 `ResizeObserver`로 컨테이너 크기 변경에 대응한다. 신규 런타임 의존성은 추가하지 않는다.

**Tech Stack:** React 18, TypeScript 5.9, CSS Grid/Flexbox, C3 0.7.20, D3 v7, native ResizeObserver, Vitest, Testing Library, Vite.

---

## 1. 기준 자료와 측정값

### 1.1 본문 Dashboard 기준 — 참조 전용

`../top_view_mockup/grafana/provisioning/dashboards/json/top-view.json`

| 구역 | Grafana gridPos | React 목표 |
|---|---|---|
| 실행 쿼리 / 성능 테이블 | `13×7` + `11×7` | 상단 `13/24 + 11/24`, 같은 높이 |
| 타임라인 | `18×11` | 중단 좌측 `18/24`, 중단 전체 높이 기준 |
| 시간 구간 / 선택 상세 | `6×2` + `6×9` | 중단 우측 `6/24`, 세로 `2/11 + 9/11` |
| 시계열 4종 | 각 `18×4`, 총 `18×16` | 하단 좌측 4개 동일 높이 스택 |
| 서버 게이지 3종 | 각 `2×16` | 하단 우측 `2/24 + 2/24 + 2/24`, 좌측 총높이와 정렬 |

본문은 세로 스크롤을 허용한다. 1600×900 viewport에 전체 34-row를 억지로 축소하지 않고, top/middle/bottom의 내부 높이 비율과 좌우 하단 정렬을 보존한다. 시각 증거는 viewport 캡처와 full-page 캡처를 모두 남긴다.

### 1.2 Sidebar 기준 — 참조 전용

- 파일: `../서류/gpu_dashboard.pptx`
- PPTX SHA-256: `2456ceab9a09aa49174112d17e9c6f4ae99878984a470b67e2a992bd1ba092d6`
- 기준: slide 1
- 확인 방법:
  - 텍스트: `python -m markitdown ../서류/gpu_dashboard.pptx`
  - 시각: Windows PowerPoint COM으로 slide 1을 PNG 1600×900으로 export
- 검증된 렌더: `1600×900`, SHA-256 `f4fe83a7f566e6ced9956e2562d77846db5bbc984a7ebae764fa4f7c62a18d46`
- 측정 기준:
  - sidebar 약 200px/1600px = 12.5%
  - `#0E1420` 계열 표면, 우측 상·하단 큰 라운드 실루엣
  - AX Portal 로고 → Overview 그룹 → Alert 그룹 → separator → GPU 서버 목록
  - 활성 탭은 파란 배경 바, 하위 탭은 들여쓰기, 서버 카드 3개 fixture는 세로 스택
  - 현행 `src/api/queries.ts`의 `NODES` 3대가 dashboard gauge와 sidebar server card의 공통 고정 도메인이다. 이번 시각 정렬에서는 API/hook/서버 발견 방식은 바꾸지 않으며, 정확히 3개 카드를 PPTX 순서로 표시한다.

### 1.3 현재 구현 경로

- 셸/배치: `src/App.tsx`, `src/styles/app.css`
- 토큰: `src/styles/tokens.css`, `docs/design-tokens.md`, `tests/tokens.contract.test.ts`
- sidebar: `src/components/Sidebar.tsx`
- panel: `src/components/Panel.tsx`
- charts: `src/components/charts/{MetricStrip,MetricChart,ServerGauges,Gauge}.tsx`

## 2. 범위와 고정 결정

### 비변경 범위

- `src/api/**`, `src/hooks/**`, PromQL, 필터 URL 상태, 폴링, 데이터 포맷은 변경하지 않는다.
- `../top_view_mockup/**`와 `../서류/gpu_dashboard.pptx`는 수정하지 않는다.
- sidebar 타 메뉴는 표시만 하고 비활성으로 유지한다.
- 서버 도메인은 현행 `NODES` 3대를 유지하며 `src/api/**`, `src/hooks/**`는 변경하지 않는다. sidebar와 dashboard gauge 모두 동일한 세 서버를 사용한다.
- 새 npm 패키지, SSR, 서버 프록시, 런타임 Node 요구사항을 추가하지 않는다.

### 반응형·스크롤 정책

- `>= 1366px`: 24-column 배치를 그대로 사용한다.
- `< 1366px`: sidebar는 최소 176px를 유지하고, `.content`만 가로 스크롤 소유자가 된다. 내부 `.dashboard-canvas`는 `min-width: 1120px`를 유지한다.
- `body`와 `.app-shell`에는 가로 스크롤을 만들지 않는다.
- sidebar 외곽 `<aside>`는 radius/background/clip만 담당하고, 신규 `.sidebar__scroll` 내부 래퍼가 `overflow-y: auto`를 담당한다.
- 각 viewport는 최초 로드와 실행 중 resize를 모두 지원한다. C3 `ChartAPI.resize()`는 ResizeObserver에서 호출하되 data polling 시 generate를 반복하지 않는다.

### 세로 34-row 정책

- `--dashboard-row-unit: 24px`로 고정하고 section gap은 row 높이에 포함하지 않는다.
- 브라우저별 CSS 곱셈 지원 차이를 피하려고 `--dashboard-top-h:168px`, `--dashboard-middle-h:264px`, `--dashboard-bottom-h:384px`를 실제 grid 높이로 쓴다. token contract가 각 값을 `24px × 7/11/16`으로 대사한다.
- section 사이에는 `--dashboard-gap` 8px를 별도로 둔다. dashboard section 총높이는 832px(168+264+384+16)이며 header/filter를 포함한 main은 세로 스크롤된다.
- table row가 top 168px를 넘으면 top panel은 늘어나지 않고 `.table-scroll` 내부만 세로 스크롤한다. timeline/detail/metric/gauge도 section 바깥으로 확장하지 않는다.

## 3. 수락 기준

1. 1600×900에서 sidebar가 PPTX와 유사한 약 12.5% 폭과 큰 우측 라운드 외곽을 가지며 메뉴 계층·separator·서버 카드 스택이 구분된다.
2. 본문 상단 `13:11`, 중단 `18:6`, 하단 `18+2+2+2` 폭 계약이 유지된다.
3. dashboard section 높이는 gap 제외 `top:middle:bottom = 7:11:16`이며, 중단 우측은 `2:9`, 하단 좌측 4개 metric card와 우측 gauge card는 총높이가 일치한다.
4. 서버 게이지 세 카드는 같은 폭이며 각 카드 내부 4개 게이지는 위→아래 동일 간격으로 쌓인다.
5. panel/table/chart/detail은 Grafana 목업과 유사한 다크 표면·얇은 border·조밀한 header/body 간격을 사용하고 경계 밖으로 넘치지 않는다.
6. 1366×768에서 24-column을 유지하며 겹침이 없고, 1024×768에서는 `.content`에만 가로 스크롤이 생기며 sidebar/body에는 생기지 않는다.
7. 브라우저 resize 시 C3 chart/gauge가 컨테이너 폭에 맞춰 resize되고 generate는 최초 1회만 호출된다.
8. 기존 접근성 계약(`aria-current`, `aria-disabled`, server button/`aria-pressed`, panel heading/region)이 유지된다. 장식 separator는 `aria-hidden`, 의미 separator는 `role="separator"` 중 하나로 명시한다.
9. 현행 `NODES` 3대가 sidebar와 하단 gauge에 같은 순서로 각각 3개 표시되고, 20자 이상 서버명 fixture에서도 badge가 눌리지 않으며 이름 overflow 정책이 일관된다.
10. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage`, `npm run build`가 모두 exit 0이다.
11. `docs/evidence/R8/`에 PPTX 기준, Grafana 기준, React 1600×900·1366×768·1024×768 viewport/full-page 증거를 남기고 최소 1회 fix-and-verify를 기록한다.
12. 미해결 Blocking/Major 0, Rejected/Escalated 인간 판정 완료, 최종 디자인 인간 승인 전에는 phase 완료로 간주하지 않는다.

## 4. 구현 작업

### Task 0: 프로젝트 거버넌스 게이트 등록 — 인간 승인 후 수행

**Objective:** R8 작업을 기존 닫힌 phase workflow에 등록한다.

**Files:**
- Modify: `docs/plan.md` — Phase R8, 체크박스형 수락 기준, 증거 경로 추가
- Create: `docs/reviews/phase-R8-codex-review.md`
- Create: `docs/reviews/phase-R8-codex-resolution.md`
- Create: `docs/retrospectives/phase-R8-dashboard-sidebar-realignment.md`

**Steps:**
1. 사용자가 본 계획을 승인한 뒤에만 보호 문서 `docs/plan.md`를 수정한다.
2. 본 문서의 12개 수락 기준을 Phase R8 체크박스와 1:1 연결한다.
3. 구현 종료 시 codex review → resolution → 재리뷰 → retrospective 순서를 강제한다.
4. 계획·교차 검토 SHA, reviewer audit, adjudication, 인간 승인 시각을 R8 기록에 남긴다.

### Task 1: 의미 있는 DOM 레이아웃 계약을 RED로 고정

**Files:**
- Modify: `tests/app.test.tsx`
- Modify: `tests/components.test.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `docs/design-tokens.md`
- Modify: `tests/tokens.contract.test.ts`
- Create: `tests/layout.contract.test.tsx`

**Steps:**
1. Task 2보다 먼저 `tokens.css`/`docs/design-tokens.md`에 `--dashboard-row-unit:24px`, section 높이 `168/264/384px`, `--dashboard-gap:8px`, `--dashboard-min-w:1120px`를 추가한다. token contract는 section 높이÷row unit이 각각 7/11/16인지 대사하여 후속 layout test의 전제를 만든다.
2. `.dashboard-canvas`, `.dashboard-top`, `.dashboard-middle`, `.dashboard-bottom`의 부모/자식 구조를 기대하는 실패 테스트를 작성한다.
3. top=두 table, middle=timeline+detail column, bottom=metric stack+server gauges가 올바른 wrapper에 있는지 단언한다.
4. sidebar section/scroll wrapper/separator와 기존 ARIA 계약을 단언한다.
5. 현행 3개 서버 fixture와 긴 이름 fixture를 추가하고 sidebar/gauge의 동일 순서 매핑을 단언한다. 0/1/4+ 동적 발견은 이번 범위가 아니다. 레이아웃 픽셀은 jsdom이 아닌 browser QA로 검증한다.
6. 20행 이상의 table fixture에서 `.table-scroll` wrapper가 존재하고 panel 외곽과 분리되는 DOM 계약을 RED로 추가한다.
7. Run: `npm run test -- tokens.contract layout.contract components app`
8. Expected: 신규 구조·overflow 단언은 FAIL, 기존 기능 단언은 PASS.


### Task 2: App을 명시적 Grafana 3구역 grid로 재구성

**Files:**
- Modify: `src/App.tsx:53-92`
- Modify: `src/styles/app.css`

**Steps:**
1. header/filter/banner와 dashboard section을 감싸는 `.dashboard-canvas`를 추가한다.
2. `.dashboard-top`: `minmax(0,13fr) minmax(0,11fr)`.
3. `.dashboard-middle`: `minmax(0,18fr) minmax(0,6fr)`; `.detail-col`: `grid-template-rows: minmax(0,2fr) minmax(0,9fr)`로 gap 제외 2:9를 보존한다.
4. `.dashboard-bottom`: `minmax(0,18fr) minmax(0,6fr)`; metric stack과 gauge region 총높이를 stretch로 맞춘다.
5. `.dashboard-top/.dashboard-middle/.dashboard-bottom`에 각각 `--dashboard-top-h/middle-h/bottom-h`를 적용하고 section gap은 계산 밖에 둔다.
6. table 데이터가 많을 때 `.table-scroll`만 세로 스크롤하고 section/panel 외곽 높이는 변하지 않도록 한다.
7. 세 구역에 공통 `--dashboard-gap`, `min-width:0`, 명시적 overflow 정책을 적용한다.
8. Run: `npm run test -- layout.contract app`; Expected PASS.

### Task 3: Grafana형 panel/card/table 밀도 정렬

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/app.css`
- Modify: `src/components/charts/MetricStrip.tsx`
- Modify: `src/components/charts/ServerGauges.tsx`
- Modify: `src/components/charts/Timeline.tsx`
- Modify: `docs/design-tokens.md`
- Modify: `tests/tokens.contract.test.ts`

**Steps:**
1. Task 1에서 선행 추가한 dashboard row/gap/min-width token에 `--sidebar-w/min/max`와 panel radius 토큰을 보강한다.
2. panel header/body, table row/header, timeline, metric card, gauge card의 padding·border·surface를 Grafana 목업과 맞추고, top table은 `.table-scroll` 내부 overflow만 허용한다.
3. 384px bottom 내부에서 `.metric-stack`은 `repeat(4,minmax(0,1fr))`, `.server-gauges`는 3개 동일 column, 각 `.gauge-card__stack`은 `repeat(4,minmax(0,1fr))`로 만들고 각 chart container에 `min-height:0;height:100%`를 부여한다. C3의 고정 높이 제거와 실제 크기 전달은 Task 6에서 수행한다.
4. 공유 metric legend는 다섯 번째 grid row를 만들지 않도록 panel 바깥 흐름에서 제거하고, 접근 가능한 compact overlay(마지막 panel 내부 absolute layer + reserved padding)로 유지한다.
5. 264px middle에서 Timeline panel body를 `minmax(0,1fr) auto`로 나누고 plot만 감싸는 `.timeline__plot-scroll {min-height:0; overflow-y:auto}`를 추가한다. 행 수 기반 SVG natural height는 유지하되 legend와 panel 외곽은 고정한다.
6. `tests/tokens.contract.test.ts`의 문서↔CSS 양방향 대사를 확장하고, component/layout tests에 timeline plot wrapper·legend overlay flow 계약을 추가한다.
7. Run: `npm run test -- tokens.contract layout.contract components`; Expected PASS. 이 단계에서는 기존 C3 고정 높이 테스트를 아직 바꾸지 않는다.

### Task 4: PPTX형 sidebar 구조·외곽/스크롤 분리

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/styles/app.css`
- Modify: `tests/components.test.tsx`

**Steps:**
1. `<aside class="sidebar">` 안에 `.sidebar__scroll`을 추가한다. 외곽 aside는 radius/clip/background, 내부 wrapper는 scrolling/padding을 담당한다.
2. logo, Overview, Alert, server section을 `aria-labelledby` 가능한 section으로 정돈한다.
3. separator의 접근성 의미를 명시하고 테스트한다.
4. active/linked/disabled 상태는 현재 ARIA 의미와 click 범위를 유지한다.
5. 긴 서버명에는 `min-width:0` + `overflow-wrap:anywhere` 또는 ellipsis 중 하나를 고정하고 badge는 `flex:0 0 auto`로 둔다.
6. 서버 배열을 slice/reorder하지 않고 현행 3개 도메인의 순서를 gauge와 동일하게 유지한다. sidebar 높이가 짧을 때는 `.sidebar__scroll`로 세 카드에 접근한다.
7. Run: `npm run test -- components`; Expected PASS.

### Task 5: PPTX sidebar 시각 토큰 적용

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/app.css`
- Modify: `docs/design-tokens.md`
- Modify: `tests/tokens.contract.test.ts`

**Steps:**
1. sidebar 폭 `clamp(176px,12.5vw,208px)`, 우측 radius 약 32px, 본문과 구분되는 surface를 적용한다.
2. PPTX의 원형 blue logo mark, group label 대비, active bar, sub indentation, separator, server card/pill 상태를 재현한다.
3. 1600×900에서 현행 server fixture 3개가 모두 보이도록 간격을 맞추고, 세로가 짧은 viewport에서는 `.sidebar__scroll`만 스크롤된다.
4. `:focus-visible`을 유지하고 불필요한 motion은 추가하지 않는다.
5. Run: `npm run test -- tokens.contract components`; Expected PASS.

### Task 6: C3 container resize 지원

**Files:**
- Modify: `src/components/charts/MetricChart.tsx`
- Modify: `src/components/charts/Gauge.tsx`
- Modify: `src/components/charts/MetricStrip.tsx`
- Modify: `src/components/charts/ServerGauges.tsx`
- Modify: `src/lib/c3config.ts`
- Modify: `tests/c3config.test.ts`
- Modify: `tests/charts.test.tsx`
- 필요 시 Create: `src/hooks/useChartResize.ts`

**Steps:**
1. native `ResizeObserver`로 chart container의 width와 height 변화를 관찰하고 `chart.resize({width,height})`를 호출한다.
2. 0-width 초기 관찰과 unmount 후 callback을 방어한다.
3. polling data update는 기존 `load`, viewport resize는 `resize`, chart 생성은 최초 1회라는 책임을 유지한다.
4. `MetricStrip`의 `CHART_H=128`, `ServerGauges`의 `GAUGE_H=96` 고정 상수와 필수 height prop을 제거한다. `MetricChart`/`Gauge`는 부모가 배정한 실제 높이를 쓰며 0 이하 크기는 무시한다. `src/lib/c3config.ts`와 `tests/c3config.test.ts`의 초기 size 계약도 container-driven 초기값과 일치하도록 함께 수정한다.
5. mock ChartAPI에 `resize`를 추가하고 width+height 전달, generate 1회, observer disconnect cleanup, fixed 128/96 상수 제거를 테스트한다.
6. Run: `npm run test -- c3config charts`; Expected PASS.

### Task 7: 고정 반응형/overflow 정책 구현

**Files:**
- Modify: `src/styles/app.css`
- Modify: `tests/layout.contract.test.tsx`

**Steps:**
1. `.app-shell`/body는 가로 overflow를 숨기고 `.content`만 `overflow:auto`로 둔다.
2. `.dashboard-canvas`는 `min-width:1120px`; 1366 이상에서는 사용 가능 폭을 채운다.
3. sidebar는 `clamp` 폭과 최소 176px를 유지한다.
4. CSS 문자열 테스트는 정확한 grid/token/scroll-owner 계약에만 한정한다. 실제 크기·겹침은 browser evidence로 판정한다.
5. Run: `npm run test -- layout.contract`; Expected PASS.

### Task 8: 재현 가능한 visual QA와 전체 게이트

**Files:**
- Create: `docs/evidence/R8/README.md`
- Create: `docs/evidence/R8/*.png`
- Create: `docs/evidence/R8/measurements.json`
- Create: `scripts/capture-r8.mjs`
- Create: `.eslintignore` (QA helper만 제외; 별도 `node --check` 적용)
- Create: `docs/reviews/phase-R8-codex-review.md`
- Create: `docs/reviews/phase-R8-codex-resolution.md`
- Create: `docs/retrospectives/phase-R8-dashboard-sidebar-realignment.md`
- 새 반응형 결정이 기존 ADR R-0006에 없을 때만 Create: `docs/adr/R-0007-dashboard-sidebar-scroll-policy.md`

**Steps:**
1. 저장소 루트 `D:/company/hynix_practice`의 Git Bash에서 전체 게이트를 실행한다:
   - `npm --prefix top_view_react run lint`
   - `npm --prefix top_view_react run typecheck`
   - `npm --prefix top_view_react run test`
   - `npm --prefix top_view_react run test:coverage`
   - `npm --prefix top_view_react run build`
2. 형제 native stack은 저장소 루트에서 다음 실제 경로로 실행·검증한다. credential은 `top_view_mockup/.env`에서 스크립트가 읽게 하고 evidence에 값을 기록하지 않는다.
   - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File top_view_mockup/native/start-native.ps1`
   - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File top_view_mockup/native/verify-native.ps1`
   - 종료 시 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File top_view_mockup/native/stop-native.ps1`
3. 기준 상태를 고정한다: single instance `gpu-server-01`, GPU All, Last 30 minutes, 5s refresh, timeline/detail 데이터가 렌더된 뒤 캡처한다.
4. 같은 저장소 루트에서 `npm --prefix top_view_react run preview -- --host 127.0.0.1 --port 4173 > top_view_react/docs/evidence/R8/preview.log 2>&1 & PREVIEW_PID=$!`로 시작하고, `trap 'kill $PREVIEW_PID 2>/dev/null || true' EXIT`를 즉시 등록한다. `curl --fail --retry 30 --retry-delay 1 http://127.0.0.1:4173/`가 성공해야 다음 단계로 이동하며 QA 후 명시적으로 `kill $PREVIEW_PID; wait $PREVIEW_PID || true` 한다.
5. 재현 가능한 CDP QA helper `scripts/capture-r8.mjs`를 만든다. Node built-in `child_process`, `fetch`, 전역 `WebSocket`만 사용해 Chrome `--remote-debugging-port`를 시작하고, viewport/scale 설정 → URL 이동 → 아래 ready expression polling → DOM 측정 → `Page.captureScreenshot` → Chrome 종료를 한 프로세스에서 보장한다. 실패/timeout은 non-zero다.
   - 현재 typed ESLint project가 `scripts/*.mjs`를 포함하지 않으므로 `.eslintignore`에는 `scripts/capture-r8.mjs` 한 파일만 명시하고, 전체 게이트에 `node --check top_view_react/scripts/capture-r8.mjs`를 추가한다. helper 자체 실행 성공도 필수 게이트다.
6. 캡처 브라우저는 설치된 `C:\Program Files\Google\Chrome\Application\chrome.exe`, device scale factor 1, zoom 100%, scrollbar 표시 상태로 고정한다. 각 viewport는 새 임시 profile, zoom 100%, 30초 ready timeout으로 실행한다. Git Bash에서 URL 전체를 단일 인용한다.
   - `node top_view_react/scripts/capture-r8.mjs --url 'http://127.0.0.1:4173/?instance=gpu-server-01&range=1800&refresh=5' --viewports 1600x900,1366x768,1024x768 --modes viewport,full-page --out top_view_react/docs/evidence/R8`
7. React 모드의 helper는 DOM ready(`.panel h2` 정확히 9개, `.c3 svg` 16개 이상, `.timeline__svg` 1개)와 CDP Network 이벤트를 함께 본다. 첫 렌더의 Prometheus `/api/v1/query*` 응답 완료 뒤 refresh interval(5초)+1초를 기다리고 같은 endpoint의 후속 응답 완료를 확인해야 ready로 판정한다. 250ms 간격/최대 30초이며 앱 소스에 QA counter를 넣지 않는다.
8. helper는 동일 CDP `Runtime.evaluate`에서 sidebar/section/child panel/table rect, `scrollWidth/clientWidth/scrollHeight/clientHeight`, computed overflow, sibling overlap을 JSON으로 반환해 `measurements.json`에 자동 저장한다. table overflow 검증은 helper가 캡처 직전에 실제 첫 data row를 DOM에서 24행까지 복제한 격리된 synthetic case로 수행하고, 측정 후 페이지를 reload한다. 앱 URL/API/hook에는 QA 전용 분기를 추가하지 않는다.
9. PowerPoint COM으로 slide 1을 `docs/evidence/R8/reference-pptx-slide1.png`에 재-export하고 SHA를 기록한다. Grafana는 별도 `--target grafana` 모드로 캡처한다. helper가 `top_view_mockup/.env`를 직접 읽어 login form에 입력하되 값은 argv/stdout/log/README에 쓰지 않고, dashboard search API 결과 uid=`tv-gpu-sqream`의 URL을 연다. Grafana readiness는 `/login` 이탈 + dashboard HTTP/API 200 + `top-view.json`의 전체 12개 panel title이 렌더된 `document.body.innerText`에 모두 존재 + loading/test spinner 0개 상태가 500ms 간격으로 2회 연속인 조건이다. 제목 비교 전 JSON/DOM 양쪽의 연속 공백을 하나로 정규화하고, JSON 제목의 `$instance`는 선택값 `gpu-server-01`로 치환해 비교한다. React 전용 selector는 Grafana 모드에 적용하지 않는다. `grafana-1600x900.png`와 React/reference/Grafana side-by-side contact sheet를 생성한다.
10. viewport 모드는 `react-{width}x{height}-viewport.png`를 실제 스크롤 정책 그대로 저장한다. full-page 모드는 중첩 `.content`를 놓치지 않도록 캡처 전 `scrollWidth/scrollHeight`와 sidebar 폭을 측정한 뒤, 증거 전용 Runtime style로 `.content`의 overflow를 visible로 바꾸고 폭/높이를 측정값으로 고정하며 `.app-shell/html/body/#root`를 `sidebarWidth + content.scrollWidth` 및 최대 scrollHeight로 확장한다. 그 후 `Page.getLayoutMetrics().cssContentSize` clip으로 캡처하고 즉시 reload해 원상 복구한다. 확장 전후 dashboard child rect의 폭/높이가 ±2px 이내인지 검사해 재배치가 일어나면 실패한다. 1024 full-page는 숨은 1120px canvas까지 포함하고, 세 폭 모두 `react-{width}-full-page.png` 존재를 helper 종료 조건으로 검사한다.
11. 정량 통과 기준:
   - 1600px sidebar: 200px ± 8px.
   - top left share: gap 제외 usable width의 `13/24` ± 2 percentage points; middle/bottom left share `18/24` ± 2 percentage points.
   - section heights: 168/264/384px 각각 ± 2px; bottom 좌우 총높이 차 ≤ 4px.
   - 1024px에서 `.content.scrollWidth > .content.clientWidth`, body/app-shell/sidebar는 horizontal overflow 없음.
   - sibling panel rectangle overlap 0건, 의도치 않은 clipping 0건. 색/밀도/시각 유사도는 인간 판단 항목으로 분리한다.
12. 20+ row fixture에서 `.table-scroll.scrollHeight > clientHeight`, computed `overflow-y:auto`, top section 168px ±2px, 두 top panel 외곽 높이 차 ≤2px를 추가 통과 기준으로 둔다.
13. 문제를 최소 1건 찾고 수정한 뒤 현재 preview를 종료한다. `node --check`와 Step 1의 전체 lint/typecheck/test/coverage/build 게이트를 다시 실행하고 새 `dist`로 preview를 재시작해 readiness를 재확인한 다음, 영향 viewport/full-page를 재캡처하고 measurements.json을 재생성한다. 마지막 캡처 이후 소스 변경은 허용하지 않는다.
14. codex review/resolution/re-review로 미해결 Blocking/Major 0을 확인하고 retrospective `## Human Check Items`에 최종 디자인 승인을 차단 항목으로 기록한다.

## 5. 변경 예상 파일

- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/charts/MetricChart.tsx`
- `src/components/charts/Gauge.tsx`
- `src/components/charts/MetricStrip.tsx`
- `src/components/charts/ServerGauges.tsx`
- `src/components/charts/Timeline.tsx`
- `src/lib/c3config.ts`
- `src/hooks/useChartResize.ts` (필요 시 신규)
- `src/styles/tokens.css`
- `src/styles/app.css`
- `tests/app.test.tsx`
- `tests/components.test.tsx`
- `tests/charts.test.tsx`
- `tests/c3config.test.ts`
- `tests/layout.contract.test.tsx` (신규)
- `tests/tokens.contract.test.ts`
- `docs/plan.md` (인간 승인 후 Phase R8 등록)
- `docs/design-tokens.md`
- `scripts/capture-r8.mjs`
- `.eslintignore`
- `docs/evidence/R8/**`
- `docs/reviews/phase-R8-codex-{review,resolution}.md`
- `docs/retrospectives/phase-R8-dashboard-sidebar-realignment.md`
- `docs/adr/R-0007-dashboard-sidebar-scroll-policy.md` (신규 결정이 필요한 경우만)

## 6. 위험과 트레이드오프

- **기준 이원화:** main은 Grafana, aside는 PPTX로 스타일 경계를 고정한다.
- **세로 밀도:** 전체 dashboard를 900px에 강제 축소하지 않고 main vertical scroll을 허용한다.
- **작은 화면:** 1024px에서 gauge를 60px대로 찌그러뜨리는 대신 content-only horizontal scroll을 사용한다.
- **C3 resize:** ResizeObserver callback storm을 방지하고 width 또는 height 변화 시에만 resize한다. 테스트에서 cleanup을 강제한다.
- **동적 데이터:** 수치 일치는 범위가 아니며, 같은 Prometheus/필터 상태로 구조적 비교만 수행한다.
- **서버 개수:** 이번 작업은 현행 `NODES` 3대를 그대로 사용한다. 동적 서버 발견은 API/hook 계약 변경이 필요한 별도 범위다.
- **ADR:** 기존 R-0006이 hybrid source 결정을 이미 담고 있으므로 중복 ADR은 만들지 않는다. 새로운 scroll-owner/resize 결정만 R-0007 후보이다.

## 7. 완료 추적표

| 요구사항 | 구현 | 검증 |
|---|---|---|
| Dashboard가 mockup과 유사 | `App.tsx`, `app.css`, `tokens.css` | layout/token tests + Grafana/React evidence |
| top 13:11 | `.dashboard-top` | contract + screenshot measurement |
| middle 18:6, detail 2:9 | `.dashboard-middle`, `.detail-col` | contract + screenshot measurement |
| bottom 18+2+2+2, equal height | `.dashboard-bottom`, metric/gauge CSS | chart tests + full-page evidence |
| sidebar가 PPTX와 유사 | `Sidebar.tsx`, sidebar CSS | component tests + PPTX side-by-side evidence |
| 1366 유지 / 1024 content scroll | `.content`, `.dashboard-canvas` | contract + three viewport evidence |
| C3 live resize | `MetricChart`, `Gauge`, resize hook | `tests/charts.test.tsx` |
| 접근성/고정 3-server 매핑 유지 | `Sidebar`, `ServerGauges`, `Panel` | component/app tests |
| 정적 배포 유지 | build config 무변경 | build + preview |

## 8. 1차 교차 검토 판정(초안 SHA-256 `f576b5ea...9120b`)

| ID | 판정 | 처리 |
|---|---|---|
| B-01 PPTX 미발견 | Rejected | 부모 세션에서 정확한 파일을 검색·MarkItDown·PowerPoint COM render·SHA-256으로 검증했다. §1.2에 증거 반영. |
| B-02 governance/approval 누락 | Accepted | Task 0, R8 review/resolution/retrospective, 인간 승인 전 구현 금지 추가. |
| M-01 vertical grid 누락 | Accepted | 7/11/2+9/4×4/16 높이 계약과 vertical scroll 정책 추가. |
| M-02 responsive 정책 미결정 | Accepted | 1366 breakpoint, 1120px canvas, content-only horizontal scroll로 확정. |
| M-03 jsdom 한계 | Accepted | DOM/token contract와 browser evidence 역할 분리. |
| M-04 QA state 미고정 | Accepted | Prometheus/filter/viewport/load condition/evidence path 고정. |
| M-05 C3 resize 범위 누락 | Accepted | Task 6 및 관련 files/tests 추가. |
| M-06 token test 이름 오류 | Accepted | 기존 `tests/tokens.contract.test.ts` 재사용. |
| M-07 radius+scroll 충돌 | Accepted | aside outer shape와 `.sidebar__scroll` 분리. |
| m-01 ADR 중복 | Accepted | R-0006 유지, 신규 scroll 결정만 R-0007 후보. |
| m-02 separator a11y | Accepted | separator 의미/ARIA 명시. |
| m-03 긴 서버명 | Accepted | min-width/overflow/badge 및 fixture 추가. |
| m-04 서버 3개 단정 | Superseded by §10 | 현행 API/hook 비변경 결정에 맞춰 3-server domain을 명시적으로 유지하고 동적 발견은 별도 범위로 분리. |


## 9. 2차 교차 검토 판정(2차 수정 이력)

| ID | 판정 | 처리 |
|---|---|---|
| R2-01 34-row 세로 계약 연결 부족 | Accepted | 24px row unit, 7/11/16 section 높이, gap 제외 규칙, table 내부 scroll, 수락 기준·Task 2·정량 QA를 연결. |
| R2-02 visual QA 재현/판정 부족 | Accepted | native script 경로, Chrome headless 명령, scale/zoom/viewport, DOM 측정 JSON, 허용 오차를 고정. |


## 10. 3차 교차 검토 판정

- Reviewer: OpenAI Codex CLI 0.144.1 / model `gpt-5.6-sol`
- Session: `019f6c22-2d64-7212-a6a6-753f92dd75be`
- Reviewed plan SHA-256: `1CB6606A12504894E70714C3BE13EA8AD5AD45E7D42E565BE3EEBD0C35F1941F`
- Reviewed at: `2026-07-17T03:19:11+09:00`

| ID | 판정 | 처리 |
|---|---|---|
| B-01 dynamic server contradiction | Accepted | 현행 3-server domain을 명시하고 0/1/4+ 요구를 범위에서 제거. API/hook 비변경과 일치시킴. |
| B-02 review metadata | Accepted | reviewer/model/session/time/full reviewed SHA를 본 절에 기록. |
| M-01 fixed section chart fit | Accepted | MetricStrip/ServerGauges/Timeline을 변경 경로에 추가하고 fixed chart constants 제거, parent-driven width+height resize, timeline internal scroll, legend overlay를 명시. |
| M-02 table overflow verification | Accepted | 20+ rows fixture, scrollHeight/clientHeight/overflow/section-height 측정을 추가. |
| M-03 reproducible visual QA | Accepted | Git Bash 명시, quoted URL, preview lifecycle/readiness, CDP helper, PPTX/Grafana evidence capture를 명시. |
| m-01 task order | Accepted | row/gap token을 Task 1 선행 단계로 이동하고 Task 5 test command 추가. |
