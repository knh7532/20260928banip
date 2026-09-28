# Phase 2 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, codex-cli 0.144.1, codex-rescue 플러그인 경유, read-only)
- 세션: job `task-mrkp78ut-xqu1i0`
- 검토 시각: 2026-07-14T14:0x UTC
- 대상: Phase 2 신규 파일 — `exporter/exporter/{static_data,metrics,main}.py`, `exporter/tests/{test_contract,test_static_data,test_main}.py`, `exporter/Dockerfile`, `prometheus/prometheus.yml`, `docker-compose.yml`
- 기준: ① 코드↔TV-C1 계약 ② 정적 수치↔db-schema.md §5 ③ Grafana 화면 ①~⑤ 구현 가능성 ④ compose/prometheus 구성 ⑤ 테스트 허점

## 결과 요약

관점 ①~④: **지적 없음**. 관점 ⑤(테스트 스위트)에서 4건 — Major 2 / Minor 2.

| ID | Severity | 파일/위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-P2-01 | Major | tests/test_contract.py | 역방향 문서 대사가 메트릭 이름만 추출 — 문서의 라벨셋·타입·단위 의미가 변해도 테스트가 통과 |
| CDX-P2-02 | Major | tests/test_static_data.py | 앵커·배분값 기대치를 검증 대상 모듈(static_data)에서 가져옴 — 동시 드리프트·미점검 행 미검출 |
| CDX-P2-03 | Minor | tests/test_main.py | 시리즈 수 검증이 sqm_statement_running만 확인 — 나머지 statement 메트릭 4종의 누락/불일치 미검출 |
| CDX-P2-04 | Minor | exporter/main.py, tests/test_main.py | 진입점 main()이 커버리지 제외 + 미테스트 — 기본 환경값·바인딩·호출 순서 회귀 미보호 |
