# codex 리뷰 처리 — 네이티브 키트 3건 (2026-08-10)

리뷰 원문: `20260810-native-split-codex-review.md`
(1차 10건 / 2차 4건 / 3차 4건 / 4차 2건: HIGH 1 · LOW 1)

**결과: Fixed 19 · Rejected 1(+2 부분) · Escalated 0. 미해결 blocking 0건.**

## 1차 (10건)

| ID | 심각도 | 처리 | 내용 |
| --- | --- | --- | --- |
| 1 | blocking | **Fixed** | `stop-linux.sh` 소유 판정을 3중으로. ① `argv[0]` == 기록된 실행 파일 ② 유닛별 인자 지문(exporter 는 `exporter.main`) ③ starttime 일치. `record_pid` 가 pid 파일에 `"PID STARTTIME OWNER"` 를 적도록 바꿨고, 옛 1필드 파일도 계속 읽는다(`.owner` 로 보강). 포트 스캔 폴백도 **포트→유닛 매핑**으로 바꿔 9801 은 exporter 만, 9091 은 prometheus 만 본다 |
| 2 | blocking | **Fixed** | `agent-stop.sh` 의 구버전 `ax-agent.pid` 정리에 `legacy_is_agent()` 신설 — `argv[0]` 가 `.venv-agent` 아래이고 인자에 `chainlit` 이 있어야 한다. **KILL 직전 재검증**도 추가 |
| 3 | blocking | **Fixed** | `Test-TvmOwnedProcess` 를 `실행파일 → 필수 명령줄 조각` 해시테이블로 교체(`exporter.main` / `http.server` / `chainlit`, `''` = 실행 파일만으로 유일). `CommandLine` 이 비면 **거부**한다(증명 못 하면 안 죽인다) |
| 4 | blocking | **Rejected** | `agent-stop.sh` 의 `is_ours()` 는 이미 ① 인자에 `chainlit` ② `/proc/PID/cwd` == 기록된 에이전트 디렉터리를 요구한다. 이 둘을 동시에 만족하는 프로세스는 **바로 이 에이전트의 다른 인스턴스**이므로 종료가 오히려 의도한 동작이다. starttime 을 필수로 만들면 `/proc` 22번 필드가 불안정한 환경에서 **에이전트를 영영 못 끄게** 된다 — `web-stop.sh` 가 같은 근거로 같은 선택을 해 뒀고, 규약을 갈라 놓을 이유가 없다 |
| 5 | major | **Fixed** | `Stop-TvmSet` 에 `-OnlyNames` 추가. 지정하지 않은 항목은 **되써서 보존**하고, 비었을 때만 파일을 지운다. `stop-native.ps1` 은 GPU 3종만, `agent-stop.ps1` 은 `ax-agent`/`ai-agent` 만 뽑아 간다 |
| 6 | major | **Fixed** | systemd 유닛에서 `Wants=top-view-prometheus.service` 제거. `After=` 만 남겨 순서만 맞춘다 |
| 7 | major | **Fixed** | `Assert-TvmAlive` 신설. `start-native.ps1` 이 Process 객체를 모아 두고 0.7초 뒤 `HasExited` 를 확인해, 죽은 것의 이름과 `err.log` 경로를 대고 throw 한다. pid 파일에는 그대로 남겨 `stop-native.ps1` 이 치울 수 있게 했다(CDX-P4-04 유지) |
| 8 | major | **Fixed** | `start-linux.sh` 의 `record_pid` 가 0.3초 뒤 `kill -0` 로 생존을 확인하고, 죽었으면 **pid 파일을 남기지 않고** `DEAD` 에 모은다. 마지막에 목록을 대고 `exit 1` |
| 9 | minor | **Fixed** | `agent-verify.ps1` — AI/AX 를 각각 모은 뒤 AI 우선 선택 |
| 10 | minor | **Fixed** | `agent-verify.sh` — `read_env()` 로 분리 후 AI 우선 |

## 2차 (수정본 재실행, 4건)

