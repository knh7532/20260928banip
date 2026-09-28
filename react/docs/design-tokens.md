# 디자인 토큰 — 원본 시안(`../서류/gpu_dashboard.pptx`) 추출값

이 문서는 **디자인 토큰의 단일 진실 공급원**이며 `src/styles/tokens.css`와 **테스트로 대사**한다(`tests/tokens.contract.test.ts`). 색상은 시안 파일에서 프로그램으로 추출한 실제 값이며 임의로 바꾸지 않는다.

## 1. 색상

### 1.1 배경·표면

| 토큰 | 값 | 용도 (시안 근거) |
| --- | --- | --- |
| `--bg` | `#0E1420` | 페이지 배경 (사이드바 최하단 패널 배경) |
| `--panel` | `#141B2E` | 패널 배경 (가장 많이 쓰인 채움색, 13회) |
| `--panel-alt` | `#1A2338` | 패널 내부 보조 면 (12회) |
| `--panel-sel` | `#1B2A47` | 사이드바 선택 메뉴 배경 |
| `--border` | `#232D45` | 패널 테두리 (15회) |

### 1.2 텍스트

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--text` | `#FFFFFF` | 본문·강조 (32회) |
| `--text-2` | `#9098AC` | 보조 라벨 (49회 — 가장 많음) |
| `--text-3` | `#5C6579` | 흐린 캡션 (27회) |
| `--text-on-accent` | `#0A0F1E` | 밝은 배지 위 글자 |

### 1.3 상태·강조

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--ok` | `#4ADE80` | 정상 배지 글자, 정상 상태 |
| `--ok-bg` | `#163526` | 정상 배지 배경 |
| `--warn` | `#FBBF24` | 경고 테두리 |
| `--danger` | `#F87171` | 위험 |
| `--accent` | `#22D3EE` | 강조(시안) |
| `--link` | `#5B9BFF` | 활성 메뉴·로고·링크 |
| `--muted` | `#6B7280` | 비활성·기타 |

### 1.4 GPU 시리즈 (시안 차트 라인의 실제 색)

| 토큰 | 값 | 시리즈 |
| --- | --- | --- |
| `--gpu-0` | `#8AB4F8` | GPU-0 |
| `--gpu-1` | `#81C995` | GPU-1 |
| `--gpu-2` | `#FDD663` | GPU-2 |
| `--gpu-3` | `#F28B82` | GPU-3 |

### 1.4b 노드(서버) 시리즈 — R9 All 뷰 노드 평균 3선

All 뷰(인스턴스 미선택) 시계열은 24슬롯 개별선 대신 `avg by(node)` 3선을 그린다.
GPU 4색·쿼리 유형 6색과 겹치지 않는 색을 쓴다(색 의미 혼동 방지, R9 F4.1).

| 토큰 | 값 | 시리즈 |
| --- | --- | --- |
| `--node-1` | `#8AB4F8` | GPU-Server-01 |
| `--node-2` | `#81C995` | GPU-Server-02 |
| `--node-3` | `#FDD663` | GPU-Server-03 |

### 1.5 쿼리 유형 (시안 범례의 실제 색)

| 토큰 | 값 | 범례 |
| --- | --- | --- |
| `--qt-select` | `#4ADE80` | SELECT 조회 |
| `--qt-etl` | `#F5A623` | ETL 적재 |
| `--qt-aggregation` | `#A78BFA` | 집계(Aggregation) |
| `--qt-join` | `#22D3EE` | JOIN 쿼리 |
| `--qt-fullscan` | `#F87171` | 풀스캔(Full Scan) |
| `--qt-other` | `#6B7280` | 기타 |

> **주의 (설계 판단 필요)**: 시안의 타임라인 막대는 `Sales_Aggregation`을 SELECT색(초록), `Group_By_Region`을 집계색(보라)으로 칠했지만, 메트릭 계약(TV-C1)의 카탈로그는 `Sales_Aggregation=aggregation`, `Group_By_Region=select`로 선언한다. 이 프로젝트는 **계약의 `query_type` 라벨을 기준으로 색을 결정**한다(범례 색은 시안과 동일). 결과적으로 두 쿼리의 막대 색이 시안과 서로 바뀌어 보인다 — 계약을 바꾸려면 형제 프로젝트의 개정 절차가 필요하므로 인간 판단 사항으로 남긴다(회고 HCI).

### 1.5b LLM 워크로드 분류 (L3 — GPU/LLM 화면, 신규 토큰 없음)

LLM 화면(시안 `llm_dashboard.pptx`)의 워크로드 분류 6색은 위 `--qt-*` 6색 hex를 **그대로 재사용**한다 — 신규 색 토큰을 만들지 않고 의미 매핑만 다르다(`web/src/lib/colors.ts`의 LLM 분류 색 맵, 계약 v3.0 §6.4):

`vllm`=vLLM 추론(`#4ADE80`) · `train`=학습/미세조정(`#F5A623`) · `data`=데이터 처리(`#A78BFA`) · `rag`=RAG 서비스(`#22D3EE`) · `tensorrt`=TensorRT-LLM(`#F87171`) · `other`=기타(`#6B7280`)

