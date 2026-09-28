# ADR-0002: 타임라인 상태 인코딩 — GPU당 enum 값 시계열

- 상태: Accepted
- 날짜: 2026-07-14

## 컨텍스트

화면 ③(시간대별 GPU 세션 & SQL 쿼리 실행 타임라인)은 GPU-0~3 행별 간트 형태로, 각 구간에 쿼리명이 표시되고 색은 쿼리 유형 6종(SELECT 조회/ETL 적재/집계/JOIN/풀스캔/기타)을 따른다. Grafana State timeline 패널은 range 쿼리 결과로 과거 구간을 그린다.

## 결정

`sqm_gpu_timeline_state{env, node, gpu}` 게이지 1종으로 인코딩한다. 값은 **0=Idle, 1~6=쿼리 카탈로그 인덱스**(1 Sales_Aggregation·집계, 2 Customer_Join·JOIN, 3 ETL_Load_Daily·ETL, 4 Fraud_Detection_Scan·풀스캔, 5 Group_By_Region·SELECT, 6 Vacuum_Maintenance·기타). 시계열 12개(3노드×4GPU)가 상시 존재하므로 range 쿼리로 과거 구간이 온전히 복원된다. 패널의 value mapping이 값→`쿼리명 · 유형` 텍스트와 유형색을 부여한다.

GPU 1개에는 동시에 1개 쿼리만 배정한다(간트 1행 1값 의미론). 동적 단계(DEF-1)에서는 점유 GPU에 도착한 쿼리를 QUEUED로 처리한다.

## 대안

- **stmt/query 라벨 기반 시계열 (예: `sqm_gpu_running_query{query_name=...} 1`)**: 쿼리 종료 시 시계열이 소멸해 State timeline에서 행이 계속 늘어나고 과거 구간 복원이 불안정하다. 기각.
- **카탈로그 인덱스 대신 유형(6종)만 인코딩**: 범례는 원본과 동일해지지만 막대에 쿼리명을 표시할 수 없다. 카탈로그가 유형과 1:1이므로 인덱스 인코딩으로 쿼리명·유형색을 동시에 얻는다. 기각.

## 결과

- 범례가 원본의 "유형 6종"이 아니라 `쿼리명 · 유형` 병기 6종으로 표시된다 — 근사임을 인지하고 인간 정적 검토(Phase 3 HCI)에서 확정한다.
- 카탈로그(6종)가 계약 TV-C1의 일부가 되며, 카탈로그 변경은 계획 문서를 통해서만 한다.
- 과거 데이터 백필은 하지 않는다 — 기동 시점부터 데이터가 쌓이므로 "Last 6 hours" 뷰는 웜업이 필요하다(README 고지).
