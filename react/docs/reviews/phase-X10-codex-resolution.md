# Phase X10 codex 지적 처리 (Adjudication)

원본: `phase-X10-codex-review.md` (2026-08-19). 각 건을 Accepted / Rejected / Escalated로 분류 — Rejected는 근거 필수(AGENTS §6.3).

## X10-01 (major) — 충전율 분포와 rows의 물리 모순

**판정: Accepted — Fixed.** codex의 재검산이 정확했다(audit_trail 최소 10.61e9 > 9.8e9, fraud_events 6.41e9 > 6.4e9 — 경계 근접까지 잡아냄). 수정: audit_trail filled90 5,980→**1,500**·under80 18,000→**26,000**(하한 3.43e9), fraud_events filled90 3,600→**3,400**(하한 6.39e9 — 시나리오 판정 불변: ② 47.2%<60% pass·④ under80=8 fail). 불변식 테스트에 권고된 **하한 + 상한** 추가: `cap×(0.9·filled90 + 0.8·중간) ≤ rows ≤ cap×(filled90 + 0.9·중간 + 0.8·under80)` — 전 8테이블 검산 통과.

## X10-02 (major) — Parallel 선언과 단계 순서 양립 불가

**판정: Accepted — Fixed.** RECHUNK 명령문을 3단계 배리어 구조로 재작성 — "1단계: Rechunk (단계 내 Parallel)" → "2단계: Cleanup Extents — 1단계 전체 완료 후" → "3단계(마지막): clustering key reindex — 2단계 완료 후". Parallel은 단계 안에서만이고 단계 주석이 실행기의 배리어 지점임을 코드 주석에 명시. 테스트가 단계 그룹 순서(RECHUNK×N → EXTENTS×N)와 단계 주석 문구를 잠금.

## X10-03 (major) — 행 단위 작업에 전역 reindex 부착

**판정: Accepted — Fixed.** action 상태에 reindex 범위를 포함 — 일괄 RECHUNK=전역 reindexTargets, 행 단위=그 행이 CK 테이블일 때 [그 행]만(아니면 []). CLEANUP 계열은 항상 []. 테스트: CK 없는 orders의 행 RECHUNK 다이얼로그에 dim_date·RECALCULATE_CHUNKS_INDEXES 부재 단언.

## X10-04 (minor) — 카드 간격

**판정: Accepted — Fixed.** `.sqm-maint { margin-bottom: 14px; }`.

## 처리 후 게이트

exporter ruff·mypy 0 · **pytest 127** · web lint·tsc 0 · **vitest 727 / 10 skipped** · 파일별 커버리지 신규 미달 0(기준선 17→**16** — TableUsage statements 미달 해소) · build · 전체 재기동 verify ALL PASS · 신규 4종 8시리즈 수집.

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=medium · 독립 세션 · 처리 4건 판정(분포 재검산 포함) | **X10-01 resolved**(재검산: audit_trail 3.43e9 ≤ 9.8e9 ≤ 25.65e9 · fraud_events 6.3896e9 ≤ 6.4e9 ≤ 7.15e9, 전 8테이블 상·하한 회귀 확인) · **X10-02 resolved**(3단계 분리·배리어 문구·순서 테스트) · **X10-03 resolved**(일괄=전역·행=CK일 때 [t]) · **X10-04 resolved** · git diff --check 통과 · **신규 지적 없음 — 수렴, 종료 게이트 통과** |

## X10-f2 처리 (Cleanup/Rechunk 목업 반영 회차, 2026-08-19)

원본: `phase-X10-codex-review.md` X10-f2 절.

### X10F2-01 (중간) — "Cleanup 선행 필요" 결론의 과잉 약속

**판정: Accepted — Fixed.** `onlyNodelFails`(③만 실패·①②④ 통과)일 때만 "Cleanup 선행 필요", 그 외 Cleanup 대상은 "Cleanup Chunk 대상"으로 폴백(Rechunk 임계 미충족 명시). 테스트: ①③ 동시 실패 픽스처 → "선행 필요" 부재 단언.

### X10F2-02 (중간) — 반영 전 동일 명령 중복 접수

**판정: Accepted — Fixed.** `request_table_maintenance`가 대기 중 동일 `(kind, key)`를 거부(pending 검사) — 접수·감사 건수가 상태 변화보다 많아질 수 없다. cleanup·rechunk 동시 예약은 FIFO 소비로 정책 명시(어느 순서든 상태 정합 유지 — docstring). 테스트: tick 전 동일 cleanup 재요청 False.

### 처리 후 게이트·E2E

exporter ruff·mypy 0 · **pytest 129** · web lint·tsc 0 · **vitest 731** · 커버리지 신규 미달 0(기준선 16) · build · 재기동 verify ALL PASS. **E2E 실측**: audit_trail 모달 "Cleanup 선행 필요"(✕③ 빨강) → CLEANUP 접수(stdout `[cleanup] table=risk_db.logs.audit_trail` 감사) → 다음 갱신 Deleted 88.2M→0·배지 Cleanup→Rechunk(4/4 개방)·틴트 노랑→빨강·집계 RECHUNK(3)→(4).

