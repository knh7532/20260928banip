# 계획 문서 (plan.md) — GPU/SQream Monitoring Dashboard Top-View 목업

> 상태: **인간 승인 완료** (2026-07-14, §7 인간 승인 기록 참조)
> 준거: `docs/AGENTS.md` (본 프로젝트 선언 §0.1)

## 1. 요구사항 요약

- **목적**: `../서류/gpu_dashboard.pptx`(저장소 루트 기준 `서류/gpu_dashboard.pptx`)의 "GPU/SQream Monitoring Dashboard" 단일 화면을 Prometheus + Grafana **순수 단일 대시보드**로 재현하는 시연용 목업.
- **원 요구**: 기존 `../mockup/`과 유사한 방식으로 진행하되 새 폴더(`top_view_mockup/`)에서 독립 수행, `../mockup/docs` 문서 형식 준수, `docs/AGENTS.md`를 이 목업에 맞게 신규 작성.
- **인간 확정 사항** (2026-07-14 계획 검토):
  1. UI 방식: 순수 Grafana 단일 대시보드 — 커스텀 UI 셸 없음, PPTX 좌측 AX Portal 사이드바 재현하지 않음
  2. 실행 환경: docker-compose + Windows 네이티브 모드 병행
  3. 문서: 핵심 세트(AGENTS.md/plan.md/ADR/architecture 2건) + Phase별 retrospectives/reviews
  4. 리스너 **0.0.0.0 바인딩** — 다른 컴퓨터 연결 대비 (ADR-0004)
  5. **동적 시뮬레이션 패턴 보류** — 정적 데이터로 먼저 화면을 띄우고 인간 정적 검토 후 별도 승인으로 진행 (§8 Deferred)
- **Out of Scope**: AGENTS.md §0.1 참조 (사이드바 UI, 알람 라우팅, LLM/Cost 메뉴, Session Kill, 실 DB/GPU 연동, 백필).

## 2. 기능 범위 — PPTX 화면 구성요소 매핑

| # | PPTX 구성요소 | Grafana 구현 | 데이터 원천 (TV-C1) |
| --- | --- | --- | --- |
| 필터바 | 환경 / 인스턴스(서버) / GPU / 시간범위(Last 6 hours) / 자동갱신(5s) | 템플릿 변수 `env`·`instance`·`gpu` + time picker(now-6h) + refresh 5s | 라벨 `env`/`node`/`gpu` |
| ① | 실행 중인 SQream DB 쿼리 테이블 (GPU/Statement ID/쿼리 ID/사용메모리/GPU%/CPU%/시작시간/사용자) | Table 패널 — instant 쿼리 5개 `joinByField(stmt_id)` + organize | `sqm_statement_*` 5종 |
| ② | SQL 쿼리 성능 정보 테이블 (쿼리명·유형/DB/GPU/처리행수·초/응답 P95/상태) | Table 패널 — instant 쿼리 3개 `joinByField(query_name)` | `sqm_query_*` 3종 |
| ③ | 시간대별 GPU 세션 & 쿼리 실행 타임라인 (GPU-0~3 간트, 유형 6종 범례) | State timeline 패널 — enum 값 + value mapping(쿼리명·유형 병기) | `sqm_gpu_timeline_state` |
| ④ | GPU 시계열 4종 (사용률%/메모리%/온도°C/전력W, GPU-0~3 시리즈) | Time series 패널 4개 | `DCGM_FI_DEV_*` 원천 메트릭 5종 (FB_USED+FB_FREE로 메모리% 산출 — 표시 패널은 4종) |
| ⑤ | 서버 요약 카드 3개 (사용률·메모리·온도 평균, 전력 합계) | Gauge 패널 3개 — PromQL `avg by(node)`/`sum by(node)` | `DCGM_FI_DEV_*` 집계 |

## 3. 계약 소유권 표 (§5.1)

