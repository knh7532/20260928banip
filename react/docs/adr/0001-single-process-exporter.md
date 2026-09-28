# ADR-0001: 단일 프로세스 exporter (3노드×4GPU + SQream 쿼리 메트릭 통합 노출)

- 상태: Accepted
- 날짜: 2026-07-14

## 컨텍스트

재현 대상 화면은 GPU 서버 3대(각 4 GPU)의 메트릭과 SQream 쿼리 메트릭을 하나의 top view로 보여준다. 실제 시스템(및 상위 `../mockup/` 프로젝트)에서는 GPU 노드마다 exporter가 따로 뜨고 Prometheus가 노드별 scrape config에서 `node` 라벨을 주입하며, SQream 쿼리 메트릭은 별도 collector가 노출한다.

이 목업은 ① 화면에 노드별 장애 분리(타깃 up/down) 패널이 없고, ② 타임라인 패널은 "어떤 쿼리가 어떤 GPU에서 도는가"라는 전역 상태를 요구하며, ③ Windows 네이티브 모드를 병행해야 한다.

## 결정

단일 Python 프로세스(`exporter/`, 포트 9801)가 3노드×4GPU의 GPU 메트릭(DCGM 명명)과 SQream 쿼리 메트릭(sqm_* 명명)을 **`node` 라벨을 exporter 내부에서 부착**해 한 엔드포인트로 노출한다. Prometheus job은 1개다.

## 대안

- **노드별 컨테이너 3개 + collector 1개 (기존 mockup 방식)**: 실제 토폴로지와 가깝지만, 이 화면에는 노드 생존 분리 시연이 없고, 쿼리→GPU 배정을 노드 프로세스 간 조정할 수 없어 타임라인/성능 테이블 데이터가 꼬인다. 네이티브 모드 프로세스가 7개로 늘어난다. 기각.

## 결과

- 네이티브 모드가 3프로세스(exporter/prometheus/grafana)로 단순해진다.
- **실제와의 차이 (명시 기록)**: ① `node` 라벨 주입 위치가 scrape config → exporter 내부로 이동 ② `up` 메트릭이 노드별 생존을 반영하지 못함(타깃 1개) ③ GPU/쿼리 메트릭의 수집 주체 분리 없음. 실제 구현 이관 시 기존 mockup의 노드별 exporter + collector 분리 구조를 따를 것.
- PromQL은 전부 `node`/`gpu` 라벨 기준이므로 대시보드 쿼리는 실제 토폴로지로 옮겨도 무수정이다.
