# 계획 문서 (plan.md) — React 대시보드

> 상태: **인간 승인 완료** (2026-07-15)
> 준거: `docs/AGENTS.md` (§0.1 프로젝트 선언)

## 1. 요구사항 요약

- **목적**: 원본 시안(`../서류/gpu_dashboard.pptx`)의 대시보드를 **React 단일 페이지 앱**으로 재현한다. **iframe 임베드 없이** 브라우저가 **Prometheus를 직접 호출**하고, 차트는 **C3.js·D3.js**로 직접 그린다.
- **인간 확정 사항 (2026-07-15)**
  1. 위치: `top_view_react/` (형제 프로젝트와 독립)
  2. 범위: 원본 **100% 재현** — 좌측 사이드바(메뉴 + 서버 목록 카드) 포함 (ADR R-0003)
  3. 실행: **현장에 Docker·Node.js 없음** → 정적 산출물 + python `http.server` 서빙이 1순위, Docker(nginx)판 병행 (ADR R-0004)
  4. 데이터: **형제 프로젝트의 exporter(:9801) / Prometheus(:9091)를 그대로 재사용** — 이 프로젝트는 소비자
  5. 거버넌스: 형제 프로젝트와 동일한 phase 닫힌 게이트
- **선행 조건 (중요)**: 데이터가 **동적 시뮬레이션**으로 전환된 뒤에 차트를 구현한다. 형제 프로젝트의 Phase 5(동적화)가 R2 착수의 선행 의존이다 — 정적 고정값에서는 시계열이 수평선, 타임라인이 단일 세그먼트로 나와 차트·브러시 동작을 검증할 수 없다.

## 2. 화면 구성요소 → 구현 매핑

| 구성요소 | 구현 | 데이터 |
| --- | --- | --- |
| 사이드바 (로고·메뉴 9종·서버 카드 3장) | React 컴포넌트 | 서버 상태·GPU 사용 수는 메트릭에서 산출 |
| 헤더 (제목·현재 시각) | React | 로컬 시각 |
| 필터바 (환경/인스턴스/GPU/시간범위/자동갱신) | React select + URL 동기화 | `label_values` |
| 실행 중인 SQream DB 쿼리 | React 테이블 | `sqm_statement_*` 5종 (stmt_id 조인) |
| SQL 쿼리 성능 정보 | React 테이블 | `sqm_query_*` (상태 배지: Initializing/In Queue/In Process) |
| GPU 세션 & 쿼리 실행 타임라인 | **D3 간트** (세그먼트·브러시·클릭 필터) | `sqm_gpu_timeline_state` range |
| 선택 구간 상세 정보 (8항목) | React 패널 | 구간 집계 쿼리 |
| GPU 시계열 4종 | **C3 라인** | `DCGM_FI_DEV_*` range |
| 서버 카드 3종 (게이지 4개씩) | **C3 게이지** | `DCGM_FI_DEV_*` 서버별 집계 |

## 3. 계약 (소비 전용)

| 필드 | 값 |
| --- | --- |
| contract_id | TV-C1 (소비자 기록: RC-1) |
| source_of_truth_path | `../top_view_mockup/docs/architecture/db-schema.md` |
| owner_role | **external** — 형제 프로젝트 exporter가 소유. 본 프로젝트는 **소비만** |
| consumer_paths | `src/api/queries.ts` |
| drift_check_command | `npm run test -- queries.contract` (사용 메트릭·라벨 ⊆ SoT) |

계약에 없는 데이터가 필요하면 AGENTS.md §4-6 이스케이프(형제 프로젝트 개정 절차).

## 4. 아키텍처 산출물 (§3.4)

| 산출물 | 경로 | 상태 |
| --- | --- | --- |
| 시스템 아키텍처 | `docs/architecture/system.md` | R1 작성 |
| 디자인 토큰 | `docs/design-tokens.md` | R1 작성 |
| ADR | `docs/adr/R-0001~0004` | R1 작성 |
| db-schema·data | — | **명시적 면제** (브라우저 앱, 계약 소비만 — 형제 문서 참조로 갈음) |

## 5. Phase 분해 (닫힌 게이트: 구현 → 테스트/린트/커버리지 → codex 리뷰 → 수정 → 회고 → dev 커밋)