| 필드 | TV-C1 | TV-C2 |
| --- | --- | --- |
| contract_id | TV-C1 | TV-C2 |
| 설명 | 메트릭 이름·라벨 스키마 | Grafana 대시보드 JSON |
| source_of_truth_path | `top_view_mockup/docs/architecture/db-schema.md` | `top_view_mockup/grafana/gen_dashboard.py` |
| owner_role | exporter | grafana |
| owner_human_approver | 프로젝트 소유 개발자 | 프로젝트 소유 개발자 |
| producer_paths | `top_view_mockup/exporter/exporter/metrics.py` | `top_view_mockup/grafana/gen_dashboard.py` |
| consumer_paths | `top_view_mockup/grafana/gen_dashboard.py` | `top_view_mockup/grafana/provisioning/dashboards/json/top-view.json`, `top_view_mockup/native/grafana/provisioning/` |
| regen_command | (해당 없음 — 문서가 SoT) | `python top_view_mockup/grafana/gen_dashboard.py` |
| drift_check_command | `cd top_view_mockup/exporter && pytest tests/test_contract.py` | regen 후 `git diff --exit-code top_view_mockup/grafana/provisioning/dashboards/json/` |
| 버전 | **v1.2** (2026-07-15) — `sqm_query_executions_total` Gauge → Counter (Phase 5). 개정 이력은 db-schema.md 마이그레이션 절 | — |

## 4. 아키텍처 산출물 상태 (§3.4)

| 산출물 | 경로 | 상태 |
| --- | --- | --- |
| 시스템 아키텍처 | `docs/architecture/system.md` | Phase 1 작성 |
| DB 스키마(메트릭 스키마 TV-C1 + RDB N/A) | `docs/architecture/db-schema.md` | Phase 1 작성 |
| ADR | `docs/adr/0001~0004` | Phase 1 작성 |
| data/security/deployment/sequences | — | **명시적 면제** (AGENTS.md §3.4 축소 선언 — `../mockup/docs/architecture/*` 참조로 갈음) |

## 5. Phase 분해 (§6.2 닫힌 게이트)

각 Phase 공통 종료 게이트: 구현 → 테스트/린트/커버리지(§3.3) → codex 리뷰(`docs/reviews/phase-N-codex-review.md`) → 지적 전건 처리(`-resolution.md`) → 회고(`docs/retrospectives/phase-N-*.md`) → dev 커밋. 스코프 검증 `SCOPE=top_view_mockup/`.

### Phase 1 — 거버넌스·설계 문서 + 스캐폴딩
- **목표**: 프로젝트 선언·계약·설계를 확정하고 검증 명령이 실행 가능한 뼈대를 만든다.
- **작업/산출물**: `docs/AGENTS.md`(신규), `docs/plan.md`, ADR-0001~0004, `docs/architecture/system.md`·`db-schema.md`, `exporter/` 패키지 스캐폴딩(pyproject/패키지 init/기본 테스트), `.gitignore`/`.env.example`
- **수락 기준**:
  - [x] AGENTS.md·plan.md·ADR 4건·architecture 2건 존재, system.md에 mermaid 블록 ≥1 (§3.4 점검 명령 통과)
  - [x] db-schema.md에 TV-C1 전 메트릭(이름·타입·라벨·값 의미·카디널리티 규칙) 표 + RDB N/A 근거
  - [x] 계약 표(§3)에 §5.1 필수 필드 전부 기재
  - [x] `cd exporter && ruff check . && mypy . && pytest` 실행 가능(0 fail)
- **의존성**: 없음

