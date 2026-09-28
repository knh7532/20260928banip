# Phase E5 codex 리뷰 — 차트 엔진 ECharts 통일 (C3·D3 제거)

- 실행: 2026-09-07 · `codex exec --sandbox read-only --skip-git-repo-check -c model_reasoning_effort=medium` (codex-cli 0.147.0)
- 스코프: `src/lib/{echartsTheme,gaugeOption,xviewOption,timelineOption}.ts`, `src/screens/drilldown/{chartBrushModel.ts,ChartBrush.tsx}`,
  `src/components/charts/{Gauge,XViewChart,Timeline}.tsx`, `src/hooks/{useEchart,useChartResize}.ts`, `src/styles/{app,drilldown}.css`,
  `tests/setup.ts`, `tests/{xview*,timeline*,chartBrush,gauge*,charts,drilldown.contract}.test.*`, `package.json`
  (diff 패킷 = `ef6973f^..3c0190d`, 46 파일 +2,836/−1,954). 제외: python/·prometheus/·grafana/·agent/·docs/.
- 깨뜨리라고 준 불변식 8종: props/DOM 계약 · 콜백 재진입 없음 · 지연 마운트 init · 기하 재현(letterbox·scaleBand·4/40) ·
  5s 폴링 안전(시리즈 누적·드래그 생존·고정 툴팁) · 토큰만 사용 · 동어반복 테스트/커버리지 · c3/d3 잔재.

## 결과 (r1) — blocking 0 · major 0 · minor 1

| ID | severity | file:line | failure | evidence | fix |
|---|---|---|---|---|---|
| E5-01 | minor | `src/components/charts/XViewChart.tsx:219` | 드래그 건수 라벨 상자가 차트 스케일(k)을 안 따른다 — 460×200 이 아닌 상자(예 920×400, k=2)에서 글자 10px/높이 16px 그대로, 세로 letterbox 에서는 위치 판정이 `oy` 를 무시해 영역 위로 벗어날 수 있다 | 기하는 `k·ox·oy` 로 스케일·중앙 정렬되지만 `tw`·17px 오프셋·`XV_MARGIN.top` 비교와 `.xvo-count` 의 10/16/6px 가 고정 CSS 픽셀. SVG 시절엔 viewBox 단위라 함께 스케일됐다 | 라벨 치수를 `geo.k` 로 스케일, 비교 기준을 `geo.plot.y0` 로, 글자/높이/패딩을 인라인 스타일로 |

Not found (검사 후 이상 없음): 컴포넌트 props·필수 DOM 구조 변경 / ChartBrush·Timeline 지연 데이터 초기화 실패 / 인스턴스 재생성·시리즈 누적·dispose 불균형 / selection·zoom 콜백 재진입 / X-View 드래그 상태·고정 툴팁 폴링 회귀 / 타임라인 scaleBand·여백·행 높이·brush 범위 계산 / 브러시 미니맵 4/40 패딩 / 폴백 토큰·c3/d3 import·죽은 셀렉터 / package.json 의존성 불일치.

비고: 리뷰어가 `tsc` 는 통과시켰고 vitest 는 read-only 샌드박스에서 `node_modules/.vite-temp` 생성 불가로 실행하지 못했다(우리 게이트에서 855 통과 — resolution 참조).