### Phase R1 — 거버넌스·설계 문서 + 스캐폴딩
- **작업**: `docs/AGENTS.md`(신규)·`plan.md`·ADR 4건·`design-tokens.md`·`architecture/system.md`, Vite+React18+TS 스캐폴딩(C3 0.7.20 + D3 5.16.0 핀), ESLint·tsc·Vitest 게이트, `.gitignore`·`.env.example`
- **수락 기준**:
  - [x] 문서 전부 존재 + system.md에 mermaid 블록 (§3.4 점검 통과)
  - [x] `npm run lint && npm run typecheck && npm run test` 0 fail
  - [x] C3 ↔ D3 단일 버전(v5) 정합 — `npm ls c3 d3`에서 deduped 확인
  - [x] 디자인 토큰이 원본 시안 추출값과 일치 (`tokens.css` ↔ `design-tokens.md`)
- **의존성**: 없음

### Phase R2 — 데이터 계층
- **작업**: `src/api/prom.ts`(instant/range/label_values, AbortController 타임아웃), `src/api/queries.ts`(PromQL 유일 정의처 + queryRegistry), `src/hooks/usePolling.ts`(tick 직렬화·연속 실패 고지), `src/hooks/useFilters.ts`(필터 상태·URL 동기화)
- **수락 기준**:
  - [x] fetch 모킹 테스트: 성공/HTTP 오류/타임아웃/취소/비정상 응답(malformed) 처리
  - [x] **계약 대사 테스트**: `queryRegistry()`의 전 메트릭·라벨·타입이 SoT의 부분집합 (미계약 이름·무명 selector·Counter 함수 오용 시 실패 — 변조 탐침 3종 CAUGHT)
  - [x] 폴링 훅: 겹침 방지·언마운트 시 취소·필터 변경 시 이전 요청 취소·연속 3회 실패 감지
  - [x] 커버리지 게이트 통과(97.7%, 분기 84.7% — perFile 임계값)
  - [x] 라이브 검증(PROM_LIVE=1): 실 Prometheus 9건 — 조인 정합·중복 없음·rows/s 구간 스케일
  - [x] 라벨 값 주입 차단(escapeLabelValue 2계층 이스케이프), build가 계약 테스트를 강제(위반 시 dist 미생성)
- **의존성**: R1 + **형제 프로젝트 Phase 5(동적 시뮬레이션) 완료**

### Phase R3 — 셸·레이아웃·테이블
- **작업**: 사이드바(메뉴 9종 + 서버 카드 3장)·헤더·필터바·패널 프레임, 시안 토큰 기반 CSS Grid, 테이블 2종(조인·단위 포맷·상태 배지)
- **수락 기준**:
  - [x] 레이아웃 비율이 `design-tokens.md` §3 표와 일치 — `src/styles/app.css` PPTX 팔레트·그리드
  - [x] 테이블 2종 렌더 테스트 — 조인 결과·단위 표기(GB/%/KST 시각)·상태 배지 3종 (`tests/components.test.tsx`)
  - [x] 사이드바 서버 카드가 **메트릭에서 산출**(하드코딩 금지) — 서버별 상이 값 검증 (`tests/app.test.tsx`)
  - [x] 커버리지 게이트 통과 — 98.78% (분기 92.26%), perFile
- **의존성**: R2
- **완료**: 2026-07-16 · codex 14건(Blocking 1/Major 7/Minor 6) 전건 Fixed + 확인 리뷰 잔여 3 Minor 처리. 리뷰/회고 문서화

### Phase R4 — 차트
- **작업**: C3 시계열 4종(GPU별 라인, 시안 색), C3 게이지 12개(3서버 × 4지표), D3 타임라인 간트(세그먼트·브러시 구간 선택·막대 클릭 GPU 필터), 선택 구간 상세 패널(8항목)
- **수락 기준**:
  - [x] range 결과 → C3 데이터 변환 테스트 — 누락 null 채움·복합키 정렬·색 매핑 (`series.test`·`c3config.test`)
  - [x] 타임라인 세그먼트화 로직 테스트 — 연속 병합·경계·Idle 제외·brushRange (`timeline.test`)
  - [x] 브러시 선택이 시간 범위를, 막대/라벨 클릭이 GPU 필터를 갱신 (`timelineRender.test`, 드래그는 HCI)
  - [x] 폴링 갱신 시 차트 **재생성 없이 load** — generate 1회·unload·destroy (`charts.test`)
  - [x] 커버리지 게이트 통과 (99.43%, 분기 90.56%) / **시각 충실도는 HCI**
- **의존성**: R3
- **완료**: 2026-07-16 · codex 10건(Blocking 1/Major 5/Minor 4) 전건 Fixed + 확인 리뷰 잔여 2 Minor 처리. 리뷰/회고 문서화

