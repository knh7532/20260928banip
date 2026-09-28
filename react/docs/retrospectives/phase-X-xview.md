# Phase X1·X2 회고 — X-View 교체 (완료 이벤트 메트릭 + 산점도 패널)

2026-08-13 · 커밋 `d482e47`(X1) + `063320b`(X2) · 브랜치 `feat/handoff-20260807`

## 한 일과 결과 (수락 기준 ↔ 증거)

| 수락 기준 | 증거 |
| --- | --- |
| X1 — 3자 검증 전량 green | exporter pytest 100 passed(계약 테스트 포함) · `gen_dashboard`+`check_dashboard` 드리프트 0(12패널·4변수·51쌍) · web `test:contract` 74 passed |
| X1 — exporter 게이트 | `ruff 0 · mypy 0 · pytest --cov 99.32%` exit 0 |
| X1 — additive-only | 기존 메트릭 diff 0 — v4.5는 §2b 2종 추가뿐, Grafana 드리프트 0으로 입증 |
| X2 — web 게이트 | `lint·typecheck·test:coverage(592 passed)·build` exit 0 |
| X2 — 계약 대사 | `xviewEvents` range 2종 registry 등록 + MANIFEST 66종 — test:contract green |
| X2 — 회귀 0·불가침 | 기존 스위트 회귀 0 · **Timeline.tsx·lib/timeline.ts diff 0**(인간 지시 불가침) · LLM `.detail-col` 2행 규칙 유지(NX-03) |
| X2 — 빈 상태 | 기동 직후 0건 문구 구현+테스트 (백필 없음 준수) |
| 종료 게이트 | codex 리뷰 blocking 0·major 0·minor 1(CDX-X-01 Fixed) — reviews/phase-X-codex-{review,resolution}.md |
| 실측 | 스택 재기동 후 X-View 패널에 완료 이벤트 산점도 표출 확인(스크린샷 인간 전달) |

## 잘된 점

- 계획 단계 3회전 리뷰(XR 8·NX 3·수렴 확인)가 구현 리뷰에서 blocking 0으로 수렴 — 링 60건 instant 설계를 계획 단계에서 폐기(range 복원)한 것이 결정적.
- 참조계수 퇴출을 "기대 링 미러" 테스트로 정확 비교 — 같은 라벨셋 2회 재사용 경합까지 결정론 검증.
- 타임라인 불가침 제약을 셀렉터 분리(NX-03, `.detail-col--xview`)로 구조화해 회귀 창구 자체를 없앰.

## 어려웠던 점

- mypy 2.1 환경 드리프트: HEAD 기준으로도 8건 오류(변수 섀도잉·유니언 좁히기) — X1 커밋에서 최소 보정(로직 불변). 게이트 도구 버전이 기록되지 않아 드리프트 시점을 특정할 수 없었다.
- web `test:coverage` 1회 플레이크: 첫 실행에서 파일별 임계 오탐 19건(전부 X2 무관 파일), 동일 트리 연속 2회 green + HEAD 대조 0건으로 플레이크 판정.
- codex 리뷰 1차 시도(reasoning=high·광범위 스코프)가 10분 제한 초과로 중단 — medium·스코프 축소로 재실행해 해소.

## 다음 phase에 반영할 개선점

- 게이트 도구 버전(ruff·mypy·pytest·vitest)을 회고에 고정 기록해 환경 드리프트를 조기 검출.
- codex 리뷰는 스코프를 파일 목록으로 명시하고 medium부터 시작(시간 제한 고려).

## codex 리뷰 지적과 처리

- CDX-X-01 (minor): plan.md X1/X2 제목 `초안·승인 대기` 잔존 → **Fixed** (구현 완료로 갱신). 상세: `docs/reviews/phase-X-codex-resolution.md`.

## Phase X3 추기 (2026-08-14) — 툴팁 생애주기 막대·Node·실패 발생 시점 + 고정

