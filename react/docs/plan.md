# 계획 문서 (plan.md) — LLM/GPU Top-View 통합 프로젝트

> 상태: **초안 (인간 승인 대기)** — 작성 2026-07-19
> 준거: `docs/AGENTS.md` (본 프로젝트 선언 §0.1)

## 1. 요구사항 요약

- **목적**: 형제 프로젝트 두 개를 `llm_gpu_top_view_mockup/` 하나의 프로젝트로 통합한다.
  - `../top_view_mockup/` — Python exporter(동적 시뮬레이션, 3노드×4GPU×2MIG=24슬롯) + Prometheus + Grafana 단일 대시보드. 계약 **TV-C1**(메트릭 스키마)·**TV-C2**(대시보드 JSON)의 소유자. Phase 1~5 완료.
  - `../top_view_react/` — 같은 화면의 React 재구현(React 18 + TS + Vite, C3/D3). Prometheus HTTP API 직접 조회, TV-C1 **소비자**. Phase R1~R9 완료.
- **인간 확정 사항** (2026-07-19 계획 질의):
  1. **전부 이식** — exporter + Prometheus + React + **Grafana 포함** 전부를 한 프로젝트로. 두 UI(Grafana/React) 병행 유지.
  2. **도메인 유지** — 1차 통합은 기존 GPU/SQream 도메인 그대로. **LLM 모니터링 확장은 보류(Deferred, §8 DEF-U1)** 로만 명시하고 지금 설계하지 않는다.
  3. **U1 산출물은 문서 2건** — `docs/plan.md`(본 문서) + `docs/AGENTS.md`(재작성). 코드 이동은 U2 이후의 일이다.
- **Out of Scope**: 기능 추가·리팩터링(통합은 "이동 + 이동이 강제하는 최소 경로 보정"만), 실 SQream/GPU 연동, 인증/알람, LLM 화면 구현(DEF-U1 착수 전), `../mockup/`·`../top_view_mockup_원본/`·`../서류/` 변경.

## 2. 통합 범위 매핑 표

| 구 경로 (저장소 루트 기준) | 신 경로 (`llm_gpu_top_view_mockup/` 기준) | Phase |
| --- | --- | --- |
| `top_view_react/{src,tests,scripts,index.html,vite.config.ts,tsconfig*,package*,eslint.config.js,.env.example,.gitignore}` | `web/` (npm 루트) | U2 |
| `top_view_react/docs/{adr,retrospectives,reviews,design-tokens.md,evidence*}` | `docs/` 하위 동명 병합 | U2 |
| `top_view_react/docs/{plan.md,AGENTS.md}` | `docs/history/top_view_react-{plan,AGENTS}.md` (동결) | U2 |
| `top_view_react/{native,native-linux,docker-compose.yml,Dockerfile*,nginx*,README.md}` | 일단 `web/` 아래 그대로 → U4에서 통합 | U2→U4 |
| `top_view_mockup/{exporter,prometheus,grafana}` | 동명 최상위 (`exporter/`·`prometheus/`·`grafana/`) | U3 |
| `top_view_mockup/docs/architecture/db-schema.md` | `docs/architecture/db-schema.md` (**무수정 이동** — TV-C1 SoT) | U3 |
| `top_view_mockup/docs/{adr,retrospectives,reviews}` | `docs/` 하위 동명 병합 | U3 |
| `top_view_mockup/docs/{plan.md,AGENTS.md}` | `docs/history/top_view_mockup-{plan,AGENTS}.md` (동결) | U3 |
| `top_view_mockup/docs/architecture/system.md` + `top_view_react/docs/architecture/system.md` | `docs/architecture/system.md` **신규 병합 작성** (유일한 파일명 충돌 — 구 2건은 git 이력으로 보존) | U3 |
| `top_view_mockup/{native,native-linux,docker-compose.yml,README.md,.env.example}` | `native/`·`native-linux/`·`docker-compose.yml`·`README.md` 통합 | U3 이동 → U4 병합 |

- 문서 파일명은 두 프로젝트가 충돌하지 않음을 확인했다: 회고·리뷰 `phase-1..5-*` vs `phase-R1..R9-*`, ADR `0001~0008` vs `R-0001~R-0007`. 신규 ADR은 `0009+`, 신규 회고·리뷰는 `phase-U<N>-*`.
- 이관된 이력 문서(ADR·회고·리뷰)의 본문·경로 표기는 **수정하지 않는다**(EXC-U3). `docs/history/README.md` 1곳에 "2026-07-19 이전 문서의 상대 경로·검증 명령은 작성 당시 구 루트 기준"임을 고지한다.
- `node_modules/`·`dist/`·`coverage/` 등 미추적 산출물은 이동하지 않는다 — `web/`에서 `npm ci`로 재생성. **(2026-07-19 개정)** 구 폴더는 삭제하지 않고 **보존 버전**으로 상주한다(§7 결정).

## 3. 계약 소유권 표 (§5.1)

| 필드 | TV-C1 | TV-C2 | TV-C3 (신규 — 구 react RC-1 승격) |
| --- | --- | --- | --- |
| contract_id | TV-C1 | TV-C2 | TV-C3 |
| 설명 | 메트릭 이름·라벨 스키마 | Grafana 대시보드 JSON | React 소비 PromQL 레지스트리 |
| source_of_truth_path | `docs/architecture/db-schema.md` | `grafana/gen_dashboard.py` | `web/src/api/queries.ts` (`queryRegistry()`) |
| owner_role | exporter | grafana | web |
| owner_human_approver | 프로젝트 소유 개발자 | 프로젝트 소유 개발자 | 프로젝트 소유 개발자 |
| producer_paths | `exporter/exporter/metrics.py` | `grafana/gen_dashboard.py` | `web/src/api/queries.ts` |
| consumer_paths | `grafana/gen_dashboard.py` **및** `web/src/api/queries.ts` (2소비자) | `grafana/provisioning/dashboards/json/top-view.json`, `native/grafana/provisioning/` | `web/src/hooks/`·컴포넌트 (PromQL 하드코딩 금지 — queries.ts가 유일 정의처) |
| regen_command | (해당 없음 — 문서가 SoT) | `python grafana/gen_dashboard.py` | (해당 없음 — 코드가 SoT) |
| drift_check_command | `(cd exporter && pytest tests/test_contract.py)` **그리고** `(cd web && npm run test:contract)` | regen 후 `git diff --exit-code -- llm_gpu_top_view_mockup/grafana/provisioning/dashboards/json/` (저장소 루트 기준) | `cd web && npm run test:contract` |
| 버전 | **v3.0** (2026-07-19, `llm_*` 네임스페이스 additive 추가 — DEF-U1 해제. v2.0(MIG)까지의 기존 메트릭은 불변) — 개정 이력은 db-schema.md 마이그레이션 절 | — | — |

- **TV-C2 확장 (2026-07-19)**: TV-C2는 "Grafana 대시보드 JSON **집합**"으로 확장한다 — SoT 생성기 2개: `grafana/gen_dashboard.py`(uid `tv-gpu-sqream`, 기존·무수정)와 `grafana/gen_llm_dashboard.py`(uid `tv-llm`, Phase L2 신규). regen은 두 생성기 순차 실행, drift_check는 기존 명령 그대로(json 디렉터리 단위라 두 파일 모두 커버). 검증기도 각 1개(`check_dashboard.py`·`check_llm_dashboard.py`).

- **TV-C3의 본질**: web이 실행하는 전 PromQL은 `queryRegistry()`에 등록되어야 하고 TV-C1의 부분집합이어야 한다. SoT는 queries.ts이되 **TV-C1에 종속(소비)** 이다. 구 react AGENTS의 `owner_role=external`은 폐기한다 — 통합 후 계약 소유자(exporter)가 같은 프로젝트 안에 있다.
- **TV-C1 변경 절차 (통합의 핵심 이득)**: 계획 문서 경유 + **한 커밋 안에서 3자 검증 전부 green** — ① `(cd exporter && pytest tests/test_contract.py)` ② `python grafana/gen_dashboard.py && python grafana/check_dashboard.py` + 드리프트 0 ③ `(cd web && npm run test:contract)`.
- **web 계약 테스트의 SoT 경로 변천** (`web/tests/queries.contract.test.ts`의 `SCHEMA` 상수):
  - 현재: `resolve(HERE, "../../top_view_mockup/docs/architecture/db-schema.md")`
  - U2(임시): `"../../../top_view_mockup/docs/architecture/db-schema.md"` — `web/tests/`에서 저장소 루트로 3단계
  - U3(최종): `"../../docs/architecture/db-schema.md"` — 통합 docs. 파일 헤더 주석의 SoT 표기도 동시 갱신.

## 4. 아키텍처 산출물 상태 (§3.4)

| 산출물 | 경로 | 상태/계획 |
| --- | --- | --- |
| DB 스키마 (TV-C1 + RDB N/A) | `docs/architecture/db-schema.md` | U3에서 무수정 이동 (이동 자체가 계약 개정이 아님 — 내용 diff 0) |
| 시스템 아키텍처 | `docs/architecture/system.md` | U3에서 신규 병합 작성 — 전 스택 mermaid(exporter → Prometheus → {Grafana, React} → 브라우저), 실행 3모드, 머리말에 구 2건의 출처 커밋 명기 |
| 디자인 토큰 | `docs/design-tokens.md` | U2에서 이동 (`web/src/styles/tokens.css`와 테스트 대사 유지) |
| ADR | `docs/adr/` (`0001~0008` + `R-0001~R-0007`) | U2·U3에서 병합 이동, 번호 재부여 금지(구 리뷰·회고가 인용), 신규는 `0009+` |
| 이력 거버넌스 | `docs/history/` | U2·U3에서 구 plan/AGENTS 2쌍 격리 + `README.md` 고지문 |

## 5. Phase 분해 (§6.2 닫힌 게이트)

각 Phase 공통 종료 게이트: 구현 → 테스트/린트/커버리지(§3.3, 발효된 영역 전부) → codex 리뷰(`docs/reviews/phase-U<N>-codex-review.md`) → 지적 전건 처리(`-resolution.md`) → 회고(`docs/retrospectives/phase-U<N>-*.md`) → dev 커밋. 스코프 검증 `SCOPE=llm_gpu_top_view_mockup/` (이행기 rename 예외는 EXC-U2).

### 선행 게이트 P0 — U2 착수 전 완료 필수 (Phase 아님)

- [x] `top_view_react/` 워킹트리 미커밋 변경(MIG 필터 드롭다운, 14파일) 해소 — 구 프로젝트 마지막 커밋 `d038446`으로 완주 (테스트 287 green 재확인 후)
- [x] `top_view_react/.git` **빈 디렉터리** 제거 (2026-07-19)
- [x] 이행기 중 구·신 스택 **동시 기동 금지** 확인 — 이관 전 구 스택(native 3프로세스)·Vite dev 서버(5173) 정지 후 전 포트 해제 확인

### Phase U1 — 통합 거버넌스 문서 (본 세션)

- **목표**: 통합 프로젝트의 거버넌스·로드맵을 확정한다. 코드 이동 없음.
- **작업/산출물**: `docs/plan.md`(본 문서, 신규), `docs/AGENTS.md`(재작성 — 두 형제 AGENTS의 상위 집합, 신 루트 기준).
- **수락 기준**:
  - [x] 문서 2건 존재 + AGENTS.md 스코프 선언이 신 루트: `grep -q "SCOPE='llm_gpu_top_view_mockup/'" docs/AGENTS.md`
  - [x] 구 루트 스코프 잔존 0: `! grep -nE "SCOPE='top_view_(mockup|react)/'" docs/AGENTS.md`
  - [x] 계약 표 §5.1 필수 8필드 완비: `for f in contract_id source_of_truth_path owner_role owner_human_approver producer_paths consumer_paths regen_command drift_check_command; do grep -q "$f" docs/plan.md || exit 1; done`
  - [x] codex 교차 리뷰·처리 기록 — EXC-U4에 따라 U2~U4와 통합 1회(`docs/reviews/phase-U2-U4-*`), 회고 `docs/retrospectives/phase-U2-U4-*`, 인간 승인(§7) 후 dev 커밋 `030b6f2`
- **의존성**: 없음

### Phase U2 — React 앱 이관 (react 먼저)

- **목표**: `top_view_react/` 전체를 `web/`과 통합 `docs/`로 이동하고, 모든 커밋 시점에 web 스위트를 green으로 유지한다.
- **순서 근거**: exporter를 먼저 옮기면 TV-C1 SoT(db-schema.md)가 함께 가면서 구 위치 react 계약 테스트가 죽고, 고치려면 구 폴더 동결 원칙을 깨야 한다. react를 먼저 옮기고 **임시로 구 SoT를 바라보게** 하면 전 커밋 시점 양쪽 스위트가 green이다.
- **작업/산출물**: §2 매핑 표의 U2 행 전부 `git mv`. `web/tests/queries.contract.test.ts` SCHEMA 경로 **임시** 조정(`../../../top_view_mockup/docs/architecture/db-schema.md`). `docs/history/` 생성 + 고지 README. **이동 + 이동이 강제한 최소 경로 보정만 한 커밋**(rename 검출 보존).
- **수락 기준**:
  - [x] `cd web && npm run lint && npm run typecheck && npm run test && npm run build` 전부 exit 0 (287 tests — node_modules 물리 이동으로 npm ci 불필요)
  - [x] git 이력 보존 표본: App.tsx가 rename을 넘어 R9 커밋까지 추적됨 (`git log --follow`)
  - [x] 구 폴더 잔존 추적 파일 0: `git ls-files top_view_react/` = 0 (커밋 `7c93d7c`, rename 113건)
  - [x] 스코프 검증 통과 (EXC-U2 적용 — 스코프 밖 변경은 공유 인프라 루트 `.gitignore` 2줄뿐, 회고 HCI 기록)
- **의존성**: P0, U1

### Phase U3 — Python 스택·계약 SoT 이관

- **목표**: exporter/prometheus/grafana와 TV-C1 SoT를 이동하고, SCHEMA 경로를 최종 형태로 확정한다.
- **작업/산출물**: §2 매핑 표의 U3 행 전부 `git mv`. SCHEMA 경로 **최종** 조정(`../../docs/architecture/db-schema.md`) + 테스트 헤더 주석 갱신. TV-C2 드리프트 명령 경로 갱신. `docs/architecture/system.md` 신규 병합 작성(mermaid).
- **수락 기준**:
  - [x] `cd exporter && ruff check . && mypy . && pytest --cov=exporter --cov-fail-under=80` exit 0 (41 tests, 98.66% — 시스템 Python 3.14)
  - [x] `python grafana/gen_dashboard.py` 후 드리프트 0 + `python grafana/check_dashboard.py` exit 0 (12패널·4변수)
  - [x] **web 게이트 재실행**: `cd web && npm run test && npm run build` exit 0 (최종 SCHEMA 경로 검증)
  - [x] db-schema.md 무수정 이동 확인: `rename (100%)` (커밋 `ee14c1b`)
  - [x] system.md 병합본 mermaid 블록 존재 (구 2건은 git 이력 보존 — mockup판은 재작성으로 유사도 하락해 delete+create 기록, react판은 delete)
  - [x] 구 폴더 잔존 추적 파일 0: `git ls-files top_view_mockup/` = 0
- **의존성**: U2

### Phase U4 — 실행 모드 통합

- **목표**: 실행 3모드(docker-compose / Windows 네이티브 / RHEL air-gapped)를 한 세트로 합치고 구 경로 하드코딩을 제거한다.
- **작업/산출물**: docker-compose 단일화(exporter+prometheus+grafana+web 4서비스). `native/`(ps1)·`native-linux/`(sh+systemd) 병합 — `serve-react-linux.sh` 기본 dist `$HERE/../web/dist`, systemd 유닛 `/opt/llm_gpu_top_view_mockup/...`, 반출 패키징 스크립트 단일 세트화. `web/` 아래 임시 보관하던 실행 파일들을 최상위로 흡수. README 통합. 루트 `.gitignore` 산출물명 갱신.
- **수락 기준**:
  - [x] `docker compose config` exit 0 (4서비스: exporter·prometheus·grafana·web)
  - [x] `powershell -File native/verify-native.ps1` **ALL CHECKS PASSED** — 통합 위치에서 스택 재기동 후 실측, 웹(8082) 체크 포함(web-serve 기동 상태에서 OK·미기동 시 선택 스킵 동작 확인). `web-verify.ps1`도 전 항목 OK(CORS·하드코딩 없음)
  - [x] 전 셸 스크립트 구문 `bash -n` exit 0 + 수정 ps1 3종 파서 검사 0오류
  - [x] 구 경로 하드코딩 0 (추적 파일 기준, 신 이름 부분 문자열·README 이력 언급 1건 제외. 미추적 런타임 잔재(.venv activate·과거 로그)의 구 경로는 회고 HCI 기록)
- **의존성**: U3

### Phase U5 — 전역 정합 마감 (구 폴더 삭제 **철회** — §7 2026-07-19 결정)

- **목표**: 저장소 전역의 참조 정합을 마감한다. **구 폴더 삭제는 철회** — `top_view_mockup/`·`top_view_react/`는 버저닝용 **보존 버전(동결·독립 기동 가능)** 으로 저장소에 상주한다(복원 커밋 `8c7200e`, 태그 `pre-integration`, 스왑 테스트로 기동성 실측 완료). **착수 조건: deploy/ 처리 방침의 인간 확정(HCI-U-1 잔여 — docker-kit 방침은 §7 2026-07-19 D1로 확정: 루트 킷 동결, 통합 킷 `docker-kit/` 신설)**.
- **작업/산출물**: `deploy/` 파일들의 구 경로 참조 처리(경로 갱신 vs 동결·폐기 — 인간 결정. 루트 `docker-kit/`은 구 스택용 동결 확정·수정 금지). 저장소 전역 참조 스캔(제외: 보존 폴더 2개·루트 `docker-kit/`·`docs/history/`·이관 이력 문서·`top_view_mockup_원본/`, 신 이름 부분 문자열 오탐은 치환 후 검사). 루트 `.gitignore` 사어 항목 정리.
- **수락 기준**:
  - [ ] deploy/ 방침 확정·반영 (docker-kit: 동결 확정 — §7 D1)
  - [ ] 전역 스캔: 통합 프로젝트 추적 파일에서 구 경로 참조 0건 (위 제외 목록 적용)
  - [ ] 루트 `.gitignore` 정리
- **의존성**: U4, 인간 결정(HCI-U-1 잔여). (E2E 실측은 U4에서 완료 — 재기동 검증 불요)

### Phase L1 — 계약 TV-C1 v3.0 + LLM 시뮬레이션 (DEF-U1 해제, 시안 `../서류/llm_dashboard.pptx`)

