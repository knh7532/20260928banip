# 회고 — Phase U2~U4 통합 이관 (EXC-U4 통합 1건)

- 기간: 2026-07-19 (P0·U1 포함 단일 세션)
- 커밋: `d038446`(P0, react 마지막) → `030b6f2`(U1) → `7c93d7c`(U2) → `ee14c1b`(U3) → `3d9a087`(U4)

## 한 일과 결과 (수락 기준 ↔ 증거)

- **P0**: MIG 필터 작업을 구 프로젝트 마지막 커밋으로 완주(287 tests green), 빈 `top_view_react/.git` 제거, 구 스택(native 3프로세스)·Vite dev 서버 정지 후 이관.
- **U1**: 통합 plan.md·AGENTS.md 확정 — grep 게이트(신 SCOPE·구 SCOPE 잔존 0·계약 8필드) 통과.
- **U2**: react 추적 파일 전량 `git mv` → `web/` + docs 병합(rename 113건, 이력 `--follow`로 R9까지 추적 확인). 최소 보정 2건(SCHEMA 임시 경로, tokens 문서 경로). 게이트: lint·typecheck·test(287)·build green.
- **U3**: exporter/prometheus/grafana/native류 + TV-C1 SoT(무수정, rename 100%) 이관, SCHEMA 최종 경로, system.md 병합 재작성. 게이트: exporter ruff·mypy·pytest 41(98.66%) / regen·check·드리프트 0 / web 재검증 green.
- **U4**: compose 4서비스 단일화, web 실행 스크립트를 `web-*` 접두사로 흡수(중복 serve-react-linux.sh 제거), systemd·README 경로 보정. 게이트: compose config·bash -n·ps1 파서·구경로 grep 0 + **E2E 실측: 통합 위치에서 스택 재기동 → verify-native ALL CHECKS PASSED(웹 8082 포함) + web-verify 전 항목 OK**.
- 수락 기준 체크박스는 plan.md §5에 [x] + 증거 요지로 갱신됨.

## 잘된 점

- "react 먼저" 이관 순서 덕에 **모든 커밋 시점에 양 스택 게이트가 green** — 계약 테스트가 빌드 경로에 있어 경로 조정 누락이 즉시 검출되는 구조가 실제로 작동했다.
- "이동 + 최소 경로 보정 1커밋" 규칙으로 rename 검출(대부분 100%)과 `--follow` 이력이 보존됐다.
- 이관 직후 통합 위치에서 스택을 재기동해 실측 검증까지 마쳤다(이관 전 가동 상태 원상 복구 겸).

## 어려웠던 점

- **U2 최초 커밋에 쓰레기 혼입**: react `.gitignore`가 web/으로 이동한 순간 구 폴더의 미추적 캐시(.chrome-qa 등 1,359파일)가 ignore에서 풀렸고, `git add -A top_view_react/`가 이를 스테이징해 커밋에 섞였다. 푸시 전 로컬에서 발견해 **amend로 제거**하고 루트 `.gitignore`에 구 폴더 껍데기를 등록해 재발을 차단했다. 교훈: 이관 커밋은 `git add -A` 금지, 경로 지정 스테이징만.
- 세션 CWD가 구 폴더를 잠가 폴더 단위 rename이 불가 → **자식 단위 git mv**로 우회 (빈 껍데기는 U5 물리 정리로 이월).
- codex 1차 광범위 리뷰가 타임아웃 → 핵심 결합점 6항목 축소 재시도로 종결 (리뷰 문서 범위 고지 참조).

## 다음 Phase(U5)에 반영할 개선점

- 전역 참조 스캔 시 신 이름(`llm_gpu_top_view_mockup`)이 구 이름을 부분 문자열로 포함하므로 **치환 후 검사** 방식을 쓸 것 (이번 U4 게이트에서 확인된 오탐 패턴).
- 구 폴더 물리 잔재 목록이 확정됨: `top_view_react/{.agents,.chrome-qa,.claude,coverage,dist}`, `top_view_mockup/{.env,docs 빈 껍데기}` — U5에서 삭제.

## codex 리뷰 지적과 처리

지적 0건 ("Blocking 잔존 여부: 없음") — `../reviews/phase-U2-U4-codex-review.md`·`-resolution.md` 참조.
1차 타임아웃·2차 축소 범위 고지 포함.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-U-1 | Scope | U5 착수 — 구 폴더 껍데기 삭제 + `deploy/`·`docker-kit/` 6개 파일의 구 경로 참조 처리(경로 갱신 vs 킷 동결·폐기) | U5 승인 및 킷 방침 결정 | **U5 차단** |
| HCI-U-2 | Scope | 루트 `.gitignore` 2줄 수정(구 폴더 껍데기 ignore) — SCOPE(`llm_gpu_top_view_mockup/`) 밖 공유 인프라 파일 | 사후 승인 (U2 쓰레기 혼입 재발 방지 목적) | 비차단 |
| HCI-U-3 | Risk | 이관된 `native/.venv`의 activate 스크립트·과거 로그에 구 절대경로 문자열 잔존(미추적 런타임 잔재). python.exe 직접 실행은 정상 동작 확인 — venv activate를 쓸 경우만 `setup-native.ps1` 재실행으로 재생성 권장 | 재생성 시점 결정(필수 아님) | 비차단 |
| HCI-U-4 | Risk | codex 리뷰가 축소 범위(핵심 결합점 6항목)로 종결 — diff 전량 검토 아님. 기계 게이트·E2E가 보완 | 전량 리뷰 재수행 여부 | 비차단 |
| HCI-U-5 | Other | 통합 스택이 현재 신규 위치에서 **가동 중**(exporter·Prometheus·Grafana + 웹 :8082 — 이관 전 가동 상태 복원). Vite dev 서버(5173)는 재기동하지 않음 | 가동 유지 여부 확인 | 비차단 |
| HCI-U-6 | Design | 웹 화면의 픽셀 수준 시각 충실도는 이번에 재검토하지 않음(기능 게이트·E2E만). 브라우저에서 http://localhost:8082 확인 권장 | 시각 확인 | 비차단 |

## 후속 결정 (2026-07-19 — 본문 무수정 추기)

- **HCI-U-1 부분 해소**: 인간이 **구 폴더 보존**을 확정했다 — 버저닝 목적으로 `top_view_mockup/`·`top_view_react/`를 이관 직전 상태(`d038446`)의 추적 동결 버전으로 복원(커밋 `8c7200e`, 태그 `pre-integration`). U5의 "구 폴더 삭제"는 철회됐다. 기동 가능성은 스왑 테스트로 실측(구 mockup 스택 verify ALL CHECKS PASSED + 구 react 서빙 verify 통과, 이후 신 스택 원복 ALL CHECKS PASSED). **deploy/·docker-kit/ 방침은 계속 대기**(HCI-U-1 잔여).
- 배경: 통합 계획 수립 시 "구 폴더를 기동 가능한 버전으로 남긴다"는 사용자 의도를 확정 질문으로 포착하지 못한 채 삭제 로드맵(U5)이 승인·진행됐다 — 계획 질의 단계에서 **기존 자산의 처분(삭제·동결·보존)은 별도 명시 질문**으로 확인해야 한다는 교훈.