**한 일**: X2-f1(호버 툴팁 오버레이, `6b6b03d`) → X3 본 구현(`a6ee440` — phase 메트릭 v4.6·누적 막대·Node 행·실패 유형/발생 시점 매핑) → codex 지적 수정(`3bce05b` — CDX-X3-01 phase 쿼리 단독 장애 격리) → 실측 보완(`cfd1f9f` — body 포털로 패널 클리핑 해소) → 클릭 고정/해제(`d0b54a8`, 인간 지시). 캡처 3장(실패 ✕·성공 점·고정 증명) 인간 전달.

**잘된 점**: 실측 캡처가 리뷰·테스트가 못 잡는 결함 2건(패널 클리핑, 헤드리스 캐시로 구번들 검증)을 잡았다. 불변 제약(산점도·타임라인 무변경)을 계획에 명문화한 것이 codex 리뷰(CDX-X3-01)의 판정 기준으로 그대로 작동했다.

**어려웠던 점 / 사고**: ① 기준선 검증용 worktree에 node_modules junction을 걸었다가 정리 시 `rm -rf`가 정션을 타고 **원본 node_modules를 부분 삭제** — `npm install`로 복구, 그 과정에서 package-lock 기존 불일치(@emnapi 2종)도 발견·보수. 재발 방지 절차(정션 먼저 rmdir) 기록. ② 헤드리스 Chrome 휴리스틱 캐시가 구번들을 서빙해 첫 캡처가 수정 전 동작을 보여줬다 — 캡처 전 프로필 초기화를 절차화.

**커버리지 게이트 판정 (HCI-X-3 종결)**: clean-slate 연속 재현 + pre-X 기준선(`d61d6d8`) worktree 실측으로 **파일별 임계 미달 14종(MetricChart·드릴다운 화면들)이 X 이전부터 동일 수치로 존재하는 pre-existing 결함**임을 확정했다. 어제의 green 2회가 이상치(원인 미상 — 커버리지 캐시/타이밍 추정). X 계열 신규·변경 파일은 전부 파일별 임계 충족. → 수리 여부는 HCI-X3-1로 인간 결정 대기.

## Phase X4 추기 (2026-08-14) — 필터 + 시간 팬(3영역) + 휠 줌

**한 일**: X4-a(`0ca97d1` — 표시 필터: 상태 2·유형 6칩 팝오버) → X4-b(`b3abf6e` — 3× 조회·PanScrollbar 공용 컴포넌트·4카드 동기 스크롤바·타임라인 panControl 슬롯(§7 부분 해제 범위)·X-View 스크롤+휠 줌) → codex 지적 6건 전건 수정(`7efa432`). 캡처 3장(필터·과거 팬·줌인) 인간 전달.

**잘된 점**: codex 리뷰가 상호작용 결함 5건(선택↔줌 경합·추적/고정 의미론·범위 변경 잔존·스크롤 플래그 경합)을 정확히 잡았다 — 단일 기능 테스트로는 못 보는 **상태 전이 조합**이 리뷰의 실효 영역임이 재확인됨. 수정마다 회귀 테스트를 남겨 재발 창구를 닫았다.

**어려웠던 점**: ① 게이트 순서 실수 — 테스트 보강 후 lint 재실행을 빠뜨려 blocking 지적(CDX-X4-01)을 자초했다. **교훈: 파일을 만진 마지막 시점 이후 반드시 lint·typecheck 재실행.** ② 수동 뷰를 절대 구간으로 저장한 초기 설계가 추적/고정·범위 변경과 충돌 — {폭, 앵커|null} 분리 저장으로 재설계.

**타임라인 부분 해제 준수**: Timeline.tsx 변경은 `panControl` 슬롯 렌더 1곳 + prop 타입뿐(§7 승인 범위 내). 쿼리 표현식·세그먼트화·브러시 diff 0.

## Phase X5·X5-b 추기 (2026-08-14) — 드래그 상호작용 + 구간 쿼리 목록