- **목표**: `llm_*` 메트릭 10종을 additive로 계약에 추가하고 동적 시뮬레이션으로 생산한다. 기존 메트릭·기존 소비자(두 대시보드·web) 무수정.
- **작업/산출물**: `docs/architecture/db-schema.md` §6(LLM 메트릭·워크로드 카탈로그 8종·카디널리티 상한 52)·타입 표·v3.0 개정 이력 추가. `exporter/exporter/{llm_params,llm_sim}.py` 신규(서비스 4종 홈 슬롯=gpu-server-01 GPU-0~3, 장수 상주+재시작 창, 단명 배치 포아송, GPU당 동시 1워크로드). `metrics.py` CONTRACT 10종 추가. `main.py` GPU 부하 `max(query_load, llm_load)` 결합(인간 확정 §7 — DCGM **값 거동**은 변할 수 있음, 스키마·기존 소비 쿼리는 불변). `tests/test_contract.py` 접두사 `llm_` + EXPECTED 10종, `tests/test_llm_sim.py` 신규(GPU당 1워크로드·상한 52·종료 remove·재현성·포화 비율).
- **수락 기준**:
  - [x] `cd exporter && ruff check . && mypy . && pytest --cov=exporter --cov-fail-under=80` exit 0 (50 tests, 98.93% — 커밋 `5b9ec70`)
  - [x] additive 증명 3자: 기존 대시보드 regen 드리프트 0 + check OK + web 계약 41 green — **기존 소비자 무수정**
  - [x] llm 계약 대사 편입: test_llm_metrics_included(10종·mig 금지) 단언
- **의존성**: 본 계획 승인(§7)

### Phase L2 — Grafana `tv-llm` 대시보드

- **목표**: 시안 ①~⑥을 두 번째 대시보드로 재현한다. 기존 `gen_dashboard.py`·`top-view.json` 무수정.
- **작업/산출물**: `grafana/gen_llm_dashboard.py`(uid `tv-llm`, 변수 env/instance/gpu — mig 없음, table ①(pid 조인)·table ②(service 조인)·state-timeline ③(0~8)·text+stat ④(8항목)·timeseries ⑤ 4스트립(`avg/sum by(node,gpu)`)·gauge ⑥ 3장, tv-gpu-sqream 링크는 tv-llm 쪽만) + `check_llm_dashboard.py`(llm_ 접두사 포함 계약 대사).
- **수락 기준**:
  - [x] gen_llm+check_llm exit 0 (12패널·3변수·계약 25종 대사), 멱등(sha256 동일) — 커밋 `69f6556`
  - [x] 기존 생성기·JSON 무수정 + 디렉터리 드리프트 0
  - [x] 스택 실측: 프로비저닝 2대시보드 확인, datasource 경유 llm 타임라인 12시리즈 조회, exporter llm 66시리즈 노출
- **의존성**: L1

### Phase L3 — React GPU/LLM 화면 (`#/llm`)

- **목표**: 시안 화면을 React 두 번째 화면으로 구현한다. 의존성 무추가, 기존 화면 회귀 0.
- **작업/산출물**: `web/src/hooks/useRoute.ts`(해시 `#/llm`) + `useFilters.ts` replaceState 해시 보존 1줄. `App.tsx` 라우터 셸화 — 본문을 `screens/GpuDashboard.tsx`로 무변경 추출 + `screens/LlmDashboard.tsx` 신규. `Sidebar` — "GPU/LLM 모니터링" 링크 추가(활성 표시), "인스턴스별 GPU" 유지(인간 확정). `queries.ts` — `llmSelector`·`LLM_CATALOG`·팩토리 6종 + `queryRegistry()` 등록. `queries.contract.test.ts` 파서 `llm_` + MANIFEST 25종 단언. 훅 3종(`useLlmData`/`useLlmCharts`/`useLlmRangeDetail`) 미러. 컴포넌트: `tables/{LlmProcesses,LlmServices}`·`detail/LlmRangeDetail` 신규, `Timeline` 파라미터화(기본값=현행)·`MetricStrip`·`ServerGauges` 재사용, `lib/colors.ts` `LLM_CATEGORY_COLORS`(기존 hex), `docs/design-tokens.md` LLM 절 추가. 신규 테스트(라우팅·해시 보존·조인·타임라인·링 카드).
- **수락 기준**:
  - [x] `cd web && npm run lint && npm run typecheck && npm run test:coverage && npm run build` exit 0 (커버리지 98/90.9/98/99 — 커밋 `bd85ff9`)
  - [x] 계약 대사: MANIFEST 25종·llm 팩토리 7종 registry 등록 단언 green
  - [x] 기존 스위트 전건 green — 테스트 312(기존 287 회귀 0)
- **의존성**: L1 (L2와 병행 가능)

### Phase L4 — 마감 (문서·ADR·E2E)

- **목표**: 산출물 문서·증거를 정리하고 전 실행 모드 재검증한다.
- **작업/산출물**: `README.md`·`docs/architecture/system.md`(mermaid에 tv-llm·`#/llm`) 갱신, ADR `0009-llm-timeline-workload-encoding.md`·`0010-hash-routing-two-screens.md`, evidence 캡처(Grafana tv-llm·React `#/llm`), plan.md 체크박스 갱신.
- **수락 기준**:
  - [x] `verify-native.ps1` **ALL CHECKS PASSED** (대시보드 2/2 정확 집합 + llm 메트릭 스팟체크 추가 — PS 5.1 배열 미열거 함정 수정 포함) + `docker compose config` exit 0
  - [x] 실측: 서빙 번들에 LLM 화면 포함(`:8082`), Grafana tv-llm 조회, 기존 대시보드·화면 회귀 없음
  - [x] 산출물: system.md(통합 mermaid 갱신)·db-schema.md §6·design-tokens §1.5b·ADR 0009/0010 존재
- **의존성**: L2, L3

### Phase X1 — 계약 TV-C1 additive: 쿼리 완료 이벤트 메트릭 (X-View 데이터) — **구현 완료 (2026-08-13, 커밋 d482e47)**

- **배경 (2026-08-13 인간 지시)**: GPU/SQream 화면 ③구역 우측의 **"시간구간"(TimeRangePanel) + "선택 구간 상세정보"(RangeDetail) 패널을 제니퍼 X-View 방식 산점도로 교체**한다(점 1개 = 완료 쿼리 1건, X=종료 시각, Y=소요시간). 타임라인 패널은 유지하며, 타임라인 브러시 선택 → X-View가 해당 구간을 표시하는 드릴다운 흐름. 현행 계약에는 완료 이벤트 메트릭이 없어(`sqm_statement_duration_seconds`는 실행 중에만 존재·종료 틱 remove, `sqm_statement_failed_timestamp`는 실패 최근 12건뿐, 성공 이벤트 전무) additive 확장이 선행돼야 한다.
- **목표**: 완료된 statement의 (종료 시각, 소요시간, 성공/실패)를 bounded ring으로 노출한다.
- **작업/산출물**: `query_sim._finish_expired()`에서 완료 시 게이지 2종 발행 — `sqm_statement_completed_timestamp{env,node,gpu,mig,stmt_id,query_id,sqream_user,query_name,status,reason}`(값=종료 epoch) · `sqm_statement_completed_duration_seconds{동일 labelset}`(값=소요초). `status="success"|"failed"`, `reason`은 기존 `FAIL_REASONS` 재사용(성공은 빈 값). `_failed` deque 패턴(`FAILED_KEEP=12`) 복제 — `COMPLETED_KEEP=60`. SoT `docs/architecture/db-schema.md` additive 갱신 + `exporter/exporter/metrics.py` CONTRACT **및 `_HELP` 2건**(XR-01) + `exporter/tests/test_contract.py` EXPECTED·개수 단언 갱신.
- **소비 의미론 (XR-02·XR-03 반영)**: `COMPLETED_KEEP=60`은 **현재 노출(exposition) 상한일 뿐**이다 — 완료율(도착률 합 ~10.8건/분)에서 링 한 바퀴는 ~5.6분으로 스크레이프 5s를 크게 웃돌아 **모든 완료 이벤트가 TSDB에 최소 1회 샘플링됨을 보장**한다. 시간창 재구성은 web이 **range 쿼리(`/query_range`)로 (라벨셋, 값=종료 epoch) 전환을 복원**하는 방식으로 한다(instant 조회는 최근 ~5.6분만 보이므로 금지). stmt_id 풀(72개) 재사용으로 동일 라벨셋의 값이 갱신되는 것은 range 복원에서는 정보 손실이 아니다(과거 샘플은 TSDB에 잔존). dedupe 키 = (전체 라벨셋, 종료 epoch 값). **동일 라벨셋이 링에 2회 존재할 때 오래된 엔트리 퇴출이 최신 게이지를 지우지 않도록 참조계수(또는 재등록 시 퇴출 스킵) 처리**한다.
- **행동 테스트 (XR-05 반영)**: 완료 시 양 메트릭 동시 발행·값(종료 epoch/소요초) 정확성·reason 매핑·`COMPLETED_KEEP` 상한 유지·퇴출 시 양쪽 remove·동일 라벨셋 재사용+퇴출 경합(참조계수) — `exporter/tests/test_query_sim.py`(또는 신규 파일)에 단위 테스트로 추가.
- **수락 기준**:
  - [x] 3자 검증 전량 green: exporter 계약 테스트(100 passed에 포함) + gen/check 드리프트 0(12패널·4변수·51쌍) + web test:contract 74 passed (MANIFEST 66종)
  - [x] exporter 게이트: ruff 0 · mypy 0 (mypy 2.1 기존 드리프트 8건을 동일 커밋에서 최소 보정 — 변수 섀도잉 리네임·유니언 분기·주석 1건, 로직 불변) · pytest 100 passed · 커버리지 99.32%
  - [x] 기존 메트릭 이름·라벨·타입 불변(additive-only — v4.5는 §2b 2종 추가뿐, 기존 소비자 무수정·드리프트 0으로 입증)
- **의존성**: 없음(L4 완료 기반). **Grafana 대시보드(TV-C2)에는 미적용** — React 전용 소비(이벤트 산점도는 시안 재현 범위 밖, 인간 확인 대상).

### Phase X2 — React X-View 패널 (detail-col 교체) — **구현 완료 (2026-08-13, 커밋 063320b)**

- **목표**: `.detail-col`의 `TimeRangePanel`+`RangeDetail`을 X-View 산점도 패널 1개로 교체한다. 그리드 18fr/6fr·`--dashboard-middle-h: 264px` 예산 유지.
- **작업/산출물**: `components/charts/XViewChart.tsx`(D3 v7 — `Timeline.tsx`의 고정 viewBox·콜백 ref 패턴 복제, ADR R-0002 d3 격리 준수) + `lib/xview.ts`(range 응답에서 (라벨셋, 종료 epoch) 전환 복원·dedupe·구간 필터 — 순수 함수) + **신규 훅 `useXViewEvents`**(range 쿼리 2종 폴링 → 이벤트 목록. XR-04: `useRangeDetail` 재사용으로는 실패 건수·완료 duration 평균을 만들 수 없음) + `XViewPanel`(헤더 요약행: 선택 구간·N건·에러 n건·평균 소요 — **표시 중인 동일 이벤트 집합에서 계산**, 교체로 제거되는 기존 `useRangeDetail` 폴링은 중단). 동작: 브러시 선택 없음=현재 시간범위 전체, 선택 있음=구간 줌·구간 밖 점 제외(`useRangeSelection` 구독). 점 색=`QUERY_TYPE_COLORS` 6색 재사용, **실패=✕ 마크(모양이 1차 채널 — `--qt-fullscan`과 `--danger`가 동일 hex `#f87171`이므로 색만으로는 풀스캔과 실패를 구분할 수 없음)**, 신규 색 토큰 0. `queryRegistry()`에 **range 쿼리 2종** 등록(TV-C3, TV-C1 부분집합). 테스트: `xview.test.ts`(전환 복원·dedupe·구간 필터)·`xviewRender.test.tsx`(점 수·색·✕·selection 재발화 금지 — timelineRender 패턴)·`layout.contract.test.tsx` detail-col 단언 갱신.
- **재검증(X-plan-2) 반영**: ① NX-01 — `useXViewEvents`는 두 range 쿼리를 **공통 `endMs`·동일 `stepSec`·동일 AbortSignal**로 호출하고, **timestamp 전환을 기준**으로 동일 평가시각의 duration 샘플을 결합한다(듀레이션 값이 연속 동일해 전환이 없는 경우 대비 — 결합 규칙 단위 테스트 포함). ② NX-02 — 훅은 기존 폴링 상태 계약을 승계한다: `failStreak`·`lastSuccessAt` 반환, 연속 3회 실패 시 이벤트 클리어(행동 테스트 포함). ③ NX-03 — `.detail-col` 그리드 단언은 **GPU 화면 전용 modifier**(예: `.detail-col--xview` 1행)로 분리하고, LLM 화면(`#/llm`)의 기존 2행 규칙 단언은 그대로 유지한다(LLM 화면 회귀 0 보장).
- **수락 기준**:
  - [x] `cd web && npm run lint && npm run typecheck && npm run test:coverage && npm run build` exit 0 (테스트 592 passed·커버리지 임계 통과 — 1회 플레이크 후 연속 2회 green, 회고 기록)
  - [x] 계약 대사: `xviewEvents` range 2종 registry 등록 + MANIFEST 66종 대사 — test:contract 74 passed
  - [x] 기존 스위트 회귀 0 (전 588→592) · 타임라인 패널(③) diff 0 (인간 지시 불가침 — Timeline.tsx·lib/timeline.ts 무수정 확인) · LLM 화면 무변경(.detail-col 2행 규칙 유지, NX-03)
  - [x] 기동 직후 완료 이벤트 0건 상태에서 빈 상태 문구 표시(백필 없음) — xviewRender 테스트 + 구현
- **의존성**: X1
- **인간 확인 항목(Design, 착수 전 확정)**: ① TimeRangePanel을 요약행으로 완전 흡수 여부 ② 18fr/6fr 폭 비율 유지 여부 ③ 점 색상 규칙(유형 6색 vs 단색+에러 구분) ④ 통합 브랜치(dev 원칙 vs 현재 feat/handoff-20260807)

### Phase X3 — X-View 호버 툴팁 확장: 생애주기 누적 막대 + Node + 실패 유형/발생 시점 — **승인 (2026-08-14 인간 지시·플랜 모드 확정)**

- **배경**: 호버 툴팁(X2-f1)에 ① Node(서버) 행(워커 위) ② 100% 누적 가로 막대 `Compile → In Queue → Initializing → Executing → Completed` (X4-f1에서 첫 단계 어휘 Preparing→Compile 개정, v4.7) ③ SQream 가이드의 실패 유형↔발생 시점 표 반영. **불변 제약(인간 확정)**: X-View 산점도(점 Y=실행시간·개수·색·✕)·타임라인·시뮬레이션 거동 무변경, 실패 reason 열거형 불변(기존 5종) — 확장은 툴팁 표시 내용뿐.
- **계약(TV-C1 v4.6, additive)**: `sqm_statement_completed_phase_seconds{기존 10라벨 + phase}` Gauge 1종 — `phase ∈ preparing|queued|initializing|executing`(이벤트당 4시리즈), 링 퇴출 시 기존 2종과 동반 remove(참조계수 키=phase 제외 라벨셋), 누적 ≤ 324×4. 소비는 range 복원만(§2b 준용). Grafana(TV-C2) 미적용.
- **exporter**: 큐 항목에 제출 시각 추가 → In Queue 실측(배정·실행 로직 불변). Compile(개정 전 표기 Preparing) 0.4~2.5s·Initializing 0.3~1.5s stmt_id 해시 결정론 합성(타임라인·실행 지속 무영향). `_record_completed()`에서 phase 4시리즈 발행. 행동 테스트 5건.
- **web**: `xviewEvents()` phases expr(레지스트리 range 3종, MANIFEST 67종), `restoreEvents` phase 조인(짝 없으면 phases=null·이벤트 유지), `lib/failureStages.ts`(가이드 8유형 전체 수록·조회는 기존 reason 5종), 툴팁 개편(누적 막대 4세그먼트+단계별 초·Completed 시각/상태·실패 단계 `--danger` 강조·유형/쉬운 설명·Node 행 `displayNode()` 재사용·폭 260px). **차트(점·축·색) 무변경.**
- **수락 기준**:
  - [x] exporter 게이트(ruff 0·mypy 0·pytest 101 passed) + 3자 검증(계약 테스트 green·grafana 드리프트 0·web test:contract 74 passed — MANIFEST 67종) 
  - [x] web 게이트(lint·typecheck·vitest 615 passed·build) green — X3 신규/변경 파일 파일별 임계 충족(전역 게이트의 기존 14파일 미달은 pre-X 기준선(d61d6d8)에서 동일 수치 재현 확인 — pre-existing, 회고 HCI)
  - [x] 산점도·타임라인 렌더 무변경(기존 테스트 회귀 0 — 점 개수·색·✕·Y축 단언 그대로) · reason 열거형 불변(5종)
  - [x] 실측: phase 메트릭 적재 확인 + 호버 캡처 3장(성공·실패·클릭 고정) 인간 전달 — 실측이 결함 2건(패널 클리핑 `cfd1f9f`, 캡처 캐시)을 추가 발견·해소
  - [x] 후속(인간 지시): 툴팁 클릭 고정/해제 `d0b54a8` — 바깥 클릭·Esc 해제, 고정 중 텍스트 복사 가능
- **의존성**: X2-f1 (커밋 6b6b03d)

### Phase X4 — X-View 필터 + 시간 팬(횡스크롤 3영역) + 휠 줌 — **승인 (2026-08-14 인간 지시·플랜 모드 확정)**

- **작업 3건**: ① X-View 필터 — 우측 상단 깔때기 아이콘 → 팝오버(1행 완료·에러 / 2행 **유형 6종**), 끈 항목은 산점도·요약행 동시 제외(XR-04 유지) ② **시간 팬** — 조회 범위 3×(PAN_FACTOR=3) 페치, 시계열 4카드(하단 공유 스크롤바 1개·동기), 타임라인(범례 밑 스크롤바), X-View(시간축 밑 스크롤바). 우측 끝=실시간 추적, 과거 스크롤=절대 시각 고정 ③ X-View 휠 줌(커서 앵커 1.2×, 최소 창 60s, 더블클릭 리셋).
- **타임라인 불가침 부분 해제 (인간 명시, §7 승인 행)**: 해제 범위는 `panControl?: ReactNode` 옵셔널 슬롯 1개(범례 아래 렌더, 기본 미표시)와 `domainStart/End` 표시 창 전달뿐 — 쿼리 표현식·세그먼트화·브러시·범례·행 렌더는 계속 불가침. LLM 화면 회귀 0(슬롯 미사용).
- **계약 무변경**: PromQL 표현식 diff 0(범위 파라미터만 3×) — exporter·Grafana·db-schema 무수정. web 전용.
- **수락 기준**:
  - [x] web 게이트(lint 0·typecheck 0·vitest 636 passed·build) green — 신규/변경 파일 파일별 커버리지 임계 충족(PanScrollbar 93/92·XViewPanel 91/85 등)
  - [x] test:contract 74 passed(표현식 무변경 입증) · 기존 스위트 회귀 0(LLM·타임라인 기존 단언 유지, gpuPan 화면 테스트 추가)
  - [x] 요약행 = 표시 집합(필터·줌·팬 적용 후) 일치 · 고정 툴팁은 표시 집합 이탈 시 해제
  - [x] 실측 캡처 3장(필터 팝오버·75분 전 팬·14.5분 줌인) 인간 전달 — codex 지적 6건(CDX-X4-01~06) 전건 Fixed(7efa432) 후 재캡처 불요(수정은 상호작용 정합 — 시각 표현 불변)
- **의존성**: X3 (커밋 61ac502)

### Phase X5 — X-View UI 보강 (인간 제공 jsx 참고) — **승인 (2026-08-14 인간 지시·코드 첨부)**

