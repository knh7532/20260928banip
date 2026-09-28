# exporter 목업 명령 API (X6 · X9-f3 · X10-f2 · X11)

> 소유: exporter (`exporter/exporter/http_api.py`) · 소비: React (`web/src/api/exporterCmd.ts`) ·
> 승인: 인간 2026-08-18 kill (plan.md §7) · 2026-08-19 restart (plan.md §7 X9-f3) ·
> 2026-08-19 table cleanup/rechunk (X10-f2) · 2026-08-19 shutdown·remove_lock (X11 —
> 재시작 3단계 절차·락 시뮬 풀 반영 승인) · 결정 기록: ADR-0011
>
> **계약 TV-C1(메트릭 스키마) 밖의 별도 문서다.** `db-schema.md`는 두 파서
> (`web/tests/queries.contract.test.ts`, `exporter/tests/test_contract.py`)가 메트릭 표를
> 기계 대사하므로 여기에 엔드포인트를 싣지 않는다.

## 1. 개요

- 이 목업 스택에서 **유일한 상태 변경 경로**다. 반영 대상은 exporter의 **합성
  시뮬레이션뿐**이다 — 실제 SQream/GPU에는 아무 것도 하지 않는다(AGENTS.md §0.1).
- 단일 포트 **:9801**에서 `/metrics`(GET, Prometheus scrape)와 함께 서빙한다 —
  "1 타깃 1 포트" 선언과 verify 스크립트가 :9801 하나를 전제하기 때문이다.
- 무인증이다 — ADR-0004(0.0.0.0 바인딩)와 같은 **사설망·시연 전제**다. 신뢰할 수
  없는 네트워크에 노출하지 않는다.
- 브라우저(:8082)가 직접 호출하므로 **모든 응답**(4xx 포함)에
  `Access-Control-Allow-Origin: *`을 싣고, JSON POST의 프리플라이트(OPTIONS)를 받는다.

## 2. 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/metrics` (·`/`) | Prometheus 노출 형식 (기존과 동일 — 텍스트 포맷) |
| POST | `/api/v1/statements/{stmt_id}/kill` | 실행 중 statement의 kill **예약** (CLE 계열은 409 — X11) |
| POST | `/api/v1/workers/{worker}/restart` | 다운 중 워커의 재시작 **예약** (X9-f3 · X11 절차 강제) |
| POST | `/api/v1/workers/{worker}/shutdown` | 다운 워커의 graceful shutdown 전이 (X11) |
| POST | `/api/v1/tables/{db}/{schema}/{table}/cleanup` | 테이블 Cleanup Chunk **예약** (X10-f2) |
| POST | `/api/v1/tables/{db}/{schema}/{table}/rechunk` | 테이블 Rechunk **예약** (X10-f2) |
| POST | `/api/v1/locks/{lock_id}/remove` | orphaned lock 제거 **예약** (X11 — REMOVE_LOCK 상당) |
| OPTIONS | (위 POST 경로들) | CORS 프리플라이트 (204) |

**409 (X11 신설)**: kill·restart·shutdown·remove_lock 핸들러는 verdict 문자열을
돌려주고, "ok"(200)·"not_found"(404) 외의 verdict는 **409** + 절차 위반 사유
(`{"ok": false, "error": "<사유>"}`)로 매핑된다. UI는 사유를 토스트로 그대로
노출한다 — UI 게이트를 우회한 수동 조작(curl)도 서버가 최종 방어한다(fail-closed
이중화). 사유 문구: `stop running statement first` · `cleanup statement running -
wait for completion` · `cleanup statement cannot be stopped (SQream guide)` ·
`graceful shutdown required` · `already shut down` · `lock is held by a running
statement - stop it first` · `lock removal already accepted`.

`{stmt_id}`: `[A-Za-z0-9_-]+`. 요청 본문(상한 4096B):
`{"reason": "...", "start_time": 1787047265.4}`

- `reason` (옵션) — **stdout 기록(200자 절단)까지만** 쓴다. 자유 문자열을 라벨에
  실으면 카디널리티가 폭발하므로 어떤 메트릭에도 싣지 않는다(TV-C1 원칙).
- `start_time` (**필수**) — **세대 토큰**(codex X6-R1/R4): 화면이 본 문장의 시작
  epoch(초, `sqm_statement_start_time_seconds` 값). stmt_id는 신원 풀에서
  재사용되므로, 이 값이 현재 세대의 시작(허용 오차 5초)과 다르면 404다 — 늦게
  도착한 kill이 재사용된 id의 **다른 문장**을 죽이는 ABA를 막는다. **fail-closed**:
  결측·NaN/Inf는 400, wall_start 미확정(첫 노출 전)은 404다. curl 수동 조작도
  /metrics에서 값을 읽어 보내야 한다. UI는 토큰이 없거나(메트릭 결측) 고정
  시점(pin) 화면이면 Kill 버튼 자체를 비활성한다.

