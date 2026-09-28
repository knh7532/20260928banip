# Phase 3 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, codex-cli 0.144.1, codex-rescue 플러그인 경유, read-only)
- 세션: job `task-mrkpwvf8-1tvp30`
- 검토 시각: 2026-07-14T14:5x UTC
- 대상: Phase 3 신규 파일 — `grafana/gen_dashboard.py`, `grafana/check_dashboard.py`, `grafana/provisioning/*`(datasource/dashboards/top-view.json)
- 기준: ① PromQL 정합 ② Grafana 11.6 스키마 유효성 ③ 변수 체인·All ④ 화면 ①~⑤ 충실도 ⑤ 검증기 허점

## 결과 요약: Blocking 0 / Major 4 / Minor 3

| ID | Severity | 파일/위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-P3-01 | Major | gen_dashboard.py (테이블 ①②) | Prometheus 자동 부착 라벨(job/instance)이 조인 프레임에 남아 접미사 중복 열이 테이블에 노출됨 — 원본 열 구성 훼손 |
| CDX-P3-02 | Major | gen_dashboard.py (타임라인) | value mapping 범례 표시에 필요한 `fieldConfig.defaults.color` scheme 미지정 — 유형 6종 범례 누락/오표시 위험 |
| CDX-P3-03 | Minor | dashboards.yml, gen_dashboard.py | `allowUiUpdates: true`+`editable: true` 조합이 TV-C2 SoT와 실행 중 대시보드의 드리프트를 허용 |
| CDX-P3-04 | Major | check_dashboard.py | TV-C1 대사가 SoT와 연결되지 않은 하드코딩 + 접두사 정규식이라 미계약 메트릭(up 등)·전역 라벨 오사용을 통과시킴 |
| CDX-P3-05 | Major | check_dashboard.py | 패널 유형 개수만 검사 — refId/instant/조인/organize 열/override/grid가 깨져도 통과 |
| CDX-P3-06 | Minor | check_dashboard.py | 변수 검사가 이름 3개만 확인 — 체인/multi/allValue/refresh 미검증 |
| CDX-P3-07 | Minor | check_dashboard.py | 타임라인 검사가 키 존재만 확인 — 텍스트·색 오류·scheme 누락도 통과 |

지적 없음 판정: 메모리% 이항 연산 라벨 매칭, byFrameRefID override, state-timeline 옵션명, organize 접미사 가정, 변수 체이닝·All, 화면 ④⑤·grid 배치.