### Phase 2 — 정적 exporter + 스택 기동
- **목표**: 계약 TV-C1을 정적 데이터로 구현하고 docker-compose로 Prometheus 수집까지 확인한다.
- **작업/산출물**: `exporter/exporter/{main,metrics,static_data}.py` + 테스트(`test_contract`/`test_static_data`/`test_main`), `prometheus/prometheus.yml`, `docker-compose.yml`, `exporter/Dockerfile`
- **수락 기준**:
  - [x] 계약 대사: `pytest tests/test_contract.py` exit 0 (metrics.py ↔ db-schema.md 이름·라벨 일치)
  - [x] 정적 수치 대사: `pytest tests/test_static_data.py` exit 0 (PPTX 수치 ↔ static_data.py — 서버 카드 집계값 일치 포함)
  - [x] `pytest --cov=exporter --cov-fail-under=80` exit 0, `ruff check . && mypy .` 0건
  - [x] `docker compose up -d` 후 Prometheus(9091) 타깃 1/1 UP, `:9801/metrics`에 `DCGM_FI_DEV_GPU_UTIL` 12시리즈·`sqm_gpu_timeline_state` 12시리즈·`sqm_statement_running` 5시리즈 존재
  - [x] 0.0.0.0 리스닝 확인 (`netstat` 또는 타 호스트 curl)
  - [x] Grafana 비밀번호 미설정 기동 거부 (CDX-P1-14/CDX-P1R2-02 이관): compose가 `${GRAFANA_ADMIN_PASSWORD:?}`를 사용하고, `.env` 부재 또는 빈 값 상태에서 `docker compose config`가 non-zero exit
- **의존성**: Phase 1 (계약 확정)

### Phase 3 — Grafana 대시보드 생성기 + 인간 정적 검토 체크포인트
- **목표**: 화면 ①~⑤를 단일 대시보드로 재현하고 드리프트 제어를 확립한다. 렌더 후 인간이 정적 화면을 검토하는 체크포인트를 갖는다.
- **작업/산출물**: `grafana/gen_dashboard.py`, `grafana/provisioning/`(datasource/dashboards/json), compose grafana 서비스 검증
- **수락 기준**:
  - [x] 생성기 idempotent + 드리프트 0: `python grafana/gen_dashboard.py && git -C .. diff --exit-code -- top_view_mockup/grafana/provisioning/dashboards/json/` exit 0
  - [x] JSON 검증 스크립트(테스트) exit 0: 패널 구성 table 2·state-timeline 1·timeseries 4·gauge 3, 템플릿 변수 env/instance/gpu 존재
  - [x] Grafana(3001) 대시보드 검색 1건 + 홈 대시보드 로드
  - [x] 인간 정적 검토 체크포인트 — 회고 Human Check Item으로 기록 (HCI-3-1 등재 완료, 검토 결과 수정 지시는 후속 반영)
- **의존성**: Phase 2 (메트릭 존재)

### Phase 4 — Windows 네이티브 모드 + README
- **목표**: 무Docker 환경 실행 경로를 완성하고 1차(정적) 범위를 마감한다.
- **작업/산출물**: `native/{setup,start,stop,verify}-native.ps1`, `native/prometheus-native.yml`, `native/grafana/provisioning/`, `README.md`
- **수락 기준**:
  - [x] `setup-native.ps1` 후 `start-native.ps1` → 3프로세스(exporter/prometheus/grafana) 기동, 0.0.0.0 리스닝
  - [x] `verify-native.ps1` ALL CHECKS PASSED (exit 0): 타깃 1/1 UP, Grafana health + 대시보드 1/1, `:9801/metrics`에 `DCGM_`·`sqm_` 스팟체크
  - [x] `stop-native.ps1` 정상 종료 + 재기동 시 TSDB 보존
  - [x] 기존 mockup 스택과 포트 무충돌(9801/9091/3001)
  - [x] README에 두 실행 모드·검증 명령·외부 접속(방화벽) 안내 기재
- **의존성**: Phase 3


