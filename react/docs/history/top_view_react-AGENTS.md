# 에이전트 지침서 (AGENTS.md) — GPU/SQream Monitoring Dashboard React 구현

이 문서는 **원본 시안 화면을 React + C3/D3로 재구현하는 프로젝트**(`top_view_react/`)에서 AI 에이전트가 수행해야 할 역할, 규칙, 검증 명령어를 정의하는 **거버넌스 문서**입니다. 거버넌스 골격은 형제 프로젝트(`../top_view_mockup/docs/AGENTS.md`)를 계승하며, §0.1 프로젝트 선언·§2 명령 바인딩·§5 스코프·§6.1 로드맵을 이 프로젝트에 맞게 교체했습니다. §3의 완료 기준·§4 이스케이프·§6.2 닫힌 게이트·§7 커밋 규칙의 **규범 본문은 동등한 강도로 유지**되며 임의로 약화하지 않습니다.

> **문서 철학**: 모든 규칙은 "약속"이 아니라 **기계가 검증 가능한 명령어**로 환원되어야 합니다. 주관적 판단이 아니라, 복붙 실행 가능한 검증 명령과 그 출력 증거로 완료를 입증합니다.

> **경로 규약**: 상대 경로(`src/…`, `docs/…`)는 **`top_view_react/` 루트 기준**입니다. 형제 폴더는 `../` 접두사로 표기합니다(예: `../top_view_mockup/`). git 스코프 접두사는 저장소 루트 기준 `top_view_react/`입니다.

## 0. 전제 조건 및 프로젝트 선언

- **버전 관리 전제**: git 저장소로 관리되며(`git rev-parse --is-inside-work-tree` → true), phase 결과는 `dev` 브랜치에 통합합니다(§7).
- **빌드/테스트/린트 명령 선언**: §2에 바인딩합니다. 에이전트는 명령을 추측하지 않습니다.
- 선언이 없어 검증을 진행할 수 없으면 추측하지 말고 **§4 이스케이프**로 인간에게 확인합니다.

### 0.1. 본 프로젝트 선언

- **프로젝트 목적**: `../서류/gpu_dashboard.pptx`의 대시보드 화면을 **React 단일 페이지 앱**으로 재현한다. Grafana 임베드(iframe)를 사용하지 않고 **브라우저가 Prometheus HTTP API를 직접 호출**하며, 차트는 **C3.js·D3.js로 직접 렌더**한다. 형제 프로젝트가 순수 Grafana로 포기했던 **좌측 사이드바(메뉴·서버 목록)까지 포함해 원본 화면을 100% 재현**한다.
- **데이터 소스**: 형제 프로젝트의 exporter(`:9801`)와 Prometheus(`:9091`)를 **그대로 재사용**한다. 이 프로젝트는 exporter를 만들지 않으며, 메트릭을 **소비만** 한다. 실제 SQream/GPU에는 접속하지 않는다.
- **기술 스택**: React 18 + TypeScript 5.9 + Vite 8 / 차트 **C3 0.7.20 + D3 v7**(앱 레벨 `d3@^7.9.0` — D3 직접 코드(타임라인)는 v7 API 사용. C3는 자체 중첩 `d3@5.16.0`을 유지하며 두 인스턴스는 상호 import 금지 — ADR R-0002 개정판 참조) / 테스트 Vitest 4 + Testing Library / 린트 ESLint + tsc.
- **실행 모델 (현장 제약)**: 배포 현장에는 **Docker도 Node.js도 없다**. 따라서 개발 PC에서 `npm run build`로 만든 **정적 산출물(`dist/`)만 반출**하고, 현장에서는 형제 프로젝트 네이티브 모드의 **venv python `http.server`가 `dist/`를 서빙**한다(`:8082`). Docker 판(nginx)도 병행 제공한다. **런타임에 Node.js를 요구하는 구성(SSR·Next 서버·dev 서버 상시 구동)은 금지**한다.
- **네트워크 바인딩**: 정적 서버는 0.0.0.0:8082 바인딩(다중 PC 접속 — 형제 프로젝트와 동일 전제, 사설망 한정). Prometheus는 CORS가 열려 있어(`Access-Control-Allow-Origin: *`) 브라우저 직접 호출이 가능하며 **프록시를 두지 않는다**.
- **포트 선언**: 정적 서버 `8082` / Vite 개발 서버 `5173`. 기존 스택(exporter 9801 / Prometheus 9091 / Grafana 3001, 상위 `../mockup` 3000·8080·9090·9100~9500)과 병행 기동을 보장한다.
- **작업 스코프 경계(§5)**: 소유 영역은 `src/`·`tests/`(앱 코드)와 `native/`·`docker-compose.yml`(실행), `docs/`(문서)다. **`../top_view_mockup/`·`../mockup/`은 참조 전용이며 절대 수정하지 않는다.**
- **공유/계약 소유권(§5.1)**: 메트릭 이름·라벨 스키마(**TV-C1**)의 SoT는 `../top_view_mockup/docs/architecture/db-schema.md`이며 **owner는 형제 프로젝트의 exporter**다. 이 프로젝트는 **소비자**로서 계약을 수정할 수 없다. 계약 변경이 필요하면 §4 이스케이프.
- **범위 제외 (Out of Scope)**: exporter·Prometheus 구현, 실제 DB/GPU 연동, 사이드바 메뉴의 타 화면(개요·프로세스·LLM·Cost·알림·설정 — 항목은 표시하되 비활성), 인증/권한, 알람 발송.