## 2. 타이포그래피

시안은 4.6~10.5pt 범위를 쓴다(슬라이드 13.33in 기준). 화면(1920px 가정)으로 환산해 아래로 고정한다.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--fs-title` | 16px | 대시보드 제목 |
| `--fs-panel-title` | 12px | 패널 제목 |
| `--fs-body` | 11px | 표·본문 |
| `--fs-label` | 10px | 축·캡션 |
| `--fs-kpi` | 18px | 게이지·상세 수치 |
| `--font` | Pretendard → 시스템 폴백 | 본문 |
| `--font-mono` | JetBrains Mono → Consolas | 수치·ID |

## 3. 레이아웃 (시안 % 좌표 → CSS Grid)

슬라이드 13.33 × 7.5 in (16:9). 아래 %는 시안에서 추출한 실제 좌표다.

| 영역 | x | y | w | h |
| --- | --- | --- | --- | --- |
| 사이드바 | 0% | 0% | 12.5% | 100% |
| 헤더(제목·시각) | 13.5% | 0.1% | 85% | 4% |
| 필터바 (환경/인스턴스/GPU/시간범위/자동갱신) | 13.5%~66% | 3.9% | 각 9.4~11.2% | 5.3% |
| 실행 중 쿼리 테이블 | 14.0% | 10.3% | 47.2% | 21.4% |
| 쿼리 성능 테이블 | 61.9% | 10.3% | 37.4% | 21.4% |
| 타임라인(+범례) | 14.0% | 32.5% | 64.7% | 22.6% |
| 선택 구간 상세 | 78.9% | 36.9% | 20.5% | 15.3% |
| 시계열 4종 | 14.3% | 58.3%~99% | 64.4% | 각 9.5~12% |
| 서버 카드 3종 | 78.9 / 85.7 / 92.6% | 58.2% | 각 6.8% | 40.8% |

R8 본문은 Grafana 24-column/34-row 계약을 CSS Grid로 옮긴다. top은 `13:11`, middle과
bottom은 `18:6`, middle 우측 detail은 `2:9`다. 전체를 900px에 축소하지 않고 본문 세로
스크롤을 허용하며, section gap은 row 높이에 포함하지 않는다.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--dashboard-row-unit` | 24px | Grafana 세로 grid 1 row |
| `--dashboard-kpi-h` | 64px | R9 KPI 스트립(활성 MIG·In Queue·처리행수·P95) |
| `--dashboard-top-h` | 168px | top 7 rows |
| `--dashboard-queries-h` | 336px | X8: GPU 화면 전용 top override(14 rows) — 쿼리 리스트 세로 확장(`.dashboard-top--gpu-tall`). LLM 화면은 기본 168px |
| `--dashboard-qsummary-h` | 96px | X8: 쿼리 개수 요약 카드 행 — 2026-09-04 세로 구성(라벨·큰 값·힌트)으로 48→96 |
| `--dashboard-middle-h` | 264px | middle 11 rows |
| `--dashboard-bottom-h` | 432px | bottom 18 rows (R9.1 — 시계열 y축 판독성으로 16→18 확대) |
| `--dashboard-gap` | 8px | section/panel 사이 간격(row 계산 제외) |
| `--dashboard-min-w` | 1120px | 1366px 미만 content-only 가로 스크롤 canvas |

## 4. 간격·모양

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--gap` | 8px | 패널 간 간격 |
| `--radius` | 6px | 패널 라운드 |
| `--panel-radius` | 3px | Grafana형 panel/card의 조밀한 라운드 |
| `--sidebar-w` | clamp(176px, 12.5vw, 208px) | PPTX 1600px 기준 200px, 작은 화면 최소폭 유지 |
| `--sidebar-min-w` | 176px | sidebar 최소폭 |
| `--sidebar-max-w` | 208px | sidebar 최대폭 |
| `--sidebar-radius` | 32px | 우측 상·하단 PPTX형 라운드 |

## 4b. canvas 차트의 토큰 소비 (E5, 2026-09-07)

ECharts(canvas)는 CSS 변수를 못 읽는다. `src/lib/echartsTheme.ts` 의 `themeTokens()` 가
`--bg/--panel/--panel-alt/--border/--text/--text-2/--text-3/--link/--accent/--muted/--font/--font-mono`
를 `getComputedStyle` 로 1회 읽어 옵션 빌더에 넘기고, 폴백(`FALLBACK_TOKENS`)은 이 문서·`tokens.css`
와 같은 hex 다. **차트 때문에 새 색 토큰을 만들지 않는다** — 계열·유형·상태색은 §1 팔레트(`colors.ts`)
그대로, 선택 영역 채움은 기존 `--link`/`--accent` 의 알파 변형만 쓴다.

## 5. 기타 시안 요소

- 사이드바 서버 카드: 배경 `--panel`, 서버명 `--text`, "정상" 배지 = 배경 `--ok-bg` + 글자 `--ok`, "4 / 4 GPU 사용 중" `--text-2`
- 활성 메뉴("GPU 모니터링"): 배경 `--panel-sel`, 글자 `--link`