- **원천**: 인간이 첨부한 Recharts 기반 참고 jsx. 신규 기능만 채택하고 구현은 기존 스택으로 대체한다 — **Recharts 미도입**(ADR R-0002 D3 격리·§4-9 런타임 의존 추가 금지), 색은 기존 토큰(`QUERY_TYPE_COLORS`), 단계 어휘는 v4.7(compile) 유지, 상세는 기존 클릭 고정 툴팁 유지.
- **채택 4건**: ① **차트 내 드래그** — 드래그 중 영역 표시(cyan 반투명), 최소 1초·4px 미만 이동은 클릭 취급(점 클릭 고정과 공존) ② **⟲ 초기화 버튼** — 수동 뷰(줌·팬) 활성 시 헤더 표시, `handleResetView` 재사용 ③ **하단 상시 범례 + 클릭 토글** — 유형 6종, 팝오버 필터와 `kind.types` 상태 공유(숨김=취소선·흐림), 우측 "● 완료 ✕ 에러" 도움말 ④ **고정 점 강조** — 고정 툴팁의 이벤트 마크 확대+흰 테두리.
- **X5-b (인간 정정, 2026-08-14)**: "드래그하면 확대가 아니라 드래그 시간대의 쿼리 목록이 나와야해" — 드래그를 놓으면 **구간 쿼리 목록 모달**(좌: 정렬 목록 종료/소요/대기 · 우: 툴팁 동일 상세, ↑↓·이전/다음 순회 — "하나씩 보면서 구간 분석" 동선). 확대는 휠 줌 전담, 뷰·요약행은 드래그로 불변. 이로써 X6 후보였던 "구간 분석 목록"은 X5-b로 흡수.
- **수락 기준**:
  - [x] web 게이트(lint·typecheck·vitest·build) green · 신규/변경 파일 파일별 임계 충족 · 기존 스위트 회귀 0 — vitest 646 passed(수정 커밋 `7a4716e` 기준)
  - [x] 드래그(목록)·팬·휠 줌·선택(타임라인 브러시)·필터·고정 툴팁 상호작용 정합(요약행=표시 집합 유지) — codex 지적 2건(CDX-X5-01/02) Fixed·재확인 신규 0 (`docs/reviews/phase-X5-codex-{review,resolution}.md`)
  - [x] 실측 캡처(드래그 중 영역·구간 목록·상세 순회) 인간 전달 — 수정 커밋은 상호작용 정합만 변경(시각 표현 불변)이라 재캡처 불요
- **의존성**: X4-f1 (커밋 12be807). 구현 커밋: `188fa0f`(X5) · `ce4504d`(X5-b) · `7a4716e`(codex 처리 + 모달 키 선택 보강).

### Phase X6 — Query 상세 팝업 탭(SQL/로그/플랜) + Statement Kill 목업 반영 — **승인 (2026-08-18 플랜 모드 확정)**

- **배경 (인간 요청 원문)**: "Query Overview 표에서 Query ID를 누르면 나오는 팝업 화면에 로그 탭 + 플랩 탭 + 킬 버튼이 나오게 수정" — 플랜 모드 질의로 확정: "플랩 탭"=**쿼리 실행 플랜 탭**, Kill은 **목업 데이터에 반영**(UI 데모만이 아니라 exporter 합성 데이터까지).
- **범위**:
  - *web*: `#/drilldown/main` 팝업을 `QueryDetailModal.tsx`로 추출 — 탭 3종(SQL 기본·로그·플랜) + Kill 버튼. 로그·플랜은 **클라이언트 결정론 목업**(`mockQueryDetail.ts` — mockSql·explainPlan·MOCK_LOGS 선례와 같은 카디널리티 근거). `explainPlan`은 QueryAnalytics에서 이동·공유(qid 계열 변주 추가, qid 없으면 기존 출력 불변). Kill UX는 `ActionDialog` 재사용(사유 필수, `mockNote` 신설) → `api/exporterCmd.ts` POST → 낙관적 행 제거 + 15s TTL 억제.
  - *exporter*: `start_http_server` → stdlib `http_api.py`(ThreadingHTTPServer)로 교체 — 단일 포트 :9801에서 GET /metrics + `POST /api/v1/statements/{id}/kill` + CORS/프리플라이트. kill은 예약→다음 tick의 `_finish_expired`가 `killed_by_admin` 강제 종료(기존 실패·완료·타임라인 기계 전량 재사용).
- **계약**: **TV-C1 무변경** — 메트릭·라벨·타입 additive 0건(`killed_by_admin`은 기존 reason enum). 명령 API는 계약 밖 신규 문서 `docs/architecture/command-api.md` + ADR-0011로 기록. AGENTS.md §0.1 Out-of-Scope에서 Statement Kill만 부분 해제(§7 승인 행).
- **수락 기준**:
  - [x] exporter 게이트 green — ruff·mypy·pytest 111 passed·cov 99.18%(≥80)
  - [x] web 게이트 — lint·typecheck·build(계약 테스트 포함) green · vitest **676 passed**(신규 30건 포함) · 신규 파일 3종 파일별 임계 충족 · 회귀 0. ※ `test:coverage`의 파일별 임계는 **X6 이전 기준선부터** 기존 파일 19건이 미달(툴체인 드리프트, X6 무관 — 미달 목록 기준선과 동일함을 stash 대조로 실측)
  - [x] verify-native ALL PASS(서버 교체 실증, 재기동 2회 전부) + 실측 스모크 — 브라우저 3탭 렌더·Kill 다이얼로그(사유 필수·STOP_STATEMENT 미리보기)·행 소멸, curl 정토큰 200→다음 tick 제거·오토큰 404·무토큰 400·`killed_by_admin` 실패 이력 등재
  - [x] codex 리뷰 3회전 수렴 — 1차 X6-R1(blocking)·R2(major)·R3(minor) → 처리 → 재확인 1회차 신규 X6-R4(blocking, fail-open 잔재)·R5(minor) → fail-closed 전환 → 재확인 2회차 **신규 0·blocking 0** (`docs/reviews/phase-X6-codex-{review,resolution}.md`) · 회고 추기(`docs/retrospectives/phase-X-xview.md`) · 커밋은 본 브랜치(HCI-X-4 관례)
- **의존성**: X5 (커밋 `7a4716e`).
- **X6-f1 (2026-08-18, 인간 지시 — 플랜 모드 확정)**: 로그 탭 상단에 X-View 생애주기 누적 막대 표시. `XViewEventDetail`의 막대+범례를 `PhaseBar`(+`phaseMeta` — react-refresh 규칙 분리)로 추출해 **X-View 툴팁·구간 목록 모달·팝업 로그 탭이 같은 컴포넌트** 사용(DOM·클래스 불변 — 기존 xviewRender 단언 무수정 통과). 수치는 `mockPhases` 단일 원천(mockLogs와 초 단위 일치, executing=현재까지 경과 — 캡션 명시). CSS는 `.sqm-phasebar` 스코프 보정 2줄뿐. 계약·exporter 무변경.

### Phase X7 — Main Dashboard: Status 단계화 · 리소스 차트 노드 누적 · 워커 장애 에피소드 — **승인 (2026-08-18 플랜 모드 확정)**

- **배경 (인간 요청 원문)**: "Query Overview의 status를 Running으로 하지말고 로그 탭의 단계별로 구분" · "리소스 그래프의 표시 형태가 평균이 아닌 누적형태로" · "워커 상태가 항상 healthy로 나오는데 unhealthy 상태도 가끔 나와서 장애대처를 할 수 있게". 플랜 모드 확정 2건: 누적=**지표 1개 선택(라디오) × 노드 3개 스택**, 장애 빈도=**보통**(평균 5~10분 간격·1~3분 다운·자동 복구).
- **X7-a (Status 단계화)**: `currentPhase`(mockQueryDetail — mockPhases 단일 원천, elapsed를 준비 단계 시작점에 겹쳐 strict `<` 판정) + `StatusPill`(Pill 톤 grey/orange/blue/green 재사용 — 신규 색 토큰 0, 라벨은 PHASE_META 공유) + Status 정렬(서수 0..3). **허용 불일치**: 로그 탭 서사는 전 생애주기를 항상 그린다(팝업은 주로 오래된 행).
- **X7-b (노드 누적 차트)**: `mainDashboard()`에 `*ByNode` 4식 additive(신규 팩토리 0 — 자동 등재), `useRangeSeries splitBy:"node"`(nodeSeriesKey 재사용 — 라벨=displayNode·색=NODE_SERIES_COLORS, 비-split 경로 불변), c3 `data.groups` 옵션(미지정 시 완전 동일 — 탑뷰 무영향 가드 테스트), DrilldownChart `stacked`(상한=시점별 합의 최대를 number 규칙으로 — percent 100핀 우회), 선택 변경은 remount key. **현재값 스트립은 클러스터 평균 4식 유지**(기존 스트립 테스트 2건 무수정 green) — 차트(노드별)와 수치가 다른 것은 설계다.
- **X7-c (워커 장애)**: drilldown_sim에 에피소드 상태기계 — `OUTAGE_MEAN_S=420`·`OUTAGE_DOWN_RANGE_S=(60,180)`·전용 rng(seed+4801, 테이블 버스트 비간섭)·첫 tick 예약만(단일-tick 계약 테스트 보호)·복구 우선. 다운 시 `WorkerDown`/critical 알람 동반(Alarms가 alertname을 무열거 렌더함을 실측 확인 — 상단바 벨·DEGRADED 자동 반영), 복구 시 알람 시리즈 remove(worker_up 24시리즈는 불변). **계약 무변경**(값 0↔1뿐). **허용 목업 한계**: statement 배정은 워커 건강과 비결합 — 다운 워커의 문장은 계속 돈다.
- **수락 기준**:
  - [x] exporter 게이트 green — ruff 0·mypy 0·pytest **119 passed**(신규 2: 에피소드 발생·복구·알람 동반·시리즈 수 불변 / 스케줄 결정론)·cov 99.22%
  - [x] web 게이트 green — lint 0·typecheck 0·vitest **693 passed**(신규 8)·build(계약 테스트 내장). 파일별 커버리지 신규 미달 0 — 미달 17건은 기존 기준선(19건)의 부분집합(MainDashboard statements·DrilldownChart는 개선으로 이탈)
  - [x] verify-native ALL PASS(재기동 스택)
  - [ ] 시각 확인(Status 순환·스택 전환·~10분 내 Unhealthy/WorkerDown) — 인간 확인 대기
  - [x] codex 리뷰 수렴 — 1차 major 2(X7-01 전환 시 옛 데이터 generate·X7-02 splitBy x축 첫 시리즈 기준) → EMPTY 리셋+합집합 x축+stacked 리마운트 key로 처리 → 재확인 신규 0·blocking 0 (`docs/reviews/phase-X7-codex-{review,resolution}.md`) · vitest 694·재빌드 배포
- **의존성**: X6-f1.

### Phase X8 — 탑뷰(`/`) 피드백 6건: 쿼리→플랜·라이브 갱신·단계 색상·상태 컬럼·중간 재배치·Kill 통합 — **승인 (2026-08-18 플랜 모드 확정)**

- **배경**: 탑뷰 화면에 대한 외부 피드백 6건(① 쿼리 클릭→플랜 ② 플랜 자동 갱신·주기 설정 ③ 플랜 단계 소요시간 색상 ④ 상태 세분화 ⑤ 리소스/쿼리 분리·개수 요약·리스트 세로 ⑥ 킬 버튼 통합). 플랜 모드 확정 3건: **레이아웃=중간 재배치**(타임라인·X-View·하단 밴드 불변) · **팝업=X6 QueryDetailModal 재사용+업그레이드**(탑뷰 진입 시 플랜 탭 기본) · **어휘=v4.7 유지**(Compile/In Queue/Initializing/Executing — 피드백의 Preparing 표기 불채택, 과거 인간 지시로 개정된 어휘).
- **범위 (계약 TV-C1 무변경 — 기존 계약 라벨·메트릭 additive 소비만)**:
  - a) `runningStatements()` identity by()에 worker/service/qid/qid_tags + duration·progress 키, `kpi()`에 `queuedCount`(node 매처만 — 그 메트릭 계약 라벨에 env/gpu/mig 없음. "대기 0=시리즈 부재" 구조라 상시 존재 인벤토리 계열 `0*count(sqm_worker_up)`으로 앵커 — exporter 부재는 NaN("-") 유지, codex X8-02 반영).
  - b) `mockPlanSteps`(mockQueryDetail) — qid 계열 골격 구조화 + 결정론 예산(총 1~10분 해시·병목 1단계 45~70% 가중) + elapsed 소비 모델(done 고정·running 증가·pending 0). 임계 `PLAN_TIME_RED_S=100`·`YELLOW=50`. `PlanSteps` 표(색 클래스·상태 Pill)로 플랜 탭 교체.
  - c) 팝업 `initialTab`·`pollLive`(화면이 등재 exprs로 콜백 구현 — 팝업은 PromQL 미생성, PromQL 단일 진원지 유지)·주기 select(3/5/10s, 기본 5s)·종료 배너(`role=status` — app.test 단일 alert 단언 보호)·종료 시 Kill 잠금. 드릴다운 MainDashboard도 pollLive 전달(고정 시점 제외).
  - d) ① 테이블 컬럼 9→11: **상태**(`currentPhase` 단일 원천 → `.state-badge` 재사용, `state--compile` 1규칙 신설 — 신규 색 토큰 0) + **런타임**(`formatElapsed` 신설). Service 컬럼은 과밀로 미추가(팝업 헤더에서 확인). Statement ID → `.query-linkbtn` 버튼(onOpen 옵션 — 미제공 시 기존 렌더). ② 카탈로그 상태 배지는 별개 축 — 무수정.
  - e) `QuerySummary` 카드 3장(실행/대기/컴파일·초기화 — 두 축 차이를 힌트로 명시) + `.dashboard-top--gpu-tall`(GPU 전용 336px — `.dashboard-top` 원문·LLM 화면 불변) + 신규 토큰 `--dashboard-queries-h`·`--dashboard-qsummary-h`(tokens.css·design-tokens.md·tokens.contract 3곳 동시).
  - f) 탑뷰 Kill 통합 — 팝업 재사용(세대 토큰=startTimeSec, X6 fail-closed 충족), killed TTL 15s 억제, `.sqm-page` **display:contents 래퍼**(CSS 변수 상속·박스 미생성 — 스코프 계약 테스트 무저촉).
- **수락 기준**:
  - [x] web 게이트 green — lint 0·typecheck 0·vitest **714 passed**(X7 대비 순증 20 — planSteps 12 + 추적 +10/−2, codex 처리 포함 최종)·build(계약 75 포함)·파일별 커버리지 신규 미달 0(미달 17건 = 기존 기준선 부분집합, 신규 파일 전부 충족)
  - [x] LLM 무회귀 — llm.test 무수정 green(전체 스위트 포함), `.dashboard-top` 원문·`.panel--running` 무스타일 유지
  - [x] 시각 실측(배포 스택) — 행 클릭→플랜 탭 기본·구조화 표·라이브 증가(25.0s→45.1s)·자연 종료 배너+Kill 잠금·요약 카드 3장·리스트 336px. 색 임계(50/100s)·Kill 실행·주기 변경은 단위/통합 테스트로 잠금 — 인간 최종 확인 대기
  - [x] codex 리뷰 수렴 — 1차 major 3(요약 카드 축 혼입·or vector(0) 결측 위장·토스트 z-index)·minor 3 → 처리 → 재확인 6건 resolved·신규 minor 1(문서 잔재) 즉시 정정·blocking/major 0 (`docs/reviews/phase-X8-codex-{review,resolution}.md`)
- **의존성**: X7.
- **X8-f3 (2026-08-18, 인간 지시)**: Worker Monitoring(#/drilldown/worker) 노드 카드 3열 → **카드당 한 행(세로 적층)** — `.sqm-grid--3`(이 화면 전용이던 규칙) 대신 `.sqm-grid--stack`(1열) 신설·교체, 미디어쿼리 목록 정리. 뷰 전용 1규칙이라 테스트 무영향(714 green)·codex 리뷰는 차기 phase 게이트에 위임.
- **X8-f2 (2026-08-18, 인간 지시)**: KPI 4타일 스트립(활성 MIG·In Queue·처리행수·P95) **화면에서 제거** — 상단 요약은 QuerySummary 카드 3장으로 일원화(KpiStrip 컴포넌트·CSS·토큰·단위 테스트는 보존, GPU 화면 배선만 해제 — layout.contract는 부재를 잠금). `.dashboard-qsummary`에 margin-bottom 8px — 아래 쿼리 카드와 붙어 있던 간격 보정.
- **X8-f1 (2026-08-18, 인간 지시)**: "쿼리 리스트가 길어져도 아래 카드에 영향이 안가게" — 세로 확장(336px)을 상시에서 **토글**로 전환. 기본은 원래 높이(168px, 행은 내부 스크롤)라 아래 섹션(타임라인·리소스·서버)이 리스트와 무관하게 고정되고, 패널 헤더의 "펼치기 ▾/접기 ▴"(`.panel__expand`, aria-pressed)를 눌렀을 때만 336px로 확장된다(그때만 아래가 내려감 — 의도적 행위). layout.contract의 X8 additive 단언을 토글 의미론(기본 모디파이어 부재→클릭 시 부착→해제)으로 개정. 시각 실측: 기본 상태에서 전 섹션이 한 화면에 들어옴.

### Phase X9 — Worker Monitoring 개편: GPU 소속·VRAM 71GB·MIG 사용률·아코디언·고정 맵 사망 판정 — **승인 (2026-08-19 플랜 모드 확정)**

- **배경**: 인간 요청 + 피드백 표 4건 — ① 각 워커의 GPU(MIG) 소속 표시 ② 워커별 VRAM 71GB 분할 반영 ③ MIG 단위 GPU 사용률(dcgmi 기준 — 수집 데이터에 이미 포함) ④ 지표 선택형 또는 아코디언(화면 꽉 참) ⑤ 워커 사망 표시(고정 GPU–MIG–워커 맵, 수집 시 워커 부재 = 이상) ⑥ 워커 구성 관리 화면(포털 관리 메뉴). 플랜 모드 확정: **아코디언** 채택 · 구성 관리 화면은 **문서 기록만(DEF-X9-1)** · **노드 총 VRAM 합계(564GB) 표기 삭제**(인간 지시 — 오표기 상태였고 총합 자체가 노이즈. 워커별 할당량만 표시).
- **범위 (계약 TV-C1 무변경 — 기존 계약 시리즈 소비만)**:
  - a) `workerMonitoring()`에 키 1개 — `migUtil: max by (node, gpu, mig)(DCGM_FI_DEV_GPU_UTIL{…})`. 워커(=MIG 슬롯)의 하드웨어 사용률 — `sqm_query_gpu_percent`(쿼리 GPU%)는 쿼리가 없으면 시리즈가 없어 부적합. 조인 키는 `workerName(node,gpu,mig)` 정방향(역산 금지) — exporter `sim_params.worker_name()`과 동일 규칙.
  - b) 행의 출처를 관측에서 **고정 맵**으로 — `NODES(server 필터) × GPU_OPTIONS × MIG_OPTIONS`(신설, 노드당 8슬롯) 전개 후 `sqm_worker_up`과 대조: up=1 "정상" / up=0 빨강 "Down"(행 틴트 8%, **값은 가리지 않음** — exporter는 다운 중에도 쿼리 시리즈를 유지하는 비결합 규약(X7-c)이므로 구 `✖ Suspended` colSpan 가림을 폐기) / 시리즈 부재 = 회색 "수집 누락(이상)"(dim·값 `--`·펼침 없음). 관측이 전무하면 고정 맵을 펼치지 않고 기존 빈 상태 메시지 유지(유령 24행 금지).
  - c) VRAM 게이지 분모 = **워커당 할당 71GiB 고정**(`MIG_VRAM_GIB` — exporter `FB_TOTAL_MIB=72704` MiB, H200 141GB의 MIG 2분할 3g.71gb). 구 `max(50GiB, 관측최대)` 분모·`NODE_MEMORY_GB=564` 상수·카드 헤더 "VRAM n GB / 564 GB" 삭제 → "워커당 VRAM 할당 71 GB" 힌트. `ACTIVE WORKERS {up}/8`(분모 = 고정 맵).
  - d) 아코디언 표 6컬럼(Worker·GPU(`GPU{g}·MIG{m}`)·상태·CPU·GPU Usage (MIG)·VRAM) — 요약 행은 텍스트 수치(막대 없음, 세로 압축), 행/버튼 클릭(`aria-expanded`) 시 colSpan 상세 행(CPU·util 막대 + VRAM 게이지 /71GB + 원시 라벨). 여러 행 동시 펼침 허용. 정렬 5키(worker·gpu=슬롯 서수·cpu·util·mem).
  - e) CSS `.sqm-wrow` 계열 신설(`--down` 빨강 틴트·`--missing` dim·`-detail` 게이지 그리드), `.sqm-worker-down` 폐기. 토큰 재선언 0.