### 응답

| 상태 | 본문 | 의미 |
| --- | --- | --- |
| 200 | `{"ok": true, "stmt_id": "...", "state": "killing"}` | **접수** — 반영은 다음 tick(≤1초). "종료 완료"가 아니다 |
| 400 | `{"ok": false, "error": "invalid json" \| "invalid content-length" \| "start_time required"}` | 본문·Content-Length 형식 오류 또는 세대 토큰 결측(NaN/Inf 포함) |
| 404 | `{"ok": false, "error": "unknown or not running stmt_id"}` | 미존재·실행 중 아님(큐 대기 `Q…` 포함) 또는 **세대 불일치**(start_time 대조 실패) |
| 405 | `{"ok": false, "error": "use POST"}` + `Allow` | kill 경로에 GET |
| 413 | `{"ok": false, "error": "body too large"}` | 본문이 4096B 상한 초과 |

### Worker Restart · Graceful Shutdown (X9-f3 · X11, 인간 승인 2026-08-19)

`{worker}`: `[A-Za-z0-9_-]+` (고정 GPU–MIG–워커 맵의 이름, 예 `sqream211`).
요청 본문(상한 4096B): `{"reason": "..."}` — reason 규칙은 kill과 같다(stdout까지만).

**X11·X14·X14-f1 — 유형별 Recovery(인간 확정)**: 장애 에피소드(X7-c)는
2-플레이버다 — **crash**(프로세스 사망: 실행 문장이 다음 tick
`connection_lost`로 즉사하고, 쓰기 계열 문장의 락은 orphan으로 잔존, 알람
**WorkerDown**)와 **hang**(응답 없음 — 화면 표기 "No response"(X14-f1): 문장
유지, 알람 **WorkerUnresponsive**). 알람 **이름이 유형 신호**다(X14 — 신규
메트릭 없이 alertname 값만 추가; 알람 부재 다운 = Stopped). 다운 슬롯에는
신규 문장이 배정되지 않는다. 조치(X14-f1 — X14의 "정지→관찰→격상" 사다리를
인간 지시로 폐기, **운영자 판단**):
- **crash** → 단일 재기동(restart 직행 — 죽은 프로세스에 선행 절차 없음).
- **hang** → 조치 3종 **병렬 제시**: STOP_STATEMENT(kill API) / graceful
  shutdown(문장 잔존 시 서버 409) / restart **직행 허용** — 접수 시 살아 있던
  문장은 crash와 같은 connection_lost 경로로 강제 종료된다(단 워커가 곧
  복귀하므로 락 orphan 승격·신원 격리는 없다 — 정상 롤백). UI는 실행 전
  확인 다이얼로그로 이 결과를 안내한다(인간 지시).
- **stopped** → 재기동만.
- **CLE(cleanup류) 실행 중** → kill·shutdown·restart 전부 409(`cle_running`) —
  X11 확정("중단 금지·완료 대기")은 X14-f1 개방에서도 유지(인간 재확인).
UI 진입 버튼·확정 어휘는 **"Recovery"**(인간 확정).

**X15 — Recovery의 실체 = 워커 서버 kill (인간 현장 확인 2026-08-20)**: 현장은
**자동 기동 스크립트**가 상시 실행 중이라, Internal Error(무응답) 시 조치는
해당 워커 서버에서의 프로세스 kill 하나다 — 재기동은 스크립트 몫. 현장 확인
원문 명령: `pgrep -a sqreamd | grep sqream101 | awk '{print "kill" $1}' | sh`
(원문의 awk에 공백이 누락돼 `kill12345`로 붙는다 — 화면 표기는 `"kill " $1`로
정정, 인간 확정). 반영:
- hang Recovery 확인 다이얼로그가 이 명령(워커명 치환)을 미리보기로 싣고,
  실행 위치(노드)와 "자동 기동 스크립트가 곧 재기동"을 안내한다. exporter
  `restart` API가 이 명령의 목업 스탠드인이다(접수 → 다음 tick 복구 = 스크립트
  재기동 재현).
- crash는 kill 대상이 없다 — 자연 복구(1~3분)가 곧 스크립트 재기동의 재현이고,
  Recovery 버튼은 스크립트가 못 살릴 때의 수동 트리거로 남는다.
- **Graceful Shutdown UI 폐기**(인간 확정): 자동 기동 스크립트 모델에서 의도적
  정지가 성립하지 않는다. exporter shutdown API(§0.1 해제 4호)·Stopped 배지·
  stopped 뷰는 **존치**하되(외부 호출 대비 방어 분기) 화면이 부르지 않는다.

