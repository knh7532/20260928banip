# Phase X6 codex 지적 처리 (Adjudication)

리뷰: `phase-X6-codex-review.md` (1차 X6-R1 blocking · X6-R2 major · X6-R3 minor →
재확인 1회차에서 X6-R4 blocking · X6-R5 minor 신규 → 2회차 수렴)

| ID | 판정 | 처리 |
|---|---|---|
| X6-R1 | **Accepted → Fixed** | 세대 토큰 도입. ① exporter: `_Running.wall_start`(첫 publish에서 `sqm_statement_start_time_seconds`와 같은 계산으로 확정) + `request_kill(stmt_id, start_time)`이 LOCK 안에서 허용 오차 5s(`KILL_START_TOLERANCE_S` — publish 지터 ≪ 재사용 간격)로 대조, 불일치 시 False(=404) ② http_api: body의 `start_time`(수치만)을 핸들러로 전달, 생략 시 대조 생략(curl 수동 조작용 — command-api.md에 명문) ③ web: `mainDashboard()`에 `startTime`(sqm_statement_start_time_seconds — **기존 계약 메트릭**, registry 자동 등재) 추가 → `QueryRow.startEpoch` → kill body로 전송(NaN이면 생략) ④ 고정 시점: `pinned` prop으로 Kill 버튼 비활성(+사유 title). 테스트: exporter `test_kill_generation_mismatch_refused`(±100s 거부·정시 수락·예약 잔류 없음), web `killStatement` 토큰 직렬화 2건 + pinned 비활성 1건 + 성공 body 단언 갱신. **실측**: 기동 스택에서 틀린 토큰 404 → 맞는 토큰 200 → 다음 tick 제거 확인 |
| X6-R2 | **Accepted → Fixed** | `Content-Length` 비정수→400(`invalid content-length`), 음수→400, `BODY_MAX_BYTES=4096` 초과→413(본문 읽기 전 거절), 모든 오류 응답에 CORS 헤더 유지. 불완전 본문 대기는 핸들러 `timeout=10`(소켓 타임아웃)으로 차단. 테스트: `http.client` 원시 헤더로 400/413 각 1건(CORS 헤더 포함 단언). **실측**: raw socket으로 `Content-Length: nope` → `HTTP/1.1 400` + `Access-Control-Allow-Origin: *` 수신(수정 전엔 무응답 절단) |
| X6-R3 | **Accepted → Fixed** | system.md 컴포넌트 다이어그램에 `B1 → EXP` POST 명령 엣지 추가, 데이터 흐름에 5번 항목(명령 경로 — 예약→tick 변이, 세대 토큰, command-api.md·ADR-0011 참조) 추가. command-api.md도 start_time·400/413·본문 상한을 반영해 개정 |
| X6-R4 (재확인 1회차 신규, blocking) | **Accepted → Fixed** | R1 처리의 fail-open 잔재 봉쇄 — **fail-closed 전환**. ① http_api: `start_time` 결측·비수치·**NaN/Inf**(json은 NaN을 통과시키고 NaN 비교는 항상 False라 대조를 몰래 우회) → 400 `start_time required`(`math.isfinite`) ② query_sim.request_kill: None·비유한·wall_start 미확정(첫 노출 전)·오차 5s 초과 전부 거부 ③ web: `killable = !pinned && Number.isFinite(startEpoch)` — 토큰 결측 시 Kill 버튼 비활성(+사유 title) ④ command-api.md·ADR-0011 §결정-6: start_time **필수**로 개정(curl도 /metrics에서 읽어 동봉). **실측**: 토큰 없음 400 → 정토큰 200 → 다음 tick 제거 |
| X6-R5 (재확인 1회차 신규, minor) | **Accepted → Fixed(일부 의도적 생략)** | 테스트 보강 — 음수 Content-Length 400(parametrize `nope`/`-5`), ±5초 경계(±5.1 거부·+4.9 수락·예약 잔류 없음), 토큰 None·NaN 거부(시뮬), HTTP 토큰 결측 400·NaN 본문 400. **의도적 생략**: `Handler.timeout=10`의 read-timeout 동작 테스트 — 스위트에 10s 벽시계를 추가하는 비용 대비 stdlib 소켓 타임아웃 위임 동작이라 회귀 위험이 낮다(2회차 리뷰에 판단 타당성 평가 요청) |

## 처리 후 게이트 재실행 (최종)

- exporter: ruff 0 · mypy 0 · pytest **117 passed** · cov 99.20% (≥80)
- web: lint 0 · typecheck 0 · vitest **680 passed** · `npm run build`(계약 테스트 포함) green — `startTime` 등재는 기존 계약 메트릭이라 TV-C1 여전히 무변경
- verify-native **ALL CHECKS PASSED**(재기동 스택) · fail-closed 실측(토큰 없음 400·정토큰 200·다음 tick 제거)

재확인 회차 기록은 `phase-X6-codex-review.md` 하단 참조.