- **수락 기준**:
  - [x] web 게이트 green — lint 0·typecheck 0·vitest **717 passed**(X8-f3 714 대비 순증 3 — Worker describe 개정: 아코디언·정렬·고정 맵 단언 + codex X9-01 의도 잠금)·build·파일별 커버리지 신규 미달 0(미달 17건 = 기존 기준선 부분집합, WorkerMonitoring·toolbarModel 충족)
  - [x] 시각 실측(배포 스택) — 노드 카드 3장 각 8행(GPU0·MIG0~GPU3·MIG1)·요약 텍스트 수치·행 클릭 게이지 상세(폴링 갱신 생존)·`n / 71 GB`·564 표기 부재·ACTIVE WORKERS n/8. **Down 실측 포함**: X7-c 에피소드(sqream211) 중 빨강 Down 배지+행 틴트+값 유지(CPU 80%·MIG 56%·10/71 GB)·ACTIVE 7/8·클러스터 DEGRADED 동반 확인
  - [x] 테스트 잠금 — 값 가림 폐기(Down 행 cpu/mem 표시)·고정 분모 8·71GB 분모·`✖ Suspended` 부재·수집 누락 6슬롯·아코디언 펼침/접힘·빈 상태/필터/폴백 기존 3건 유지
  - [x] codex 리뷰 수렴 — 1차 major 1(X9-01 빈 상태 게이트 범위 — **Rejected**: "수집 시 워커 없으면 이상 판단" 인간 규칙의 의도된 동작, 의도 잠금 테스트만 추가)·minor 1(X9-02 all-missing 카드 빨강 강조 — Fixed: `--missing` 회색 dim 분리) → 재확인 회차 **양건 resolved(Reject 근거 타당 판정)·신규 코드 결함 0**·신규 minor 1(X9-N01 문서 수치 716→717) 즉시 정정 — blocking/major 0 (`docs/reviews/phase-X9-codex-{review,resolution}.md`)
- **의존성**: X8-f3(`sqm-grid--stack` 유지).
- **X9-f1 (2026-08-19, 인간 지시)**: 표 재배치 — "GPU는 맨앞으로·GPU0 MIG0 반복 대신 감싸서·상태도 맨 앞으로·CPU/GPU/VRAM 상태바는 다시 돌려놔줘". 플랜 모드 확정 3건: ① **세로 병합 셀** — 컬럼 `GPU|MIG|상태|Worker|CPU|GPU 사용률|VRAM`(7열), GPU 셀 rowSpan=2가 MIG 2행을 감쌈(밴드 행 대안 기각) ② **컬럼 정렬 제거** — 병합 그룹과 임의 정렬 양립 불가, 고정 맵 순서만(useTableSort/SortReset 이 표에서 제거) ③ **아코디언 제거** — 막대가 행으로 돌아와 클릭 상세의 게이지가 중복(X9의 아코디언 확정을 인간이 개정). 막대는 `BarCell` 재사용(X9 상세 행 스펙을 요약 행으로 이동), down 틴트·missing dim은 `:not(.sqm-wgpu)`로 병합 셀 제외(이웃 MIG 행과 공유 — 한 행 상태로 칠하면 오정보). 게이트: lint·tsc 0·vitest **716**(아코디언·정렬 2건 삭제, 평면 표 1건 신설)·커버리지 신규 미달 0·build. 시각 실측: 병합 셀·막대 3종·정렬/상세 부재 + **실제 Down 에피소드(sqream111)에서 병합 GPU1 셀 틴트 제외** 확인. codex 수렴: 1차 major 1(X9F1-01 missing 슬롯 DCGM util 막대 누출 — Fixed: `o ?` 게이트+44% 미표시 잠금)·minor 1(X9F1-02 행 클릭 회귀 미잠금 — Fixed) → 재확인 **양건 resolved·신규 지적 없음**(리뷰 문서 X9-f1 절).
- **X9-f3 (2026-08-19, 인간 지시·플랜 질의 확정)**: "상태는 Healthy Unhealthy로 표시 · Unhealthy 워커는 restart 버튼 · 상태 오른쪽에 쿼리 ID열 · 클릭하면 로그탭/계획탭/kill로 쿼리 상태 확인·종료" — ① 상태 배지를 MainDashboard 어휘(Healthy/Unhealthy)로 통일 ② **Restart = 목업 반영**(확정 — X6 Kill에 이은 두 번째 §0.1 부분 해제): exporter `POST /api/v1/workers/{w}/restart` 신설(http_api — 본문 파싱 공통화), `DrilldownSimulator.request_restart`가 복구 시각만 당기고 다음 tick의 **X7-c 자동 복구 경로 재사용**(worker_up 0→1·WorkerDown 알람 제거 — 복구 로직 단일화). 세대 토큰 없음(고정 맵이라 ABA 불성립), 다운 아니면 404 fail-closed. UI는 Unhealthy 행에만 `.sqm-btn--tiny` Restart(고정 시점 숨김) → ActionDialog(사유 필수) → 접수 토스트(낙관적 제거 없음 — 복구는 폴링 실측) ③ **Query ID 열**(상태 오른쪽): `sqm_statement_running{TV}` 워커 조인(슬롯 규약상 워커당 최대 1개), `QID{stmt_id}` `.sqm-linkbtn` — 클릭 시 **X6 QueryDetailModal 재사용**(SQL/로그/플랜 + Kill), **로그 탭 기본**(피드백 열거 순서), pollLive=이 화면 등재 exprs(stmtDuration/stmtProgress), Kill 세대 토큰 = stmtStartTime, 낙관적 제거+15s TTL 억제(MainDashboard 규약). 문서: command-api.md §2 확장·ADR-0011 추기·AGENTS §0.1 개정. 잔여 비대칭(HCI): MainDashboard의 Restart 다이얼로그는 여전히 기록만 — 통합 여부 인간 결정 대기 (**→ X9-f4에서 인간 지시로 통합, 해소**). codex 수렴: 1차 major 1(X9F3-01 다이얼로그 경고문이 목업 거동과 모순 — Fixed: 반영 범위로 교체+2구절 단언)·minor 2(X9F3-02 감사 문구 과장 — Fixed / X9F3-03 수동 복구 tick 재추첨 경합 — Fixed: 0.0 표지+개시 건너뛰기+재예약, 결정론 테스트) → 재확인 **3건 resolved·신규 지적 없음**. **E2E 실측**: 실제 에피소드(sqream201)에서 Restart→200→stdout `[restart]` 감사 기록(자연 복구 아님 입증)→다음 갱신 Healthy·8/8·HEALTHY. 게이트: exporter ruff·mypy 0·pytest **125**(+6: sim restart 2·HTTP 4) · web lint·tsc 0·vitest **719**(+3)·커버리지 신규 미달 0(WorkerMonitoring 함수 78.78%→Kill·실패 경로 테스트 보강으로 충족)·build·재기동 verify ALL PASS.
- **X9-f4 (2026-08-19, 인간 지시)**: "각 노드 카드는 카드 제목을 누르면 접힐 수 있게 · Main Dashboard의 Restart를 실제 api에 통합" — ① **카드 접기**: 제목을 `.sqm-wnode__toggle` 버튼으로(aria-expanded/controls, 캐럿), 본문(지표·표) 조건부 렌더 + 접힌 동안 헤더에 `raw · ACTIVE {n}/8` 요약. 상태는 카드 로컬(key=node 고정 — 폴링 생존) ② **MainDashboard Restart 통합**(X9-f3 HCI 비대칭 해소): 공용 모듈 `restartAction.tsx` 신설(RESTART_WARNING/MOCK_NOTE/HEALTHY_TITLE + requestRestart — 두 화면이 같은 문구·요청을 쓰므로 codex X9F3-01류 드리프트가 구조적으로 불가) — 구 "기록만" 토스트 삭제, Node Health의 Restart는 **Healthy면 disabled**(+title — exporter 404 fail-closed와 일치, 버튼 유지로 `.sqm-workerhealth` 4칸 계약 보존). ActionDialog 헤더 주석의 예외 각주에 Restart 추기. codex 수렴: 1차 major 1(X9F4-01 고정 시점에서 MainDashboard Restart 미차단 — Fixed: `pinnedMs` disabled+`RESTART_PINNED_TITLE`+테스트)·nit 1(X9F4-02 ActionDialog 주석 잔재 — Fixed). 게이트: lint·tsc 0·vitest **723**(+4: 접기·MainDashboard 통합·네트워크 실패 분기·pin 잠금)·커버리지 신규 미달 0(restartAction 충족)·build·재배포 실측(접힘 한 줄 요약·전원 Healthy 시 Restart 전부 disabled).
- **X9-f2 (2026-08-19, 인간 지시)**: "워커당 VRAM 할당 글씨 지우고 MIG 열을 지우고 그 자리를 Worker열이 · VRAM 오른쪽에 RAM Memory 열 · 각 워커당 368 GB 할당" — 컬럼 `GPU|Worker|상태|CPU|GPU 사용률|VRAM|RAM Memory`(7열 유지, MIG 식별은 병합 셀+워커명 `sqream{노드}{GPU}{MIG+1}`이 담당), 카드 서브 행은 ACTIVE WORKERS만. **RAM 값의 출처(계약 무변경)**: 워커별 RAM 게이지가 계약에 없어 `sqm_statement_memory_bytes`를 `sqm_statement_running`으로 워커 귀속 — `mainDashboard().memoryBytes`와 같은 조인의 `sum by (worker)(… group_left(worker) …)` 변형(`workerRam` 키). 실행 문장 없는 워커=0(기존 비결합 규약), missing 행 `--`(X9F1-01 게이트 동일 적용·픽스처 잠금). 분모 368GB는 **논리 할당**(인간 지정, spool limit 성격) — 물리 RAM(계약 node_memory 512GiB)과 별개 축임을 주석 명시. 막대 색 `--purple`. codex 수렴: 1차 minor 1(X9F2-01 RAM 단위 — exporter `GB_BYTES=1e9`인데 GiB 환산 ~7% 과소·픽스처가 가림 → Fixed: `/1e9`+실단위 픽스처) → 재확인 **resolved·신규 지적 없음**. 게이트: lint·tsc 0·vitest 716·커버리지 신규 미달 0·build·시각 실측(RAM 막대 실데이터 흐름 확인).
- **X9-f5 (2026-08-19, 인간 지시)**: Worker Monitoring 표 헤더 "GPU Usage (MIG)" → **"GPU Usage"** — 표기만 교체, 값의 출처(migUtil = MIG 단위 DCGM 조인)·조인·테스트 불변(헤더 문구를 잠근 단언 없음). 뷰 전용 소규모라 codex 리뷰는 차기 phase 게이트에 위임(X10-f1 선례). lint·tsc·vitest green·재배포 실측.

### Phase X10 — Table Usage 개편: 청크 정합(상한 1,048,576) + 유지보수 기준 실판정 — **승인 (2026-08-19 플랜 모드 확정, 계약 v4.8)**

- **배경**: 인간 지시 — ① 행 수·청크 수·Frag.가 SQream 청크당 행 상한 **1,048,576**을 감안해 말이 되게(기존 `8000+idx*7300` 수열은 rows와 무관 — 상위 3테이블이 상한 2~10배 초과·행 많을수록 청크 적은 역방향) ② 유지보수 기준 반영: **Cleanup Chunk**(매일 새벽 1시, delete/update 레코드 존재 테이블) · **Rechunk**(새벽 1시, 4임계 동시 — 플랜 질의로 해석 확정: ① 평균 청크 행 < 900,000 ② **충전율 90% 이상 청크 비율 < 60%** ③ **NoDel_Cnt ≥ 2**(table_frag_info) ④ 충전율 80% 미만 청크 > 10) · Rechunk 시 **Cleanup Extent 동반**(extent 메타데이터 정리) · 말미 **recalculate chunks indexes**(clustering key 테이블 chunk index 재생성). 반영 수위 = **계약 확장**(질의 확정). 행 틴트(승인 반려 시 추가 지시): Rechunk 대상 투명 빨강 > Cleanup 대상 투명 노랑.
- **범위**:
  - a) **계약 TV-C1 v4.8 additive 4종**(`db`,`schema`,`table` Gauge): `sqm_table_chunks_filled_90pct`·`sqm_table_chunks_under_80pct`·`sqm_table_chunks_no_deletion`·`sqm_table_clustering_key`. 3자 동시 개정: db-schema.md(§7.3 표+타입 표+이력 v4.8 — 생산 규약: `deleted==0 ⇔ nodel==chunks`·`filled90+under80 ≤ chunks`·`avg ≤ 상한`) · metrics.py CONTRACT/HELP · test_contract.py(_DRILLDOWN 34→38) · queries.contract.test.ts(MANIFEST 67→71). 기존 8종 불변, Grafana(TV-C2) 미적용, 시계열 +32.
  - b) exporter TABLES → NamedTuple 시나리오 행렬(chunks를 rows에서 유도): 4/4 대상 3건(customer_orders 650K·web_traffic 500K·campaign_events 488K — frag도 대상 결에 맞게 재배치, 0.52 red 1건)·3/4 근접 3건(audit_trail ③NoDel=1·sensor_readings ②65%·fraud_events ④under80=8)·건강 2건(sales_data 1.02M/97%·inventory 1.02M/95% — 둘 다 ① 미충족, fraud_events·inventory는 deleted=0 Cleanup 비대상)·CK 5건. 신규 테스트 2본: 논리 불변식·시나리오 판정 잠금(값을 잠그는 테스트가 그간 없어 자유 개정).
  - c) web 판정(tableRows): `isCleanupTarget = deleted > 0`(구 1.5%/50% 목업 규칙 대체 — 실데이터 대상 0건이던 문제 해소), `rechunkChecks` 4임계 상세(툴팁용 값·통과)+`isRechunkTarget`, `avgChunkRows`·`CHUNK_ROW_CAP`.
  - d) 화면(TableUsage): 유지보수 기준 안내 카드(스케줄 명시·실판정 건수 3종), `Avg Chunk Rows` 컬럼(값+상한 대비 %·title에 상한), 구 `"Cleanup"` 헤더 → `"Deleted Rows"`(의미 어긋남 정정), `유지보수` 판정 컬럼(Rechunk red / `n/4` dim + 4임계 title 툴팁·Cleanup yellow·Idx blue), **행 틴트 빨강>노랑**(`.sqm-trow--rechunk/--cleanup`), 일괄 버튼 대상 = 배치 판정 결과(구: 필터 목록).
  - e) cleanupCommands: RECHUNK 명령문에 테이블별 `CLEANUP_EXTENTS` 동반 쌍 + 말미 `RECALCULATE_CHUNKS_INDEXES` 블록(reindex 인자 — SnapshotLock 하위호환 기본 []), 머리말 "새벽 수행 권장" → "매일 새벽 1시 자동 수행 예약 — 수동 실행은 긴급 조치용"(자동 스케줄 사실과 서사 정합, "새벽" 단어 유지). 다이얼로그 경고문 동조.
- **수락 기준**:
  - [x] exporter 게이트 — ruff·mypy 0 · pytest **127**(+2: 불변식·시나리오) · 계약 3자 대사 green
  - [x] web 게이트 — lint·tsc 0 · vitest **727**(+8: 4임계 경계·평균·화면 판정·명령문 확장) · 커버리지 신규 미달 0(기준선 17→**16** — TableUsage statements 미달 해소) · build
  - [x] 배포 실측 — verify ALL PASS·신규 4종 8시리즈 수집·화면(평균 전 테이블 ≤ 상한·틴트 3빨강/3노랑/2무·배지·안내 카드 6/3/5건·RECHUNK(3)/CLEANUP CHUNKS(6))
  - [x] codex 리뷰 수렴 — 1차 major 3(X10-01 충전율 분포↔rows 물리 모순(재검산 적발) — Fixed: 값 조정+분포 상·하한 불변식 / X10-02 Parallel↔단계 순서 모순 — Fixed: 3단계 배리어 구조 / X10-03 행 단위 작업에 전역 reindex 부착 — Fixed: 범위 분리)·minor 1(카드 간격 — Fixed) → 재확인 **4건 resolved·신규 지적 없음** (`docs/reviews/phase-X10-codex-{review,resolution}.md`)
