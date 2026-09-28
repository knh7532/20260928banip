# 회고 — Phase X16(상태 축 5종) · X17(Query Overview 개편·카탈로그 확장) (2026-08-21)

## 무엇을 했나

- **X16**: 문장 **상태(Status) 축** 신설 — In Queue·Preparing·Initializing·Executing·Stopped.
  누적 그래프 축(PHASE_META, v4.7 Compile 어휘)과 분리(사용자 정정이 설계를 갈랐다 —
  "개명"이 아니라 축 분리). `/` 요약 카드 3→5장, Stopped는 X-View 완료 이벤트 파생
  (exporter·계약 무변경). X8 ③(Preparing 불채택)의 **부분 변경**으로 §7에 기록.
- **X17**: Query Overview 9→8열(Q-Type 삭제·qid 데이터 유지), "Query ID/QID{id}" →
  "Statement ID/{id}" 드릴다운 전체 통일, Service 열 = qid 파생 표시 축(select_service/
  etl_service/sqream + 실행 전 compile + In Queue 워커 공란), 카탈로그 8종 확장
  (TV-C1 v4.10 additive — INS-02L·DEL-05M, 타임라인 값역 1~8, 3자 검증 전량 green).

## 잘된 것

- **축 분리 원칙이 파급을 줄였다**: 상태 축·서비스 축 모두 "표시 파생"으로 설계해
  exporter 큐 모델·워커 축·PHASE_META를 건드리지 않았다. 계약 개정은 카탈로그
  additive(v4.10) 하나로 한정.
- **표류 가드**: 웹 상수(QID_SERIES·QID_LOCK_CODES·STOPPED_REASONS·CATALOG)를
  exporter 원본·계약 문서와 기계 대사하는 테스트를 남겼다 — 이후 어휘 이동이 CI에서 잡힌다.
- codex 3회전(r1 blocking 3+2 → r2 1 → r3 0) 수렴 — 특히 같은 밀리초 경계(X16-01),
  한 표 전체 누락(X17-02) 같은 우리 스스로 "무시 가능"으로 넘길 뻔한 경계를 잡아 줬다.

## 배운 것 / 다음에 다르게

- **시간 비교 게이트는 경계부터 설계하라**: `<` vs `>`가 stale-통과/fresh-지연을 가른다 —
  안전한 방향(fresh 지연)을 고르고 순수 함수로 추출해 경계를 단위 테스트로 잠그는 것이
  정답이었다. 처음부터 그렇게 했어야 했다.
- **카탈로그 확장의 진짜 연쇄는 타임라인 인코딩**(idx=값역)이었다 — 설계 에이전트의
  사전 전수 조사(§0 보정)가 없었으면 세그먼트가 "#7 · other"로 새는 것을 배포 후에 봤을 것.
- **결정론 시뮬의 난수 스트림은 카탈로그 크기에 민감하다**: rng.choice의 소비 비트가
  집합 크기에 따라 달라져 무관해 보이는 CLE 테스트가 깨졌다(암묵 전제 노출 — 장애 시작을
  문장 종료 직전으로 옮겨 결정론화). 시뮬 테스트는 "시드 우연"이 아니라 시나리오를
  직접 구성해야 한다.
- **범위 밖 발견**: `llm-top-view.json` 커밋본 ↔ 생성기 드리프트(포털 딥링크) — TV-C2
  규약 위반 상태가 잠복해 있었다. HCI로 넘긴다(생성기를 커밋본에 맞출지, 별도 변형
  생성기가 있는지 확인 필요).

## 게이트 증거

exporter pytest 147(+2) · Grafana 드리프트 0 · web vitest 779(+6)·lint/tsc 0·커버리지
기준선 동일 · 배포 실측(카탈로그 8종·타임라인 max=8·DEL-05M etl 큐 관측·번들 어휘 확인) ·
codex 수렴 blocking 0 (`docs/reviews/phase-X16-*`·`phase-X17-*`).