## 1. 에이전트 역할 및 책임

- **Primary Planner**: 요구사항 분석 → 아키텍처·phase 분해 초안 작성. 모든 리뷰를 취합하는 유일한 주체.
- **Cross-Reviewers**: 독립 세션·타 모델로 초안을 비판적으로 검토(§3.1).
- **Implementor**: 승인된 계획에 따라 phase 단위 구현. 스코프 경계 준수.
- **Tester/Reviewer**: 병합 전 린터·테스트·타입·보안 결함을 기계적으로 검증.

> **인간 승인자**: 프로젝트 소유 개발자. 특히 **화면 디자인 확정, 실행 모델(현장 제약) 변경, 계약(TV-C1) 관련 요청**은 인간 검토를 거칩니다.

## 2. 빌드 및 테스트 명령

| 플레이스홀더 | 바인딩 (`top_view_react/`에서 실행) |
| --- | --- |
| `<PROJECT_DECLARED_RUN_CMD>` | `npm run dev` (개발) / `npm run build && npm run preview` (정적 확인) |
| `<PROJECT_DECLARED_TEST_CMD>` | `npm run test` |
| `<PROJECT_DECLARED_LINT_CMD>` | `npm run lint && npm run typecheck` |
| `<PROJECT_DECLARED_TEST_COVERAGE_CMD>` | `npm run test:coverage` (라인·함수·구문 80%, 분기 70% 임계값 — 미달 시 non-zero exit) |

- `native/` 영역은 `powershell -File native/verify-native.ps1` 종료 코드 0(ALL CHECKS PASSED)으로 검증한다.
- **커버리지 의미론(선언된 예외)**: §3.3-3의 "신규/변경 라인 80%"를 **패키지 전체 커버리지 임계값**으로 대체 운용한다(전량 신규 코드이므로 전체≈신규). 근거는 `docs/plan.md` §예외에 기록한다. 단, 전체가 임계값을 넘더라도 이번 변경 로직에 대응 테스트가 없으면 §3.3-3 위반이며 리뷰에서 확인한다.
- **UI 렌더 검증의 한계**: 차트·레이아웃의 시각적 충실도는 자동 테스트로 완전히 보장할 수 없다. 따라서 **DOM 구조·데이터 변환·색상 토큰은 테스트로 게이트**하고, 픽셀 수준 충실도는 **인간 검토(회고 Human Check Item)** 로 넘긴다.

> **명령어 존재 확인(필수 선행)**: 선언된 명령이 실제 실행 가능한지 먼저 확인한다. 없으면 추측·대체하지 말고 §4 이스케이프.

## 3. 완료의 정의

