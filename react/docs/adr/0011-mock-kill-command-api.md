# ADR-0011: Statement Kill 목업 명령 API — 단일 포트 stdlib 서버

- 상태: 승인 (인간, 2026-08-18 — plan.md Phase X6·§7)
- 관련: ADR-0001(단일 프로세스 exporter), ADR-0004(0.0.0.0 바인딩), AGENTS.md §0.1

## 맥락

X6 요구(인간, 2026-08-18): Query 상세 팝업의 Kill 버튼이 **목업 데이터에 반영**돼야
한다 — 확인 후 해당 쿼리가 실행 목록에서 사라지고 타임라인도 종료로 바뀌는 것까지.

기존 원칙은 "목업은 상태를 바꾸지 않는다"(정적 목업 시절의 ADR-0004 표기,
AGENTS.md §0.1 Out-of-Scope)였고, 스택은 Prometheus pull 전용이었다 — exporter는
`prometheus_client.start_http_server`로 GET /metrics만 서빙했다.

## 결정

1. **부분 해제**: Statement Kill에 한해 "목업 시뮬레이션 내 상태 변경"을 in-scope로
   한다. 실제 SQream 접속 금지는 불변이고, 다른 상태 변경 UI(Restart·Rechunk·
   Cleanup)는 계속 다이얼로그-온리다. (§0.1 개정, §7 승인 행)
2. **단일 포트 유지**: `start_http_server`를 stdlib `ThreadingHTTPServer` 기반
   `http_api.py`로 교체하고 :9801 하나에서 GET /metrics + POST kill을 서빙한다.
   - 두 번째 포트 기각 — 포트 선언(5종)·verify 스크립트·방화벽 안내가 전부
     "exporter=:9801 하나"를 전제한다.
   - `make_wsgi_app` 조합 기각 — prometheus_client의 반공개 심볼에 기대야 해서
     오프라인(RHEL 8.1, wheelhouse 고정) 환경에서 버전 교체에 취약하다.
   - 표준 라이브러리만 쓴다 — 의존성 추가 금지(§4-9)와 오프라인 조달 제약.
3. **기존 종료 기계 재사용**: kill은 예약(set) → 다음 tick의 `_finish_expired`가
   `end_ts` 당김 + 실패 사유 `killed_by_admin` 강제로 처리한다.
   - `killed_by_admin`은 **이미 계약에 있는 reason enum**이다 — TV-C1 무변경
     (메트릭·라벨·타입 additive 0건). 계약 개정 절차가 불필요한 것이 이 설계의
     핵심 근거다.
   - HTTP 스레드는 메트릭을 만지지 않는다 — 예약만 `metrics.LOCK` 하에 하고,
     변이는 전부 tick(같은 락)에서 일어난다(CDX-P5-16의 직렬화 유지).
4. **reason은 라벨 금지**: 요청 본문으로 받되 stdout 기록(200자 절단)까지만.
   자유 문자열 라벨은 카디널리티 폭발이라는 TV-C1 원칙 그대로다.
5. **CORS 전면 허용**: 브라우저 직접 호출(ADR R-0001과 같은 구도)이므로 모든
   응답에 `Access-Control-Allow-Origin: *` + OPTIONS 프리플라이트. 무인증은
   ADR-0004의 사설망 전제를 공유한다.
6. **세대 토큰 필수·fail-closed** (codex X6-R1/R4): stmt_id는 신원 풀에서
   재사용되므로 kill 요청은 화면이 본 시작 epoch(`sqm_statement_start_time_seconds`)
   를 반드시 동봉하고, exporter가 현재 세대의 wall_start와 5초 오차로 대조한다.
   결측·NaN/Inf는 400, 불일치·미확정은 404 — 늦은 kill이 같은 id의 **다른 문장**을
   죽이는 ABA를 서버에서 막는다. UI는 토큰 결측·고정 시점에서 버튼을 비활성한다.

## 결과

- 상세: `docs/architecture/command-api.md` (엔드포인트·반영 의미론·web 소비 규칙).
- exporter `/metrics`는 텍스트 포맷 고정이 된다(gzip·OpenMetrics 협상 없음) —
  Prometheus 2.53은 텍스트 폴백으로 무영향, verify-native 스팟체크도 텍스트 기준.
- "목업은 상태를 바꾸지 않는다"를 인용하던 주석·문서는 X6 예외를 각주로 단다
  (`ActionDialog.tsx`, `cleanupActions.test.tsx`).

## 추기 — X9-f3 Worker Restart 확장 (인간 승인 2026-08-19)

부분 해제를 **Worker Restart**로 한 건 더 넓힌다(플랜 모드 질의 확정 — "목업 반영"
선택). 같은 설계를 재사용한다: 단일 포트 `POST /api/v1/workers/{worker}/restart` →
예약 → 다음 tick의 X7-c 자동 복구 경로(worker_up 0→1 + WorkerDown 알람 제거).
세대 토큰은 없다 — 워커 이름은 고정 맵이라 ABA가 없고, "지금 다운인가" 대조가
fail-closed다(아니면 404). TV-C1 무변경. 나머지 상태 변경 UI(Rechunk·Cleanup,
MainDashboard의 Restart 다이얼로그)는 계속 다이얼로그-온리다. 상세:
`docs/architecture/command-api.md` §2.

## 추기 2 — X10-f2 Table Cleanup/Rechunk 확장 (인간 승인 2026-08-19)

부분 해제 3호. 같은 설계 재사용: 단일 포트 `POST /api/v1/tables/{db}/{schema}/{table}/(cleanup|rechunk)` → 예약 → 다음 tick 청크 통계 갱신(`_table_stats`가 살아 있는 진원지, TABLES 상수는 초기값). fail-closed = 배치 판정과 동일 규칙(cleanup: deleted>0 / rechunk: 4임계). 계약 무변경 — v4.8 게이지의 **값**만 변한다(생산 규약 deleted==0⇔nodel==chunks 유지). Cleanup 선행 → NoDel_Cnt 상승 → Rechunk 개방 흐름이 화면에서 시연된다. 상세: `docs/architecture/command-api.md` §2.

## 추기 3 — X11 재시작 3단계 절차 + Graceful Shutdown·Remove Lock (인간 승인 2026-08-19)

부분 해제 4·5호. 인간 지적("SQream 가이드상 에러 시 무조건 재시작은 금물 — 특히
CUD 작업 중")에 따라 restart를 **3단계 절차**(① STOP_STATEMENT ② graceful
shutdown ③ restart — SQream 가이드의 stop 우선·shutdown_server 순서)로 강제한다.
핸들러는 verdict 문자열을 돌려주고 절차 위반은 **409**로 매핑된다(fail-closed
이중화 — UI 가이드 + 서버 최종 방어). 장애 에피소드는 crash/hang 2-플레이버가
되고, crash가 쓰기 계열 문장을 덮치면 락이 **orphan**으로 잔존해
`POST /api/v1/locks/{lock_id}/remove`(REMOVE_LOCK 상당)만이 지운다. kill은 CLE
계열을 409로 거부한다(가이드: cleanup류 중단 금지). TV-C1 무변경 — 락은 기존
`sqm_lock_held_seconds`의 값·수명만 바뀌고(쓰기 계열 한정·실측 보유 초), 크래시
실패 사유는 기존 enum의 `connection_lost` 재사용, 정상 정지/장애 구분은
WorkerDown 알람 시리즈 존재 여부다. 상세: `docs/architecture/command-api.md` §2.
