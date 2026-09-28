# Phase 4 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, codex-cli 0.144.1, codex-rescue 플러그인 경유, read-only)
- 세션: job `task-mrkrc6sz-a3xhl2`
- 검토 시각: 2026-07-14T15:5x UTC
- 대상: Phase 4 신규 파일 — `native/{setup,start,stop,verify}-native.ps1`, `native/prometheus-native.yml`, `native/grafana/provisioning/*`, `README.md`
- 기준: ① PS 5.1 스크립트 결함 ② stop 오살 방지·폴백 안전성 ③ verify 커버리지 ④ README 정확성 ⑤ .env 취급 일관성

## 결과 요약: Blocking 0 / Medium 7 / Low 3

| ID | Severity | 파일/위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-P4-01 | Medium | start/stop-native.ps1 | startTime 캡처 실패 시 프로세스명만으로 신뢰 — 재사용 PID 오살 가능성 잔존 |
| CDX-P4-02 | Medium | stop-native.ps1 | 포트 폴백의 소유권 판정이 경로·명령행 부분 문자열 검색 — 유사 경로 무관 프로세스 오살 가능 |
| CDX-P4-03 | Medium | start-native.ps1 | 성공 시 기존 세션 env 삭제 + 실패 시 관리자 비밀번호 포함 env 세션 잔존 |
| CDX-P4-04 | Medium | start-native.ps1 | pids.json을 전체 기동 후에만 기록 — 중간 실패 시 기 시작 프로세스 미추적 |
| CDX-P4-05 | Medium | verify-native.ps1 | UP 수만 검사 — "1 UP + 추가 DOWN"이나 다른 단일 타깃도 통과 |
| CDX-P4-06 | Medium | verify-native.ps1 | HTTP 타임아웃 부재 + Grafana 검사 무재시도 — 콜드 스타트 오판정 |
| CDX-P4-07 | Medium | verify-native.ps1 | datasource 누락/오설정으로 전 패널이 깨져도 ALL CHECKS PASSED 가능 |
| CDX-P4-08 | Low | start/verify-native.ps1 | compose(셸 env 우선)와 native(.env 전용)의 자격증명 우선순위 차이 미고지 |
| CDX-P4-09 | Low | setup-native.ps1 | "Python 3.10+" 서술이 exporter 요구(≥3.12)와 불일치 + 버전 미검사 |
| CDX-P4-10 | Low | README.md | "zip을 복사해 재사용" 안내가 실제 동작(압축 해제 디렉터리 감지)과 다름 |