### X10F2-03 (회차 1 신규) — 통계 결측 테이블의 "건강" 오결론

**판정: Accepted — Fixed.** verdict에 결측 분기 신설 — `deleted`·청크 통계 결측이면 "판정 불가 — exporter 수집을 확인하세요"(건강 결론 금지, 상단 "관측 없음" 표기와 정합). Cleanup 대상인데 청크 통계만 결측이면 "Rechunk 판정은 청크 통계 결측으로 불가"로 정밀화(구 "임계 미충족" 단정 제거). 테스트: 전결측 → 조치 없음/건강 부재 + 판정 불가 결론 / deleted만 관측 → Cleanup 대상 + 결측 명시.

### 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 · 처리 2건 판정 | **X10F2-01 resolved**(onlyNodelFails 분기·테스트 구분 확인) · **X10F2-02 resolved**(pending 거부·LOCK 직렬화·kind별 동시 예약 FIFO 확인) · **신규 [X10F2-03]** — 결측 테이블 "건강" 오결론(위 절에서 처리) |
| 2 | codex exec · reasoning=low · 독립 세션 · X10F2-03 처리 판정 | **not-resolved** — rechunk 분기가 결측 판정보다 앞이라 "청크 통계 4/4 + deleted 결측"이 여전히 "Rechunk 대상"으로 표시(정밀 재지적). 신규 지적 없음 → 재처리: 결측 분기를 **최우선** 재배치(전결측/deleted 결측/deleted=0+통계 결측 3분기 — Rechunk 대상 문구가 나올 수 없는 구조) + 경계 테스트 3케이스 |
| 3 | codex exec · reasoning=low · 독립 세션 · 재처리 판정 | **X10F2-03 resolved**(결측 분기 최우선·3케이스 회귀 확인) · **신규 [X10F2-04]** — 테이블 식별자 URL 계약 불일치(프런트 encodeURIComponent ↔ 서버 `[A-Za-z0-9_-]+` — 점·한글 식별자 404) → 처리: TABLE_PATH `[^/]+` 확장 + `unquote` 디코딩(kill/restart는 무변경 — 숫자·고정 맵이라 좁은 집합이 정당), percent-인코딩 식별자 200 테스트 |
| 4 | codex exec · reasoning=low · 독립 세션 · X10F2-04 처리 판정 | **X10F2-04 resolved**(라우팅·unquote·빈 세그먼트 거부·%2F 안전성(구조적 튜플 키 대조 — 경로 노출 없음)·fail-closed·테스트 확인) · 신규 낮음 1: **X10F2-05** — command-api.md 식별자 계약 문구가 구현(`[^/]+`+percent-decode)과 불일치 → **즉시 정정**(비어 있지 않은 세그먼트·percent-encoding 규약으로 갱신 — 문서 전용, X9-N01 선례). **수렴 — 종료 게이트 통과** |

## X10-f3 처리 (단편화율·유지보수 진행도 회차, 2026-08-19)

원본: `phase-X10-codex-review.md` X10-f3 절.

### X10F3-01 (minor) — 상태 모달의 낡은 스냅숏 고정

**판정: Accepted — Fixed.** statusRow(행 객체) → `statusKey({db,schema,table})`로 교체, 매 렌더 최신 rows에서 useMemo 재검색 — 폴링 갱신(진행도·단계·완료)이 열린 모달에 그대로 반영. 테스트 신설: refreshMs=50 연속 폴링 — "Cleanup Chunk (40%)" 진행 줄 → 픽스처 시리즈 제거 → "유지보수 진행 중" 소멸.

### X10F3-02 (minor) — 비이력 주석의 구 용어 잔존

**판정: Accepted — Fixed.** drilldown_sim(_Table 필드)·TableUsage 헤더·test_drilldown_sim docstring·drilldownScreens 주석 2곳 → "단편화율". 이력 문서(plan.md 과거 절·리뷰 기록)는 계획대로 불변.

### 처리 후 게이트·E2E

exporter ruff·mypy 0 · **pytest 129** · web lint·tsc 0 · **vitest 734**(+1) · 커버리지 신규 미달 0(기준선 16) · build · 재배포. **E2E 실측**: audit_trail Cleanup(15s) 완료 → Rechunk 예정 전환 → RECHUNK 실행 — **진행 중 파랑 배지·Progress 50% 바·진행단계 "Rechunk"·행 버튼 잠금·일괄 집계 제외** 실화면 캡처 → 30s 후 완료(Chunks 30K→10K·Avg 97%·Frag 5%·유지보수 "—").

### 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · 독립 세션 | **X10F3-01 resolved**(키 저장·useMemo 재조회·회귀 테스트 확인) · **X10F3-02 resolved**(비이력 주석 교체·수치 판정 불변 확인) · 정적 검토에서 계약·상태 기계·UI 결합 회귀 없음 · **신규 지적 없음 — 수렴, 종료 게이트 통과** |
