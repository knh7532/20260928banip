# 회고 — Phase L1~L4 LLM 모니터링 화면 (EXC-U4 간소 게이트, 통합 1건)

- 기간: 2026-07-19 (DEF-U1 해제 단일 세션)
- 커밋: `97dd83d`(L0) → `5b9ec70`(L1) → `69f6556`(L2) → `bd85ff9`(L3) → `41c7193`(L4) → 리뷰 반영 커밋
- 시안: `../서류/llm_dashboard.pptx` (python-pptx로 좌표·색·표 전수 파싱 후 구현)

## 한 일과 결과 (수락 기준 ↔ 증거 — plan.md §5 Phase L 체크박스에 [x]+증거 기재)

- **L1**: 계약 TV-C1 v3.0 — `llm_*` 10종 additive(GPU 단위·mig 없음) + 워크로드 카탈로그 8종. LLM 시뮬레이터(장수 서비스 4종 홈 슬롯 상주+재시작 창, 단명 배치 포아송, pid 고정 신원 상한 52, GPU 부하 max 결합). additive 증명: 기존 두 소비자 무수정 green.
- **L2**: Grafana `tv-llm` 12패널(생성기·검증기 분리 신설, 기존 무수정·드리프트 0). 가동 스택 실측 — 프로비저닝 2대시보드·datasource 경유 조회.
- **L3**: React `#/llm` 화면 — 의존성 무추가 해시 라우팅, App→screens 분리(기존 본문 무변경 추출), 컴포넌트 재사용(Timeline 파라미터화·MetricStrip·ServerGauges) + 신규 4종, TV-C3 확장(MANIFEST 25종). 기존 287 테스트 회귀 0.
- **L4**: ADR 0009/0010, README·system.md 갱신, verify-native 강화(대시보드 정확 집합 2/2 + llm 스팟체크), E2E ALL CHECKS PASSED.

## 잘된 점

- **additive 원칙이 기계로 증명됨**: 계약 파서 3곳의 접두사 확장 + 종수 단언(RL-1 완화)으로 llm 계약이 대사에 실제 편입됐고, 기존 소비자는 커밋마다 무수정 green이었다.
- **파라미터화 재사용**: Timeline·MetricStrip·ServerGauges·FilterBar에 기본값=현행 props만 더해 LLM 화면을 구성 — 기존 화면 DOM 계약이 흔들리지 않았다(기존 스위트 전건 green이 증거).
- 축소 범위 codex 리뷰를 처음부터 적용(U2~U4 타임아웃 교훈) — 1회에 완료되고 실질 결함 3건을 잡았다.

## 어려웠던 점

- **PS 5.1 Invoke-RestMethod 배열 미열거 함정**: 구식 verify의 "대시보드 1/1" 검사가 2개 상태에서도 통과하고 있었다(배열 `-eq` 필터링 의미론). 대시보드 집합 검증으로 교체하며 파이프라인 평탄화로 수정 — 검증기의 자기 검증이 필요함을 재확인.
- codex 지적 3건(요청 수 부분 적분·popstate 재수화·redraw 의존성)은 모두 "전이 순간"의 엣지 — 상태 기계·히스토리 전이 시점의 경계 조건은 셀프 리뷰에서 놓치기 쉽다.

## 다음에 반영할 개선점

- 신규 검증 스크립트는 **의도적 실패 케이스**(변조 탐침)로 자기 검증을 함께 넣을 것 — verify-native 함정의 재발 방지.
- 계약 파서를 쓰는 소비자가 3곳(exporter test·web test·Grafana check ×2)으로 늘었다 — 접두사·파싱 규칙의 공용화(단일 매니페스트 파서)는 후속 리팩터링 후보.

## codex 리뷰 지적과 처리

3건(Major 2·Minor 1) 전건 **Fixed** — `../reviews/phase-L1-L4-codex-review.md`·`-resolution.md` 참조. 요청 수 부분 적분(CDX-L-01), popstate 필터 재수화(CDX-L-02), Timeline redraw 의존성(CDX-L-03). 각 수정에 회귀 테스트 또는 기존 불변식 테스트가 대응하며 전 게이트 재통과.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-L-1 | Design | 픽셀 수준 시각 충실도 — React `http://localhost:8082/#/llm`, Grafana `http://localhost:3001/d/tv-llm` 브라우저 확인 (스택 가동 중) | 시안 대비 배치·색·표기 확인 | 비차단 |
| HCI-L-2 | Design | Grafana tv-llm 타임라인 범례가 워크로드 8종 나열(시안은 분류 6종) — value mapping 구조 한계. React판은 6분류 정확 재현 | 근사 수용 여부 | 비차단 |
| HCI-L-3 | Design | 기본 시간범위 30m 유지(시안 표기는 Last 6 hours — 시간 압축 세계관 정합, 6h는 드롭다운 옵션) | 기본값 확정 | 비차단 |
| HCI-L-4 | Architecture | LLM 서비스 4종의 홈 GPU가 전부 gpu-server-01 고정(시안 "선택 인스턴스: GPU-Server-01" 재현) — 서버-02/03은 배치 전용 | 배치 분산 필요 여부 | 비차단 |
| HCI-L-5 | Scope | 사이드바 메뉴가 시안과 다름 — "인스턴스별 GPU" 유지 + "GPU/LLM 모니터링" 추가(인간 확정 2026-07-19, 시안의 대체안 기각) | 확정 재확인 | 비차단 |
| HCI-L-6 | Other | max 부하 결합으로 기존 DCGM **값 거동**이 변할 수 있음(스키마만 additive — 계약 §6.5-5 명기, 인간 확정) | 시연 관점 이상 여부 확인 | 비차단 |