- **세대 토큰이 없다** — 워커 이름은 고정 맵이라 재사용 ABA가 성립하지 않는다.
  대신 상태를 대조한다(fail-closed): 업·미존재는 404(자동 복구가 요청을 앞지른
  경우 404가 정답), 절차 위반은 409.
- **shutdown**: 다운(crash·hang) 워커를 shutdown 상태로 전이 — WorkerDown 알람이
  다음 tick 걷히고(의도적 정지는 알람이 아니다 — web은 알람 부재로 "Stopped"를
  식별한다, 신규 메트릭 없음) **자연 복구가 취소**된다(재시작만이 되살린다).
  실행 문장이 남아 있으면 409(`stop running statement first` — CLE면 wait 문구),
  중복 접수는 409(`already shut down` — 접수가 상태 변화보다 많으면 안 된다).
  응답: 200 `{"ok": true, "worker": "...", "state": "shutdown"}`.
- **restart**: kind가 hang이면 409(`graceful shutdown required` — 절차 강제),
  실행 문장이 남아 있으면(crash 직후 1-tick 창) 409. crash·shutdown 상태에서
  200 = 접수 — `request_restart`가 복구 시각만 과거로 당기고
  `_tick_worker_outages`의 **자동 복구와 같은 경로**(worker_up 0→1 + 알람
  제거(crash만 — shutdown은 이미 걷힘))가 처리한다.
  응답: 200 `{"ok": true, "worker": "...", "state": "restarting"}` ·
  404 `{"ok": false, "error": "unknown or healthy worker"}` · 400/405/413은 kill과 동일.
- web: Worker Monitoring·Main Dashboard의 다운(Unhealthy)·정지(Stopped) 행 →
  **RestartGuideDialog**(3단계 가이드 — 단계 진행은 폴링 실측, 유형별 카피:
  조회=락 없음·쓰기=롤백 경고·CLE=차단+완료 대기). 낙관적 제거는 stop(①)만
  kill 규약을 따르고, shutdown·restart는 폴링 실측이다. 고정 시점(pin)에서는
  진입 자체가 막힌다.

### Orphaned Lock Remove (X11, 인간 승인 2026-08-19)

`{lock_id}`: `[A-Za-z0-9_-]+` (exporter 채번 `LOCK-{stmt_id}` — 테이블 식별자와
달리 percent-decode 불요). 요청 본문: `{"reason": "..."}`.

- **락 모델**(값·수명 변경 — 계약 라벨·이름·타입 불변): 락은 **쓰기 계열**
  (INS·LOA·DEL·UPD·TRU·DDL·CLE) 실행 문장에만 존재하고(SQream: SELECT는 락이
  없다), 값은 실측 보유 초다. 정상 종료(자연·kill)는 락을 제대로 해제한다.
  **crash가 쓰기 문장을 덮치면** 락이 orphan으로 승격돼 문장 사망·워커 복구 후에도
  잔존·증가한다 — 실행 중 문장과 조인되지 않는 락 = orphan(웹 판별 규칙,
  `sqm_statement_running` 조인 실패). 신원 폴백은 최근 실패 이력
  (`sqm_statement_failed_timestamp`, FAILED_KEEP 12건 — 퇴출 후 `--` 허용 한계).
  누적 카디널리티는 신원 풀 상한(72)을 넘지 않는다.
- **orphan만 제거할 수 있다** — 살아 있는 문장의 락은 409(`lock is held by a
  running statement - stop it first`), 미존재는 404(`unknown lock`), 중복 접수는
  409. 200 = 접수 — 시리즈 제거는 다음 tick(메트릭 remove는 tick 전담).
  응답: 200 `{"ok": true, "lock_id": "...", "state": "removing"}`.
- web: Snapshot & Lock의 Active Locks에서 orphan 배지(빨강) + Remove 버튼
  (orphan만·pin 숨김) → 접수 시 낙관 제거 + 15s TTL 억제(kill 규약).
  Restart 가이드 다이얼로그도 orphan 수를 경고 배너로 보인다.

### Table Cleanup Chunk / Rechunk (X10-f2, 인간 승인 2026-08-19)

`{db}`·`{schema}`·`{table}`: 각각 **비어 있지 않은 경로 세그먼트** — 임의 문자열
식별자를 percent-encoding(`encodeURIComponent`)해 보내면 서버가 디코딩해 원문으로
대조한다(점·한글 등 포함 — codex X10F2-04. stmt_id·worker와 달리 테이블 식별자는
좁은 문자집합 보장이 없다). 요청 본문(상한 4096B): `{"reason": "..."}` — reason
규칙은 kill과 같다(stdout까지만).