### 3.1. 계획 완료
1. **초안 작성**: 요구사항·수락 기준·§3.4 산출물·phase 분해를 포함한 계획 초안.
2. **독립적 교차 검증**: 최소 1개 이상의 **다른 모델·독립 세션** 리뷰어에게 전달. 계획 문서에 `reviewer_id`·`model_id`·`session_id`·**draft SHA-256**·검토 시각을 기록한다. 동일 agent/session/model의 자기 검토는 무효이며, draft가 바뀌면 기존 리뷰는 무효화된다.
3. **피드백 통합**: 각 지적을 **Accepted / Rejected / Escalated**로 분류해 기록한다. Rejected는 근거 필수. 보안·아키텍처 blocking 지적은 인간 판정 전까지 구현 불가.
4. **인간 승인**: 명시적 승인 전까지 구현 단계로 넘어가지 않는다.

### 3.2. 구현 완료
1. **스펙 충족**: 수락 기준을 대응 코드/테스트 경로와 1:1 매핑한 추적표로 제시한다. 현재 phase의 미충족 체크박스가 남아 있으면 미완료:
   ```bash
   N=1   # phase 번호(R1→1)로 치환
   unchecked=$(awk -v pat="^### Phase R${N} " '
     $0 ~ pat { in_sec = 1; next }
     /^### Phase R/ { in_sec = 0 }
     in_sec && /^\s*- \[ \]/ { print }' docs/plan.md)
   [ -z "$unchecked" ] && echo "✅ Phase R${N} 수락 기준 충족" \
     || { echo "❌ 미충족:"; echo "$unchecked"; exit 1; }
   ```
2. **임시 코드 제거**: 스테이징된 변경의 추가 줄에 `TODO`/`FIXME`/`HACK`/`XXX`가 없어야 한다(발견 시 exit 1).
3. **영역 준수**: 스코프(`top_view_react/`) 밖 파일 수정이 없어야 한다(위반 시 exit 1). rename의 양쪽 경로를 모두 검사한다.
   ```bash
   SCOPE='top_view_react/'
   name_status=$(git diff --cached --name-status -M) || { echo "❌ git diff 실패"; exit 2; }
   violations=$(printf '%s\n' "$name_status" | awk -v scope="$SCOPE" '
     $1 ~ /^[RC][0-9]+$/ { if (index($2, scope) != 1) print $2; if (index($3, scope) != 1) print $3; next }
     NF >= 2 && index($2, scope) != 1 { print $2 }')
   [ -z "$violations" ] && echo "✅ 스코프 준수" || { echo "❌ 스코프 위반:"; echo "$violations"; exit 1; }
   ```

### 3.3. 테스트 완료
1. `<PROJECT_DECLARED_TEST_CMD>` 실패 0건.
2. `<PROJECT_DECLARED_LINT_CMD>` 경고·타입 에러 0건 (`--max-warnings 0`).
3. **신규 로직의 테스트 존재** + 커버리지 게이트를 **종료 코드로 판정**:
   ```bash
   npm run test:coverage || { echo "❌ 커버리지 기준 미달"; exit 1; }
   ```
4. **증거 제시**: 테스트·린트·커버리지 출력을 **실제 콘솔 출력 그대로** 제출한다("통과했다"는 서술 금지).

### 3.4. 계획 단계 아키텍처 산출물
`docs/`에 두며 다이어그램은 mermaid로 작성한다.
1. **시스템 아키텍처**(`docs/architecture/system.md`) — 브라우저(React) → Prometheus 직접 호출 → exporter, 두 실행 모드(정적 서버/Docker), 빌드-반출 경로.
2. **디자인 토큰**(`docs/design-tokens.md`) — 원본 시안에서 추출한 색상·타이포·레이아웃 좌표. `src/styles/tokens.css`와 **테스트로 대사**한다.
3. **ADR**(`docs/adr/R-NNNN-*.md`) — 주요 결정마다 컨텍스트·결정·대안·결과.
> **축소 선언(명시적 면제)**: 이 프로젝트는 자체 영속 저장소가 없고(브라우저 앱) 메트릭 계약을 소비만 하므로 `db-schema.md`·`data.md`는 작성하지 않고 **형제 프로젝트 문서를 참조로 갈음**한다. 이는 누락이 아니라 선언된 면제다.