- **X10-f3 (2026-08-19, 인간 지시·플랜 질의 확정 3건, 계약 v4.9)**: ① **"충전율"→"단편화율" 명칭만 교체**(확정 — 수치·메트릭 이름 불변): 임계 ②/④ 표기·계약 문서·주석(이력 문서는 불변) ② **Progress·진행단계 열 신설** — 유지보수를 **기간형 실행 시뮬**로 전환(확정: 시연형 — Cleanup Chunk 15s 단일, Rechunk 30s 3단계 60/25/15% = Rechunk→Cleanup Extent→Recalculate Chunk Indexes). **계약 v4.9 additive 1종** `sqm_table_maintenance_progress_ratio`{db,schema,table,stage enum 4값} — 값=전체 진행도, **실행 중에만 존재**(테이블당 현재 단계 시리즈 하나·전환/완료 시 remove). exporter `_table_runs` 상태 기계(효과는 완료 시 적용 — 최종 결과 불변), 접수는 실행 중·대기 중(kind 무관) 테이블 거부(테이블당 하나) ③ **유지보수 열 3상태**(확정 — 배지 문구): "—" / "Cleanup 예정"(노랑)·"Rechunk 예정"(빨강) / **"진행 중"(파랑)** + 파랑 행 틴트(우선순위 최상)·Progress 바·진행단계 표시명·행 버튼 잠금·일괄 대상 제외. 모달에 "진행 중 — {단계} ({n}%)" 줄. **E2E 실측**: audit_trail Cleanup 15s 완료(Deleted 0→Rechunk 예정) → RECHUNK 30s — **진행 중 파랑·Progress 50%·단계 "Rechunk" 실화면 캡처** → 완료(Chunks 30K→10K·Avg 97%·Frag 5%·"—"). codex 수렴: 1차 minor 2(X10F3-01 모달 낡은 스냅숏 고정 — Fixed: 키 저장+useMemo 재조회+연속 폴링 테스트 / X10F3-02 비이력 주석 어휘 잔존 — Fixed) → 재확인 **양건 resolved·신규 지적 없음**. 게이트: exporter pytest **129**·web vitest **734**(+3)·커버리지 신규 미달 0(기준선 16)·verify ALL PASS.
- **X10-f2 (2026-08-19, 인간 지시 3건)**: ① **Cleanup/Rechunk 목업 반영**(인간 "ㅇㅇ 필요해" — §0.1 상태 변경 **3호**, Kill·Restart에 이어): exporter `POST /api/v1/tables/{db}/{schema}/{table}/(cleanup|rechunk)` 신설 — `_table_stats`(살아 있는 진원지, TABLES는 초기값)·예약→tick 소비. fail-closed=배치 판정과 동일(cleanup: deleted>0 / rechunk: 4임계). 효과: cleanup→deleted=0·nodel=chunks(**임계 ③ 개방 — Cleanup 선행→Rechunk 흐름**, 인간 확인), rechunk→⌈rows/(0.97상한)⌉ 청크·전 청크 ≥90%·frag 0.05(생산 규약·X10-01 분포 불변식 유지). 계약 무변경(값만 변동). UI: 다이얼로그 확인→allSettled 접수→접수/거부 요약 토스트, 낙관적 갱신 없음(폴링 실측), pin 잠금(X9F4-01 규약) ② **"n/4" 폐기 → 테이블 이름 클릭 상태 설명 모달**(`TableStatusModal` 신규 — 통계·Cleanup 근거·4임계 ✓/✕·결론 4분기(Rechunk 대상/Cleanup 선행 필요/Cleanup만/조치 없음), 판정은 tableRows 단일 원천) ③ 유지보수 열 **배지 순서 Cleanup→Rechunk**(배치 순서)·**Idx 배지 폐기**(reindex는 Rechunk 동반 작업). **E2E 실측**: audit_trail 모달 "Cleanup 선행 필요"(✕③ 빨강) → CLEANUP 접수(stdout `[cleanup]` 감사) → 다음 갱신 Deleted 88.2M→0·배지 Cleanup→Rechunk·틴트 노랑→빨강·집계 (3)→(4). codex 수렴(4회전): 1차 2건 Fixed(X10F2-01 "Cleanup 선행 필요"의 과잉 약속 — ③만 실패 시로 한정 / X10F2-02 반영 전 중복 접수 — pending 거부·FIFO 정책) → 회차 신규 2건 Fixed(X10F2-03 결측 테이블 "건강" 오결론 — 결측 분기 최우선 재배치(회차 2 재지적까지 2회 처리) / X10F2-04 식별자 URL 계약 불일치 — `[^/]+`+unquote·percent-인코딩 테스트) → 회차 4 **resolved·신규는 문서 1건(X10F2-05 즉시 정정)** — 수렴. 게이트: exporter pytest **129**(+2)·web vitest **731**(+4)·커버리지 신규 미달 0(기준선 16)·verify ALL PASS. 문서: command-api §2·ADR-0011 추기 2·AGENTS §0.1 개정.
- **X10-f1 (2026-08-19, 인간 지시)**: 유지보수 배치 기준 안내 카드 **삭제** — 기준 정보는 판정 배지의 title 툴팁(4임계 값·통과)과 다이얼로그 경고문이 계속 담는다. `.sqm-maint` 계열 CSS 동반 제거(`.sqm-maintcell`만 잔존), 테스트는 카드 부재 단언으로 교체. 뷰 전용 소규모라 codex 리뷰는 차기 phase 게이트에 위임(X8-f3 선례). vitest 727 green·재배포 실측.
- **잔여(기록)**: TableUsage의 Grafana 링크 `/grafana/d/sqm-table-usage/`는 존재하지 않는 대시보드(죽은 링크 — 범위 외 HCI). 유지보수 실행 이력 메트릭(마지막/다음 수행 시각)은 범위 제외 — 판정에 필요한 4종만.
- **의존성**: 없음(테이블 계열 독립).

### Phase X11 — Worker Restart 안전 절차: SQream 가이드 기반 3단계 + 락 시뮬 — **승인 (2026-08-19 플랜 모드 확정, 계약 무변경)**

