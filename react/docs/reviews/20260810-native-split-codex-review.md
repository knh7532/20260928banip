# codex 리뷰 — 네이티브 키트 3건 (MAX_PATH · 세트 분리 · ai-agent 개명)

- 일자: 2026-08-10
- 대상: `native/*.ps1`, `native-linux/*.sh`, `native-linux/systemd/top-view-ai-agent.service`, `agent/config.py`
- 실행: `codex exec --sandbox read-only --skip-git-repo-check -c model_reasoning_effort=high`
  (codex-cli 0.146.0). `codex review --uncommitted`는 쓰지 않았다 — 이 저장소에서는 무관한
  미추적 파일을 끌어온다(AGENTS.md §6.2 게이트 규약).
- 입력: 스코프 경로를 명시한 지시문 + 준비된 diff 패킷(변경분 diff + 신규 9파일 전문).
  깨뜨릴 불변식 7개(I1~I7)를 제시하고 스타일 지적은 금지했다.

## 제시한 불변식

| ID | 불변식 |
| --- | --- |
| I1 | 어떤 스크립트도 자기 것이 아닌 프로세스를 죽이지 않는다 (PID 재사용·무관 프로세스 거부) |
| I2 | 세트 독립 — 하나를 기동/종료/검증해도 다른 세트를 막거나 죽이거나 pid 파일을 지우지 않는다 |
| I3 | 업그레이드 안전 — 구버전 합본 스크립트로 띄운 스택도 여전히 종료 가능해야 한다 |
| I4 | PowerShell 5.1 전용 문법. 한글 포함 `.ps1`은 UTF-8 BOM 필수 |
| I5 | fail-fast 유지 — 빈 `GRAFANA_ADMIN_PASSWORD` 거부, 죽은 프로세스의 pid 파일 미잔류 |
| I6 | `AI_LLM_*`가 `AX_LLM_*`를 이긴다. 빈 값은 기본값으로 흐른다 |
| I7 | 상태 루트 해석 — 기존 설치를 조용히 옮기지 않고, 259−1−180=78 산술이 실제로 260을 지킨다 |

## 1차 결과 — 10건 (blocking 4 · major 4 · minor 2)

| ID | 심각도 | 불변식 | 위치 | 요지 |
| --- | --- | --- | --- | --- |
| 1 | blocking | I1 | `stop-linux.sh:23` | 소유 판정이 `cmdline 에 $HERE 포함`뿐이라, 재사용된 GPU PID 가 React·에이전트일 때 **남의 세트를 죽인다** |
| 2 | blocking | I1 | `agent-stop.sh:37` | 구버전 `ax-agent.pid` 정리도 같은 약한 판정 — exporter/Prometheus/Grafana/React 를 죽일 수 있다 |
| 3 | blocking | I1 | `common.ps1:192` | 포트 스캔 폴백이 **실행 파일만** 본다. exporter 와 React 가 같은 venv 파이썬이라 구분 불가 |
| 4 | blocking | I1 | `agent-stop.sh:70` | `STARTTIME=0`이면 재사용 검사가 생략된다 |
| 5 | major | I2 | `stop-native.ps1:37` | 구버전 합본 `pids.json` 을 통째로 비워 **GPU 전용 스크립트가 에이전트까지 종료**한다 |
| 6 | major | I2 | `top-view-ai-agent.service:16` | `Wants=top-view-prometheus` 가 에이전트 기동 시 Prometheus 까지 끌어올려 독립성이 깨진다 |
| 7 | major | I5 | `common.ps1:180` | 즉시 종료한 프로세스도 pid 에 남고 "3개 기동 완료"로 보고된다 |
| 8 | major | I5 | `start-linux.sh:79` | 같은 문제 — `record_pid` 가 생존 확인 없이 기록한다 |
| 9 | minor | — | `agent-verify.ps1:43` | AI/AX 를 한 변수에 덮어써 **파일에 나중에 적힌 쪽**이 이긴다 (config.py 와 불일치) |
| 10 | minor | — | `agent-verify.sh:51` | 같은 문제 (`tail -n1`) |

지적 1·3·7·8은 이번 변경이 만든 것이 아니라 **기존 코드의 결함**인데, 세트를 나누면서
현실적인 사고 경로가 생겼다(같은 venv 파이썬을 두 세트가 공유하게 됐다). 그대로 두면
"각각 기동"이 이름뿐이 되므로 이번에 함께 고쳤다.

## 2차 결과 (수정 후 재실행) — 4건

수정본으로 다시 돌렸다. 지시문에 **고친 내용 F1~F7을 명시하고 "CONFIRMED 또는 반례"를
요구**했다. 결과: `F2 · F4 · F6 CONFIRMED`, 나머지 넷은 더 깊은 반례가 나왔다.

| ID | 심각도 | 위치 | 요지 |
| --- | --- | --- | --- |
| F1-1 | HIGH | `stop-linux.sh:77` | `kill_graceful` 이 **KILL 직전에 신원을 다시 보지 않는다.** TERM 후 PID 가 재사용되면 그 새 프로세스를 죽인다 |
| F3-1 | HIGH | `common.ps1:211` | 명령줄 지문이 **부분 문자열** 매칭이다. `python.exe C:\tmp\foreign-exporter.main-proxy.py` 가 `exporter.main` 을 포함해 통과한다 |
| F5-1 | MEDIUM | `start-linux.sh:94` | `run/` 이 쓰기 불가면 pid 기록이 조용히 실패하는데 `record_pid` 는 0을 반환한다 → **추적 불가능한 산 프로세스** |
| F7-1 | MEDIUM | `agent-verify.ps1:42`, `agent-verify.sh:51` | 따옴표를 벗기기 **전에** 비었는지 판정한다. `AI_LLM_BASE_URL=""` 면 config.py 는 AX 를 쓰는데 검증기는 `""/models` 를 찌른다 |

