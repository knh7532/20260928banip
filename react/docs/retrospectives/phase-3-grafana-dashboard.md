# Phase 3 회고 — Grafana 대시보드 생성기 + 인간 정적 검토 체크포인트

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 코드/테스트 경로와 증거 |
| --- | --- |
| 생성기 idempotent + 드리프트 0 | `grafana/gen_dashboard.py` — 재실행 sha256 동일(`6444df0f…`). git 드리프트 검증은 커밋 직후 재생성으로 확인 |
| JSON 검증 스크립트 exit 0 | `grafana/check_dashboard.py` — `OK: 패널 10개, 변수 3종, 계약 메트릭 14종 대사` (SoT 파싱 manifest·패널별 계약·변수 체인·타임라인 매핑 전수 대조) |
| Grafana 대시보드 검색 1건 + 홈 로드 | `/api/search` 1건(`tv-gpu-sqream`), `/api/dashboards/uid` panels 10·editable False·refresh 5s. 전 패널 쿼리 Prometheus 실측 — ① 5시리즈(계약 라벨만), ② 6, ③ 12, ④ 12, ⑤ 집계값 = PPTX 앵커(72/986 등) |
| 인간 정적 검토 체크포인트 | **HCI-3-1로 등재 (아래)** — 다음 인간 접점에서 화면 검토·수정 지시 |

## 잘된 점

- 계약 TV-C1을 세 곳(코드 metrics.py / 문서 db-schema.md / 대시보드 검증기)이 서로 대사하는 삼각 구조가 완성 — 어느 한 곳의 이름·라벨 변경도 게이트에 걸린다.
- 기존 mockup 생성기의 joinByField 패턴을 이식하되, 리뷰 지적(CDX-P3-01)을 계기로 `max by()` 래핑으로 개선 — 원본 mockup보다 조인 결과가 깨끗하다.

## 어려웠던 점

- Prometheus 자동 부착 라벨(job/instance)이 테이블 조인 열을 오염시키는 문제를 리뷰 전에 자체 발견하지 못함 — 실행 검증(시리즈 수)만으로는 테이블 열 구성 결함이 안 보였다.
- 검증기의 "패널 수 세기" 수준으로는 게이트 가치가 없다는 지적 — 패널별 기대 계약 방식으로 재작성.

## 다음 phase에 반영할 개선점

- Phase 4 verify-native.ps1에도 단순 도달성 검사 이상(대시보드 uid·타깃 수 정확값)을 넣는다.
- 시각 요소(범례 렌더·색)는 API 검증 한계가 있으므로 인간 정적 검토(HCI-3-1)에서 확인받는 항목을 명시적으로 목록화했다.

## codex 리뷰 지적과 그 처리 결과

- 1차: 7건 (Major 4 / Minor 3) → 전건 Accepted·Fixed. 지적 없음 판정: 변수 체인, 메모리% 벡터 매칭, 화면 ④⑤ 배치.
- 확인 리뷰: `docs/reviews/phase-3-codex-resolution.md` 확인 리뷰 절 참조.
- 상세: `docs/reviews/phase-3-codex-review.md`, `docs/reviews/phase-3-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-3-1 | Scope | **인간 정적 검토 체크포인트** (plan.md Phase 3 수락 기준) — http://localhost:3001 (또는 다른 PC에서 http://<호스트IP>:3001) 접속, admin/.env 비밀번호 로그인 후 "GPU/SQream Monitoring Dashboard" 확인. 중점 확인: ① 테이블 컬럼 구성·단위 ② 성능 테이블 유형 한글 표기 ③ 타임라인 막대 텍스트(`쿼리명 · 유형` 병기 — 원본은 유형 6종 범례, ADR-0002 절충) ④ 시계열 4종(정적이라 수평선) ⑤ 서버 카드 게이지 수치(72/68/61/986 등) ⑥ 레이아웃 배치 | 화면 수정 지시 (수정분은 생성기 재생성으로 반영). PPTX 대비 어긋난 부분 지적 | **Phase 5(동적 시뮬레이션) 착수 차단** — DEF-1 해제는 이 검토·승인 후 |
| HCI-3-1 진행 | — | **1차 검토(2026-07-15) 접수·반영 완료**: 배치가 PPTX와 다르다는 지적 → PPTX 동일 배치로 재배치(plan.md §7.1). 잔여 항목(수치·표기·타임라인 절충안 등)은 재검토 대기 | 재배치된 화면 재검토 및 잔여 항목 확인 | Phase 5 착수 차단 유지 |
| HCI-1-1 (이관) | Scope | Phase 1 회고의 HCI-1-1 — 리뷰 반영으로 갱신된 plan.md 재확인 | plan.md 최신본 확인 (수락 기준 의미 무변경) | 비차단 |
| HCI-2-1/2-2 (이관) | Other | Phase 2 회고의 정적 수치 정규화(카드 앵커 우선)·임의 배정값 | 정적 화면 검토 시 함께 확인 | 비차단 |