**한 일**: 인간 제공 참고 jsx(Recharts 목업)에서 **기능만** 채택해 기존 D3 스택으로 구현(`188fa0f` — 드래그 영역 표시·⟲ 초기화·하단 범례 클릭 토글·고정 점 강조). 이어 인간 정정("드래그하면 확대가 아니라 드래그 시간대의 쿼리 목록이 나와야해")으로 드래그 의미를 **구간 쿼리 목록 모달**로 교체(`ce4504d` — 좌측 정렬 목록(종료/소요/대기) + 우측 툴팁 동일 상세, ↑↓·이전/다음 순회 — "하나씩 보면서 구간 분석" 동선). 확대는 휠 줌이 전담. codex 지적 2건(major) 전건 수정(`7a4716e`) + 재확인 Fixed·신규 0.

**잘된 점**: codex가 또다시 **상태 전이 조합**(드래그 잔존 플래그가 다음 클릭을 삼킴 · 폴링 redraw가 진행 중 드래그를 유실)을 잡았다 — X4 회고의 패턴 그대로. 수정은 표준 관용구로 수렴: 1회성 부작용은 `{capture, once}` 리스너 + 다음 태스크 해제, redraw를 넘겨야 하는 상태는 ref 승격 + 재생성 시 복원.

**어려웠던 점**: ① jsdom은 mouseup 뒤 브라우저의 자동 click을 쏘지 않아, 1회성 삼킴이 테스트의 **다음 합성 click(정렬 헤더)** 을 먹었다 — 실제 브라우저와 이벤트 시퀀스가 다른 지점은 테스트에서 태스크 플러시(`setTimeout 0` await)로 명시해야 한다. ② 모달 선택을 인덱스로 저장한 초안은 폴링 갱신에 선택이 미끄러진다 — 안정 키(`stmtId|endMs`) 저장 + 파생 인덱스 + 소실 시 인접 보정으로 재설계(자체 발견, `7a4716e`에 동승).

**범위 준수**: 계약·exporter·PromQL·타임라인 diff 0. Recharts 미도입(ADR R-0002). X6 후보였던 "구간 분석 목록"은 X5-b로 흡수 — 별도 phase 불요.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-X-1 | Design | X-View 시각 충실도 — 점 크기·유형 6색·실패 ✕·Y축 스케일·요약행 배치는 자동테스트가 DOM·색상까지만 보장 | 전달된 스크린샷으로 화면 확정(§2 UI 렌더 검증의 한계). 수정 지시 시 반영 | 아니오 |
| HCI-X-2 | Scope | mypy 2.1 드리프트 보정이 X1 스코프 밖 파일 1건(test_drilldown_sim.py 타입 주석) 포함 | 최소 보정 허용 여부 사후 승인 | 아니오 |
| HCI-X-3 | Risk | web test:coverage 파일별 임계 1회 플레이크(오탐 19건 → 연속 2회 green) | 재발 시 vitest coverage 워커 조사 지시 여부 | 아니오 |
| HCI-X-4 | Architecture | 커밋 브랜치 — AGENTS §7 원칙은 `dev` 통합이나 인간 지시 흐름에 따라 `feat/handoff-20260807`에 커밋·푸시(§7 Design ④ 기록) | dev 병합 시점·방식 결정 | 아니오 |
| HCI-X3-1 | Risk | web 파일별 커버리지 임계 미달 14종이 **pre-existing으로 확정**(X 이전 커밋 d61d6d8에서 동일 수치 재현) — 현행 `test:coverage` 게이트는 이 파일들 때문에 exit 1 | 14종 커버리지 보수 작업을 별도 phase로 지시할지, 당분간 예외로 둘지 결정 | 아니오 (X 계열 파일은 전부 충족) |
| HCI-X3-2 | Design | 툴팁 고정 시각 표시(파란 테두리)·해제 UX(바깥 클릭/Esc)가 의도와 맞는지 | 전달된 고정 증명 캡처로 확인, 수정 지시 시 반영 | 아니오 |

## Phase X6 추기 (2026-08-18) — Query 팝업 탭(SQL/로그/플랜) + Statement Kill 목업 반영