`F2`(에이전트 구버전 정리) · `F4`(부분 배수) · `F6`(systemd `Wants=` 제거)는 **CONFIRMED**.
나머지 넷은 더 깊은 반례가 나왔고 전부 고쳤다.

| ID | 심각도 | 처리 | 내용 |
| --- | --- | --- | --- |
| F1-1 | HIGH | **Fixed** | `kill_graceful` 이 이름·owner·starttime 을 받아 **KILL 직전에 `is_native_owned` 를 다시 부른다.** 아니면 KILL 을 생략하고 그 사실을 출력한다. 호출부 2곳도 반환값을 보고 카운트하도록 고쳤다 — `web-stop.sh`·`agent-stop.sh` 가 이미 쓰던 규약을 GPU 세트에도 맞춘 것 |
| F3-1 | HIGH | **Fixed** | `Split-TvmCommandLine` 신설(따옴표 인식 토큰화) 후 지문을 **토큰 완전 일치**로 바꿨다. codex 가 든 반례 `python.exe C:\tmp\foreign-exporter.main-proxy.py` 로 실제 프로세스를 띄워 `False` 를 확인했다 |
| F3-1 (일부) | — | **Rejected** | "지문이 `''` 인 항목도 빈 `CommandLine` 을 거부하라"는 부분은 받지 않았다. `''` 를 쓰는 것은 `prometheus.exe`·`grafana.exe` 뿐이고 **이 키트의 `bin\` 안에 있는 자기 바이너리**다 — 그것을 실행 중인 프로세스는 정의상 우리 것이다. WMI 가 `CommandLine` 을 숨기는 환경에서 거부하면 정상 Prometheus 를 못 끄게 된다. 인터프리터를 공유하는 항목(`exporter.main`/`http.server`/`chainlit`)은 지금도 빈 CommandLine 을 거부한다 |
| F5-1 | MEDIUM | **Fixed** | `record_pid` 가 `printf`+`mv`+owner 기록 **전체를 한 덩어리로 검사**하고, 실패하면 자식을 TERM 으로 내린 뒤 `DEAD` 에 넣는다. 포트는 잡혔는데 stop 이 찾을 근거가 없는 상태를 만들지 않는다 |
| F7-1 | MEDIUM | **Fixed** | 두 검증기 모두 **따옴표·인라인 주석을 벗긴 뒤에** 비었는지 판정한다(`ConvertTo-TvmEnvValue` / `read_env`). `AI_LLM_BASE_URL=""` 는 이제 AX 로 내려가 config.py 와 같은 주소를 본다 |

## 3차 — 파이썬 3.12 고정 (4건)

인간 질문("파이썬 환경은 왜 3.13이야, 레드햇은 3.12인데")에서 출발한 후속 변경을 별도로 리뷰했다.

| ID | 심각도 | 처리 | 내용 |
| --- | --- | --- | --- |
| P3-1 | HIGH | **Fixed** | 태그 검사를 화이트리스트(`py3`/`py312`/`cp312`만 허용)로 짰더니 **정상 wheel 을 떨어뜨렸다.** `cp37-abi3-manylinux2014`(안정 ABI — 3.12에서 설치된다)와 `py311-none-any` 가 거부돼 번들 생성이 헛되이 실패한다. **블랙리스트로 뒤집었다** — 정확한 호환 판정은 pip 가 `--python-version 3.12 --platform manylinux2014_x86_64` 로 이미 했고, 이 함수는 그 뒤의 안전망이므로 **명백히 못 쓰는 것만** 거른다 |
| P3-2 | HIGH | **Fixed(일부)** | 플랫폼 글롭이 `manylinux*_x86_64` 를 다 받아 `manylinux_2_34_x86_64` 도 통과했다 — RHEL 8 은 glibc 2.28 이라 못 쓴다. `manylinux_2_YY` 는 **YY ≤ 28** 만 통과하도록 했고, win/macosx/aarch64 도 거부한다. **Rejected(일부)**: "ABI 태그까지 튜플로 검증하라"는 부분은 받지 않았다. `cp312-cp311-...` 같은 조합은 실재하지 않고, 튜플 검증은 `packaging.tags` 재구현이라 P3-1 과 같은 과잉 거부를 다시 부른다 |
| P1-1 | MEDIUM | **Fixed** | `TVM_PYTHON` 이 3.11 이면 venv 를 **만든 뒤에** 버전 게이트가 터져, 깨진 venv 가 남고 다음 실행은 그걸 기존 venv 로 보아 수동 삭제 전까지 복구가 안 됐다. `Find-TvmPython` 안에서 **venv 생성 전에** 거부한다. 버전 파싱도 `Test-TvmPythonMinor` 로 방어적으로 바꿨다(`3.13.0rc1`·`x.y.z`·`3` 모두 안전) |
| P1-2 | LOW | **Fixed** | uv 탐색이 `%APPDATA%\uv\python` 하드코딩이라 `UV_PYTHON_INSTALL_DIR` 를 놓쳤다. **`uv python find 3.12` 를 먼저 묻고**, 실패 시 `UV_PYTHON_INSTALL_DIR` → 기본 경로 순으로 훑는다 |

## 고친 뒤 확인한 것 (실측)

| 확인 | 방법 | 결과 |
| --- | --- | --- |
| 명령줄 지문이 실제로 구분하는가 (ID 3) | `python -m http.server` 를 띄우고 `Test-TvmOwnedProcess` 호출 | 실행 파일만: `True`(옛 동작이면 죽였다) / `http.server`: `True` / **`exporter.main`: `False`** / `chainlit`: `False` |
| 부분 배수가 항목을 잃지 않는가 (ID 5) | 합본 pid 파일(GPU 3 + `ax-agent`)에 `-OnlyNames` GPU 3종 실행 | 파일 잔존, 남은 항목 `ax-agent` 1개. 이어서 에이전트 배수 → 파일 삭제 |
| 폴백이 남의 프로세스를 건드리지 않는가 (I1) | 9801/9091/3001 을 `wslrelay`·`com.docker.backend` 가 점유한 상태에서 폴백 실행 | 전부 `SKIP`, `stopped=0` |
| 죽은 프로세스가 pid 파일을 안 남기는가 (ID 8) | `record_pid` 에 산 PID 와 죽은 PID 를 각각 투입 | 산 것만 3필드 pid 파일 생성, 죽은 것은 `DEAD` 에만. 반환 1 이 스크립트를 중단시키지 않음 |
| 빈 `DEAD` 가 `set -u` 에서 안전한가 (ID 8) | `${#DEAD[@]}` 평가 | `0`, 오류 없음 |
| 옛 1필드 pid 파일도 읽히는가 (ID 1) | `read -r pid ptime powner` 에 3필드/1필드 투입 | 3필드 전부 파싱 / 1필드는 pid 만, 나머지 빈 값(`.owner` 폴백 경로) |
| `AI_` 가 `AX_` 를 이기는가 (I6) | `config.py` 4조합 실행 | 기본 / `AX_`만 / `AI_`만 / 둘 다 → 모두 기대대로, 둘 다면 `AI_` |
| 지문이 부분 문자열에 속지 않는가 (F3-1) | codex 반례 그대로 `python.exe ...\foreign-exporter.main-proxy.py` 를 띄우고 판정 | `False`. 토큰화 결과도 확인 — 공백 있는 `--directory "C:\a b\dist"` 가 한 토큰으로 유지됨 |
| 따옴표 정규화가 config.py 와 같은가 (F7-1) | `AI=""`+`AX=값` / 따옴표 값 / 인라인 주석 / AX 만, 4조합 | 순서대로 AX 값 / 따옴표 제거 / 주석 제거 / AX 값 — bash·PowerShell 양쪽 동일 |
| wheel 태그 판정 (P3-1·P3-2) | 정상 8종 + 불량 6종 | 정상 전부 PASS(`cp37-abi3`·`cp39-abi3`·`py311`·`py2.py3`·빌드태그 포함), 불량 전부 REJECT(`py314`·`cp313`·`manylinux_2_34`·`win_amd64`·`macosx`·`aarch64`) |
| 3.12 탐색 (P1-1·P1-2) | `uv python find 3.12` 경로, `TVM_PYTHON`=3.11/3.14/쓰레기 | 3.12.13 자동 선택(Pinned=True) / 3.11 은 **venv 생성 전 거부** / 3.14 는 통과하되 경고 / 없는 경로는 즉시 실패 |
| 버전 파싱 방어 (P1-1) | `3.12.13`·`3.14.0`·`3.11.15`·`3.9.2`·`3.13.0rc1`·`''`·`x.y.z`·`3` | 순서대로 T/T/F/F/T/F/F/F — 예외 없음 |
| bash 엣지 (`set -euo pipefail`) | `&&` 실패, `PY312_BIN` 쓰레기, 빈 글롭, 빌드태그 파일명 | 스크립트 중단 없음. 빈 글롭 오탐은 `[[ -f ]]` 가드로 막음 |
| 문법·인코딩 (I4) | `bash -n` 13개, PowerShell 5.1 파서 11개, BOM 감사 | 전부 통과. 한글 포함 6개 모두 BOM 있음, ASCII 선언 5개는 non-ASCII 0바이트 |

## 남은 미검증

**RHEL 8.1 실기가 없다.** `/proc` 기반 신원 검사(starttime·cwd·cmdline)는 Git Bash 의
`/proc` 에뮬레이션에서만 돌려 봤다. 현장 첫 배포 때 `stop-linux.sh` 가 세 유닛을 모두
`[stop] <name> (pid N)` 로 종료하는지, `SKIP` 이 뜨지 않는지 확인할 것.
`.venv-agent` 가 이 PC에 없어 에이전트 실기동은 보지 못했다.

## 4차 — node_* 시뮬레이션·사이드바 합집합 (2건)

| ID | 심각도 | 처리 | 내용 |
| --- | --- | --- | --- |
| N5-1 | HIGH | **Fixed** | 합집합을 `+`(내부 조인)에서 **`or` 뒤 `max by` 접기**로 재작성. `or`의 두 피연산자는 라벨 차원이 달라 서로를 가리지 않는다 — MIG판은 LLM 전개의 인벤토리로 DCGM을 쓰되 `modelName` 라벨을 **일부러 유지**해 차원을 갈랐다(같아지면 0값 sqm이 같은 라벨셋의 LLM 전개분을 가린다 — 수정 중 자체 발견). 한 계열이 통째로 없으면 남은 계열만으로 정확히 동작한다 |
| N1-1 | LOW | **Fixed** | `main.py`의 시뮬레이션 시간 t를 `time.monotonic()` 기반으로 — 벽시계는 타임스탬프 값(now)으로만 쓴다 |

수정 후 실측: 3노드 모두 쿼리 결과 == 원시 시리즈로 계산한 합집합(파이썬 별도 산출)과
정확 일치. exporter 93·웹 563 테스트 통과.

## 5차 — 세션 ↔ statement 동기화

지적 0건 (NO DEFECTS FOUND, codex가 테스트 95개 재실행 포함). 누적 최종:
**Fixed 19 · Rejected 1(+2 부분) · Escalated 0 · 미해결 blocking 0.**

## 6차 — 상세 대시보드 손질 (2건)

| ID | 처리 | 내용 |
| --- | --- | --- |
| U1-01 | **Fixed** | 차트에 `key`(y2 멤버십)를 줘 Disk 표시 여부가 바뀌면 리마운트 — 축이 다시 굳는다 |
| U5-01 | **Fixed** | `_table_last` 로 단조 클램프 — 백데이트가 직전 기록보다 과거면 이전 값 유지. 테스트를 매 tick 단조 검사로 강화 |

수정 후: typecheck·웹 563·exporter 96 통과.

## 7차 — Focus+Context (6건 전부 Fixed)

Z1-01 failThreshold=1 / Z1-02 창 유효성 검사(밖이면 빈 차트) / Z3-01 도메인 **모드** 리마운트
(값은 axis.range 제자리 — 탑뷰 전진 도메인 리마운트 방지, 테스트가 잡음) / Z2-01 좁은
브러시=해제 / Z2-02 양끝 clamp+비겹침 숨김 / Z4-01 스트립은 context. 웹 570 통과.
