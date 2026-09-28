# Phase 4 회고 — Windows 네이티브 모드 + README

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 코드/검증 증거 |
| --- | --- |
| setup→start 3프로세스 기동, 0.0.0.0 | `native/{setup,start}-native.ps1` — exporter/prometheus/grafana 기동, netstat `0.0.0.0:9801/9091/3001` LISTENING |
| verify ALL CHECKS PASSED (exit 0) | `native/verify-native.ps1` — 타깃 1/1(job·주소 정확 대조) + Grafana health + 대시보드 uid 대조 + **datasource 프록시 실쿼리** + 스팟체크 3종. 2회 실행 모두 exit 0 |
| stop 정상 + 재기동 시 TSDB 보존 | `native/stop-native.ps1` — pids.json 신원 대조 종료(3프로세스). 재기동 후 재시작 이전 타임스탬프 샘플 query_range 조회 확인 |
| 기존 mockup과 포트 무충돌 | 포트 집합 {9801,9091,3001} ∩ {9100~9500,9090,3000,8080} = ∅. start의 선점 검사 목록에도 자기 포트만 포함 |
| README 완비 | `README.md` — 양 모드 실행법·포트 표·0.0.0.0 경고·방화벽 안내·웜업 고지·검증 명령·수동 수정 금지 |

## 잘된 점

- 기존 `../mockup/native` 패턴(Start-Logged/pids.json/포트 검사/`$__env{}`)의 이식이 7→3프로세스로 단순해지며 검증 항목도 명확해졌다.
- portable 바이너리를 형제 프로젝트에서 재사용해 다운로드 없이 전체 사이클을 실검증했다.

## 어려웠던 점

- 원본 mockup 스크립트를 그대로 이식하면 남는 결함(이름-만 신원 대조, 부분 문자열 소유권 판정, env 누수)을 리뷰가 잡아냄 — 원본에도 존재하는 패턴이므로 상위 프로젝트에 역제안할 가치가 있다(HCI-4-1).
- docker 모드와 네이티브 모드가 같은 포트를 쓰므로 동시 기동은 불가(의도된 동작) — README에 명시.

## 다음 phase에 반영할 개선점

- Phase 5(동적 시뮬레이션, DEF-1) 착수 시 verify에 "값이 실제로 변한다" 검사를 추가한다(정적 단계에서는 불가).
- codex 리뷰의 변조 탐침 관행을 스크립트 리뷰에도 적용해 볼 것.

## codex 리뷰 지적과 그 처리 결과

- 1차: 10건 (Medium 7 / Low 3, Blocking 0) → 전건 Accepted·Fixed 후 전체 사이클 재검증(ALL CHECKS PASSED).
- 확인 리뷰: `docs/reviews/phase-4-codex-resolution.md` 확인 리뷰 절 참조.
- 상세: `docs/reviews/phase-4-codex-review.md`, `docs/reviews/phase-4-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-4-1 | Other | 이번 리뷰에서 고친 stop 오살 방지·env 누수 패턴은 원본 `../mockup/native/*.ps1`에도 동일하게 존재 | 상위 mockup 프로젝트에 역반영할지 결정 (이 프로젝트 스코프 밖 — `../mockup/` 수정 금지 규칙) | 비차단 |
| HCI-4-2 | Security | 0.0.0.0 노출 상태에서 Prometheus(9091)/exporter(9801)는 무인증 — README에 사설망 전제·방화벽 안내로 보완 | 실제 사용 네트워크 환경에서 이 보완 통제가 충분한지 확인 | 비차단 |
| HCI-3-1 (재게시) | Scope | **인간 정적 검토 체크포인트** — 1차(정적) 범위 산출물 전체가 완료된 지금이 검토 적기. docker 스택이 기동 중: http://localhost:3001 | 화면 검토 후 수정 지시 → 반영 후 Phase 5(동적) 착수 승인 여부 결정 | **Phase 5 착수 차단** |