### Phase 5 — 동적 시뮬레이션 + Grafana판 보정
- **목표**: 값이 실제로 움직이게 한다 — 쿼리가 순환하고, 타임라인 세그먼트가 생기고, GPU 지표가 쿼리 부하와 연동된다. 소비 측(Grafana) 쿼리도 함께 보정한다. (DEF-1 해제 — 인간 승인 2026-07-15)
- **인간 확정 사항**: ① 시간 압축(쿼리 30초~3분, 기본 시간범위 30분) ② 서버 카드는 원본 고정 수치를 포기하고 자유 변동(서버별 성격만 차등)
- **작업/산출물**: `exporter/exporter/{sim_params,simulation,query_sim,gpu_sim}.py`(신규), `metrics.py`(계약 v1.2 — Counter 전환·LockedRegistry), `main.py`(tick 루프), `static_data.py` 삭제. 테스트 5종(불변식). `docs/adr/0008-dynamic-simulation.md`, `db-schema.md` §2·§3·§5·타입 표·마이그레이션 개정, `system.md` 데이터 흐름. `grafana/gen_dashboard.py`·`check_dashboard.py` 보정.
- **수락 기준**:
  - [x] 불변식 테스트 통과: GPU당 1쿼리 / 종료 시 statement 라벨셋 5종 제거 / 누적 라벨셋 ≤ 36 / In Queue 실제 발생 / Counter 자식 12개 사전 초기화 / `*_created` 미노출 / 값 범위·재현성
  - [x] `ruff && mypy && pytest --cov=exporter --cov-fail-under=80` 통과 (41 tests, 커버리지 ≥ 98%)
  - [x] 계약 v1.2 대사: 문서 타입 표 ↔ CONTRACT ↔ 실제 노출 타입(Counter/Gauge) 3자 일치
  - [x] 대시보드 보정: 상세 패널이 현재 시점 selector(신원 재사용 시 many-to-many 방지), 쿼리 수는 `increase()`, GPU 행은 `by(node, gpu)`, 클릭 창 2분, 기본 30분 — `check_dashboard.py` 통과 + 드리프트 0
  - [x] 실스택 실측: 쿼리 순환(타임라인 전이 다수), 서버별 사용률 차등, 포화 없음, `increase()` 정상
- **의존성**: Phase 1~4 (계약·대시보드·실행 모드)

## 6. Cross-Review 기록 (§3.1)

### 6.1 초안 작성

Claude Code (model_id `claude-fable-5`), 2026-07-14 — 탐색(기존 mockup 관습·PPTX 분석) + Plan 설계 종합. 인간 개발자가 플랜 모드에서 직접 검토·**수정**·승인(§7). 인간 검토 시 지적 2건 모두 **Accepted**: ① 리스너 127.0.0.1 → 0.0.0.0 변경(다중 PC 연결 대비) ② 동적 시뮬레이션 패턴 보류·정적 데이터 우선.

### 6.2 독립 교차 검증 (타 모델)

리뷰어 공통: OpenAI Codex `gpt-5.6-sol` (reasoning effort xhigh, codex-cli 0.144.1, codex-rescue 플러그인 경유 `codex exec` read-only) — Claude(claude-fable-5)와 상이한 모델·실행 주체.

| 회차 | session_id | 검토 대상 draft SHA-256 (plan.md) | 검토 시각 (UTC) | 결과 |
| --- | --- | --- | --- | --- |
| 1차 | thread `019f60b0-0023-7182-b953-57565fe99376` / job `task-mrkniyvi-5jrkom` | `2c8a7b0c0322203902e917f9378f982a816804073ff0c51e32df23799374efac` | 2026-07-14T12:52~13:05 | 지적 15건 (Blocking 1 / Major 12 / Minor 2) — `docs/reviews/phase-1-codex-review.md` |
| 2차(재검증) | thread `019f60bf-0c2c-7643-87bd-d9f85ade39bc` / job `task-mrko43wk-vmpe6r` | `6ceeaee8ecca9d262cba7aaa4940dcd02ac65df8f206c51c78c1e7fe1e95d331` | 2026-07-14T13:10~13:20 | 11건 Resolved, 4건 잔여(-02/-03/-13/-14) + 절차성 신규 1건(CDX-P1R-01) |
| 3차(최종 검증) | `docs/reviews/phase-1-codex-resolution.md` 재검증 절에 기록 | 동 문서에 최종 hash 기록 | 동 문서 참조 | 동 문서 참조 — 신선도 무한회귀 방지를 위해 최종 회차 기록은 resolution 문서에 둔다 |

### 6.3 이의 처리 (Adjudication)