### Phase R5 — 실행 모드 + README
- **작업**: `native/`(build/start/stop/verify PS1 — `dist/`를 python `http.server`로 :8082 서빙), `docker-compose.yml`(nginx:alpine), `README.md`(양 모드·망분리 반출 절차·보안 전제)
- **반출 세트 정의 (CDX-R1-10)**: `dist/` + `native/*.ps1` + `.env.example` + `README.md` + **SHA-256 체크섬 파일**. 정적 서버의 기동 주체는 **현장 운영자가 `start-native.ps1`을 실행**하는 것으로 고정하며(서비스 등록은 범위 밖), 스크립트가 python 존재를 검사하고 없으면 안내 후 종료한다.
- **작업(실제)**: 현장이 RHEL 8.x Linux 이므로 **`native-linux/*.sh`(serve/stop/verify/package-dist)를 1순위**로,
  `native/*.ps1`(개발 PC 테스트)은 보조로 구현. `docker-compose.yml`(nginx) 2순위.
- **수락 기준**:
  - [x] `npm run build` → `dist/` 생성, 번들에 하드코딩 호스트 없음(verify 4번 항목이 전체 JS 검사)
  - [x] `verify.sh`/`verify.ps1` 통과: 정적 서버 200 + index/자산 + Prometheus 도달 + **CORS 값 검사**(ACAO 가 `*`/보낸 Origin 정확 일치)
  - [x] Docker(nginx) 기동 구성 — `docker compose config` 유효(codex 확인)
  - [x] 기존 스택(9801/9091/3001)과 포트 무충돌(8082 사용, 9091 공유 소비)
  - [x] README에 두 모드·**자립 반출 세트**·체크섬 검증 절차 기재
  - [ ] 원격 PC 브라우저 접속·현장 RHEL 실행은 **인간 검토(HCI-R5-1)** — 자동 검증 불가
- **의존성**: R4
- **완료**: 2026-07-16 · codex 9건(Blocking 1/Major 6/Minor 2) 전건 Fixed + 확인 리뷰 잔여 Blocking(정확 인자 일치) 처리. 스크립트 기능 스모크 통과. 리뷰/회고 문서화

### Phase R6 — PPTX 디자인 재정렬 + 동적 시뮬레이션 가시화 (인간 지시 2026-07-17)
- **배경**: 인간 지적 — ① 디자인이 PPTX 취지(선택 인스턴스 중심 화면)와 다름, ② 동적 시뮬레이션 패턴이 화면에서 읽히지 않음. PPTX COM 렌더 대조 + `gen_dashboard.py`(Grafana 재현) 기준으로 시각 계층 재정렬. PromQL·데이터 계층 불변.
- **인간 결정**: 기본 화면 All 유지(서버 카드 클릭 시 단일 인스턴스 뷰 전환) / 타임라인 색 = 계약(query_type) 기준 유지(DES-1 오픈) / d3 v7 툴체인 유지(ADR R-0002 개정).
- **작업**: 인스턴스 선택(사이드바 카드 버튼화+`selectInstance` 토글, 패널 제목 접미사), 타임라인(단일 시 GPU-0~3 행·적응 높이·세그먼트 쿼리명 라벨), 시계열(제목 개정·하단 공유 범례·인셋 범례 제거), 서버 카드(원형 링 게이지 4단 스택·"N GPU" 부제·임계 green/orange70/red85·전력 max1600), RangeDetail × 닫기, CSS 비율(.grid 1.26fr / .lower 3.16fr).
- **수락 기준**:
  - [x] 단일 인스턴스 선택 시: 4개 패널 제목 "(선택 인스턴스: GPU-Server-0N)", 타임라인 GPU-0~3 4행 + 세그먼트 라벨, 시계열 4선 + 하단 GPU-0~3 범례
  - [x] All: 기존 composite 표기 유지, 접미사 "(인스턴스: All)"
  - [x] 링 게이지: fullCircle + 임계색(70/85, 온도 75/85), 전력 max 1600 단색(info)
  - [x] 사이드바 카드 aria-pressed 토글, RangeDetail × 로 선택 해제
  - [x] `npm run verify`(커버리지 perFile 80/80/70) + `npm run build` 통과, PromQL 계약 테스트 불변 (테스트 218 passed/9 skipped)
  - [x] 라이브 E2E: mockup 스택(Docker, 동적 exporter 리빌드) 기동 후 확인 — 행당 세그먼트 3~6개 churn·절단 라벨·In Queue 배지·링 게이지 임계 전환(72%→주황)·시계열 부하 상관 육안 확인 → **HCI-R4-1 종결**
- **의존성**: R5 + ADR R-0002 개정(툴체인 커밋)
- **완료**: 2026-07-17 · 검증 중 발견: 기동 중이던 Docker exporter가 Phase 5 이전 이미지(정적) → 리빌드로 해소. c3 링 중앙 값 6px 인라인 → CSS !important 보정(HCI-R6-1 종결)