- 산출물 존재 점검:
  ```bash
  missing=""
  for f in docs/AGENTS.md docs/plan.md docs/design-tokens.md docs/architecture/system.md; do
    [ -f "$f" ] || missing="${missing:+$missing }$f"
  done
  find docs/adr -type f -name '*.md' -print -quit 2>/dev/null | grep -q . || missing="${missing:+$missing }docs/adr/*.md"
  [ -z "$missing" ] && echo "✅ 산출물 완비" || { echo "❌ 누락:$missing"; exit 1; }
  grep -q '```mermaid' docs/architecture/system.md && echo "✅ system mermaid" || { echo "❌ mermaid 누락"; exit 1; }
  ```

## 4. 에스컬레이션 및 이스케이프 밸브

다음 상황에서는 자의적으로 추측하지 말고 **즉시 중단하고 인간에게 질문**한다.
1. **무한 루프**: 동일한 테스트 실패·빌드 에러가 3번 이상 반복될 때.
2. **권한·보안**: 시크릿(`.env`), CI 설정을 수정해야 할 때.
3. **모호성**: 요구사항이 불명확하거나 승인된 계획과 어긋나는 상황.
4. **환경 미비**: 선언된 명령이 존재하지 않을 때. 명령을 지어내지 말 것.
5. **보호 파일 변경**: 본 `AGENTS.md`, 승인된 계획의 수락 기준, 위 2항 파일.
6. **계약 변경 필요**: 화면에 필요한 메트릭·라벨이 TV-C1에 없을 때. **이 프로젝트는 계약 소유자가 아니므로**, exporter 변경이 필요하면 형제 프로젝트의 계약 개정 절차를 인간 승인으로 진행한다.
7. **실행 모델 제약 위반**: 현장에 Node.js/Docker가 필요해지는 구성(SSR·서버 사이드 프록시·상시 dev 서버 등)이 요구될 때.
8. **런타임 의존 추가**: 새 npm 런타임 의존성을 추가해야 할 때(번들 크기·망분리 반출·라이선스 영향). D3 등 차트 의존성의 메이저 변경은 ADR R-0002 개정판의 격리 규칙(앱 d3 v7 ↔ C3 중첩 d3 v5 상호 import 금지)을 지켜야 하며, 규칙을 벗어나는 변경은 이스케이프 대상.

**해소 규칙**: 에스컬레이션은 **지정된 인간 승인자만** 해소한다. 시한(기본 24시간) 내 응답이 없으면 상태를 `BLOCKED`로 기록하고 중단한다(임의 진행 금지). **에이전트·서브에이전트는 인간 승인자를 대체할 수 없다.**

## 5. 스코핑 및 코드 소유권

- 소유 영역: `src/`·`tests/`·`native/`·`docs/`·루트 설정 파일. 스코프 접두사 `top_view_react/`.
- **형제 프로젝트(`../top_view_mockup/`, `../mockup/`) 수정 금지** — 이식은 "패턴 복사"로만 한다. git diff에 해당 경로가 나타나면 스코프 위반이다.
- 계층 규칙: **UI 컴포넌트는 Prometheus를 직접 호출하지 않는다**. 데이터 접근은 `src/api/`(저수준 fetch) → `src/hooks/`(폴링·상태) → 컴포넌트 순으로만 흐른다. 컴포넌트에 PromQL 문자열을 하드코딩하지 않는다(`src/api/queries.ts`가 유일한 정의처).

### 5.1. 공유/계약 소유권

| 필드 | RC-1 (소비 계약) |
| --- | --- |
| contract_id | TV-C1 (소비자 측 기록: RC-1) |
| source_of_truth_path | `../top_view_mockup/docs/architecture/db-schema.md` |
| owner_role | **external** (형제 프로젝트 exporter) — 이 프로젝트는 **소비자** |
| consumer_paths | `src/api/queries.ts` |
| drift_check_command | `npm run test -- queries.contract` (queries가 쓰는 전 메트릭·라벨이 SoT의 부분집합인지 검사) |

- 소비 측은 계약을 **소비만** 한다. 메트릭 이름·라벨을 임의로 만들지 않는다.
- 계약에 없는 데이터가 필요하면 §4-6 이스케이프.

## 6. Phase 분해 및 구현 워크플로우

### 6.1. 로드맵
- **R1** 거버넌스·설계 문서 + 스캐폴딩
- **R2** 데이터 계층(Prometheus 클라이언트·PromQL·폴링·필터 상태)
- **R3** 셸·레이아웃·테이블(사이드바·헤더·필터바·패널 프레임·테이블 2종)
- **R4** 차트(C3 시계열·C3 게이지·D3 타임라인·구간 상세)
- **R5** 실행 모드(네이티브 정적 서빙·Docker)·README

수락 기준의 소재는 **원본 시안 화면의 구성요소 재현 여부**와 §0.1의 기술 선언(실행 모델·포트·계약 소비)이다.

### 6.2. Phase별 구현 절차 (닫힌 게이트)
1. **구현** — 스코프(§5) 준수.
2. **테스트** — §3.3의 테스트·린트·타입·커버리지 게이트를 모두 통과.
3. **codex 리뷰** — 결과를 `docs/reviews/phase-R<N>-codex-review.md`에 저장(지적별 고유 ID·severity·파일/위치·요약).
4. **리뷰 지적 수정** — 처리 상태를 `docs/reviews/phase-R<N>-codex-resolution.md`에 **Fixed / Rejected / Escalated**로 기록. Rejected·Escalated는 인간 판정 전까지 phase 종료 불가. 수정 후 **재리뷰**로 미해결 blocking 0을 입증.
5. **회고** — §6.3.
6. **dev 커밋·푸시** — §7.

- phase 종료 게이트:
  ```bash
  N=1   # phase 번호로 치환
  npm run lint && npm run typecheck && npm run test:coverage || { echo "❌ 게이트 미통과"; exit 1; }
  [ -f "docs/reviews/phase-R${N}-codex-review.md" ] && [ -f "docs/reviews/phase-R${N}-codex-resolution.md" ] \
    && echo "✅ 리뷰 기록 존재" || { echo "❌ 리뷰 기록 누락"; exit 1; }
  find docs/retrospectives -type f -name "phase-R${N}-*.md" -print -quit 2>/dev/null | grep -q . \
    && echo "✅ 회고 존재" || { echo "❌ 회고 누락"; exit 1; }
  current_branch=$(git symbolic-ref --quiet --short HEAD) || { echo "❌ detached HEAD"; exit 1; }
  [ "$current_branch" = "dev" ] && echo "✅ dev 브랜치" || { echo "❌ dev 아님: $current_branch"; exit 1; }
  ```

### 6.3. Phase 회고
`docs/retrospectives/phase-R<N>-<slug>.md`에 작성한다. 포함 항목: 한 일과 결과(완료된 수락 기준↔증거), 잘된 점 / 어려웠던 점 / 다음 phase 개선점, codex 지적과 처리 결과, 그리고 **`## Human Check Items`**.
- 정확히 `## Human Check Items` 제목을 포함하고, 표로 `ID | 분류(Security/Architecture/Scope/Risk/Design/Other) | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부`를 기록한다.
- **비어 있으면 안 된다.** 없다고 판단하면 `HCI-0 | None | 없음 | 근거=<검증 증거>` 행을 적는다.
- 단, Rejected/Escalated 지적·범위 변경·보호 파일 변경·보안/아키텍처 트레이드오프·**시각적 충실도 판단(§2)** 이 하나라도 있으면 `없음(HCI-0)`을 사용할 수 없다.

## 7. 커밋 및 브랜치 규칙
- **원자적 커밋**: 하나의 논리적 변경 단위만 담는다.
- **커밋 메시지**: 명령형 현재 시제로 변경의 *이유*를 설명한다.
- **검증 통과 후 커밋**: §3.2·§3.3의 검증이 통과하고 증거가 확보된 후에만 커밋한다.
- **phase 단위 통합**: 각 phase 종료 시 `dev` 브랜치에 commit & push(§6.2-6).
- **보호 파일**: `AGENTS.md`, 승인된 계획의 수락 기준, 시크릿·CI 설정은 §4에 따라 인간 승인 없이 커밋하지 않는다.
- **빌드 산출물 비커밋**: `dist/`·`node_modules/`·`coverage/`는 커밋하지 않는다(`.gitignore`). 현장 반출은 빌드 산출물을 별도 전달한다.
- **자동 커밋·푸시 금지(예외)**: 인간이 명시 요청하기 전까지 임의 커밋/푸시하지 않는다. 단 §6.2의 phase 종료 커밋·푸시는 승인된 워크플로우의 일부다.
