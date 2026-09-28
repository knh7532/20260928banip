# Phase R5 회고 — 실행 모드·반출·README

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 |
| --- | --- |
| 네이티브(무-Docker) 실행 — RHEL, python http.server :8082 | `native-linux/serve.sh`(fg/`--bg`)·`stop.sh`·`verify.sh` |
| Docker(nginx) 실행 | `docker-compose.yml` + `docker/nginx.conf` (nginx:alpine, :8082) |
| 망분리 반출(SHA-256) | `native-linux/package-dist.sh` — 자립 배포 세트 tar + checksums |
| README(양 모드·반출·포트·CORS) | `README.md` |
| 검증: :8082 200 + Prometheus 도달 + 번들 하드코딩 없음 | `verify.sh`/`verify.ps1` 4종 점검 |

## 잘된 점

- **빈 서버에서도 바로 뜨는 자립 반출 세트**: 처음엔 dist/ 만 묶었으나 리뷰가 "빈 서버엔 실행
  스크립트가 없어 기동 불가"를 지적 → dist + native-linux/*.sh + compose + README 를 한
  아카이브로 묶고 `checksums.sha256`(내부)·`tar.sha256`(전체) 2중 무결성으로 만들었다. 실제로
  풀어 `cd /opt/top_view_react && serve.sh` 로 동작함을 확인했다.
- **프로세스 종료 안전을 정면으로**: `stop.sh` 가 cmdline 인자 배열에서 `http.server` + `--directory`
  **정확 일치** DIST + starttime 재사용 가드 + KILL 직전 재검증으로, PID 재사용·무관 프로세스를
  절대 죽이지 않게 했다(형제 stop-linux.sh 의 소유 판정 철학 계승·강화).
- **verify 가 실제 속성을 검사**: CORS 는 헤더 존재가 아니라 값이 `*`/정확 Origin 인지, 하드코딩은
  첫 파일이 아니라 전체 JS 를, IPv4 뿐 아니라 호스트명·https 까지 검사하도록 리뷰 반영. 실 Prometheus
  로 CORS(*)·번들 `location.hostname` 기반을 확인했다.

## 어려웠던 점

- **PowerShell 5.1 호환**: `?.`(널 조건) 는 PS7 전용이라 5.1 파싱 실패 → 명시적 null 체크로.
  UTF-8-no-BOM 한글 주석이 5.1 에서 깨져 파싱 오류 → BOM 추가로 해결(pwsh·5.1 모두 통과).
- **개발 PC의 깨진 `python3` 스텁**: Windows Store 별칭 `python3` 가 폴백에 먼저 걸려 서빙 실패 →
  후보별 `version_info >= (3,7)` 검사로 실 Python 만 선택하게 해 부수적으로 이 문제도 해결.
- **stop.sh 를 개발 PC(Windows)에서 완전 검증 불가**: MSYS2 /proc/cmdline 이 Windows 경로로 보여
  POSIX DIST 와 불일치 → 안전 거부. 로직은 RHEL(/proc POSIX·안정 starttime) 전제로 정확하며,
  이는 회고 HCI 로 현장 1회 확인 대상.

## 프로젝트 전체 마무리 메모

- R1~R5 전 phase 폐쇄 게이트 완료: 각 phase codex 리뷰 → 전건 수정 → 확인 리뷰 → 회고 → dev 커밋.
- 앱 게이트 최종: eslint 0 · tsc 0 · vitest 168 passed · 커버리지 99.43% · build 성공(계약 26 통과).
- 실행: native(RHEL python http.server) 1순위 + Docker(nginx) 2순위, 자립 반출 세트.

## codex 리뷰 지적과 처리 결과

- 1차: 9건 (Blocking 1 / Major 6 / Minor 2) → 전건 Accepted·Fixed.
- 확인 리뷰: 7 해소 / 2 부분해소 → 잔여 Blocking(부분 문자열 비교) 정확 인자 일치로 추가 수정 → **"Blocking·Major 잔여 없음"**.
- 상세: `docs/reviews/phase-R5-codex-review.md`, `docs/reviews/phase-R5-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-R5-1 | Deploy | 현장 RHEL 에서 `serve.sh --bg` → `verify.sh` 4종 통과, `stop.sh` 로 정상 종료(/proc 기반 신원) | 현장 1회 실행 확인 | 비차단 |
| HCI-R5-2 | Security | Prometheus 를 브라우저가 무인증 직접 호출 — 배포망이 **사설망**인지(0.0.0.0 바인딩 전제) | 배포망 확인 | 비차단 |
| HCI-R5-3 | Perf | 번들 636KB(gzip 192KB) — 로컬 서빙이라 무방하나 필요 시 d3 서브모듈 임포트로 축소 | 축소 필요 여부 판단 | 비차단 |