1·2차 지적 전건 **Accepted → Fixed** (지적별 처리 상세·증거는 `docs/reviews/phase-1-codex-resolution.md`). Rejected/Escalated 없음.

**인간 재승인 관련 판단**: 인간의 구현 착수 승인(§7)은 draft 갱신 전에 §3.1-4 절차로 확보되었고, 이후의 plan.md 변경은 리뷰 지적 반영(경로 표기·명령 수정·감사 기록 보강)으로 **승인된 결정 사항과 수락 기준의 의미를 바꾸지 않는다**. 따라서 Phase 2 착수는 비차단으로 진행하되, 갱신된 계획 문서의 재확인을 **HCI-1-1**(Phase 1 회고)로 등재하여 다음 인간 접점(Phase 3 정적 검토 체크포인트)에서 확인받는다.

## 7. 인간 승인 기록

| 날짜 | 승인자 | 대상 | 결과 |
| --- | --- | --- | --- |
| 2026-07-14 | 프로젝트 소유 개발자 | 구축 계획 v2 (UI 방식·실행 환경·문서 범위·0.0.0.0 바인딩·정적 우선) | **승인** — 플랜 모드 명시 승인. 승인된 계획 사본: 세션 플랜 파일 |
| 2026-07-15 | 프로젝트 소유 개발자 | **Phase 5 동적 시뮬레이션 착수**(DEF-1 해제) + 계약 TV-C1 v1.2(Counter 전환) + Grafana판 보정. 파라미터: 시간 압축(기본 30분), 서버 카드 자유 변동 | **승인** |

## 7.1 인간 정적 검토 기록 (HCI-3-1 진행)

| 회차 | 날짜 | 지시 | 반영 |
| --- | --- | --- | --- |
| 1차 | 2026-07-15 | 대시보드 배치가 PPTX 원본과 다름 — PPTX 동일 배치로 재배치 (커스텀 셸 전환은 기각, 순수 Grafana 유지) | gen_dashboard.py gridPos 재배치: 테이블 나란히(13+11) → 전폭 타임라인(24×6) → 시계열 얇은 스트립 4줄(18×3, 범례 숨김) + 세로형 서버 카드 3열(2×12, orientation vertical). check_dashboard.py 기대 계약 동기화 |

| 2차 | 2026-07-15 | GPU 서버 계기판(카드)을 위아래로 배치 | 서버 카드 3장을 우측에 세로 적층(18,{13,17,21},6,4), 카드 내부는 게이지 4개 좌우 배열 — Grafana 의미론상 `orientation: vertical`(항목이 좌우로 늘어선 열). 최초 horizontal로 잘못 설정했다가 codex 확인 리뷰 Blocking 지적으로 정정. check_dashboard.py 동기화 |

| 3차 | 2026-07-15 | 카드 **내부**의 게이지 4개를 위→아래로 적층 (2차 지시의 의도 명확화 — PPTX 원본 카드 모양) | 세로로 긴 카드 3장 나란히(18/20/22,13,2,12) + orientation `horizontal`(항목 위아래 적층). h=12 콘텐츠 ~448px ≥ 4×75px 최소 높이로 무스크롤. check_dashboard.py에 orientation·높이 가드(≥10행) 추가. codex 확인 리뷰 "Blocking 잔존 없음"(항목 높이 ~98px·폭 ~150px 산술 확인) |

| 4차 | 2026-07-15 | PPTX의 "선택 구간 상세 정보" 박스 구현 여부 질의 → 구현 지시 | Grafana에 클릭 팝업이 없어 관용 방식으로 구현: 타임라인 (0,7,18,6) 축소 + stat 패널 "선택 구간 상세 정보" (18,7,6,6) 신설 — 드래그 구간 선택 → `$__range` 집계 갱신(rows/s 합·P95 평균·메모리 조인 합·Statement 수). PPTX '쿼리 수'(누적)는 TV-C1에 메트릭이 없어 실행 Statement 수로 대체(description 고지, 누적 카운터는 DEF-1에서 검토). codex 확인 "Blocking 잔존 없음" + 비차단 지적(쿼리 원문 미고정) 즉시 반영(8c 원문 대조) |

