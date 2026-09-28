# Phase R5 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (`codex exec` read-only)
- 검토 시각: 2026-07-16
- 대상: `native-linux/{serve,stop,verify,package-dist}.sh`, `native/{serve,verify}.ps1`, `docker-compose.yml`, `docker/nginx.conf`, `README.md`, `.gitignore`
- 기준: ① 프로세스 안전(stop) ② 서빙 정확성(serve) ③ 검증 정확성(verify) ④ 반출 무결성(package) ⑤ Docker/nginx ⑥ README·이식성

## 결과 요약: 9건 — Blocking 1 / Major 6 / Minor 2

| ID | Severity | 위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-R5-01 | **Blocking** | stop.sh | cmdline 부분문자열 + 무조건 KILL — PID 재사용/무관 프로세스 오종료 위험 |
| CDX-R5-02 | Major | stop.sh | 소유 판정이 `$ROOT/dist`/`$HERE`만 인정 — 사용자 지정 DIST 서버는 stop 불가 |
| CDX-R5-03 | Major | verify.sh | ACAO 헤더 존재만 확인 — 다른 고정 Origin 이어도 통과(브라우저는 차단) |
| CDX-R5-04 | Major | verify.ps1 | CORS 요청 실패시 Warn 만 — exit 0 로 거짓 통과 |
| CDX-R5-05 | Major | verify.sh/ps1 | `assets/*.js` 첫 파일만 검사 — 다른 chunk 의 고정 주소 놓침 |
| CDX-R5-06 | Major | verify.sh/ps1 | 하드코딩 탐지가 `http://IPv4:9091` 한 형태만 — 호스트명·https 놓침 |
| CDX-R5-07 | Major | README/package | 반출 tar 에 dist/만 — 빈 서버에 전개하면 실행 스크립트가 없어 기동 불가 |
| CDX-R5-08 | Minor | serve.sh | python 폴백이 버전 미검증 — python2 면 http.server 기동 실패 |
| CDX-R5-09 | Minor | serve.sh | --bg 기동 성공 여부 미확인 — 죽어도 성공 안내 + 죽은 pidfile 잔존 |

## 확인 리뷰(re-review): 7 해소 / 2 부분해소 → 잔여 Blocking 추가 처리
- stop.sh 의 DIST 비교가 **부분 문자열**(`*"$DIST"*`)이라 `/opt/app/dist` 기록 시 `/opt/app/dist-old` 오인 가능 → cmdline NUL 인자를 배열로 읽어 `--directory` **다음 인자 == DIST 정확 일치** + `http.server` 존재로 재작성.