넷 다 타당해서 모두 고쳤다(F3-1 의 "빈 CommandLine 도 거부하라"는 부분만 근거를 대고
유지 — 아래 resolution 참조). 처리 내역은 `20260810-native-split-codex-resolution.md`.

## 3차 결과 — 파이썬 3.12 고정 후속 (4건)

"파이썬 환경은 왜 3.13이야, 레드햇은 3.12인데"라는 질문에서 나온 후속 변경
(`Find-TvmPython` 신설, 굽기용 3.12 탐색, wheel 태그 검사)을 따로 리뷰했다.

| ID | 심각도 | 위치 | 요지 |
| --- | --- | --- | --- |
| P3-1 | HIGH | `01-fetch-bundle.sh` | 태그 화이트리스트가 **정상 wheel 을 거부**한다 — `cp37-abi3-manylinux2014`·`py311-none-any` 는 3.12에서 설치되는데 떨어진다 |
| P3-2 | HIGH | `01-fetch-bundle.sh` | 플랫폼 글롭이 `manylinux_2_34_x86_64` 도 받는다 — RHEL 8(glibc 2.28)에서 못 쓴다 |
| P1-1 | MEDIUM | `common.ps1`·`setup-native.ps1` | `TVM_PYTHON`=3.11 이면 venv 를 만든 **뒤** 실패해 깨진 venv 가 남고 복구가 안 된다 |
| P1-2 | LOW | `common.ps1` | uv 탐색이 기본 경로 하드코딩이라 `UV_PYTHON_INSTALL_DIR` 를 놓친다 |

P3-1 이 특히 값졌다. **"엄격하게 만들었다"가 곧 "옳다"가 아니었다** — 화이트리스트가
정확한 호환 규칙(`packaging.tags`)을 재구현하려다 실패하는 형태였고, 그대로 뒀으면
현장 번들 생성이 처음부터 실패했을 것이다. 블랙리스트로 뒤집었다.

## 4차 결과 — node_* 시뮬레이션·사이드바 합집합 (2건)

exporter의 `node_*` 자급 시뮬레이션(v4.4)과 사이드바 busy 합집합 쿼리를 리뷰했다
(불변식 N1~N7 제시).

| ID | 심각도 | 위치 | 요지 |
| --- | --- | --- | --- |
| N5-1 | HIGH | `queries.ts` | 벡터 `+`는 **내부 조인** — 한쪽 계열이 없으면 다른 쪽 활동까지 버리고, `or vector(0)`이 그 실패를 "busy 0"으로 위장한다 |
| N1-1 | LOW | `node_sim.py`·`main.py` | 벽시계 역행(NTP 보정) 시 `_last_t`가 리셋돼 같은 구간을 두 번 센다 — 실측 재현(0→10→5→11 tick에서 합 16) |

N5-1은 codex가 옳았다. 우리 exporter는 두 계열을 상시 선생성해 당장은 안 터지지만,
"합집합"이라 부른 식이 실제로는 교집합 조건을 품고 있었다.

## 5차 결과 — 세션 ↔ statement 동기화 (0건)

세션 시뮬레이터를 정적 난수에서 statement 실측 파생으로 바꾼 변경(불변식 S1~S4:
시리즈 수명주기·running 0/1·격리·사용자 풀)을 리뷰했다. **NO DEFECTS FOUND** —
codex가 직접 테스트 스위트(95개)까지 재실행해 확인했다.

## 6차 결과 — 상세 대시보드 손질 6건 (2건)

계열 토글·세션 노드 필터·VRAM 표기·QID 등급 제거·statbox 색·테이블 버스트를 리뷰했다.

| ID | 심각도 | 위치 | 요지 |
| --- | --- | --- | --- |
| U1-01 | MEDIUM | `MainDashboard.tsx`·`MetricChart.tsx` | C3 축 배정은 생성 시 한 번 굳는다 — 전부 숨겼다 CPU→Disk 순서로 켜면 Disk가 % 축에 실린다 |
| U5-01 | MEDIUM | `drilldown_sim.py` | 버스트 백데이트 난수가 직전 기록보다 과거로 갈 수 있어 last_access 가 역행한다(seed 42 tick 912 실측 재현) |

## 7차 결과 — Focus+Context 브러시 줌 (6건)

| ID | 심각도 | 요지 |
| --- | --- | --- |
| Z1-01 | HIGH | 일회성 줌 재조회는 3회 실패 문턱에 못 닿아 실패가 "데이터 없음"으로 위장 |
| Z1-02 | HIGH | 창 A→B 직행 시 A 샘플이 B 축 아래 남는다 |
| Z3-01 | HIGH | C3 는 axis.range 를 스스로 풀지 않아 줌 해제 후 옛 축이 남는다 |
| Z2-01 | MED | 최소 폭 미만 브러시 "무시"가 d3 시각 선택만 남긴다 |
| Z2-02 | MED | 과거 고정 창이 흐르는 context 밖으로 밀리면 브러시 좌표가 뒤집힌다 |
| Z4-01 | MED | 요약 스트립 "현재값"이 줌 창의 마지막 값으로 바뀐다 |