| 5차 | 2026-07-15 | 구간 선택을 여러 번 하면 화면이 망가짐 | 원인: 드래그 확대 누적으로 범위가 샘플 간격(5s) 이하로 좁아지면 집계가 비고 복귀 수단 부재. 조치: ① 대시보드 상단 "전체 구간(6h)으로 리셋" 링크(includeVars=true 필터 유지·keepTime=false 시간 초기화) ② 상세 패널 noValue 안내 문구 ③ description에 누적 확대·복귀 안내. 검증기 8d 신설(링크 URL 정확 일치·속성). codex 확인 "Blocking 잔존 없음" |

| 6차 | 2026-07-15 | ① 돋보기(−) 버튼: Grafana 내장 기능으로 확인(추가 불요, 위치 안내) ② 상세 패널 정보를 PPTX와 일치 ③ 타임라인에서 개별 GPU 선택 | ② 상세 패널 v2 — 시간 구간(제목 전역 변수, HH/mm/ss 분리 보간), GPU·쿼리·DB(E: 타임라인 상태+`쿼리명 · db` 매핑), 쿼리 ID(F), 처리행수/A·P95/B·메모리/C, **쿼리 수/D**. ③ 타임라인 막대 데이터 링크(`${__url_time_range}`+var-instance/var-gpu 전달, 같은 탭) + "구간·필터 모두 초기화" 링크. 레이아웃 h=7·스트립 y14~·카드 y14. codex 확인 지적 2건(제목 포맷 콜론·개정 기록 누락) 반영 후 재확인 |

| 7차 | 2026-07-15 | ① 상세 패널에 8항목(시간 구간·GPU·쿼리 ID·데이터베이스·처리행수/초·응답시간(P95)·쿼리 수·사용 메모리) 전부 행으로 ② 글씨 확대 ③ 바 선택 시 그 바 정보만 | ① 시간 구간=text 패널(전역 변수 보간 보장) + 상세 stat 7행(PPTX 순서, GPU행 값=쿼리명·데이터베이스행 값=db명·쿼리 ID행). 응답시간(P95)은 선택 GPU 활성 쿼리 조인으로 개선(실측 gpu0→1.28/1→1.05/3→0.88) ② 상세 영역 h9로 확대 + `options.text {titleSize:12, valueSize:18}` 고정, 스트립 h4 ③ 바 클릭 링크가 `time=${__value.time}&time.window=600000`(클릭 중심 10분 창) + GPU 필터 전달 — 정적 단계에선 세그먼트 경계 메타데이터가 없어 근사(CDX 판정: 최선의 근사로 수용). codex 확인 2회 — Blocking(시간 미축소)·중복 표기 지적 반영 후 "Blocking 잔존 없음" |

| 8차 | 2026-07-15 | 타임라인 세로축을 늘려 "선택 구간 상세 정보" 영역과 높이를 맞출 것 | 타임라인 h7→11 (우측 시간 구간 text 2 + 상세 stat 9와 정합), 스트립 y18~(h4 유지), 서버 카드 h12→16(게이지도 커짐). 순수 gridPos 변경 — 검증기 정확 일치 대조·그리드 산술(겹침 0·공백 0·34행)·멱등으로 전량 기계 검증되어 codex 확인 생략(변경에 의미론 없음) |

| 9차 | 2026-07-15 | ① 쿼리 성능 정보의 상태를 Initializing/In Queue/In Process로 ② 도움말에서 내부 문서 출처(ADR/PPTX/MOCK/TV-C1/db-schema) 제거 — 처음 보는 사람 기준으로 | ① 상태 매핑 0→Initializing(파랑)/1→In Process(초록)/2→In Queue(주황), 상세 F행도 In Process로 통일 (메트릭 값 의미는 계약 불변 — 표시 계층만) ② 전 패널 도움말 재작성(P95 뜻풀이 포함), 태그 mockup→demo ③ 재발 방지: 검증기 8f — 전 UI 노출 문자열(제목·설명·displayName·매핑 텍스트·링크 제목/툴팁·noValue·변수 라벨·태그) 금지어 검사, 변조 탐침 4종(노출 지점별) 전부 검출 확인. codex 확인 3회(링크 툴팁 스캔 누락 지적 반영) 후 "Blocking 잔존 없음" |

