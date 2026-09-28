# Phase R5 codex 리뷰 처리 기록 (Resolution)

전 9건 **Accepted → Fixed**. 확인 리뷰 잔여 Blocking(부분 문자열 비교)도 Fixed. Rejected 없음.

| ID | 처리 | 증거 |
| --- | --- | --- |
| CDX-R5-01 | Fixed | stop.sh 신원 게이트: cmdline NUL 인자 배열에서 `http.server` 존재 + `--directory` 다음 인자 == 기록 DIST **정확 일치**. starttime 보강(양쪽 유효 양수인데 다르면 재사용으로 거부). TERM 후 사라지면 KILL 안 함, **KILL 직전 is_ours 재검증**. |
| CDX-R5-02 | Fixed | serve.sh --bg 가 pidfile 에 `PID STARTTIME DIST` 원자적 기록(tmp→mv). stop.sh 가 그 DIST 로 검증 → 사용자 지정 DIST 서버도 정상 종료 |
| CDX-R5-03 | Fixed | verify.sh: 보낸 Origin(`http://verify.local:8082`)을 받아 ACAO 가 `*` 또는 그 Origin 과 **정확 일치**할 때만 통과, 다른 값이면 실패 |
| CDX-R5-04 | Fixed | verify.ps1: catch 에서 Bad, 값도 `*`/Origin 검증 |
| CDX-R5-05 | Fixed | verify.sh `mapfile` 로 **모든** assets/*.js 검사, PS1 은 전체 결합 후 검사. 파일 없으면 Bad |
| CDX-R5-06 | Fixed | 정규식 `https?://[A-Za-z0-9._-]+:9091` — 호스트명·IPv4·https 고정 주소 탐지. 런타임 템플릿은 `//`↔`:9091` 사이가 `${location.hostname}` 로 끊겨 미검출(의도) |
| CDX-R5-07 | Fixed | package-dist.sh 가 **자립 배포 세트**(dist + native-linux/*.sh + docker-compose.yml + docker/nginx.conf + README + .env.example)를 `top_view_react/` 루트로 tar. README: `tar -xzf ... -C /opt` → `cd /opt/top_view_react` → serve |
| CDX-R5-08 | Fixed | serve.sh: 후보별 `sys.version_info[:2] >= (3,7)` 검사 통과한 python 만 선택(python2·깨진 스텁 배제) |
| CDX-R5-09 | Fixed | serve.sh --bg: nohup 후 `kill -0` 로 생존 확인, 죽었으면 로그 tail + pidfile 미기록 + 실패 종료 |

## 기능 스모크 (실행 검증)

```
serve.sh --bg   : 깨진 python3 스텁 건너뛰고 Python 3.14 선택, pidfile "PID STARTTIME DIST" 기록, :8082 200
verify.sh       : dist·:8082 200·Prometheus :9091 도달+CORS(*)·전체 JS 하드코딩 없음 → 통과 ✅
package-dist.sh : 자립 tar(dist+native-linux/*.sh+compose+README) + checksums.sha256 + tar.sha256, 무결성 OK
verify.ps1      : Windows PowerShell 5.1 에서 파싱·실행 통과(전 항목)
bash -n         : 4개 스크립트 구문 무오류
```

> **stop.sh 의 KILL 경로**는 RHEL `/proc/PID/{cmdline,stat}`(POSIX 경로·안정 starttime) 전제로
> 정확하다. 개발 PC(Windows/MSYS2)에서는 /proc/cmdline 이 Windows 경로(`D:\…`)로 보여 기록된
> POSIX DIST(`/d/…`)와 불일치 → **안전하게 거부**(오종료 없음). 개발 PC 정적 서빙은 `native/serve.ps1`
> (포그라운드, Ctrl-C) 을 쓴다.

**Blocking·Major 잔여 없음** — R5 종료.