- **배경**: 인간 지적 — "SQream 가이드상 에러 시 그냥 재시작하면 안 된다(특히 CUD 작업 중). 지금은 Unhealthy면 무조건 Restart" + 조사 지시. **SQream 공식 문서 조사**(docs.sqream.com — 상위 폴더 덤프 `sqream-sqream-docs-latest/`와 동일 원천): ① 막힌 문장의 권장 절차는 `show_server_status()` → `stop_statement()` 먼저, 워커 재시작은 격상 단계 ② SELECT는 락 없음·INSERT inclusive·DELETE/UPDATE/DDL exclusive — 크래시 후 **orphaned lock** 잔존 → SUPERUSER `SHOW_LOCKS()`/`REMOVE_LOCK` 정리 ③ **"Avoid interrupting or killing CLEANUP_EXTENTS operations that are in progress"**(Deleting Data 가이드 원문) ④ `shutdown_server(is_graceful)` = 신규 접속 차단 후 문장 완료 대기 ⑤ kill 자체는 무손상(ACID) — 실위험은 CUD 배치 롤백·재실행과 잔존 락. **질의 확정 3건**: 반영 수위=**락 시뮬까지 풀 반영** / 절차=**3단계 강제**(인간 원문 "stop statement를 먼저 시작하고 그 다음에 worker graceful shutdown하고 마지막으로 재시작") / CLE 계열=**완전 차단·완료 대기**.
- **범위** (계약 TV-C1 v4.9 무변경 — 신규 메트릭 0·reason enum 불변):
  - a) exporter 장애 **2-플레이버**(`CRASH_RATIO=0.5`, 전용 `_outage_rng` 결정론): **crash** = 실행 문장 다음 tick 즉사(`connection_lost` 재사용 — 워커 사망은 클라이언트에 연결 오류) + 쓰기 계열(LOCK_CODES: INS·LOA·DEL·UPD·TRU·DDL·CLE — SELECT는 락 없음) 문장의 락 **orphan 승격** / **hang** = 문장 유지(절차의 실질 대상). `_down_until` → `_down`(kind/until/slot/alert), 다운 슬롯 신규 배정 차단(`down_slots()` — 구 "비결합" 절반 폐기), 락 방출 재작성(구 "사전순 첫 문장 1건·LOCK-2048·톱니값" → 쓰기 문장마다 `LOCK-{stmt_id}`·실측 보유 초·카디널리티 ≤72).
  - b) exporter 명령 API (§0.1 해제 **4·5호**): 핸들러 verdict화(ok/not_found/409 사유) — 신설 `POST /workers/{w}/shutdown`(실행 문장 잔존 409 "stop 먼저"·중복 409·자연 복구 취소·알람은 다음 tick 제거 — **알람 부재=Stopped 판별**, 신규 메트릭 없이) · 신설 `POST /locks/{lock_id}/remove`(orphan만 — live 409·중복 409·제거는 tick 소비) · restart 개정(hang 직행 409 "graceful shutdown required"·문장 잔존 409) · kill 개정(**CLE 계열 409** — 가이드 인용. 내부 crash 경로는 면제 — 그것이 orphan 데모의 발생원). `_kill_requests`를 dict(stmt_id→사유)로 — crash·admin kill이 같은 종료 기계를 쓴다.
  - c) web `RestartGuideDialog` 신설(Worker Monitoring·MainDashboard 공용 — 매 폴링 재파생, X10F3-01 교훈): ① STOP_STATEMENT(X6 kill 재사용 — 조회 "락 없음·재실행만"/쓰기 "롤백·배치 재실행" 경고/CLE 차단+진행도+가이드 인용) ② Graceful Shutdown ③ Restart, 409는 서버 사유 그대로 토스트. 상태 배지 3종(Healthy/Unhealthy/**Stopped**), Snapshot & Lock에 **orphan 배지+Remove**(낙관 제거+15s TTL, 신원은 실패 이력 폴백), QueryDetailModal Kill의 CLE 비활성. `qidSeries` 롤업 공유 모듈 추출. 신규 expr 3건(workerAlerts·locks·failed — 전부 기존 메트릭, MANIFEST 자동).
- **수락 기준**:
  - [x] exporter 게이트 — ruff·mypy 0 · pytest **143**(+14: 플레이버 결정론·crash 즉사·orphan 수명·락 계열 불변식·hang 3단계 시퀀스·shutdown 자연복구 취소·CLE 차단·무배정·remove_lock·신원 격리(X11-01)·HTTP 409 계열)
  - [x] web 게이트 — lint·tsc 0 · vitest **758**(+24) · 커버리지 신규 미달 0(기준선 16→**11** — copyText·SnapshotLock 등 개선 이탈) · build
  - [x] E2E 실측 — ① **3단계 완주**(sqream201 Unhealthy: 가이드 ①통과→② shutdown 접수→다음 갱신 **Stopped(알람 해제)**·③ 개방→restart→Healthy·다이얼로그 자동 닫힘, stdout `[shutdown]`/`[restart]` 감사) ② **CLE kill HTTP 409**(curl, 세대 토큰 동봉) ③ **crash→orphan 락→Remove**(시드 탐색(130)으로 결정론 재현 — crash가 etl_svc의 쓰기 문장을 덮침 → Snapshot & Lock에 **orphan 배지·Remove(orphan 행에만)**·실패 이력 폴백으로 워커 sqream201 표기·워커 자연 복구 후에도 락 잔존 → Remove 접수(stdout `[remove_lock]` 감사)→낙관 제거·다음 tick 시리즈 제거 실측). 실측 후 기본 시드(42)로 원복·verify ALL PASS
  - [x] codex 리뷰 수렴 — 1차 **blocking 1**(X11-01 orphan stmt_id 즉시 재사용 — Fixed: 신원 격리+REMOVE_LOCK 해제 배선+회귀 테스트)·minor 1(X11-02 EXP 거짓 쓰기 경고 — Fixed: 락 보유 판정 공유) → 재확인 **양건 resolved·신규 지적 없음** (`docs/reviews/phase-X11-codex-{review,resolution}.md`)
- **불가침**: 계약 v4.9 이름·라벨·타입·reason enum 불변, Timeline 코드 무수정(크래시 실패는 데이터로만), X6 세대 토큰·X10 유지보수 기계 불변. 시드 고정 쿼리 스케줄은 blocked 필터로 변한다(계약 아님 — 자기-일관 결정론 유지).

### Phase X12 — 대시보드 메타 멘트 제거 (UI 카피 정리) — **승인 (2026-08-19 플랜 모드 확정)**

- **배경**: 인간 지시 — "(ADR-0004: ADMIN 전용, 실행·거부 모두 감사 기록)"·"(목업 — 합성 데이터에 반영)" 류 멘트 제거 + 전수 조사. **조사 결과**(web/src 렌더 문자열): 고유 지점 약 40곳 — ADR·문서/과업코드 참조 9(경고문·토스트의 ADR-0004 4곳, QID 규칙 §2.2, 회의록 §5.1, M3·F4 각주) · "목업/합성/실제 ~ 없음" 28(+상수 2 — mockNote 괄호 7곳은 ActionDialog 한 곳 렌더, 토스트 접미 ~10, 목업 실행계획/로그 각주, "(mock)" 표기, CSV 파일명) · phase 코드 1(X9-f3 title) · codex 0(전부 주석) · 감사·거버넌스 서사 7("실제 시스템: receiver가 ADMIN 인가 확인 → …") · SQream 가이드 참조 6. Grafana JSON·정적 잔재 0. **질의 확정 2건**: ① SQream 가이드 참조 = **전부 삭제**(영문 인용 포함) ② 내부 기술어(exporter·:9801·409·tick·fail-closed·식별자·Prometheus) = **범위 제외**.
- **범위**: 화면 렌더 문자열만(코드 주석 유지 — 제거 사실·근거는 주석·문서로 이동). ActionDialog **mockNote prop 완전 철거**(기본값·`<h3>` 괄호·호출처 7곳), restartAction(RESTART_MOCK_NOTE 삭제·경고문/HEALTHY_TITLE 개정·토스트 접미), RestartGuideDialog(제목 괄호·CLE 영문 인용·"(SQream 가이드)"), QueryDetailModal(제목 괄호·ADR 경고·로그 각주·CLE title), SessionMonitoring(제목·경고·감사 서사 → "종료 요청이 기록되었습니다+사유"), SnapshotLock(§2.2·ADR 토스트 줄·Remove 문구), TableUsage(토스트 접미·ARCHIVE 문구), Alarms·QueryAnalytics·PlanSteps·mockQueryDetail·cleanupCommands(머리말·mockSql 고지 2줄)·LogMonitoring("(mock)"·`sqream-logs.csv`·토스트). 접수 토스트 규약 = "접수 사실 + 다음 갱신 안내 + 사유"만. 테스트 ~17개 단언 존재→부재 전환.
- **수락 기준**:
  - [x] web 게이트 — lint·tsc 0 · vitest **757**(단언 개정, 병합 -1) · 커버리지 신규 미달 0(기준선 11 동일) · build
  - [x] 완전성 — src 렌더 문자열 sweep 잔여 = 주석뿐 · 번들 grep "목업|ADR-0004" **0건** · 브라우저 실측(Cleanup Chunks 다이얼로그 제목·경고문 깨끗)
  - [x] codex 리뷰 수렴 — 1차 medium 1(X12-01 Acknowledge 토스트가 기록 전용인데 "처리했습니다"로 완료 확정 — Fixed: "요청이 기록되었습니다" + 부재 단언) → 재확인 **resolved·신규 지적 없음** (`docs/reviews/phase-X12-codex-{review,resolution}.md`)
- **불가침**: exporter·API·계약 무변경, 기능(접수 흐름·낙관 규약·409 노출) 무변경, 기술어·코드 주석 무변경.

### Phase X13 — Main Dashboard Cluster Performance Grafana 스타일 리스타일 — **승인 (2026-08-20 플랜 모드 확정)**

- **배경**: 인간 지시 "main dashboard의 그래프가 조금 보기 싫은데 Grafana 스타일로". Grafana 원본 근거 = mockup `01-main-dashboard.json` 동명 패널(line 2px·fillOpacity 15·gradientMode opacity·crosshair 실선). **질의 확정 2건**: ① 구성 = **스택 유지 + 시각만**(X7-b 라디오·노드 누적 불변) ② 색 = **Grafana classic 톤**(이 차트 한정 — 타 화면 노드색 불변).
- **범위** (전부 opt-in — 미지정 경로 완전 동일, 탑뷰 4카드·타 드릴다운 4차트 무영향):
  - a) `colors.ts` `NODE_CLASSIC_COLORS` — 키 `classic-gpu-server-0N`(기존 `--node-*` 팔레트와 격리), 값은 **기존 hex 재사용**(#73BF69 green·#FADE2A yellow·#5794F2 info — 신규 색 토큰 0, 계약 §6.4). `seriesColor` 체인 추가.
  - b) `useRangeSeries` LineSpec `palette?: "nodeClassic"` — splitBy 분기의 colorKey를 `classic-{node}`로.
  - c) `DrilldownChart` `variant?: "grafana"` — 래퍼에 `.sqm-chart--grafana` 클래스 훅만.
  - d) `drilldown.css` 변형 스코프: 면 채움 **0.22**(Grafana 15~25 구간 — 스택 밴드 구분, 기존 `.07` 규칙·계약과 공존)·crosshair **실선**(`stroke-dasharray:none`, 45%).
  - e) MainDashboard by-node 스펙에 palette·차트에 variant. 툴팁(.sqm-tip)·스트립(.sqm-summary)·축 5/5·리마운트 key(X7-01)·brush 전부 불변.
- **수락 기준**:
  - [x] web 게이트 — lint·tsc 0 · vitest **759**(+2: classic 팔레트 계약·CSS 계약, variant 존재/부재 가드) · 커버리지 신규 미달 0(기준선 11 동일) · build
  - [x] 배포 실측 — classic 3색(그린·옐로·블루) 스택·22% 채움·실선 crosshair·툴팁(색점·노드·값)·지표 전환 리마운트(y축 재고정) 정상
  - [x] codex 리뷰 — 한도로 위임됐다가 **X15 게이트에서 이행**(2026-08-20): X13-01(면 0.22 vs 원본 15) 1건 → **Rejected(승인 플랜 명시 의도 — 스택 밴드 구분)**, CSS 주석에 근거 명기. `docs/reviews/phase-X15-codex-review.md`
- **불가침**: X7-b 구성·X7-01 key·R4 generate 1회·Focus+Context·R9.2 툴팁 세트·`.sqm-chart` 배경·전역 `.c3-area .12/.07`·기존 "node" 팔레트·신규 색 토큰 0. exporter·계약 무변경.

### Phase X14 — 장애 유형별 Recovery 분기 (crash=재기동 / hang=정지→관찰→격상) — **승인 (2026-08-20 플랜 모드 확정)**

- **배경**: 인간 지적 "장애 유형에 따른 선택지가 다른데 지금 Restart 조치는 순차적으로 실행하게 만들고 있어. 조치 내용들을 보면 restart가 맞는지 조금 의문스러워" — 정확한 지적: crash(프로세스 사망)에도 UI가 3단계(shutdown 포함)를 강제(exporter는 crash 직행 재기동을 이미 허용 — UI가 서버보다 엄격), hang의 1차 조치는 재시작이 아니라 문장 정지 후 회복 관찰(SQream 가이드의 격상 서사), 화면이 crash/hang을 구분하지 못함. **질의 확정 5건**: ① 유형 신호 = **알람 이름 분리**(crash=`WorkerDown`, hang=`WorkerUnresponsive` — 신규 메트릭 0, alertname은 값이라 계약 무변경) ② crash = **단일 재기동**(스텝 없음 + connection_lost 안내) ③ hang = **정지→관찰→격상**(정지 후 회복 관찰 — 회복 시 다이얼로그 자동 닫힘, 미회복 시 종료·재기동 격상) ④ **배지 분리**(빨강 "Down"·주황 "무응답"·회색 "Stopped") ⑤ 진입·확정 어휘 = **"Recovery"**(1차 플랜 반려 원문 "Restart 버튼 보다 다른 말을 쓰는게 좋을거 같아" → "Recovery 라는 말을 쓰면 되겠네").
- **범위**: exporter `_begin_outage` kind별 alertname(`_down` entry `alert`가 이름 문자열 — 제거 시 그 이름으로 remove; restart/shutdown verdict 로직 불변) · web workerAlerts 쿼리 `alertname=~"WorkerDown|WorkerUnresponsive"` + 두 화면 worker→alertname 맵 · WorkerMonitoring `WorkerState`에 crash/hang 분리(배지·행 틴트) · MainDashboard Node Health 상태 4종 표기 · RestartGuideDialog `kind` 분기(crash=단일 Recovery+`crashSettling` 가드 / hang=①STOP_STATEMENT→관찰 박스→②격상 shutdown→③재기동 / stopped=Recovery) · restartAction `CRASH_RESTART_WARNING`·어휘 동조. Alarms 화면은 alertname 원문 표시라 매핑 불필요.
- **수락 기준**:
  - [x] exporter 게이트 — ruff·mypy 0 · pytest **144**(+1: `test_outage_alert_name_reflects_kind`)
  - [x] web 게이트 — lint·tsc 0 · vitest **764**(+5: crash 단일 Recovery·관찰 박스·배지 3종·staged hang 서사·CLE) · 커버리지 신규 미달 0(기준선 11파일 동일) · build
  - [x] 배포 실측 — 실 에피소드 E2E 3종: ① crash(sqream131) 빨강 Down → 단일 Recovery → Healthy 복귀·다이얼로그 자동 닫힘 ② hang 자연 복귀(sqream201) ①정지(락 경고) → 관찰 박스 → 문장 정지로 자연 복귀·자동 닫힘, 경합에 진 늦은 shutdown은 404 fail-closed 거부 ③ hang 격상(sqream231) ②shutdown → Stopped(회색·알람 해제) → ③Recovery → Healthy. Alarms 화면에 WorkerDown·WorkerUnresponsive 이름 그대로 표시, Main Dashboard 4종 표기 확인. 부수 발견: SHUTDOWN_WARNING이 "WorkerDown 알람"이라 표기 — ②는 hang 전용 경로라 WorkerUnresponsive로 정정(재게이트·재배포 후 실측)
  - [x] codex 리뷰 — 한도로 위임됐다가 **X15 게이트에서 이행**(2026-08-20): X14-01(알람 중복 관측 시 유형 비결정) 1건 → **WorkerDown 우선 규칙**으로 수정(두 화면)+순서 역전 픽스처·양 경로 테스트. `docs/reviews/phase-X15-codex-{review,resolution}.md`
- **불가침**: 계약 라벨·타입·메트릭 이름 불변(alertname 값만 추가). exporter 전이 규칙(crash 직행 ok·hang need_shutdown·신원 격리·CLE 차단) 불변 — UI가 서버 규약에 정합해지는 방향. X6 kill·X11 락·X13 차트 무변경. 신규 색 토큰 0.

### Phase X14-f1 — hang 조치 병렬화(사다리 폐기)·"No response" 표기·Longest Running 카드 — **승인 (2026-08-20 인간 지시)**

- **배경**: 인간 지시 2건(연속). ① "회복 관찰 박스는 운영자도 아는 사항이니 지워버려. stop statement는 비활성화 시키지 말고 운영자 판단에 맡기게 활성화, 재기동 옵션도 활성화시키되 실행하기 전에 안내를 해주고 실행해. 서버 상태에 무응답이라고 하지 말고 No response로 적어" — X14 "정지→관찰→격상" 사다리(순차 잠금)의 개정. ② "Queued Queries 카드는 의미없는게 시스템상 1초 이상 기다리는 쿼리는 정지시키고 에러로 돌리게 되있어. 지워버리고 다른 카드 넣는 방안 생각해". **질의 확정 2건**: CLE 실행 중 = **차단 유지**(X11 확정 보존 — 개방은 CLE 외 전부) / 대체 카드 = **Longest Running**(실행 중 최장 쿼리).
- **범위**:
  - exporter `request_restart`: hang 직행 재기동 허용(**need_shutdown verdict 폐기**) — 살아 있던 문장은 crash와 같은 connection_lost 예약으로 강제 종료(orphan 승격·신원 격리 없음 = `(stmt_id, False)`, `_begin_outage`와 같은 자연 종료 1s 가드·`_last_elapsed`). CLE 실행 중은 `cle_running` 409 유지. shutdown verdict 불변.
  - RestartGuideDialog hang 뷰: 관찰 박스·①②③ 순차 잠금 삭제 → 조치 3종 병렬(STOP_STATEMENT·Graceful Shutdown·Recovery). 잠금은 사실 게이트만 — CLE는 전 조치 비활성+사유, 문장 잔존 shutdown은 서버 409라 비활성+사유. 재기동은 실행 전 확인 다이얼로그가 결과(connection_lost 강제 종료·롤백)를 안내(인간 지시 원문 "실행하기 전에 안내를 해주고 실행해").
  - 표기: 배지·상태 텍스트·다이얼로그 "무응답" → **"No response"**(Worker Monitoring·Main Dashboard·RESTART_HEALTHY_TITLE). RESTART_WARNING의 절차 강제 문구 폐기.
  - Main Dashboard: **Queued Queries 카드·내역 모달 삭제**(StatKind "queued"·`q.queued`·`detailQueued` 제거 — `sqm_statement_queued` 메트릭 자체는 계약 유지, 탑뷰 QuerySummary 무변경) → **Longest Running** 카드(기존 statements/duration 폴링에서 파생 — 신규 쿼리 0, 클릭 시 그 쿼리의 X6 팝업).
- **수락 기준**:
  - [x] exporter 게이트 — ruff·mypy 0 · pytest **145**(+1: hang 직행 connection_lost·orphan 없음; 사다리 테스트는 "경로 유효" 재서술·CLE restart 409 전환)
  - [x] web 게이트 — lint·tsc 0 · vitest **765** · 커버리지 신규 미달 0(기준선 11파일 동일) · build
  - [x] 배포 실측 — Longest Running 카드(값=Query Overview 최장 경과와 일치, 클릭=X6 팝업) 확인
  - [x] 배포 실측 — hang 실 에피소드(sqream201): "No response" 배지·다이얼로그 병렬 조치(문장 실행 중 — 정지 활성·정상 종료 비활성+사유·Recovery 활성, orphan 배너 동시 표시)·문장 자연 종료 시 다이얼로그 즉시 재파생(정지 옵션 걷힘·정상 종료 활성)·직행 Recovery 안내→실행→Healthy 복귀·자동 닫힘. 문장 잔존 중 직행 Recovery의 connection_lost 강제 종료는 자연 종료가 경합에서 이겨 브라우저 실측 미완 — exporter 테스트(`test_hang_direct_restart_kills_statement_without_orphan`)가 잠근다
  - [x] codex 리뷰 — **X15 게이트에서 이행**(2026-08-20): X14F1-01(blocking — hang 즉사 예약 tick 2단계 전달의 ABA 잔존 창) **HTTP 접수 즉시 전달로 수정**(main 래퍼)+회귀 테스트, X15-02(shutdownWorker dead export) 삭제. `docs/reviews/phase-X15-codex-{review,resolution}.md`
- **불가침**: 계약 무변경(메트릭·라벨·alertname 2종 유지). CLE 차단(X11)·crash 직행·신원 격리·X6 kill 세대 토큰 불변. 탑뷰 QuerySummary("대기" 카드)는 별도 화면 — 무변경.

### Phase X15 — Recovery 실체 = 워커 서버 kill(자동 기동 스크립트 모델)·Shutdown UI 폐기 — **승인 (2026-08-20 플랜 모드 확정)**

- **배경**: 인간 현장 확인 원문 요지 "Internal Error 발생 시 Worker 기동은 자동 기동 스크립트가 실행 중이라, 각 워커에 해당하는 서버에서 kill 명령만 실행하면 된다 — `pgrep -a sqreamd | grep sqream101 | awk '{print "kill" $1}' | sh`". **질의 확정 4건**: ① Recovery = **명령 미리보기+서사 교체**(exporter API는 스탠드인 유지) ② crash = **자동 기동 서사 + 버튼 유지**(수동 트리거) ③ Graceful Shutdown/Stopped = **UI 폐기**(exporter API·방어 분기 존치) ④ 명령 표기 = **`"kill " $1` 정정**(원문 공백 누락은 kill12345로 붙어 실패).
- **범위**(web 전용 — exporter·계약 무변경): RestartGuideDialog hang 뷰 = 조치 2종(정지·재기동)·"정상 종료" li와 shutdown ActionDialog 삭제·Recovery 확인에 kill 파이프라인(워커명 치환)+실행 위치(`RestartGuideInfo.node` 신설, 호출처 2곳 배선)+자동 기동 안내, crash 뷰 자동 기동 서사, restartAction의 `SHUTDOWN_WARNING`·`requestShutdown` 삭제·CRASH 경고문 개정.
- **수락 기준**:
  - [x] web 게이트 — lint·tsc 0 · vitest **765**(shutdown 단언 전면 교체·kill 명령 미리보기·자동 기동 서사 잠금) · 커버리지 신규 미달 0(기준선 11파일 동일) · build. exporter 무변경(pytest 145 유지)
  - [x] 배포 실측 — hang(sqream231): 조치 2종(정지·재기동)·shutdown 부재·kill 명령 미리보기(`pgrep -a sqreamd | grep sqream231 | awk '{print "kill " $1}' | sh` — 이후 codex X15-01로 `grep -w` 보강, 표기는 vitest가 잠금)·실행 위치(icspreamh2gpu02)·자동 기동 안내 → Recovery 실행 → Healthy 복귀·자동 닫힘. crash(sqream331): 자동 기동 서사("보통 1~3분 — 복구되지 않으면 수동 재기동") 표시 후 실제 자동 복구 관찰(스크립트 재현). 문장 자연 종료 시 다이얼로그 즉시 재파생(정지 옵션 걷힘)도 재확인
  - [x] codex 리뷰 — 한도 재개 후 **X13·X14·X14-f1 위임분과 묶어 실행**(2026-08-20 16:5x, reasoning=medium): 지적 5건(blocking 1·major 2·minor 2) → X14F1-01(hang 즉사 예약 tick 2단계 전달의 ABA 잔존 창) **즉시 전달로 수정**·X14-01(알람 중복 관측 비결정) **Down 우선 규칙**·X15-01(grep 부분 일치) **`-w` 보강**·X15-02(shutdownWorker dead export) **삭제**·X13-01(면 0.22) **Rejected(승인 플랜 명시 의도)**. 재확인: 미해결 blocking 0(X14-01 테스트 공허 지적은 역순 픽스처+MainDashboard 경로로 즉시 해소). 기록: `docs/reviews/phase-X15-codex-{review,resolution}.md`. 최종 pytest **146**·vitest **766**
- **불가침**: 계약·exporter 무변경(shutdown·restart API·verdict 그대로). CLE 차단·crashSettling·X6 세대 토큰·"Recovery" 어휘·"No response" 표기 불변.

### Phase X16 — 문장 상태(Status) 축 신설: In Queue·Preparing·Initializing·Executing·Stopped — **승인 (2026-08-21 플랜 모드 확정)**

- **배경**: 지시 원문 요지 ":8082 카드들의 상태 내용을 In Queue, Preparing, Initializing, Executing, Stopped로 변경" + 정정 원문 "Compile / In Queue / Initializing / Executing 이건 누적 그래프에 쓰이는 상태잖아 그거하고는 구분해야지". 플랜 질의 확정 2건: ① 적용 범위 = **React 문장 상태 표시 전체**(Grafana 무변경) ② Stopped = **최근 중단된 문장 수**(파생 — 라이브 '중단 중' 상태 신설 대안 기각).
- **X8 ③과의 관계**: "어휘=v4.7 유지(Preparing 불채택)"의 **완전 번복이 아니다** — v4.7 Compile 어휘는 누적 그래프 축(PhaseBar·X-View 툴팁·로그 문장·failureStages)에 그대로 유지하고, **상태 표시 축을 별도 신설**해 그 축에서만 Preparing을 채택한다. 두 축의 표기가 의도적으로 다르다(Compile=소요 분해 / Preparing=현재 상태).
- **범위**(web 전용 — 계약 TV-C1·TV-C2(Grafana)·exporter 무변경, 신규 PromQL 0건): `lib/statusMeta.ts` 신설(STATUS_META 단계→상태 매핑, 순서=카드 배치·정렬 서수 — 기존 PHASE_BADGE·PHASE_TONE 중복 흡수) · 상태 소비처 전환(RunningQueries 배지·MainDashboard StatusPill·정렬 서수 — 판정은 currentPhase 단일 원천 유지) · `/` 요약 카드 3장→5장(In Queue→Preparing→Initializing→Executing→Stopped) · **Stopped = 표시 구간 내 `reason=killed_by_admin` 완료 이벤트 수**(기존 useXViewEvents 소비 파생, 창 라벨 동적 표기, 결측 NaN="-", Kill 낙관 증분 없음 — 이중계상 방지) · Stopped는 표 미노출(원천 `sqm_statement_running`이 종료 시 remove되어 행 데이터 결측 · 표 제목이 "실행 중인 쿼리" · 중단 문장 드릴인은 X-View 점이 담당).
- **수락 기준**:
  - [x] web 게이트 — lint 0·tsc 0 · vitest 773(신규 statusMeta 대사 포함: STOPPED_REASONS ↔ failureStages "Stopped / Cancelled" 표류 가드, codex X16-01 재현·X16-02 순서·X16-03 5슬롯 배선) · **누적 그래프 축 pin 무변경 green** · 계약 테스트 무변경 green(레지스트리 무추가) · 커버리지 신규 미달 0(기준선 11파일) · build
  - [x] 배포 실측 — 카드 5장·번들 라벨(Preparing/Stopped·Compile 유지) 확인, Kill API 실측 → `killed_by_admin` 완료 이벤트가 웹의 range 조회로 복원됨(집계 경로 종단 확인)
  - [x] codex 리뷰 — 1차 3건(blocking) 전건 Accepted·수정, X17 묶음 수렴(X16-01은 strict 경계로 2회전) — **미해결 blocking 0** (`phase-X16-codex-{review,resolution}.md`)
- **불가침**: PHASE_META 라벨·키·순서 · X-View 툴팁 4세그먼트(Stopped는 phase가 아니라 종료 상태 — 실패 강조 "Stopped / Cancelled"가 기존 담당) · Timeline.tsx · 카탈로그 축(`sqm_query_state` 표기 Initializing/In Process/In Queue) · 워커 축(Healthy/Down/No response/Stopped) · db-schema.md.

### Phase X17 — Query Overview 개편: Statement ID 통일·Service 3종 파생·카탈로그 확장(TV-C1 v4.10) — **승인 (2026-08-21 플랜 모드 확정)**

- **배경**: 지시 원문 요지 "Query overview에서 Q-Type 열 지워버리고 Query ID열은 Statement ID로 바꿔버리고 값들도 이에 맞게 변경, Service 열은 etl_service·sqream·select_service로 값을 두고 실행 쿼리에 따라 달라지게, Preparing·In Queue·Initializing 단계에서는 compile로 표시하고 In Queue에서는 배정된 워커가 없게, sqream 서비스에 어떤 쿼리가 들어가는지 매뉴얼에서 찾아라 — etl_service는 delete·insert·copy·create, select_service는 select". **매뉴얼 조사 결과(Workload Manager)**: 서비스는 쿼리 유형 자동 라우팅이 아니라 접속 시 지정하는 큐이고 기본값이 `sqream` — 즉 sqream 서비스 = **서비스 미지정 접속의 모든 문장**(DDL·유틸리티·카탈로그·ad-hoc). 플랜 질의 확정 4건: ① compile 표시 = **Service 열** ② 반영 수위 = **웹 표시 파생**(exporter service 라벨은 워커 구독 큐 축 — 무변경) ③ Statement ID 표기 = **드릴다운 전체 통일** ④ 카탈로그 = **확장**(INS·DEL 2종 추가).
- **범위**:
  - **exporter (TV-C1 v4.10 additive)**: `QUERY_CATALOG`에 `Daily_Order_Insert`(idx 7, INS-02L)·`Stale_Orders_Purge`(idx 8, DEL-05M) — 둘 다 query_type="etl"(도메인 6종 불변), 타임라인 값역 1~8, 누적 상한 144→192·324→342. `qid._BY_NAME` 채번 2건. 메트릭 이름·라벨·타입 전부 불변.
  - **Grafana (TV-C2)**: TIMELINE_STATES·CATALOG_DB 7·8 추가 → 재생성·검증기 동조. ※ 재생성 중 `llm-top-view.json`이 생성기와 어긋나는 **기존 드리프트**(커밋본에 포털 링크, 생성기 미반영)를 발견 — X17 범위 밖이라 커밋본으로 원복, HCI 등재 필요.
  - **web**: `queries.ts CATALOG` 7·8(타임라인·X-View 자동 수용) · `qidSeries.ts`에 `QID_SERVICE`/`qidService` 신설(계열 롤업 경유 — read→select_service, ingest·modify→etl_service, ddl·util→sqream, 결측 null="--") · Query Overview 9→8열(Q-Type 삭제 — **QueryRow.qid 데이터는 유지**: currentPhase 시드·mockSql/플랜·CLE 차단·서비스 파생이 소비) · tr에서 phase 1회 판정 공유 · Service 셀 = 실행 전 "compile"(dim)/실행 중 파생 3종(etl_service 노랑 배지) · In Queue 행 Worker 셀 dim "—"(배정 전 — 지어내지 않음, StatDetail NONE 전례) · 정렬(worker·service)은 표시값 기준 · **Statement ID 통일**: MainDashboard(Query Overview·Top Queries)·QueryDetailModal(제목·aria "Statement {id}"·토스트·ActionDialog)·QueryAnalytics·RestartGuideDialog·WorkerMonitoring·StatDetail·SnapshotLock — 값은 무접두 "{id}"(탑뷰 선례). **허용 불일치 2건(기록)**: LogMonitoring 고정 목업 로그의 "QID1839"류는 로그 원문 서사라 유지, QueryDetailModal 로그 첫 줄 `service=`는 큐 축 원시 라벨 유지.
- **수락 기준**:
  - [x] exporter 게이트 — ruff 0·mypy 0·pytest **147**(+2: INS/DEL 채번 pin·etl 카탈로그 3종 관측). CLE 차단 테스트의 암묵 전제(장애가 문장보다 오래 산다)를 결정론화(장애를 종료 직전에 걺)
  - [x] Grafana — gen/check green·top-view.json 재생성 드리프트 0(+30줄, 매핑 7·8)
  - [x] web 게이트 — lint 0·tsc 0·vitest **778**(+5: qidService 14코드·exporter SERIES/LOCK_CODES 표류 가드 2건·Service/Worker 파생 행동)·커버리지 신규 미달 0(기준선 11파일 동일)·build
  - [x] 배포 실측 — 재기동 후 카탈로그 8종 노출(`count(sqm_query_state)=8`)·DEL-05M이 etl 큐 실측 관측
  - [x] codex 리뷰 — 묶음 r1(blocking 2: 표류 가드 키만 대사·카탈로그 단방향) → 강화 → r2(X17-02 절별 파싱 재지적) → r3 **미해결 blocking 0 수렴** (`phase-X17-codex-{review,resolution}.md`) · 회고 `docs/retrospectives/phase-X16-X17-status-and-overview.md`
- **불가침**: Timeline.tsx 미접촉(소비 데이터만 CATALOG 경유 확장) · STATUS_META·PHASE_META·currentPhase · query_type 도메인 6종 · 워커 축 service 라벨(`sqm_worker_up` — db-schema :365 무개정)·워커 배지 · QidPill(StatDetail 존속) · reason 열거형.

### Phase E5 — 차트 엔진 ECharts 통일 (C3·D3 제거) — **완료 (2026-09-07, 차트별 시안 승인 4건)**

- **배경**: 지시 원문 요지 "llm_gpu_top_view_mockup 폴더의 그래프를 현재 디자인 그대로 apache-echarts 로 바꾸는 작업 — 일단 시안 위주로, 시작 전에 계획" → 작업 대상은 **transplant/react**("Transplant에서 작업하는게 맞겠네"). 플랜 질의 확정 3건: ① 타임라인 포함(X1·X2 의 "절대 수정 금지" 해제) ② 시안 = **실제 ECharts 프로토타입 페이지**(현행 vs ECharts 나란히, 차트별 승인 후 교체) ③ 범위 = 게이지·타임라인·X-View + LLM 탑뷰 검증 + 드릴다운 브러시 + C3·D3 제거. 진행 규칙(인간 정정 2026-09-07): **"본 화면 교체는 시안 보여주고 진행"** — 외부에 있는 사용자에게 헤드리스 크롬 캡처 이미지를 전달해 승인을 받은 뒤 교체.
- **범위·결과**: E1 라인 차트 규약(순수 옵션 빌더 + `useEchart` + 스텁 테스트)을 전 차트로 확장 — D0 공용 기반(`echartsTheme.ts`·`useEchart.ts`·스텁 `on/emit/getZr`)·시안 페이지 `#/design/echarts`(임시) → D1 게이지(`gaugeOption.ts`) → D2 X-View(`xviewOption.ts`, letterbox 기하·d3 눈금·2D 드래그 HTML 오버레이) → D3 드릴다운 브러시(`chartBrushModel.ts` brushOption, 지연 마운트 init 누락·미니맵 잘림 기존 문제 수정) → D4 타임라인(`timelineOption.ts`, custom 시리즈 3개·scaleBand 재현·brush ↔ selection) → D5 시안 페이지·`c3`·`d3`·`c3config`·`.c3-*`/`.tl-*`/`.xv-*` CSS·`vi.mock("c3")` 14곳 제거. ADR **R-0008**(R-0002 Superseded), AGENTS §0.1/§4-9 갱신.
- **수락 기준**:
  - [x] 차트별 시안 승인 — 게이지·X-View·브러시·타임라인(GPU/SQream·GPU/LLM) 현행 vs ECharts 나란히 캡처를 인간에게 전달, "승인" 4회
  - [x] web 게이트 — lint 0·tsc 0·vitest **855**(57 파일; 시안 관련 테스트 정리 후)·파일별 커버리지 신규 미달 0(기존 10파일 동일)·build(번들 index.js 1,421 kB / gzip 458 kB)
  - [x] 화면 검증 — `#/`(타임라인·X-View·게이지)·`#/llm`·`#/drilldown/main`(브러시) 헤드리스 캡처 + 브라우저 상호작용(호버·클릭·브러시 드래그·2D 드래그) 확인
  - [x] 계약 불변 — queries/tokens/chartColors/layout contract 통과, TV-C1/C2/C3 무변경
  - [x] codex 리뷰 — r1 blocking 0·major 0·minor 1(E5-01 드래그 라벨 스케일 → Fixed) `phase-E5-codex-{review,resolution}.md` · 회고 `docs/retrospectives/phase-E5-echarts-unify.md`
- **알려진 시각 차이(승인 시 고지)**: 게이지 C3 외곽 호 없음·전력 값 가운데 정렬 / 선택 영역 테두리 사각 전체·손잡이 글리프 없음 / 타임라인 막대 위 드래그가 구간 선택을 시작.
- **불가침 변경**: X1·X2 의 "타임라인 절대 수정 금지"는 본 Phase 승인으로 **해제**(§7 2026-09-07 행). STATUS/PHASE 어휘·계약·레이아웃 셀렉터는 불변.

### Phase X18 — 실행 쿼리 표 Connection ID 채우기 (TV-C1 v4.12 additive) — **완료 (2026-09-07, 인간 지시)**

- **배경**: 인간 질문 "Connection ID가 비는 이유가 뭐야" → 계약 라벨에 없어 "-"로 두었음을 설명하고 additive 확장을 제안 → "ㅇㅇ 진행해".
- **범위**: `sqm_statement_running` 에 `connection_id` 라벨 **additive 추가**. 값은 `sim_params.connection_id(stmt_id)` = `5000 + 신원 순번`(72종, `stmt_id` 와 1:1 결정론) — 슬롯 고정 신원 원칙 그대로라 **누적 라벨셋 상한 72 불변**. publish·remove 가 같은 함수를 쓴다(`_qid_of` 규칙과 동일). 메트릭 이름·타입·다른 라벨 불변, Grafana(TV-C2) 무변경. web: `runningStatements.identity` by() 에 `connection_id` 추가(TV-C3), `StatementRow.connectionId`, 실행 쿼리 표 Connection ID 열 표시·정렬 활성(결측은 "-"·정렬 뒤).
- **수락 기준**:
  - [x] 3자 검증 — exporter `test_contract`(라벨 튜플 + 결정론·유일성 테스트 신설) · db-schema §2 표·설명·개정 이력 v4.12 · web `test:contract`(MANIFEST 에서 라벨 읽어 PromQL 대사) green
  - [x] exporter 게이트 — pytest **152**(+1) · ruff 0 · mypy 0 · Grafana `check_dashboard` OK
  - [x] web 게이트 — lint 0 · tsc 0 · vitest **855** · build
  - [x] 실측 — exporter 재기동 후 `/metrics` 의 `sqm_statement_running{... connection_id="50xx"}` 관측, 탑뷰 표 Connection ID 열 표시(캡처)
- **후속(같은 날, 인간 지시 "ㅇㅇ 진행해")**: `sqm_statement_queued` 에도 `connection_id` 추가(v4.12b) — 배정 전에도 세션은 있다. 같은 파생 함수, 소비자 무변경(web 은 count 만). pytest 152 · 3자 검증 green.
- **불가침**: 카디널리티 상한 72 · 다른 라벨·타입.

## 6. Cross-Review 기록 (§3.1)

### 6.1 초안 작성

Claude Code (model_id `claude-fable-5`), 2026-07-19 — 세 폴더 탐색(구조·계약 결합점·git 상태) + 통합 설계 종합. 인간 개발자가 플랜 모드에서 통합 방침 3건(§1)을 질의·확정한 뒤 본 문서를 작성했다.

### 6.2 독립 교차 검증 (타 모델)

| 회차 | reviewer / model / session | 검토 대상 draft SHA-256 | 검토 시각 (UTC) | 결과 |
| --- | --- | --- | --- | --- |
| — | (U1 종료 게이트에서 수행 예정 — codex 플러그인, Claude와 상이한 모델·실행 주체) | — | — | `docs/reviews/phase-U1-codex-review.md`에 기록 |
| X-plan-1 | codex exec / codex-cli 0.147.0 (GPT-5 계열, reasoning=high, 독립 실행 주체 — Primary Planner=claude-fable-5와 상이) | `74cef166451b8e39e8c1cda6cab9f81772148675ec46f6e3d5b6a28e288c24ce` (plan.md @ 60ccca4) | 2026-08-13T04:55Z | XR-01~08 (blocking 3·major 2·minor 3) — `docs/reviews/phase-X-plan-codex-review.md`. 반영으로 draft 변경 → X-plan-2로 재검증 |
| X-plan-2 | codex exec / codex-cli 0.147.0 (동일 구성, 독립 세션 재실행) | XR 반영 워킹트리 (커밋 전 — 최종 해시는 커밋 메시지·§6.3 수렴 규칙 참조) | 2026-08-13T05:0xZ | XR-01~05 **전건 resolved · 미해결 blocking 0** + 신규 major 3(NX-01~03, 즉시 반영) — `docs/reviews/phase-X-plan-codex-resolution.md`. NX 반영으로 draft 재변경 → **X1 착수 직전 최종 해시 기준 확인 리뷰 1회 재실행**(수렴 규칙) |
| X4-plan | codex exec / codex-cli 0.147.0 (reasoning=low — 확인 목적 경량, 독립 세션) | plan.md Phase X4 절 (2026-08-14 등재본) | 2026-08-14 | **지적 없음 · 미해결 blocking 0** — 불가침 부분 해제 범위·3× 팬 모델 정합 확인 |
| X3-plan | codex exec / codex-cli 0.147.0 (reasoning=low — 확인 목적 경량, 독립 세션) | plan.md Phase X3 절 (2026-08-14 등재본) | 2026-08-14 | **지적 없음 · 미해결 blocking 0** — 불변 제약↔작업 항목 모순 없음, phase 메트릭이 §2b 링/참조계수/range 복원 의미론과 정합 |
| X-plan-3 | codex exec / codex-cli 0.147.0 (reasoning=medium — 확인 목적 경량 재실행, 독립 세션) | `9c238a6fceb125a45971f08bc25302887ebb891028f307c1485996184dbac485` (plan.md, §7 승인 기록 반영본) | 2026-08-13T06:0xZ | **수렴 확인 완료**: XR-01~05·NX-01~03 전건 resolved 유지 · 신규 blocking 0 · 해시 일치. exporter 실코드(_finish_expired·CONTRACT/_HELP·도착률·stmt_id 풀) 대조 모순 없음 → **X1 구현 착수 게이트 통과**. 이후 §6.2/6.3 감사 기록 추가는 X1/X2 절 본문 불변 |

### 6.3 이의 처리 (Adjudication)

교차 검증 수행 후 각 지적을 **Accepted / Rejected / Escalated**로 분류해 여기에 기록한다. Rejected는 근거 필수.

**X-plan-1 (XR-01~08) 처리** — 상세는 `docs/reviews/phase-X-plan-codex-resolution.md`:

| ID | 판정 | 반영 |
| --- | --- | --- |
| XR-01 (`_HELP` 누락) | Accepted | X1 산출물에 `_HELP` 2건·import/수집 테스트 명시 |
| XR-02 (링 60건으로 30분 창 재구성 불가) | Accepted | X1에 "소비 의미론" 절 신설 — instant 금지, range 쿼리로 (라벨셋,값) 전환 복원. KEEP=60은 노출 상한(한 바퀴 ~5.6분 ≫ 스크레이프 5s) |
| XR-03 (stmt_id 재사용·퇴출 경합) | Accepted | range 복원으로 덮어쓰기 무해화 + 동일 라벨셋 퇴출 참조계수 처리 명시 |
| XR-04 (`useRangeDetail` 재사용 불가) | Accepted | X2를 신규 훅 `useXViewEvents`로 교체, 요약행은 표시 이벤트 집합에서 계산 |
| XR-05 (행동 테스트 부재) | Accepted | X1에 행동 테스트 목록 추가 |
| XR-06 (목업 데이터가 시뮬 불변식과 불일치) | Accepted(구현 지침) | 목업은 제안 시각화용으로 동결. X2 구현은 실데이터(실제 stmt_id 풀·결정론 실패 규칙) 사용이므로 자연 해소 — 구현 시 재현 금지 항목으로 기록 |
| XR-07 (`preserveAspectRatio="none"` 왜곡) | Accepted(구현 지침) | 실제 구현은 Timeline.tsx 고정 viewBox 패턴이라 미해당. 목업 파일은 증거로 동결 |
| XR-08 (데모 드래그 clamp 부재) | Accepted(구현 지침) | 학습용 데모 한정 결함. X2 구현은 d3.brushX(extent로 plot 경계 강제) 사용이라 미해당 |
| NX-01 (두 range 응답 결합 규칙 부재) | Accepted | X2 "재검증 반영" ① — 공통 endMs·stepSec·signal, timestamp 전환 기준 결합 |
| NX-02 (폴링 상태 계약 미승계) | Accepted | X2 "재검증 반영" ② — failStreak·lastSuccessAt·3회 실패 클리어 |
| NX-03 (detail-col 셀렉터 LLM 공유) | Accepted | X2 "재검증 반영" ③ — GPU 전용 `.detail-col--xview` 1행, LLM 2행 단언 유지 |

## 7. 인간 승인 기록

| 날짜 | 승인자 | 대상 | 결과 |
| --- | --- | --- | --- |
| 2026-07-19 | 프로젝트 소유 개발자 | 통합 방침 3건 — ① 전부 이식(Grafana 포함, 2 UI 병행) ② 도메인 유지·LLM은 Deferred ③ U1 산출물은 문서 2건 | **승인** (플랜 모드 질의 확정) |
| 2026-07-19 | 프로젝트 소유 개발자 | **통합 실행 승인** — 게이트 수위는 간소 진행(EXC-U4), 범위는 **U4까지**(U5는 별도 세션 재승인), 푸시는 마지막 1회 | **승인** (플랜 모드 질의 확정) |
| 2026-07-19 | 프로젝트 소유 개발자 | **구 폴더 보존 결정** — 버저닝 목적으로 `top_view_mockup/`·`top_view_react/`를 이관 직전 상태(`d038446`)의 추적 동결 버전으로 복원(독립 기동 가능, 스왑 테스트 실측). **U5의 '구 폴더 삭제' 철회** | **승인** (인간 지시 — 복원 커밋 `8c7200e`, 태그 `pre-integration`) |
| 2026-07-19 | 프로젝트 소유 개발자 | **DEF-U1 해제 — LLM 화면 착수** (시안 `../서류/llm_dashboard.pptx`, Grafana `tv-llm` + React `#/llm` 두 UI). 계약 v3.0 additive(`llm_*` 10종). 게이트: 간소(EXC-U4 방식 — Phase별 커밋·기계 게이트 전량, codex 리뷰·회고 통합 1회, 푸시 1회) | **승인** (플랜 모드 질의 확정) |
| 2026-07-19 | 프로젝트 소유 개발자 | LLM 화면 세부 결정 — ① 사이드바 메뉴 "인스턴스별 GPU" **유지** + "GPU/LLM 모니터링" 추가(시안의 대체안 기각 — R6 연동 보존) ② 시뮬 결합: 모듈 분리 + **GPU 부하 max() 결합 유지**(시연 정합 우선 — DCGM 값 거동 변화는 허용, 스키마만 additive. 부하 비결합·별도 exporter 대안 검토 후 선택) | **승인** (플랜 모드 질의 확정) |
| 2026-07-19 | 프로젝트 소유 개발자 | 사이드바 후속 3건 — ① "GPU/SQream 모니터링" 하위 링크 추가(화면 2종 병렬) ② 상위/현재 화면 강조 위계 분리(A안) ③ **"인스턴스별 GPU" 항목 제거**(위 ①번 '유지' 결정 개정 — 시안 정합, R6 시각 연동 강조 기능 폐지) | **승인** (인간 지시) |
| 2026-07-19 | 프로젝트 소유 개발자 | **폐쇄망 RHEL 8.1 Docker 배포 (Phase D1)** — 통합 프로젝트 안에 전용 킷 `docker-kit/` 신설(개발 PC 빌드·save → 현장 Windows는 반입 통로만(가상화 불가) → RHEL 오프라인 정적 엔진 + load). 루트 `docker-kit/`·`deploy/`는 **구(보존) 스택용 동결** — **HCI-U-1의 docker-kit 부분 해소**, `deploy/` 방침은 계속 대기. 실측: 패키지 433MB 생성·해제본 compose E2E `verify-docker.sh` ALL CHECKS PASSED·네이티브 원복 검증 | **승인** (플랜 모드 질의 확정) |
| 2026-08-14 | 프로젝트 소유 개발자 | **Phase X4 착수 + 타임라인 불가침 부분 해제** — 횡스크롤 배치 지시 원문: "시계열 4카드는 icspreamh2gpu01~03 밑에 횡스크롤 하나 둬서 같이 움직이게 하고 시간대별 GPU 세션 & SQL 쿼리 실행 타임라인(인스턴스: All)도 쿼리 분류 밑에 횡스크롤을 둬 X-View도 시간 밑에 횡 스크롤을 두고". 해제 범위는 Timeline.tsx의 옵셔널 `panControl` 슬롯 1개·표시 창(domain) 전달에 한정 — 쿼리·세그먼트화·브러시·범례는 계속 불가침. 필터 2행은 **유형 6종** 확정 | **승인** (플랜 모드 확정) |
| 2026-08-14 | 프로젝트 소유 개발자 | **Phase X5 착수 + X5-b 정정** — 참고 jsx(Recharts 목업) 첨부와 함께 UI 기능 채택 지시("UI 관련해서는 약간의 기능을 추가하려고해 코드 첨부할테니 참고해"). 구현은 기존 D3 스택(Recharts 미도입, ADR R-0002). 이후 드래그 의미 정정 원문: "드래그하면 확대가 아니라 드래그 시간대의 쿼리 목록이 나와야해" — 드래그=구간 쿼리 목록 모달, 확대=휠 줌 전담. 구간 분석 목록(구 X6 후보)은 X5-b로 흡수 | **승인** (인간 지시·코드 첨부 + 정정) |
| 2026-08-18 | 프로젝트 소유 개발자 | **Phase X6 — Query 팝업 탭(SQL/로그/플랜) + Statement Kill 목업 반영** — 플랜 모드 질의 확정 2건: ① "플랩 탭"=쿼리 실행 플랜 탭 ② Kill은 **목업 데이터에 반영**(exporter kill 엔드포인트 신설 포함 선택지 채택). 이에 따라 §0.1 Out-of-Scope의 "상태 변경 기능"에서 **Statement Kill만 목업 시뮬 내 상태 변경으로 부분 해제** — exporter 명령 API(`POST /api/v1/statements/{id}/kill`, 단일 포트 :9801) 신설, TV-C1 무변경(`killed_by_admin` 기존 enum 재사용), 실제 SQream 접속 금지 유지 | **승인** (플랜 모드 질의 확정) |
| 2026-08-18 | 프로젝트 소유 개발자 | **X6-f1 — Query 팝업 로그 탭 상단에 X-View 생애주기 누적 막대 재사용** ("xview에서 만든 누적횡바를 로그탭의 로그 위에" — 검토 요청 후 플랜 승인). PhaseBar 공용 추출·mockPhases 단일 원천·X-View 원색 유지 | **승인** (플랜 모드 확정) |
| 2026-08-18 | 프로젝트 소유 개발자 | **Phase X7 — ① Query Overview Status 단계별 구분(로그 탭 어휘) ② Cluster Performance 지표 1개 선택 × 노드 누적(스택) ③ 워커 unhealthy 에피소드 '보통'(평균 5~10분·1~3분 다운·자동 복구·WorkerDown 알람)** | **승인** (플랜 모드 질의 확정) |
| 2026-08-18 | 프로젝트 소유 개발자 | **Phase X8 — 탑뷰 피드백 6건 반영**: 확정 ① 레이아웃=중간 재배치(요약 카드+리스트 세로, 타임라인·X-View 불변) ② 플랜/킬=X6 팝업 재사용+플랜 탭 업그레이드(구조화·색 임계 100/50s·라이브 갱신 3/5/10s) ③ 상태 어휘=v4.7 유지(Preparing 불채택) | **승인** (플랜 모드 질의 확정) |
| 2026-08-19 | 프로젝트 소유 개발자 | **Phase X9 — Worker Monitoring 개편**: 확정 ① 레이아웃=**아코디언**(요약 텍스트 행 + 클릭 상세 게이지 — 지표 선택형 기각) ② 워커 구성 관리 화면=**문서 기록만**(DEF-X9-1, 포털 관리(설정) 메뉴 소관) ③ **노드 총 VRAM 합계 표기 삭제**(인간 지시 원문: "GPU 총 VRAM 합계 표시 삭제 — 현재 오표기 상태이며, 총합 자체가 의미 없음(노이즈). 각 워커별 할당량만 표시") | **승인** (플랜 모드 질의 확정) |
| 2026-08-19 | 프로젝트 소유 개발자 | **X9-f3 — Worker Restart 목업 반영 (§0.1 부분 해제 확대)**: Unhealthy 워커의 Restart 버튼 동작을 "목업 반영 — 실제 복구"로 확정(질의 선택지: UI 기록만 vs 목업 반영). exporter 명령 API에 `POST /api/v1/workers/{w}/restart` 추가 — X6 Kill에 이은 두 번째 상태 변경 예외, 실제 시스템 접속 금지 불변(AGENTS §0.1 개정·ADR-0011 추기·command-api.md §2) | **승인** (플랜 모드 질의 확정) |
| 2026-08-19 | 프로젝트 소유 개발자 | **Phase X10 — Table Usage 개편 + 계약 v4.8**: 지시 원문 요지 "각 청크의 행 수 상한이 1,048,576인 거 감안해서 말이 되게 수정 + Cleanup Chunk(새벽 1시, delete/update 존재 테이블)·Rechunk(4임계 동시, 새벽 1시)·Rechunk 시 Cleanup Extent 동반·recalculate chunks indexes(clustering key 테이블) 기준 반영". 플랜 질의 확정 3건: ① 임계 ② 해석 = **충전율 90% 이상 청크가 60% 미만** ② 임계 ③ = **table_frag_info의 no_del_cnt ≥ 2** ③ 반영 수위 = **계약 확장(TV-C1 v4.8 additive 4종) — 4임계 실판정**. 승인 반려 시 추가 지시: **행 틴트**(Cleanup 대상 투명 노랑·Rechunk 대상 투명 빨강) | **승인** (플랜 모드 질의 확정) |
| 2026-08-19 | 프로젝트 소유 개발자 | **X10-f2 — Table Cleanup/Rechunk 목업 반영 (§0.1 부분 해제 3호)**: Claude가 "Cleanup/Rechunk 실행이 합성 데이터에 반영되는 것(Cleanup 접수 → 다음 틱 deleted 0·NoDel_Cnt 상승 → Rechunk 판정 변화)"을 제안, 인간 승인 원문 "ㅇㅇ 필요해". 동반 지시: n/4 표기 폐기·이름 클릭 상태 설명 모달, 유지보수 열 순서 Cleanup→Rechunk("어차피 Cleanup부터 시작하니까"), Idx 배지 제거("리청크하면 진행하는 작업이니까") | **승인** (인간 지시) |
| 2026-08-19 | 프로젝트 소유 개발자 | **X10-f3 — 단편화율 표기·유지보수 진행도(계약 v4.9)**: 지시 원문 요지 "충전율이라고 하지말고 단편화율 · 유지보수 열 오른쪽에 Progress열(바)·진행단계 열(Cleanup chunk/Rechunk/Cleanup Extent/Recalculate Chunk Indexes) · 유지보수 열의 계획/진행/필요 구분 계획". 플랜 질의 확정 3건: ① 단편화율 = **명칭만 교체**(수치 반전 대안 기각) ② 상태 구분 = **배지 문구 3상태**("예정"/"진행 중"/"—") ③ 진행 시간 = **시연형 ~30초**(실감형 기각) | **승인** (플랜 모드 질의 확정) |
| 2026-08-19 | 프로젝트 소유 개발자 | **Phase X11 — Worker Restart 안전 절차 (§0.1 부분 해제 4·5호: Graceful Shutdown·Remove Lock)**: 지시 원문 요지 "SQream 가이드를 보니 에러 발생 시 그냥 재시작하면 안 되는 것 같다 — 특히 CUD 작업 중. 지금은 Unhealthy면 무조건 Restart인데 이러면 안 될 것 같다. 가이드 조사해서 개선안". 플랜 질의 확정 3건: ① 반영 수위 = **락 시뮬까지 풀 반영**(orphaned lock + REMOVE_LOCK) ② 절차 = **3단계 강제** — 인간 원문 "stop statement를 먼저 시작하고 그 다음에 worker graceful shutdown하고 마지막으로 재시작을 허용해야하는거 아냐?" ③ CLE(cleanup) 계열 = **완전 차단·완료 대기**(가이드 원문 "Avoid interrupting or killing CLEANUP_EXTENTS…") | **승인** (플랜 모드 질의 확정) |
| 2026-08-19 | 프로젝트 소유 개발자 | **Phase X12 — 대시보드 메타 멘트 제거**: 지시 원문 요지 "(ADR-0004: ADMIN 전용…) 이런 멘트나 (목업 — 합성 데이터에 반영) 이런 멘트는 없애줄래 + 얼마나 있는지 어떤 종류가 있는지 조사". 플랜 질의 확정 2건: ① SQream 가이드 참조 6건 = **전부 삭제** ② 내부 기술어(exporter·:9801·409 등) = **이번 범위 제외** | **승인** (플랜 모드 질의 확정) |
| 2026-08-20 | 프로젝트 소유 개발자 | **Phase X13 — Cluster Performance Grafana 스타일**: 지시 원문 "main dashboard의 그래프가 조금 보기 싫은데 Grafana 스타일로 그려줄 수 있을까". 플랜 질의 확정 2건: ① 구성 = **스택 유지 + 시각만**(X7-b 불변) ② 색 = **Grafana classic**(이 차트 한정) | **승인** (플랜 모드 질의 확정) |
| 2026-08-20 | 프로젝트 소유 개발자 | **Phase X14 — 장애 유형별 Recovery 분기**: 지시 원문 "장애 유형에 따른 선택지가 다른건데 지금 Restart 조치는 순차적으로 실행하게 만들고 있어 그리고 조치 내용들을 보면 restart가 맞는지 조금 의문스러워 어떻게 하면 좋을지 생각해서 제안해줄래". 플랜 질의 확정 5건: ① 유형 신호 = **알람 이름 분리**(WorkerDown/WorkerUnresponsive) ② crash = **단일 재기동** ③ hang = **정지→관찰→격상** ④ **배지 분리**(빨강 Down·주황 무응답·회색 Stopped) ⑤ 어휘 = **"Recovery"**(1차 반려 원문 "Restart 버튼 보다 다른 말을 쓰는게 좋을거 같아" → "Recovery 라는 말을 쓰면 되겠네") | **승인** (플랜 모드 질의 확정) |
| 2026-08-20 | 프로젝트 소유 개발자 | **X14-f1 — hang 조치 병렬화·표기·카드 교체**: 지시 원문 요지 "회복 관찰 멘트는 운영자도 아는 사항 — 지워버려. stop statement 비활성화하지 말고 운영자 판단에 맡겨. 재기동 옵션도 활성화하되 실행 전에 안내를 해주고 실행. '무응답' 대신 No response. Queued Queries 카드는 의미없음(1초 이상 대기는 정지·에러 처리) — 지우고 다른 카드 방안 생각해". 질의 확정 2건: ① CLE 실행 중 = **차단 유지**(X11 확정 보존) ② 대체 카드 = **Longest Running** | **승인** (인간 지시 + 질의 확정) |
| 2026-08-20 | 프로젝트 소유 개발자 | **Phase X15 — Recovery 실체 = 워커 서버 kill**: 현장 확인 원문 "Internal Error 발생 시 Worker 기동은 자동 기동 스크립트가 실행 중이라 각 워커에 해당하는 서버에서 kill 명령어만 실행하면 되나봐 — `pgrep -a sqreamd | grep sqream101 | awk '{print "kill" $1}' | sh`". 플랜 질의 확정 4건: ① 명령 미리보기+서사 교체 ② crash 자동 기동 서사+버튼 유지 ③ Graceful Shutdown/Stopped **UI 폐기** ④ awk 공백 정정(`"kill " $1`) | **승인** (플랜 모드 질의 확정) |
| 2026-08-21 | 프로젝트 소유 개발자 | **Phase X16 — 문장 상태(Status) 축 5종 신설**: 지시 원문 요지 "카드들의 상태 내용을 In Queue, Preparing, Initializing, Executing, Stopped로" + 정정 "Compile/In Queue/Initializing/Executing은 누적 그래프에 쓰이는 상태 — 구분해야지". 플랜 질의 확정 2건: ① 적용 범위 = **React 문장 상태 표시 전체**(Grafana 무변경) ② Stopped = **최근 중단된 문장 수**(X-View 완료 이벤트 파생 — exporter·계약 무변경). X8 ③(Preparing 불채택)의 **부분 변경** — 누적 그래프 축은 v4.7 Compile 어휘 유지, 상태 축에서만 Preparing 채택 | **승인** (플랜 모드 질의 확정) |
| 2026-08-21 | 프로젝트 소유 개발자 | **Phase X17 — Query Overview 개편 + 카탈로그 확장(TV-C1 v4.10)**: 지시 원문 요지 "Q-Type 열 삭제·Query ID→Statement ID(값 포함)·Service 3종(etl_service/sqream/select_service, 실행 쿼리 따라)·실행 전 compile 표시·In Queue 워커 공란·sqream 서비스 용도는 매뉴얼 조사". 플랜 질의 확정 4건: ① compile = **Service 열** ② **웹 표시 파생**(exporter 큐 축 무변경) ③ Statement ID **드릴다운 전체 통일** ④ **카탈로그 확장**(INS·DEL 2종, query_type 도메인 6종 불변) | **승인** (플랜 모드 질의 확정) |
| 2026-09-07 | 프로젝트 소유 개발자 | **Phase E5 착수 — 차트 ECharts 통일**: 지시 원문 "llm_gpu_top_view_mockup 폴더의 그래프를 현재 디자인 그대로 apache-echarts로 바꾸는 작업을 할거야, 일단 먼저 시안 위주로 진행하고 시작하기 전에 어떻게 작업할지 계획해" + "Transplant에서 작업하는게 맞겠네". 플랜 질의 확정 3건: ① **타임라인 포함 — X1·X2 불가침 해제** ② 시안 = 실제 ECharts 프로토타입 페이지 ③ 범위 = 게이지·타임라인·X-View·LLM 검증·드릴다운 브러시·C3/D3 제거 | **승인** (플랜 모드 확정) |
| 2026-09-07 | 프로젝트 소유 개발자 | **E5 진행 규칙 정정** — 원문 "잠깐 본 화면 교체는 시안 보여주고 진행해야지" + "나 지금 외부야": 교체는 시안 이미지(헤드리스 캡처)를 전달하고 승인을 받은 뒤에만. 이미 진행한 X-View 교체분은 되돌린 뒤 시안 승인 후 재적용 | **승인** (인간 지시) |
| 2026-09-07 | 프로젝트 소유 개발자 | **E5 시안 승인 4건** — 게이지("승인 — 이대로 교체") · X-View("승인 — 이대로 교체" → 시안 재확인 후 "1진행해") · 드릴다운 브러시("승인") · 타임라인 GPU/SQream·GPU/LLM("승인"). 각 승인 직후 본 화면 교체·테스트 재작성·커밋·푸시 | **승인** (인간 지시) |
| 2026-09-07 | 프로젝트 소유 개발자 | **Phase X18 — Connection ID 채우기 (TV-C1 v4.12 additive)**: 질문 "Connection ID가 비는 이유가 뭐야" → 계약에 없음 설명 + `connection_id` 라벨 additive 확장 제안 → 원문 "ㅇㅇ 진행해". 값은 stmt_id 결정론 파생(상한 72 불변) | **승인** (인간 지시) |
| — | 프로젝트 소유 개발자 | U5 착수(잔여: `deploy/` 방침 + 전역 참조 스캔 — docker-kit 방침은 위 D1로 확정) | 대기 |
| — | 프로젝트 소유 개발자 | DEF-U1 착수(LLM 모니터링 요구사항 확정) | 대기 |
| 2026-08-13 | 프로젝트 소유 개발자 | **Phase X1·X2 착수(X-View 교체)** — TV-C1 additive 완료 메트릭 2종 · detail-col(시간구간+선택 구간 상세) X-View 교체 · Grafana(TV-C2) 미적용. Design 확인 4건은 계획 본문 기본안대로 확정: ① TimeRangePanel은 X-View 헤더 요약행으로 완전 흡수 ② 18fr/6fr 폭 비율 유지 ③ 점 색 = 유형 6색(QUERY_TYPE_COLORS) + 실패 ✕ 마크 ④ 통합 브랜치 = `feat/handoff-20260807`(인간이 본 브랜치에서 착수 지시·문서 커밋 흐름 유지, dev 통합은 추후 일괄). **추가 제약(인간 지시)**: ③구역 "시간대별 GPU 세션 & SQL 쿼리 실행 타임라인"(Timeline.tsx·lib/timeline.ts·타임라인 쿼리·Grafana 동명 패널)은 **절대 수정 금지** — X2는 `useRangeSelection` 구독만 한다 | **승인** (인간 지시 "착수하고 다되면 스크린샷" — 착수 직전 codex 확인 리뷰(수렴 규칙) 수행 후 구현) |

## 8. 보류(Deferred) 항목

| ID | 항목 | 조건 | 상태 |
| --- | --- | --- | --- |
| DEF-U1 | **LLM 모니터링 확장** — 폴더명 `llm_gpu_top_view_mockup`의 최종 지향점: 이 GPU/SQream 목업 기반 위에 LLM 모니터링 화면을 얹는다 | 인간이 요구사항(대상 메트릭·화면 시안·데이터 원천)을 확정·승인 | **해제 (2026-07-19)** — 시안 `llm_dashboard.pptx` 제시 + 인간 승인(§7). 구현은 Phase L1~L4 |
| DEF-X9-1 | **워커 구성 관리 화면** — 고정 GPU–MIG–워커 맵의 등록/변경 UI. 피드백 원문: "워커 구성 관리 화면 — 포탈 관리(설정) 메뉴에서 제공". X9의 사망 판정(고정 맵 대조)은 현행 코드 상수(`NODES × GPU_OPTIONS × MIG_OPTIONS`)를 맵으로 쓴다 | 포털 관리(설정) 메뉴 소관 — 이 목업 범위 밖. 포털 측 관리 메뉴 설계가 확정되면 맵의 외부 주입(설정 API) 여부를 그때 결정 | **보류 (2026-08-19, 인간 확정 — 문서 기록만)** |

- **DEF-U1 계약 원칙 (선점)**: LLM 확장은 TV-C1 v2.0에 대해 **additive-only** — 신규 `llm_*` 메트릭 네임스페이스를 추가할 뿐, 기존 메트릭 이름·라벨·타입은 불변이다(기존 두 UI 무수정 보장). 이 원칙을 벗어나는 설계는 계약 개정 절차(§3 TV-C1)와 인간 승인을 요한다.
- 메트릭 목록 초안·화면 스케치·일정은 **의도적으로 기록하지 않는다**(과속 방지).

## 9. 수락 기준 추적표 운영 규칙

Phase 종료 시 해당 Phase의 체크박스를 [x]로 갱신하고, 기준↔코드/테스트 경로 매핑을 회고에 기록한다.

## 10. 선언된 예외 (Declared Exceptions)

| ID | 대상 규칙 | 예외 내용 | 근거 |
| --- | --- | --- | --- |
| EXC-U1 | AGENTS.md §3.3-3 (신규/변경 라인 80%) | 커버리지 게이트를 **영역 전체 커버리지 임계값**으로 대체 운용 — exporter `--cov-fail-under=80`, web `npm run test:coverage`(라인·함수·구문 80%, 분기 70%) | 양 구 프로젝트의 동일 예외(각 plan.md EXC) 승계. 신규 로직의 테스트 존재는 codex 리뷰에서 별도 확인 |
| EXC-U2 | AGENTS.md §3.2-3 (스코프 검증 — rename 양쪽 경로 검사) | U2~U5 이관 커밋에서 rename **소스 측**의 `top_view_mockup/`·`top_view_react/` 경로는 스코프 위반이 아니다 | 통합의 본질이 구 폴더 → 신 폴더 이동이며, 검증 스니펫이 rename 양측을 검사하므로 예외 없이는 모든 이관 커밋이 위반 판정된다. 소스 측 경로가 위 2개 외이면 여전히 위반 |
| EXC-U3 | 문서 정합 일반 원칙 | `docs/history/` 및 이관된 이력 문서(ADR·회고·리뷰)의 본문·경로 표기는 **작성 당시 그대로 동결** — 구 루트 기준 경로가 남는 것을 허용 | 감사 기록의 사후 수정 금지. 고지문(`docs/history/README.md`)으로 갈음 |
| EXC-U4 | AGENTS.md §6.2 (Phase별 닫힌 게이트) | U1~U4의 codex 교차 리뷰·회고를 **통합 1회**(`phase-U2-U4-*`)로 갈음하고, push는 마지막 1회로 묶는다. 기계 검증 게이트(테스트·린트·커버리지·드리프트·스코프)와 Phase별 커밋은 전량 유지 | 인간 승인(2026-07-19, §7) — 이관 작업은 기능 변경이 없는 이동 중심이라 Phase별 리뷰의 한계 효용이 낮음. U5 및 이후 Phase는 원칙 복귀 |

## 11. 리스크 등록부

| ID | 리스크 | 완화 |
| --- | --- | --- |
| RK-1 | SCHEMA 상대경로 2단계 조정(U2 임시·U3 최종) 누락 | web 계약 테스트가 `npm run build` 경로에 포함 — 누락 시 빌드 즉사로 검출. 각 Phase 수락 기준에 빌드 green 명시 |
| RK-2 | 배포 스크립트 하드코딩 — `serve-react-linux.sh`(`../../top_view_react/dist`), systemd 유닛(`/opt/top_view_*`), native-linux README, 반출 tar 구조 | U4에서 일괄 갱신 + `grep top_view_` 스캔을 U4 수락 기준으로 |
| RK-3 | 미커밋 워킹트리 위에서 `git mv` 시작 | P0 게이트 — clean tree 필수 |
| RK-4 | `deploy/`·`docker-kit/` 6개 파일(git 추적, 통합 스코프 밖)이 구 경로 참조 — U5 삭제 시 파손 | U5 착수 조건으로 인간 결정(경로 갱신 vs 킷 동결·폐기), §7 승인 표 등재. **구 폴더 삭제 철회 + docker-kit 동결 확정(§7 D1)으로 절반 해소 — 잔여는 deploy/** |
| RK-5 | 모노레포 커밋 스코프 혼선(기존 `react`/`top-view` 접두사) | §7 커밋 규칙 — 신규 커밋은 `llm-top-view` 단일 스코프, 기존 접두사는 구 프로젝트 이력용으로 동결 |
| RK-6 | `top_view_react/.git` 빈 디렉터리 — 내용이 생기면 중첩 저장소화 | P0에서 제거 |
| RK-7 | AGENTS 스코프 검증이 rename 양측 경로를 검사 → 이관 커밋 전부 위반 판정 | EXC-U2로 기계 검증과 정합 |
| RK-8 | 이동+대량 수정 동시 커밋 시 rename 검출 저하로 git 이력 단절 | "이동 + 최소 경로 보정 1커밋" 규칙, `git log --follow` 표본 검사를 U2 수락 기준화 |
| RK-9 | 보존 버전 스택과 신 스택의 포트 공유(9801/9091/3001/8082) — 동시 기동 시 충돌 | **상시 규칙**: 한 번에 한 스택만 기동 (AGENTS §0.1 포트 선언) |
| RK-10 | U5 전역 스캔 오탐 — `top_view_mockup_원본/`(미추적 스냅샷), `docs/history/`·이관 이력 문서(동결) | 스캔 규칙에 제외 목록 명시(§5 U5 수락 기준) |