### Phase R7 — 하이브리드 디자인 + MIG v2.0 + 공란 (인간 지시 2026-07-17)
- **배경**: 인간 지시 4건 — ① 정적 수치 제거→공란(둘 다: TSDB 정리 + 끊김 시 공란), ② 본문 디자인·카드 배치 = Grafana판, ③ 사이드바 = PPTX 계층, ④ H200 4장 × MIG 2분할 반영(계약 TV-C1 v2.0 — 형제 프로젝트에서 개정). 결정 기록: ADR R-0006.
- **작업**: mig 라벨 소비(by-list 3곳·시리즈/타임라인 키·라벨 GPU-n·Mm), 시계열 4분할 독립 카드(Grafana 표기), arc 게이지 회귀 + 전력 2800W, "시간 구간" 소패널 분리, 필터바 리셋 2종, 사이드바 sub 들여쓰기, 공란 동작(DISCONNECT_THRESHOLD=3 공유·3훅 리셋·RangeDetail 끊김 문구), 사이드바 "N / 8 MIG 사용 중"·카드 부제 "4 GPU · 8 MIG"(gpuPhysical 쿼리).
- **수락 기준**:
  - [x] 계약 v2.0 소비: 24슬롯 타임라인(단일 서버 8행 GPU-0·M0~), 시계열 8선(MIG 쌍 색 공유), MIG 컬럼 없는 기존 테이블 유지(라벨만 조인 키)
  - [x] 본문 = Grafana판: 시계열 독립 카드 4개·arc 게이지·시간구간 소패널·리셋 버튼 2종·비율 1.18fr/3fr
  - [x] 사이드바 = PPTX: 하위 5종 sub 들여쓰기, aria 유지
  - [x] 공란: 연속 실패 3회 시 테이블·차트·게이지·상세 EMPTY(잔상 없음), 끊김 문구 분기
  - [x] `npm run verify`(223 passed, 커버리지 perFile) + `npm run build` 통과
  - [x] 라이브 E2E: exporter 리빌드 + prom 볼륨 초기화(grafana-data 보존) 후 확인 — 24시리즈·mig=[0,1]·H200, 단일 서버 8행(GPU-0·M0~) 세그먼트 churn·절단 라벨, arc 게이지 값 판독, 사이드바 "7/8·3/8·1/8 MIG 사용 중"(서버별 상이), 공란 실측(스택 정지→배너+테이블 공란+"연결 끊김" 문구+세그먼트/게이지 DOM 0→복원)
- **의존성**: R6 + 계약 TV-C1 v2.0(형제 커밋 1·2)
- **완료**: 2026-07-17 · 운영 반영: exporter 이미지 v2 리빌드, Prometheus 볼륨 초기화(구 정적·v1 시리즈 제거), Grafana v2 대시보드 재프로비저닝