> **계약 TV-C1 개정 v1.1 (2026-07-15, 정적 검토 6차)**: PPTX "쿼리 수" 항목 재현을 위해 `sqm_query_executions_total{env, node, gpu}` 추가. SoT(`docs/architecture/db-schema.md`) §3 표·§5 정적값(01/GPU-0=12,458 PPTX 앵커) 개정, `exporter/exporter/{metrics,static_data,main}.py`·테스트 3종 동기화(24 passed, 커버리지 100%). **MOCK 예외**: 1차(정적)에서는 고정값 게이지로 노출하며 `_total` 명명은 동적 전환(Counter) 대비 선점 — DEF-1에서 Counter로 전환한다. 동적 전환 시 재설계 항목(6차 리뷰 주의 사항): 상세 E는 `max_over_time`이라 구간 최신값이 아닌 최대 인덱스이며 node가 병합됨, F는 구간 중 존재했던 ID를 모두 "실행 중"으로 표시 — DEF-1에서 `last_over_time` 기반으로 교체.

> **검증 기록 (1차 반영분)**: 재생성 멱등(sha256 동일) · check_dashboard exit 0 · 그리드 산술 검사(겹침 0, 미커버 셀 0, 25행) · 실행 중 Grafana API에서 10패널 새 gridPos 반영 확인.
> **검증 기록 (2차 반영분)**: 동일 4종 게이트 전부 통과(멱등 sha256 `cb7b8dd7…`, check exit 0, 그리드 겹침 0·공백 0·25행, 실행 중 Grafana API에서 카드 3장 (18,{13,17,21},6,4)·horizontal 반영 확인).
> **codex 확인 리뷰 (ESC-TV-1 → 해소)**: 1차 반영 직후 codex API가 전 모델 400 오류로 일시 불가(동일 오류 4회, §4-1 한도)여서 보류로 기록했으나, 같은 날 서비스 복구 후 1·2차 반영분 통합 확인 리뷰를 수행 — gauge orientation 의미론 오류(Blocking) 1건 지적받아 `vertical`로 정정, 재확인에서 **"Blocking 잔존 여부: 없음"** 판정 (비차단 노트: sizing=auto에서의 최소 높이 주석 뉘앙스 — 주석 완화 반영).

## 8. 보류(Deferred) 항목

| ID | 항목 | 조건 | 상태 |
| --- | --- | --- | --- |
| DEF-1 | **Phase 5 — 동적 시뮬레이션** | 인간의 정적 목업 검토·승인 | **해제 (2026-07-15)** — 인간이 정적 검토 9차까지 마친 뒤 동적화를 승인했다. 시간 압축·자유 변동 파라미터도 함께 확정. 구현은 위 Phase 5 참조 |

## 9. 수락 기준 추적표 (Phase 종료 시 갱신)

Phase 종료 시 해당 phase의 체크박스를 [x]로 갱신하고, 기준↔코드/테스트 경로 매핑을 회고에 기록한다.

## 10. 선언된 예외 (Declared Exceptions)

| ID | 대상 규칙 | 예외 내용 | 근거 |
| --- | --- | --- | --- |
| EXC-1 | AGENTS.md §3.3-3 (신규/변경 라인 80%) | 커버리지 게이트를 **패키지 전체 커버리지 80%**(`pytest --cov=exporter --cov-fail-under=80`)로 대체 운용 | `exporter/` 전체가 본 프로젝트 신규 코드라 1차 범위에서 전체≈신규. 변경 라인 전용 도구(diff-cover 등) 추가 없이 종료코드 게이트 유지. 신규 로직의 테스트 존재는 codex 리뷰에서 별도 확인 (CDX-P1-13 처리) |