- **fail-closed 대조 = 배치 판정과 동일 규칙**: cleanup은 delete/update 레코드가
  있는 테이블만(`deleted > 0`), rechunk는 4임계(평균<900K·단편화율 90%↑<60%·
  NoDel_Cnt≥2·80%↓>10)를 지금 충족하는 테이블만 접수. 아니면 404.
- 200 = 접수. 실행은 **기간형**(X10-f3, 인간 확정 시연형 — cleanup 15s 단일 단계,
  rechunk 30s 3단계: Rechunk 18s → Cleanup Extent 7.5s → Recalculate Chunk Indexes
  4.5s). 진행은 `sqm_table_maintenance_progress_ratio`(계약 v4.9 — 값=전체 진행도,
  `stage`=현재 단계, 실행 중에만 존재)로 노출되고, **통계 효과는 완료 시** 적용된다:
  - **cleanup**: `deleted=0`, `nodel=chunks`(전 청크 무삭제 — 생산 규약
    `deleted==0 ⇔ nodel==chunks` 유지). 이것으로 Rechunk 임계 ③이 열릴 수 있다
    (**Cleanup 선행 → Rechunk 개방** — 인간 확인 흐름).
  - **rechunk**: 청크 병합 — `chunks=⌈rows/(0.97×상한)⌉`(평균 ~97%),
    전 청크 ≥90%·under80=0·단편화 0.05. deleted가 남아 있으면 nodel<chunks 유지.
  - 접수는 **테이블당 하나** — 실행 중·대기 중(kind 무관) 테이블은 404.
- 응답: 200 `{"ok": true, "table": "db.schema.table", "state": "cleaning"|"rechunking"}`
  · 404 `{"ok": false, "error": "unknown table or not eligible"}` · 400/405/413 kill과 동일.
- web: Table Usage의 Rechunk/Cleanup 확인 → 대상별 접수(allSettled) → 접수/거부
  요약 토스트. 낙관적 갱신 없음 — 폴링 실측이 표(청크·NoDel·삭제 대기·판정 배지·
  틴트)를 갱신한다. 고정 시점(pin)에서는 버튼 비활성.

## 3. 반영 의미론 (exporter)

HTTP 스레드는 `metrics.LOCK` 하에 **예약만** 하고(`QuerySimulator.request_kill` —
세대 토큰 대조 포함), 다음 tick의 `_finish_expired`가 종료 처리한다:

- **CLE(cleanup류) 계열은 kill 자체가 409다**(X11 — SQream 가이드 원문 "Avoid
  interrupting or killing CLEANUP_EXTENTS operations that are in progress").
  워커 crash의 내부 즉사 경로(`request_worker_crash`)는 이 가드를 받지 않는다 —
  관리자 행위가 아니라 장애이고, 강제 사유는 `connection_lost`(기존 enum 재사용 —
  워커 프로세스 사망은 클라이언트에 연결 오류로 나타난다)다.
- `end_ts`를 현재 시각으로 당긴다 — 완료 duration·executing phase가 실측이 된다.
- 실패 판정을 `killed_by_admin`으로 **강제**한다(기존 reason enum, db-schema.md의
  고정 값 — 신규 라벨·메트릭 없음). 실패 이력(`sqm_statement_failed_timestamp`)과
  완료 이벤트(`sqm_statement_completed_*`)가 같은 강제값을 받아 status/reason이
  일치한다.
- 나머지는 기존 종료 기계가 처리한다: running 5종 remove → 드릴다운 시리즈 동기
  제거 → 타임라인 슬롯 Idle → 신원 풀 반납 → X-View에 ✕(실패) 이벤트.
- kill 예약과 자연 종료가 같은 tick에 겹치면 **자연 종료가 이긴다**(예약은 소거).
- kill은 stmt_id 결정론 실패 규칙(`_failure_of`)의 의도적 예외다 — 재사용된 신원의
  다음 생애는 다시 결정론을 따른다.

## 4. web 소비 규칙

- base URL: `VITE_EXPORTER_URL` > `${protocol}//${location.hostname}:9801` —
  번들에 호스트를 하드코딩하지 않는다(`agentUrl.ts`·web-verify 규칙). 포털
  프록시 뒤 배치만 env 지정이 필요하다.
- 200 수신 시 **낙관적 제거**: 행을 즉시 지우고 15초 TTL로 폴링 재출현을 억제한다
  (kill tick ≤1s + scrape 5s + 폴링 간격 > 즉시 반영이 불가능하므로). TTL 만료
  항목은 지운다 — 신원 풀 재사용(슬롯당 3종) 시 다음 쿼리를 오억제하면 안 된다.
- 404는 "이미 종료"로 안내하고 목록을 갱신한다(실패 아님).