**요약**: 인간 요청("Query ID 팝업에 로그 탭 + 플랩 탭 + 킬 버튼") → 플랜 모드 질의 확정 2건(플랩=실행 플랜 탭, Kill=**목업 데이터에 반영**) → §0.1 Out-of-Scope에서 Statement Kill 부분 해제(§7 승인 행). 팝업을 `QueryDetailModal.tsx`로 추출(탭 3종), 로그·플랜은 결정론 목업(`mockQueryDetail.ts`), Kill은 exporter 명령 API(`http_api.py` — stdlib 단일 포트 :9801) → 예약 → 다음 tick `killed_by_admin` 강제 종료. **TV-C1 무변경**(기존 enum·기존 메트릭 재사용, additive 0).

**잘된 것**:
- 기존 종료 기계 전량 재사용 — kill 반영이 `end_ts` 당김 + 실패 사유 강제 2곳으로 끝났다. 실패 이력·X-View ✕·타임라인 해제·신원 반납이 전부 공짜로 따라왔다.
- codex 리뷰 3회전(medium 1 + low 재확인 2)이 **실전 결함 2건을 잡았다**: stmt_id 재사용 ABA(X6-R1→R4, 세대 토큰 fail-closed로 종결 — python json이 NaN을 통과시키는 우회까지)와 Content-Length 무검증(X6-R2 — 리뷰어가 소켓 레벨로 직접 재현). 특히 R4는 1차 처리(옵션 토큰)의 fail-open 잔재를 재확인 회차가 잡은 것 — 재확인 리뷰의 가치 실증.
- 실측 우선: verify-native·curl(정토큰 200/오토큰 404/무토큰 400/CL "nope" 400)·브라우저 3탭·Kill 다이얼로그·행 소멸까지 배포 스택에서 확인.

**어려웠던 것 / 사고**:
- 브라우저 스모크 중 모달이 저절로 다른 쿼리로 바뀌는 "유령 동작" — 코드 결함이 아니라 **사용자가 같은 Chrome 탭을 동시에 조작**한 것으로 추정(뷰포트 크기까지 변함). 이후 좌표 대신 요소 참조(find ref)로 전환해 해소.
- UI 킬 실측이 404("이미 종료") 경로를 탔다 — 팝업을 열어 둔 사이 문장이 자연 종료. 그 자체가 설계대로의 동작이라 200 경로는 curl·vitest로 갈음.
- web `test:coverage` 파일별 임계 미달 19건은 **X6 이전 기준선과 동일**(stash 대조 실측 — HCI-X3-1의 pre-existing 결함과 같은 것). X6 신규 파일 3종은 전부 임계 충족, QueryAnalytics는 explainPlan 이동으로 statements가 79.5%로 내려간 것을 실패 경로 테스트 추가로 82.1% 복구.
- Grafana `gen_llm_dashboard.py` 재생성물이 커밋본과 다름(커밋본에 포털 드릴다운 링크 존재 — 생성기에는 없음). X6 무관 pre-existing 드리프트라 커밋본으로 원복하고 기록만 남긴다(HCI-X6-1).

**다음 phase에 반영**:
- 상태 변경 API를 추가할 때는 **세대/신원 재사용**을 계획 단계 리스크에 명시할 것 — 이번엔 리뷰가 잡았지만 계획서에는 없었다.
- codex 프롬프트에 따옴표가 있으면 PowerShell 인자로 깨진다 — stdin 파일 전달 방식 고정.

## Phase X6 Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-X6-1 | Risk | `grafana/provisioning/dashboards/json/llm-top-view.json` 커밋본이 현 생성기 출력과 불일치(커밋본에 `/mon/dashboard/llmReact` 포털 링크 — 생성기 미반영). TV-C2 "생성기=SoT" 원칙 위반 상태가 X6 이전부터 존재 | 생성기에 포털 링크를 반영할지, 커밋본을 재생성물로 되돌릴지 결정 | 아니오 (X6는 grafana 무수정) |
| HCI-X6-2 | Design | Kill 성공 토스트·비활성 사유 문구, 탭 순서(SQL 기본)가 의도와 맞는지 | 실기동 화면 확인, 수정 지시 시 반영 | 아니오 |
