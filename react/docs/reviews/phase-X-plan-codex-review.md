# Phase X1/X2 계획 초안 — codex 교차 리뷰 (AGENTS §3.1)

- **검토 대상**: `docs/plan.md`의 Phase X1·X2 절 + `docs/design/xview-proposal/*.html` (커밋 `60ccca4`)
- **draft SHA-256**: `74cef166451b8e39e8c1cda6cab9f81772148675ec46f6e3d5b6a28e288c24ce` (plan.md @ 60ccca4)
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=high`, sandbox read-only (Primary Planner=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-13T04:55Z
- **실행 명령**: `codex exec --sandbox read-only --skip-git-repo-check -c model_reasoning_effort=high "<스코프·불변식 명시 지시문>"` (지시문은 스코프 경로·제외 경로·불변식 6항·출력 형식 포함)

## 지적 사항 (원문)

| ID | severity | file:line | failure | evidence | fix |
|---|---|---|---|---|---|
| XR-01 | blocking | `docs/plan.md:181` | 신규 메트릭을 `CONTRACT`에만 추가하도록 되어 있어 exporter가 import 단계에서 실패한다. | `metrics.py:215-219`는 모든 CONTRACT 항목에 대해 `_HELP[name]`을 조회한다. 계획 산출물에는 `_HELP` 2건 추가가 없다. | X1 산출물에 `_HELP` 정의 2건과 import/수집 테스트를 명시한다. |
| XR-02 | blocking | `docs/plan.md:181,191` | `COMPLETED_KEEP=60`과 instant 쿼리로 최대 30분 창을 재구성할 수 없다. | 24슬롯÷75초×60=`19.2건/분`, 따라서 60건 수명은 약 `3.125분`이고 30분에는 최대 `576건`이 완료된다. 실제 도착률 합계도 약 `10.79건/분`이라 수명은 약 `5.56분`뿐이다(`sim_params.py:50-58,118-121,136-137`). | 권장: raw metric을 `/query_range`로 조회해 값 전환을 `(labelset,endEpoch)`로 복원한다. instant를 유지하려면 `KEEP≥576`(여유 포함 600~720)과 각 링 엔트리를 구분하는 bounded `event_slot/exec_id` 라벨이 모두 필요하다. 단순 `last/max_over_time`은 시리즈별 마지막 이벤트만 남기므로 불충분하다. |
| XR-03 | blocking | `docs/plan.md:181,191` | `stmt_id+end epoch` dedupe는 instant 결과에서 재사용 충돌을 해결하지 못한다. | stmt_id는 슬롯당 3개뿐이라 계속 재사용된다(`sim_params.py:128-158`). Prometheus 시리즈 키는 메트릭명+라벨이며 값인 end epoch는 키가 아니다. 동일 stmt/query-name/status/reason 라벨셋의 새 완료는 Gauge 값을 덮어써 이전 epoch가 instant 결과에서 사라진다. deque에 동일 라벨이 중복되면 오래된 엔트리 퇴출 시 더 최신 Gauge까지 `remove()`할 수 있다. | raw range 샘플의 timestamp 값 전환을 복원하고 중복 라벨 퇴출을 참조계수로 처리하거나, bounded event-slot 라벨로 각 링 엔트리를 분리한다. 단조 증가 exec_id는 15일 retention 동안 시리즈가 계속 늘어 기존 카디널리티 불변식에 반한다. |
| XR-04 | major | `docs/plan.md:191` | 요약행을 `useRangeDetail` 재사용으로 만들 수 없다. | 기존 hook은 `sqm_query_executions_total`의 구간 증가량과 카탈로그 P95 등을 반환할 뿐(`queries.ts:291-315`, `useRangeDetail.ts:51-75`), 실패 건수와 완료 쿼리 평균 duration이 없다. 링 누락 시 `queryCount`와 표시 점 수도 달라진다. | 완료 이벤트 목록을 가져오는 신규 hook에서 구간 필터 후 `N`, `status=failed` 수, duration 산술평균을 동일 점 집합으로 계산한다. 제거된 패널의 기존 rangeDetail 폴링도 중단한다. |
| XR-05 | major | `docs/plan.md:181-185` | 신규 링·완료 판정 로직에 대응하는 행동 테스트가 계획에 없다. | 산출물은 `test_contract.py`의 스키마/개수 갱신뿐이다. 이는 완료 시각·duration·성공/실패·양쪽 Gauge 퇴출·KEEP 상한·ID 재사용 충돌을 검증하지 않아 AGENTS.md §3.3의 "변경 로직 대응 테스트" 게이트를 충족하지 않는다. | QuerySimulator 단위 테스트에 양 메트릭 동시 발행, 종료값, reason, 60건 상한, 양쪽 remove, 동일 라벨 재사용/퇴출 사례를 추가한다. |
| XR-06 | minor | `docs/design/xview-proposal/xview-panel-mockup.html:213-222` | 목업 데이터가 실제 시뮬레이터 불변식과 불일치한다. | 실패 여부와 stmt_id를 독립 난수로 생성해 고정 시드에서도 `stmt_104/116/117/137`이 성공·실패 양쪽으로 나타난다. 실제 실패는 stmt_id로 결정론적으로 정한다(`query_sim.py:192-205`). ID 형식도 실제 `100000+n×137` 풀과 다르다. | 실제 72개 ID 풀을 만들고 실패 여부/reason을 동일 hash 규칙으로 유도한다. duration도 실제 로그정규 중앙값 75초 분포를 사용한다. |
| XR-07 | minor | `docs/design/xview-proposal/xview-panel-mockup.html:74,81` | 두 SVG가 `preserveAspectRatio="none"`으로 패널 셀 크기에 비균등 확대되어 원·✕·텍스트가 찌그러진다. 특히 우측 패널의 실제 가로세로비와 `246×152` viewBox 비율이 다르다. | SVG 좌표의 x/y 배율이 달라 원이 타원이 되고 ✕ 각도 및 글리프 비율도 변한다. | 비율을 보존하는 viewBox 렌더링을 사용하고 plot 컨테이너의 aspect-ratio/여백을 맞추거나, 실제 컨테이너 크기로 좌표를 계산한다. |
| XR-08 | minor | `docs/design/xview-proposal/xview-demo.html:282-319` | 드래그 좌표를 plot/SVG 경계로 제한하지 않아 SVG 밖으로 이동하면 선택 박스와 결과 팝업이 카드 밖으로 뻗는다. 축·주석 영역에서도 선택이 시작된다. | `window` mousemove/up 좌표를 그대로 변환하며 `mx/my`를 `[M.l,W-M.r]`, `[M.t,H-M.b]`에 clamp하지 않는다. | mousedown을 plot 내부로 제한하고 이동·종료 좌표를 plot 경계로 clamp한 뒤 overlay 위치도 같은 좌표계로 계산한다. |

**총평 (원문)**: X1의 기존 CONTRACT 항목 자체는 이름·라벨·타입을 바꾸지 않으므로 additive-only 주장은 성립하지만, `_HELP` 누락은 수정해야 한다. 핵심 설계는 60건 instant 링과 stmt_id 재사용 때문에 30분 X-View를 재구성하지 못하므로 X1·X2 모두 차단 상태다. X2로 깨지는 기존 layout 단언은 `layout.contract.test.tsx:117`의 2행 `detail-col` 규칙이며, 계획의 "detail-col 단언 갱신" 산출물이 이를 커버한다.