### Phase R8 — Dashboard·PPTX Sidebar Visual Realignment (인간 승인 2026-07-17)
- **승인 계획**: `.hermes/plans/2026-07-17-dashboard-pptx-sidebar-realignment.md`
- **범위**: Tasks 0–7은 레이아웃·sidebar·C3 resize 구현과 자동 게이트까지 수행한다. Task 8의 CDP helper, `docs/evidence/R8/**`, codex review/resolution, retrospective는 별도 QA/review 단계로 남긴다.
- **고정 계약**: `src/api/**`, `src/hooks/**`, PromQL, 폴링의 `load` 갱신, TV-C1, `NODES` 3대 순서는 변경하지 않는다.
- **수락 기준**:
  - [ ] 1600×900에서 sidebar가 PPTX와 유사한 약 12.5% 폭과 큰 우측 라운드 외곽을 가지며 메뉴 계층·separator·서버 카드 스택이 구분된다.
  - [ ] 본문 상단 `13:11`, 중단 `18:6`, 하단 `18+2+2+2` 폭 계약이 유지된다.
  - [ ] dashboard section 높이는 gap 제외 `top:middle:bottom = 7:11:16`이며, 중단 우측은 `2:9`, 하단 좌측 4개 metric card와 우측 gauge card는 총높이가 일치한다.
  - [ ] 서버 게이지 세 카드는 같은 폭이며 각 카드 내부 4개 게이지는 위→아래 동일 간격으로 쌓인다.
  - [ ] panel/table/chart/detail은 Grafana 목업과 유사한 다크 표면·얇은 border·조밀한 header/body 간격을 사용하고 경계 밖으로 넘치지 않는다.
  - [ ] 1366×768에서 24-column을 유지하며 겹침이 없고, 1024×768에서는 `.content`에만 가로 스크롤이 생기며 sidebar/body에는 생기지 않는다.
  - [x] 브라우저 resize 시 C3 chart/gauge가 컨테이너 폭·높이에 맞춰 resize되고 generate는 최초 1회만 호출된다.
  - [x] 기존 접근성 계약(`aria-current`, `aria-disabled`, server button/`aria-pressed`, panel heading/region)이 유지되고 separator 의미가 명시된다.
  - [x] 현행 `NODES` 3대가 sidebar와 하단 gauge에 같은 순서로 각각 3개 표시되고, 20자 이상 서버명에서도 badge와 이름 overflow 정책이 유지된다.
  - [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage`, `npm run build`가 모두 exit 0이다.
  - [ ] `docs/evidence/R8/`에 PPTX·Grafana 기준과 React 1600×900·1366×768·1024×768 viewport/full-page 증거 및 최소 1회 fix-and-verify를 기록한다.
  - [ ] 미해결 Blocking/Major 0, Rejected/Escalated 인간 판정 완료, 최종 디자인 인간 승인까지 확인한다.
- **감사 기록**:
  - 승인 계획 SHA-256: `D0E1DB551FCCC5520329063B49517ABA9DF66E5B7DA8B4A6DAC876C2102A6FD8`
  - 독립 교차 검토: OpenAI Codex CLI 0.144.1 / model `gpt-5.6-sol` / session `019f6c22-2d64-7212-a6a6-753f92dd75be`
  - 교차 검토 대상 SHA-256: `1CB6606A12504894E70714C3BE13EA8AD5AD45E7D42E565BE3EEBD0C35F1941F` / 검토 시각 `2026-07-17T03:19:11+09:00`
  - adjudication: 3차 검토 지적 6건 전부 Accepted, 계획 본문에 반영. Rejected/Escalated 없음.
  - 인간 승인 시각: `2026-07-17T05:37:48+09:00` (본 구현 요청)
- **자동 검증(Tasks 0–7)**: focused RED→GREEN 5회, 전체 238 passed/9 skipped, coverage 97.79% statements·90.78% branches·98.20% functions·99.08% lines, lint/typecheck/build exit 0.
- **상태**: Tasks 0–7 구현 완료, Phase R8 미완료. 1–6번의 browser 정량·시각 판정과 11–12번 Task 8 QA/review 및 최종 디자인 인간 승인 전에는 완료로 표시하지 않는다.
  (R8의 시각 판정은 R9 E2E 재캡처로 흡수 — R8 수용 커밋 57cf74e 메시지 참조)

### Phase R9 — UX 10사이클 검토 반영 (인간 지시 2026-07-16, 계획 승인 시 "codex review gate 넣어서 진행" 조건)

- **검토 방법**: 실화면 4개 상태(All 1600w / 단일 인스턴스 / 1366×768 / 공란)를 헤드리스 캡처해
  10개 렌즈(정보 계층·차트 판독성·레이아웃 무결성·색 의미론·테이블 UX·인터랙션 발견성·
  상태 피드백·표기 일관성·반응형·접근성)로 순회 검토. 발견은 F-번호 체계로 우선순위화.
- **10사이클 발견 요약**:
  - P0 (깨짐): F3.1 All 뷰 타임라인 24행 잘림(스크롤 신호 부재) · F3.2 상세 패널 마지막 행
    잘림(2fr/9fr 고정 분할) · F2.1 y축 눈금 뭉개짐(C3 320px 기본 생성 후 RO 축소)
  - P1 (핵심): F5.1 테이블 MIG 컬럼 부재 · F4.2 MIG 쌍 동일색 식별 불가 · F2.2/F2.3 All 뷰
    24선·범례 무력화 · F7.1 갱신 시각 부재 · F3.4/F3.5 공란 골격 부재 · F3.3 All 게이지 "—"
  - P2 (다듬기): F1.1 KPI 요약 부재 · F5.2 In Queue 매몰 · F6.1/F6.2 발견성 · F8.2/F8.3 표기 ·
    F7.2 로딩 구분 · F10.2 focus-visible
  - P3 (백로그 — 이번 범위 제외): F5.3 경과시간 컬럼 · F6.3 리셋 버튼 위계 · F10.1 임계 초과
    텍스트 보조 신호(▲)
- **인간 확정**: ① 미커밋 R8 수용 후 그 위에 개선 ② KPI 스트립 추가 ③ All 뷰 시계열은
  노드 평균 3선.
- **구현 (커밋 단위)**:
  - R9-P0: c3config `initialSize`(생성 시점 컨테이너 실측 — 320px 기본 생성 제거),
    `.timeline__plot-scroll` 하단 sticky 페이드 + 내부 스크롤바 상시 가시화(8px),
    `.detail-col` `auto minmax(0,1fr)`, y축 폰트 10px
  - R9-P1+KPI: 테이블 MIG 컬럼(M0/M1), M1 라인 점선(`[class*="·M1"]` — c3 0.7.20은 공백만
    치환해 라벨을 보존, 범례 스와치도 점선), All 뷰 `gpuTimeseriesAvg`(avg by(node) 4종) 3선 +
    노드 팔레트 `--node-1/2/3`, `usePolling.lastSuccessAt` → 헤더 "갱신 HH:MM:SS",
    MetricChart "데이터 없음" 문구, ServerGauges NODES 자리표시 카드, KpiStrip(활성 MIG
    n/분모 · In Queue(>0 주황, **환경 전체** — `sqm_query_state`에 위치 라벨이 없어 필터
    불가·전역 명시) · 총 처리행수/s · 평균 P95 — `kpi()` 5쿼리, `--dashboard-kpi-h` 64px)
  - R9-P2: In Queue 행 틴트(주황 8%) · 상세 "전체" 브러시 안내 인라인 · 서버 카드 hover ·
    "활성 MIG n / 분모" · "쿼리 수(구간 완료)" · 공통 `:focus-visible` · 첫 로드 "불러오는 중…"
- **수락 기준**:
  - [x] `npm run verify`(lint·typecheck·coverage)·`build` exit 0 — 270 passed/9 skipped,
    coverage 97.9% stmts·91.71% branches·98.31% funcs·99.14% lines
  - [x] 신규 동작 테스트: KPI 4타일·MIG 컬럼·점선 스와치·갱신 시각·공란 골격·All 평균 3선
    전환·initialSize·lastSuccessAt (계약 테스트 갱신 포함: queries/tokens/chartColors/layout)
  - [x] Codex 리뷰 게이트(working-tree scope) Blocking/Major 0 후 커밋 (커밋 6383347)
  - [x] E2E 4개 상태 재캡처(CDP 실시간, `docs/evidence-r9-*.png`) — 아래 판정
- **E2E 판정 (2026-07-17, CDP 실시간 14~26s 폴링 관찰)**:
  - All 1600: KPI 4타일 값·갱신 시각 표시, 시계열 = 노드 평균 3선(c3 target 12 = 4차트×3선,
    슬롯 target 0), 범례 3항목, 게이지 12개 값·arc 전부 렌더(svg 93×64 — initialSize 실측
    작동), 상세 7항목 전부 존재, MIG 컬럼 2테이블, NaN path 0
  - 단일(gpu-server-01): KPI "활성 MIG 7 / 8"로 필터 스코프 반영, 범례 8항목(GPU-0·M0~
    GPU-3·M1), **M1 점선 스와치 4개 + `·M1` target 존재**(점선 CSS 매칭 대상 확인)
  - 1366×768: 겹침 없음, 타임라인 24행 내부 스크롤 유지, 게이지·KPI 정상
  - 공란(Prometheus 정지 26s): 배너 + KPI "- / -"·"-"(**0 위장 없음** — 2차 P1 반영 검증),
    "갱신 —", 차트 4장 "데이터 없음" 중앙 문구, 게이지 자리표시 카드 12개 골격 유지
  - **F3.3 종결**: DOM·CDP 실시간에서 게이지 값·arc 정상 — "—"는 `--virtual-time-budget`
    헤드리스 캡처에서만 재현되는 **캡처 환경 아티팩트**(RO/페인트 타이밍)로 판정. 실브라우저
    영향 없음. F2.1 예비안(bottom-h 432) 불필요 — y축 3눈금 판독 가능.
- **백로그(P3)**: F5.3 경과시간 컬럼 · F6.3 리셋 버튼 위계 · F10.1 임계 초과 텍스트 보조
  신호(▲) · (관찰) 공란 시 사이드바 서버 목록도 자리표시 골격 후보
- **R9.1 후속 (인간 지시 2026-07-17 "세로축이 작아서 안 보여")**: E2E의 F2.1 "판독 가능"
  판정을 인간이 뒤집음. 원인 계측 — c3가 카드마다 x축에 세로 30px를 예약해 y 플롯이
  ~24px. 인간 확정 "x축 중복 제거 + 높이 확대": 위 3장 `axis.x.show:false`(예약 30→8px,
  시간축은 전력 카드 대표 — 스파크라인 스택, ADR R-0007 결정 7) +
  `--dashboard-bottom-h` 384→432(7:11:18) + 축 폰트 11px. 결과 플롯 ~57px.
  - Codex 게이트 1차: P2 1건 — 전력 시리즈만 비면 시간축이 화면에서 통째로 사라짐 →
    축 대표를 "데이터 있는 맨 아래 카드"로 동적 선택(`axisIdx`), 축 소유 변경 시
    `key` 재마운트로 갱신(generate-1회 원칙 유지). 수정 후 verify 276 passed·build green.
  - Codex 게이트 2차: P2 1건 — 부분 가용 시 auto-domain이 차트마다 어긋나 대표 축이
    위 차트의 시간 위치를 오도할 수 있음 → 4장의 x도메인을 요청 구간(useCharts.domain)에
    고정(`axis.x.min/max` + padding 0), 폴링 전진은 `chart.axis.range`로 갱신
    (c3 parseDate가 ms 숫자 처리 확인). 수정 후 verify 278 passed·build green.
  - CDP 재캡처: y축 0/50/100 분리 판독 확인, 위 3장 시간축 부재·게이지 arc 확대 —
    `docs/evidence-r9-all-1600.png`·`-single-1600.png` 갱신.
- **R9.2 후속 (인간 지시 2026-07-17 "hover 표가 잘린다")**: 원인 2겹 — ① c3 기본
  `tooltipPosition`이 `d3.mouse`(d3 v7 제거)를 호출해 위치 계산이 조용히 실패
  (c3는 위치 전에 display:block을 먼저 켬) ② 카드 overflow:hidden 체인이 표를 클리핑
  (플롯 ~57px에 8행 표는 물리적으로 수납 불가). 수정: `tooltip.position` 콜백 직접
  제공(커서 추적 + 뷰포트 클램프 `tooltipPosition()` — d3 비의존 근본 수정) +
  `.c3-tooltip-container`를 `position: fixed !important`(c3가 인라인 absolute를 박음)
  z-index 40으로 overflow 탈출 + 다크·컴팩트 툴팁 스타일. CDP 실측: hover 디스패치로
  fixed·뷰포트 내·카드 밖 표시(잘림 없음) 판정.
  - Codex 게이트 1차: P2 — 버블 리스너는 c3 타깃 핸들러 뒤라 좌표가 1이벤트 지연 →
    **캡처 페이즈** 등록으로 수정(CDP 재실측: 현재 이벤트 좌표 정확 반영) /
    P3 — 포인터 테스트의 실행 순서 의존 → 테스트 내 등록 보장으로 자립화.
    수정 후 verify 285 passed·build green.
- **감사 기록 (Codex 리뷰 게이트)**:
  - 1차 리뷰(working-tree): Blocking 0 · P1 1건 · P2 4건 → **전건 Accepted·수정**
    1. [P1] `.chrome-review/`(344MB 크롬 프로필) 커밋 위험 → 루트 `.gitignore` 등재
    2. [P2] KPI In Queue가 인스턴스/GPU 필터 미적용 → 계약상 `sqm_query_state`에 위치
       라벨이 없어 필터 불가 — 타일 라벨 "In Queue (환경 전체)"로 전역 명시(옵션 ② 채택)
    3. [P2] 첫 로드 문구가 폴링 계열 간 오염(detail 선성공 시 테이블·차트 "데이터 없음")
       → `loadingText(at)`를 훅별 타임스탬프(tableAt/chartAt)로 분리
    4. [P2] 대기·유휴 행의 MIG 라벨은 슬롯 잔재 → In Process(state 1)만 표시, 그 외 "-"
    5. [P2] `.claude/settings.local.json`(머신 로컬 allowlist) — 전역 ignore에만 의존하던
       것을 루트 `.gitignore`에 명시
  - 2차 리뷰(수정 반영 재검): 신규 P1 1건 · P2 1건 → **전건 Accepted·수정**
    6. [P1] `or vector(0)`이 시리즈 부재(exporter 장애)를 "In Queue 0"으로 위장 →
       `or (0 * count(원본))` 패턴으로 원본 존재 조건부 폴백 (같은 결함의 R9 신규
       `migActive`도 동일 수정 — 부재 시 NaN → "-" 표기)
    7. [P2] 첫 로드 상태가 MetricStrip에만 전파되고 Timeline은 "표시할 타임라인 데이터가
       없습니다" → Timeline에도 `emptyText`(chartAt 기준) 전파
  - 수정 후 verify 272 passed·coverage 97.9%/91.78%·build exit 0
  - 3차 리뷰: **"No actionable correctness issues" — Blocking/Major 0, 게이트 통과**
  - 커밋 전략: 당초 ②P0→③P1+KPI→④P2+docs 3분할 예정이었으나 P0/P1/P2가 같은 파일
    (app.css·App.tsx·c3config.ts·layout.contract 등)을 공유해 hunk 분할 없이는 중간
    커밋의 green을 보장할 수 없어 **단일 커밋으로 봉인** — 게이트가 전체 diff를 3회
    검토했으므로 분할의 취지(검토 단위)는 충족

## 6. Cross-Review 기록 (§3.1)

### 6.1 초안 작성
Claude Code (model_id `claude-opus-4-8`), 2026-07-15 — 시안 색·좌표 추출, PromQL 인벤토리, CORS·툴체인 확인 후 설계. 인간이 4개 항목(위치·재현 범위·실행 모델·거버넌스)을 확정(§1).

### 6.2 독립 교차 검증 (타 모델)

리뷰어: **OpenAI Codex `gpt-5.6-sol`** (reasoning xhigh, codex-cli 0.144.1, `codex exec` read-only) — Claude와 상이한 모델·실행 주체.

| 회차 | session_id | 검토 대상 draft SHA-256 (plan.md) | 검토 시각 (UTC) | 결과 |
| --- | --- | --- | --- | --- |
| 1차 | `019f61d3-c6d8-7fe3-890d-acadc05c2ea3` | `1c0a4bd0d0be21ba8f96ad3c6d2ad02a7a3ea6ae53e4b5b0ba3b7a4e2d1a9c77`(R1 시점 초안) | 2026-07-15T18:0x | 지적 8건 (Blocking 1 / Major 4 / Minor 3) + 보강 지적 5건 — 전문 `docs/reviews/phase-R1-codex-review.md` |
| 2차(확인) | `docs/reviews/phase-R1-codex-resolution.md`에 기록 | 갱신본 | 동 문서 | 동 문서 |

> 신선도 바인딩(§3.1-2): 리뷰 반영으로 본 문서가 갱신되면 이전 리뷰는 무효화된다. 최종 회차 판정은 무한회귀를 피하기 위해 resolution 문서에 기록한다.

### 6.3 이의 처리 (Adjudication)

1차 지적 전건 **Accepted → Fixed** (처리 상세·증거는 `docs/reviews/phase-R1-codex-resolution.md`). Rejected/Escalated 없음.

**인간 재승인**: 리뷰 반영으로 갱신된 부분(빌드 게이트·tsconfig 분리·테스트 확장 등)은 인간이 승인한 결정 사항(위치·범위·실행 모델·거버넌스)의 **의미를 바꾸지 않는다**. 따라서 R2 착수는 비차단으로 진행하되, 갱신본 재확인을 회고 HCI로 등재한다.

### 6.4 인간 승인 기록

| 날짜 | 승인자 | 대상 | 결과 |
| --- | --- | --- | --- |
| 2026-07-15 | 프로젝트 소유 개발자 | React 재구현 계획 v6 (위치·100% 재현·무-Docker 정적 배포·거버넌스) | **승인** |
| 2026-07-15 | 프로젝트 소유 개발자 | 데이터 정책: 기존 exporter/Prometheus 재사용 + **동적 시뮬레이션 선행**(형제 Phase 5), 시간축 압축(기본 30분), 서버 카드 자유 변동 | **승인** |

## 7. 선언된 예외

| ID | 대상 규칙 | 예외 내용 | 근거 |
| --- | --- | --- | --- |
| RXC-1 | AGENTS.md §3.3-3 (신규/변경 라인 80%) | 패키지 전체 커버리지 임계값(라인·함수·구문 80%, 분기 70%)으로 대체 운용 | 전량 신규 코드라 전체≈신규. 신규 로직의 테스트 존재는 codex 리뷰에서 별도 확인 |
| RXC-2 | §3.4 산출물 | `db-schema.md`·`data.md` 면제 | 브라우저 앱이라 자체 영속 저장소가 없고 메트릭 계약을 소비만 함 — 형제 문서 참조로 갈음 |

## 8. 알려진 설계 판단 사항 (인간 확인 대상)

| ID | 내용 | 상태 |
| --- | --- | --- |
| DES-1 | 시안 타임라인은 `Sales_Aggregation`을 SELECT색, `Group_By_Region`을 집계색으로 칠했으나 계약의 `query_type`은 그 반대다. 이 프로젝트는 **계약 라벨 기준으로 색을 결정**한다(범례 색 자체는 시안과 동일) | R3/R4 회고 HCI로 인간 확인 |
| DES-2 | 데모 시간축: 쿼리 지속을 30초~3분으로 압축하고 **기본 시간범위 Last 30 minutes** 사용(실제 운영은 더 긴 시간축) | 인간 확정 (2026-07-15) |
| DES-3 | 서버 카드 수치는 시안 고정값에 맞추지 않고 **자유 변동**(서버별 성격만 차등) | 인간 확정 (2026-07-15) |
