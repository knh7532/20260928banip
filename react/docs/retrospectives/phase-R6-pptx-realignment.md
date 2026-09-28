# Phase R6 회고 — PPTX 디자인 재정렬 + 동적 시뮬레이션 가시화

- 날짜: 2026-07-17
- 배경: 인간 지적 ① 디자인이 PPTX 취지(선택 인스턴스 중심)와 다름 ② 동적 시뮬레이션
  패턴이 화면에서 읽히지 않음. ADR R-0005에 결정 기록.

## 무엇을 했나

- PPTX를 PowerPoint COM으로 PNG 렌더해 실제 시안을 확보, 형제 프로젝트
  `gen_dashboard.py`(검증된 Grafana 재현)를 기계가독 스펙으로 삼아 차이를 도출.
- 인스턴스 선택(카드 버튼·`selectInstance` 토글·제목 접미사), 타임라인(단일 시
  GPU-0~3 행·적응 높이·세그먼트 쿼리명 라벨), 시계열(하단 공유 범례·인셋 제거),
  서버 카드(원형 링 게이지 4단·임계색·전력 max 1600), RangeDetail ×, 그리드 비율
  보정(1.26fr / 3.16fr). PromQL·데이터 계층 불변.
- 선행으로 d3 v7/vite 8 툴체인 마이그레이션을 ADR R-0002 개정과 함께 커밋.

## 결과

- 테스트 218 passed / 9 skipped (R5 종료 시점 168 → +50). verify(lint·typecheck·
  커버리지 perFile 80/80/70)·build 통과.
- App 지역 selection state를 `useRangeSelection` 훅으로 승격(계층 규칙과 정합,
  App.tsx 함수 커버리지 회복).
- 도달 불가 방어 가드는 `/* v8 ignore next */` + 사유 주석으로 처리(6곳).

## Human Check Items

- **HCI-R4-1 (픽셀 충실도) — 종결**: PPTX 렌더와 나란히 대조하는 라이브 E2E로 확인.
- **HCI-R4-4 (DES-1 색 스왑) — 종결**: 인간 결정으로 계약(query_type) 기준 유지 확정.
- **HCI-R6-1 (신규, 비차단)**: c3 fullCircle 링의 중앙 값 텍스트 위치는 jsdom에서
  검증 불가 — 라이브 브라우저에서 육안 확인(어긋나면 `.c3-chart-arcs-title` CSS 보정).

## 배운 점

- c3 `color.threshold`는 `unit:"value"`를 명시하지 않으면 경계값을 max 대비 %로
  해석한다 — 전력(max 1600) 게이지가 조용히 오동작하는 함정. 유닛 테스트로 고정.
- PPTX 같은 시안 문서는 내부 모순(필터 All vs 제목 선택 인스턴스)과 시점 값 색상을
  담고 있다 — 규칙(임계·필터 파생)을 우선하고 해석을 ADR에 기록하는 것이 맞다.
