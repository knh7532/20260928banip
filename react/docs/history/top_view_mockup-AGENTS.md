# 에이전트 지침서 (AGENTS.md) — GPU/SQream Monitoring Dashboard Top-View 목업

이 문서는 **`../서류/gpu_dashboard.pptx`의 "GPU/SQream Monitoring Dashboard" 화면을 순수 Grafana 대시보드로 재현하는 목업 프로젝트**(`top_view_mockup/`)에서 AI 에이전트가 수행해야 할 역할, 규칙, 검증 명령어를 정의하는 **거버넌스 문서**입니다. 상위 프로젝트(`../mockup/docs/AGENTS.md`)의 거버넌스 골격을 계승하되, 다음을 이 목업에 맞게 교체·조정했습니다: §0.1 프로젝트 선언, §2 명령 바인딩, §3.4 산출물 축소 선언(명시적 면제), §4-6·7 프로젝트별 이스케이프 항목, §5 스코프·계약, §6.1 로드맵, 검증 스니펫의 경로. §3의 완료 기준·§4의 해소 규칙·§6.2 닫힌 게이트·§7 커밋 규칙의 **규범 본문은 상위와 동등한 강도로 유지**되며 임의로 약화하지 않습니다. 에이전트는 작업을 수행하기 전 반드시 이 문서를 숙지해야 합니다.

> **문서 철학**: 모든 규칙은 "약속"이 아니라 **기계가 검증 가능한 명령어**로 환원되어야 합니다. 주관적 판단("잘 됐는지 확인")이 아니라, 복붙 실행 가능한 검증 명령과 그 출력 증거로 완료를 입증합니다.

> **경로 규약**: 이 문서의 상대 경로(`docs/…`, `exporter/…` 등)는 모두 **`top_view_mockup/` 루트 기준**입니다. 저장소 루트의 형제 폴더를 가리킬 때는 `../` 접두사로 표기합니다(예: `../mockup/…`, `../서류/…`). 검증 명령은 별도 표기가 없으면 `top_view_mockup/`에서 실행합니다. git 명령의 스코프 접두사는 저장소 루트(`D:\company\hynix_practice`) 기준 `top_view_mockup/`입니다.

## 0. 전제 조건 및 프로젝트 선언 (Prerequisites & Project Declaration)

거버넌스 본문은 도메인 비종속적입니다. 프로젝트는 자신의 환경을 아래 형태로 **선언**하며, 에이전트는 하드코딩된 가정 대신 이 선언을 참조합니다.

- **버전 관리 전제**: 이 프로젝트는 **git 저장소로 관리**되어야 합니다. (`git rev-parse --is-inside-work-tree` 가 `true`를 반환). 초기화되어 있지 않다면 자의적으로 `git init` 하지 말고 **§4 이스케이프**에 따라 인간에게 확인합니다.
- **작업 스코프 선언**: 프로젝트는 에이전트별 작업 영역(모듈/디렉토리 경계)을 선언합니다. (§5 참조)
- **빌드/테스트/린트 명령 선언**: 프로젝트는 실행·테스트·린트·커버리지 명령을 선언합니다. (§2 참조) 에이전트는 명령을 임의로 추측하지 않습니다.
- **`dev` 브랜치 전제**: phase별 작업 결과는 `dev` 브랜치에 통합됩니다. (§7 참조)

> 프로젝트 선언이 누락되어 검증을 진행할 수 없으면, 추측하지 말고 **§4 이스케이프**로 인간에게 확인합니다.

### 0.1. 본 프로젝트 선언 (Top-View Mockup Declaration)

이 목업 프로젝트는 위 전제들을 다음과 같이 구체적으로 선언한다. 에이전트는 하드코딩된 가정 대신 이 선언을 참조한다.

- **프로젝트 목적**: `../서류/gpu_dashboard.pptx`의 top view 화면(실행 중 SQream 쿼리 테이블 · SQL 쿼리 성능 테이블 · GPU별 쿼리 실행 타임라인 · GPU 시계열 4종 · 서버 요약 게이지 3종 · 상단 필터바)을 **Prometheus + Grafana 순수 단일 대시보드**로 재현하는 시연용 목업. 실제 SQream/GPU에는 접속하지 않으며 모든 값은 목데이터다.
- **데이터 단계 선언 (정적 우선)**: 목데이터는 2단계로 진행한다.
  - *1차 — 정적(현재 범위)*: PPTX에 표기된 수치를 상수로 노출(`exporter/exporter/static_data.py`). 화면 레이아웃·수치 검토가 목적이다.
  - *2차 — 동적(보류, Deferred)*: 사인파·랜덤워크 등 동적 시뮬레이션 패턴. **인간이 정적 목업을 검토·승인한 뒤에만 착수**한다(§4-7). 메트릭 스키마(계약 TV-C1)는 1차에서 확정하며 2차 전환 시 대시보드는 무수정이어야 한다.
- **버전 관리**: 상위 저장소(`D:\company\hynix_practice`)의 git을 사용하며, phase 결과는 `dev` 브랜치에 통합한다(§7).
- **기술 스택**:
  - *Exporter*: Python 3.12 + prometheus-client — 단일 프로세스가 3노드×4GPU의 GPU 메트릭(DCGM 명명 관습)과 SQream 쿼리 메트릭(sqm_* 명명 관습)을 `:9801`로 노출(ADR-0001).
  - *Storage*: Prometheus TSDB (v2.53.4, scrape 5s, retention 15d).
  - *Visualization*: Grafana 11.6.0 — 프로비저닝된 단일 대시보드(uid `tv-gpu-sqream`). 커스텀 UI 셸 없음(ADR-0003).
  - *실행 모드*: docker-compose(기본) + Windows 네이티브(portable Prometheus/Grafana + PowerShell 스크립트) 병행.
- **네트워크 바인딩 선언(ADR-0004)**: 전 리스너는 **0.0.0.0 바인딩**한다(다중 PC 연결 대비 — 인간 지시 사항). 상위 mockup의 127.0.0.1 관습을 이 프로젝트에 적용하지 않는다. 보완 통제: Grafana 익명 접근 금지 + `.env` 자격증명, 사설망 전제. 바인딩 범위를 좁히거나 인증을 완화하는 변경은 §4 이스케이프 대상이다.
- **포트 선언**: exporter `9801` / Prometheus `9091` / Grafana `3001`. 기존 `../mockup/`(3000/8080/9090/9100~9500)과 병행 기동을 보장해야 하며, 포트 변경은 계획 문서를 통해서만 한다.
- **작업 스코프 경계(§5)**: 두 개의 소유 영역 — `exporter/`(메트릭 exporter, Python), `grafana/`(대시보드 생성기 + 프로비저닝). `prometheus/`, `native/`, `docker-compose.yml`, `README.md`, `docs/`는 인프라·문서 영역으로 계층 규칙(§5) 없이 스코프 검증(`SCOPE=top_view_mockup/`)만 적용한다. **상위 `../mockup/` 폴더는 참조 전용이며 절대 수정하지 않는다.**
- **공유/계약 소유권(§5.1)**: 두 가지 계약을 관리한다 — ① **TV-C1 메트릭 이름·라벨 스키마**(SoT `docs/architecture/db-schema.md`, `owner_role=exporter`) ② **TV-C2 Grafana 대시보드 JSON**(SoT `grafana/gen_dashboard.py` 생성기, 생성물 수동 수정 금지).
- **범위 제외 (Out of Scope)**: PPTX 좌측 사이드바(AX Portal 메뉴·서버 목록 UI), 알람 라우팅/통보, LLM 모니터링·Cost 분석 등 타 메뉴 화면, 커스텀 UI 셸, Session Kill 등 상태 변경 기능, 실제 SQream/GPU 연동, 과거 데이터 백필. 에이전트는 이를 근거로 스코프를 확장하지 않는다.
  - 단, **동적 시뮬레이션(2차)은 Out of Scope가 아니라 보류(Deferred)** 상태다 — 인간 승인 후 Phase 5로 진행한다(계획 문서 참조).

> 위 선언 슬롯 외 §3·§4·§6의 거버넌스 규칙 본문(완료의 정의, 이스케이프, phase 게이트)은 보호 대상이며 임의로 약화하지 않는다.

## 1. 에이전트 역할 및 책임 (Agent Roles)
계획 단계의 완벽성을 기하기 위해 기획 역할은 다중 모델 구조로 분리하여 운영합니다.
- **Primary Planner (초안 설계)**: 요구사항을 분석하고 아키텍처와 작업 단위(phase)로 분해된 최초의 계획을 작성합니다. **모든 Cross-Reviewer의 리뷰를 취합(synthesis)하는 유일한 주체**입니다.
- **Cross-Reviewers (교차 검증자)**: Primary Planner의 계획을 보안, 아키텍처 제약, 엣지 케이스 관점에서 비판적으로 교차 검토합니다. 각 리뷰어는 **서로 독립된 컨텍스트/세션에서 실행**되며, 다른 리뷰어의 산출물을 입력으로 받지 않습니다(§3.1 참조).
- **Implementor (구현)**: 승인된 계획에 따라 phase 단위로 코드를 작성합니다. 할당된 스코프 경계를 엄격히 지킵니다.
- **Tester/Reviewer (코드 검증)**: 코드를 병합하기 전 린터, 테스트, 보안 결함을 기계적으로 검증합니다.

> **인간 승인자 구성**: 본 목업 프로젝트의 인간 승인자는 프로젝트 소유 개발자입니다. 특히 **정적→동적 전환(보류 해제), 외부 노출·인증 정책, 화면 수치/레이아웃의 확정**은 인간 검토를 거쳐야 합니다(§4 참조).

## 2. 빌드 및 테스트 명령 (Build & Test Commands)
코드를 수정하거나 기능을 추가한 후, 에이전트는 스스로 프로젝트가 선언한 명령을 실행하여 결과를 확인해야 합니다. 명령은 프로젝트 스택에 따라 다르므로 **프로젝트 선언(§0)** 을 참조합니다.

선언해야 할 명령은 아래 **플레이스홀더 이름**으로 본 문서 전체(§3.3, §6.2 등)에서 일관되게 참조합니다.

| 목적 | 플레이스홀더 |
| --- | --- |
| 실행 | `<PROJECT_DECLARED_RUN_CMD>` |
| 테스트 | `<PROJECT_DECLARED_TEST_CMD>` |
| 린트/정적분석 | `<PROJECT_DECLARED_LINT_CMD>` |
| 커버리지 게이트 | `<PROJECT_DECLARED_TEST_COVERAGE_CMD>` |

> **본 프로젝트 바인딩(§0.1)**: 이 목업 프로젝트는 영역별로 아래 명령을 바인딩한다. 에이전트는 자신이 작업 중인 영역의 명령을 실행한다.
>
> | 플레이스홀더 | exporter (`exporter/`에서 실행) |
> | --- | --- |
> | `<PROJECT_DECLARED_RUN_CMD>` | `python -m exporter.main` |
> | `<PROJECT_DECLARED_TEST_CMD>` | `pytest` |
> | `<PROJECT_DECLARED_LINT_CMD>` | `ruff check . && mypy .` |
> | `<PROJECT_DECLARED_TEST_COVERAGE_CMD>` | `pytest --cov=exporter --cov-fail-under=80` |
>
> `grafana/` 영역은 코드 실행 대상이 아니며 **계약 TV-C2의 드리프트 검증(§5.1)** 만 적용한다 — regen: `python grafana/gen_dashboard.py`, drift: `git -C .. diff --exit-code -- top_view_mockup/grafana/provisioning/dashboards/json/`.
> `native/` 영역은 `powershell -File native/verify-native.ps1`의 종료 코드 0(ALL CHECKS PASSED)으로 검증한다.
> `§3.2`의 스코프 검증에서 `SCOPE`는 `top_view_mockup/`으로 설정한다.
>
> **바인딩 발효 시점**: `<PROJECT_DECLARED_RUN_CMD>`(`python -m exporter.main`)는 **Phase 2에서 `main.py`가 구현되면서 발효**된다. Phase 1(스캐폴딩)에서는 실행 대상이 없으므로 명령어 존재 확인 게이트에서 제외하며, TEST/LINT/COVERAGE 바인딩은 Phase 1부터 발효된다.
> **커버리지 의미론 (선언된 예외, §3.3-3)**: 본 프로젝트는 §3.3-3의 "신규/변경 라인 기준 80%"를 **패키지 전체 커버리지 80% 종료코드 게이트**(`fail_under=80`)로 대체 운용한다. 이는 계획 문서(plan.md §10 EXC-1)에 기록된 명시적 예외다 — 근거: `exporter/` 패키지 전체가 본 프로젝트에서 신규 작성되어 1차 범위에서는 전체≈신규이며, 변경 라인 전용 게이트 도구 추가 없이 종료코드 판정을 유지한다. 단, 전체 커버리지가 80%를 넘더라도 이번 변경 로직에 대응 테스트가 없으면 §3.3-3 위반이며 codex 리뷰에서 확인한다.

> **명령어 존재 확인 (필수 선행 단계)**: 선언된 명령이 실제로 실행 가능한지 먼저 확인합니다. 정의되어 있지 않으면 명령을 임의로 추측·대체하지 말고 **§4 이스케이프**로 인간에게 확인합니다.

> **목데이터 원칙**: 이 프로젝트의 어떤 코드도 실제 SQream DB·GPU·DCGM에 접속하지 않습니다. 외부 시스템 접속 코드가 필요해 보이는 상황 자체가 §4 이스케이프 대상입니다.

## 3. 완료의 정의 (Definition of Done)
에이전트는 자신이 맡은 역할과 단계에 따라 다음의 기계적이고 객관적인 완료 기준을 모두 충족해야 합니다. 각 단계의 완료가 확인되지 않으면 다음 단계로 넘어갈 수 없습니다.

### 3.1. 계획 완료 (Plan Completed)
코드를 수정하기 전, 다음의 **다중 모델 교차 검증 및 인간 승인 절차**를 모두 충족해야만 구현 단계로 넘어갈 수 있습니다.

1. **최초 초안 작성 (Drafting)**: Primary Planner가 요구사항, 수락 기준(Acceptance Criteria), §3.4의 아키텍처 산출물, §6의 phase 분해를 포함한 계획 초안을 작성합니다.
2. **독립적 교차 검증 (Independent Cross-Review)**: 초안은 최소 1개 이상의 다른 모델 기반 Cross-Reviewer에게 전달되어 검토를 받습니다.
   - **독립성 보장 방식**: 각 Cross-Reviewer는 Primary Planner와 **다른 모델 또는 독립 실행 주체**여야 하며, 별도의 서브에이전트/세션으로 호출합니다. 입력으로는 *계획 초안만* 받고, 다른 리뷰어의 결과를 컨텍스트에 포함하지 않습니다.
   - **감사 가능성(Auditability)**: 각 리뷰는 계획 문서(`docs/plan.md`)에 `reviewer_id`, `model_id`, `session_id`, **검토 대상 draft의 해시(예: SHA-256)**, 검토 시각을 기록합니다. **동일 agent/session/model 조합의 자기 검토는 무효**입니다.
   - **신선도(Freshness) 바인딩**: 각 리뷰는 검토 시점 draft 해시와 함께 저장되며, **draft 내용이 바뀌면 기존 리뷰는 자동 무효화**됩니다.
   - **단방향 정보 흐름**: 리뷰 결과는 오직 Primary Planner에게만 모입니다. 리뷰어끼리는 서로의 결과를 보지 못합니다(group-think 방지).
3. **피드백 통합 및 파일 저장 (Synthesis & Save)**: Primary Planner는 지적 사항을 분석·반영하여 최종 계획서를 작성하고 **계획 문서(`docs/plan.md`)로 저장**합니다.
   - **이의 처리 명시(Adjudication)**: 각 지적 사항을 **Accepted / Rejected / Escalated** 중 하나로 분류해 기록하며, **Rejected 항목은 근거를 반드시 명시**합니다.
   - **차단성 지적의 우선권**: Security 또는 architecture blocking 지적은 인간 승인자가 명시적으로 판정하기 전까지 구현으로 넘어갈 수 없습니다.
4. **인간 검토 및 승인 (Human Review & Judgment)**: 저장된 계획 문서에 대해 인간 개발자에게 검토를 요청하고 대기 모드로 전환(Plan Mode)합니다.
   - **수정 및 추가 판단**: 인간 피드백을 반영해 계획 문서를 수정합니다.
   - **구현 단계 승인**: 인간 개발자의 **명시적 승인 전까지는 절대 구현 단계로 넘어가서는 안 됩니다.**

### 3.2. 구현 완료 (Implementation Completed)
Implementor는 코드 작성을 마친 후 다음을 **검증 명령**으로 입증합니다.

1. **스펙 충족**: 승인된 계획의 수락 기준과 아키텍처 제약을 정확히 반영합니다.
   - 검증: 각 수락 기준 체크박스를 **대응 코드/테스트 경로와 1:1 매핑한 추적표**로 제시합니다. 미매핑 기준이 하나라도 있으면 미완료입니다.
   - 보조 점검 (검사 범위를 **현재 phase 섹션으로 한정**하고, 미충족 체크박스 발견 시 **exit 1**로 실패):
     ```bash
     N=1   # phase 번호로 치환
     unchecked=$(awk -v pat="^### Phase ${N} " '
       $0 ~ pat { in_sec = 1; next }
       /^### Phase / { in_sec = 0 }
       in_sec && /^\s*- \[ \]/ { print }' docs/plan.md)
     [ -z "$unchecked" ] && echo "✅ Phase ${N} 수락 기준 체크 완료" \
       || { echo "❌ Phase ${N} 미충족 수락 기준:"; echo "$unchecked"; exit 1; }
     ```
2. **임시 코드 제거**: 커밋 대상 Diff에 `TODO`, `FIXME`, `HACK` 등 임시 주석·데드 코드가 없어야 합니다.
   - 검증 명령 (스테이징된 변경의 **추가된 본문 줄만** 검사. 매칭이 없어야 통과):
     ```bash
     git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ git 저장소 아님 → §4 이스케이프"; exit 2; }
     diff_output=$(git diff --cached --unified=0 --no-ext-diff) || { echo "❌ git diff 실패 → §4 이스케이프"; exit 2; }
     if printf '%s\n' "$diff_output" | awk '
       /^diff --git / { in_hunk = 0 }
       /^@@ /         { in_hunk = 1; next }
       in_hunk && /^\+/ && !/^\+\+\+ / && /(TODO|FIXME|HACK|XXX)/ { print NR ":" $0; found = 1 }
       END { exit(found ? 0 : 1) }'; then
       echo "❌ 임시 코드 발견"; exit 1; else echo "✅ 임시 코드 없음"; fi
     ```
3. **영역 준수**: 할당된 스코프를 위반한 파일 수정이 없어야 합니다.
   - 검증 명령 (저장소 루트에서 실행. 스코프 밖 경로가 출력되면 **위반**. rename의 양쪽 경로를 모두 검사):
     ```bash
     SCOPE='top_view_mockup/'
     git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ git 저장소 아님 → §4 이스케이프"; exit 2; }
     name_status=$(git diff --cached --name-status -M) || { echo "❌ git diff 실패 → §4 이스케이프"; exit 2; }
     violations=$(printf '%s\n' "$name_status" | awk -v scope="$SCOPE" '
       $1 ~ /^[RC][0-9]+$/ { if (index($2, scope) != 1) print $2; if (index($3, scope) != 1) print $3; next }
       NF >= 2 && index($2, scope) != 1 { print $2 }')
     [ -z "$violations" ] && echo "✅ 스코프 준수" || { echo "❌ 스코프 위반:"; echo "$violations"; exit 1; }
     ```
   - 공유/계약 파일(§5.1 참조) 변경이 포함된 경우, 그 변경이 계획 문서에 명시·승인되었는지 추가 확인합니다.

### 3.3. 테스트 완료 (Test Completed)
Tester/Reviewer는 다음을 만족해야 합니다.
1. **결정론적 테스트 통과**: 선언된 `<PROJECT_DECLARED_TEST_CMD>` 결과 실패(Fail)가 0건이어야 합니다.
2. **정적 분석 통과**: 선언된 `<PROJECT_DECLARED_LINT_CMD>` 결과 경고·타입 에러가 0건이어야 합니다.
3. **신규 로직의 테스트 존재**: "실패 0건"만으로는 테스트 0개로도 통과할 수 있으므로, **이번 변경의 신규/변경 로직에는 대응 테스트가 반드시 존재**해야 합니다.
   - 커버리지 하한선의 **기본값은 신규/변경 코드 라인 기준 80%** 이며, 이는 권장이 아니라 **강제 기준**입니다. 낮춰야 할 합당한 사유가 있을 때만 계획 문서에 명시적으로 예외 기록합니다.
   - 검증은 정보성 리포트가 아니라 **종료 코드로 통과/실패가 판정**되어야 합니다.
     ```bash
     <PROJECT_DECLARED_TEST_COVERAGE_CMD> || { echo "❌ 커버리지 기준 미달 → §4 이스케이프"; exit 1; }
     ```
4. **증거(Evidence) 제시**: 테스트 통과 로그, 린트 결과, 커버리지 요약을 **실제 콘솔 출력 그대로** 제출합니다("통과했다"는 서술 금지).

### 3.4. 계획 단계 아키텍처 산출물 (Planning Architecture Artifacts)
계획 단계에서는 코드 작성 전 다음 산출물을 작성해야 하며, 모든 문서는 **`docs/` 폴더**에 둡니다. 다이어그램은 **mermaid**로 작성합니다.

> **본 프로젝트 축소 선언(명시적 면제)**: 단일 화면 목업 특성상 필수 산출물을 ① `docs/architecture/system.md` ② `docs/architecture/db-schema.md`(계약 TV-C1 메트릭 스키마 포함) ③ `docs/adr/NNNN-*.md`로 한정한다. data/security/deployment/sequences 산출물은 상위 프로젝트 문서(`../mockup/docs/architecture/*`)를 참조로 갈음하며, 이는 **누락이 아니라 선언된 면제**다. 축소 범위를 넓히는 변경은 §4 이스케이프 대상이다.

1. **시스템 아키텍처 (System Architecture)**: 전체 컴포넌트(exporter → Prometheus → Grafana → 브라우저/외부 PC)와 그 관계, docker-compose/네이티브 두 실행 모드를 mermaid로 작성합니다. (`docs/architecture/system.md`)
2. **DB 스키마 정의서 (Database Schema Definition)**: 계약 TV-C1의 **메트릭 이름·라벨 스키마**(이름, 타입, 라벨, 값 의미, 카디널리티 규칙)를 정의합니다. RDB 등 다른 영속 저장소가 없으므로 **"해당 없음(N/A)"과 그 근거**를 함께 기록합니다. (`docs/architecture/db-schema.md`)
3. **ADR (Architecture Decision Records)**: 주요 결정마다 ADR 문서를 작성합니다. ADR은 컨텍스트·결정·대안·결과를 담으며 `docs/adr/NNNN-title.md` 형식으로 번호를 매깁니다.

   - 산출물 존재 점검 (`top_view_mockup/`에서 실행, 모든 항목이 존재해야 통과):
     ```bash
     missing=""
     for f in docs/architecture/system.md docs/architecture/db-schema.md; do
       [ -f "$f" ] || missing="${missing:+$missing }$f"
     done
     find docs/adr -type f -name '*.md' -print -quit 2>/dev/null | grep -q . \
       || missing="${missing:+$missing }docs/adr/*.md"
     [ -z "$missing" ] && echo "✅ 아키텍처 산출물 완비" || { echo "❌ 누락:$missing → §4 이스케이프"; exit 1; }
     ```
   - mermaid 블록 존재 점검:
     ```bash
     grep -q '```mermaid' docs/architecture/system.md \
       && echo "✅ system mermaid 존재" || { echo "❌ system mermaid 누락"; exit 1; }
     ```
   - DB 스키마 점검 (메트릭 스키마 표와 N/A 근거가 모두 있어야 통과):
     ```bash
     grep -q 'TV-C1' docs/architecture/db-schema.md \
       && grep -qiE 'N/A|해당 없음' docs/architecture/db-schema.md \
       && echo "✅ 메트릭 스키마 + RDB N/A 근거 기재됨" \
       || { echo "❌ db-schema.md에 TV-C1 스키마 또는 N/A 근거 없음 → §4 이스케이프"; exit 1; }
     ```

## 4. 에스컬레이션 및 이스케이프 밸브 (Escalation Rules)
에이전트는 다음 상황에 직면하면 자의적으로 추측하지 말고 **즉시 작업을 중단하고 인간 개발자에게 질문**해야 합니다.
1. **무한 루프 방지**: 동일한 테스트 실패나 빌드 에러가 3번 이상 반복되어 해결되지 않을 때.
2. **권한 및 보안**: 시크릿/자격증명(`.env`, Grafana admin 계정 등), CI/CD 파이프라인 설정을 수정해야 할 때.
3. **모호성**: 명확히 정의되지 않은 요구사항이나 승인된 계획과 어긋나는 상황을 만났을 때.
4. **환경 미비**: 저장소가 git으로 초기화되어 있지 않거나(§0), 선언된 빌드/테스트 명령이 실제로 존재하지 않을 때. 임의로 초기화하거나 명령을 지어내지 말 것.
5. **보호 파일 변경**: 본 `AGENTS.md`, 승인된 계획 문서의 수락 기준, 또는 위 2항의 보호 대상 파일을 수정해야 할 때.
6. **외부 노출·인증 정책 변경**: §0.1에 선언된 0.0.0.0 바인딩 범위를 바꾸거나(축소 포함), Grafana 인증을 완화하거나, 새 포트를 외부에 노출해야 할 때.
7. **보류(Deferred) 항목 착수**: 동적 시뮬레이션(2차) 등 계획 문서에 Deferred로 표기된 항목을 시작해야 할 때. 반드시 인간의 정적 목업 검토·승인 후 착수한다.

**에스컬레이션 해소 규칙 (교착·자기승인 방지)**:
- 에스컬레이션은 **지정된 인간 승인자(owner)만** 해소할 수 있습니다.
- 승인자가 **합의된 시한(기본 24시간) 내 응답하지 않으면** 작업 상태를 `BLOCKED`로 기록하고 중단합니다(임의 진행 금지).
- **에이전트·서브에이전트, 또는 검토 대상 산출물의 작성자는 인간 승인자를 대체할 수 없습니다.**

## 5. 스코핑 및 코드 소유권 (Scoping & Ownership)
에이전트는 현재 할당된 작업 영역의 경계를 넘어서는 코드를 수정해서는 안 됩니다. 경계는 프로젝트 선언(§0.1)을 따릅니다: 소유 영역 `exporter/`·`grafana/`, 인프라·문서 영역 `prometheus/`·`native/`·`docs/`·루트 파일. 전체 스코프 접두사는 `top_view_mockup/`.

- **상위 `../mockup/` 폴더 수정 금지**: 이식은 "패턴 복사"로만 하며 원본 파일은 읽기 전용이다. git diff(저장소 루트 기준 경로)에 `mockup/` 접두 경로가 나타나면 스코프 위반이다.
- exporter는 어떤 외부 시스템에도 접속하지 않는다(목데이터 원칙, §2).
- 선언된 계층 경계가 없는 영역(`grafana/` 설정, `native/` 스크립트)에서는 에이전트가 임의로 계층 구조를 가정하지 않는다.

### 5.1. 공유/계약 코드의 단일 소유권 (Single Ownership of Shared Contracts)
경계 사이에 공유되는 **계약**은 소유권이 불분명하면 교착이 발생합니다. 본 프로젝트의 계약(§0.1 선언):

1. **TV-C1 — 메트릭 이름·라벨 스키마**: SoT는 `docs/architecture/db-schema.md`(`owner_role=exporter`). `exporter/exporter/metrics.py`가 생산하고 Grafana 대시보드(생성기)는 이를 소비만 한다. 메트릭 이름/라벨 변경은 계획 문서를 통해서만 이뤄진다. 드리프트 검증: `(cd exporter && pytest tests/test_contract.py)` (metrics.py ↔ db-schema.md 대사).
2. **TV-C2 — Grafana 대시보드 JSON**: SoT는 생성기 `grafana/gen_dashboard.py`. 생성물(`grafana/provisioning/dashboards/json/top-view.json`)은 **수동 수정 금지**. regen: `python grafana/gen_dashboard.py`, drift: 재생성 후 `git diff --exit-code top_view_mockup/grafana/provisioning/dashboards/json/`(저장소 루트 기준).

- **계약의 단일 소유자(owner)를 계획 단계에서 명시**합니다. 계약의 단일 진실 공급원(SoT)은 그 소유자가 정의합니다.
- **소비 측은 계약을 소비(consume)만** 합니다.
- **계약 변경은 반드시 계획 문서를 통해서만** 이뤄집니다.
- **기계 검증 가능한 소유권 기록**: 계약마다 계획 문서에 `contract_id`, `source_of_truth_path`, `owner_role`, `owner_human_approver`, `producer_paths`, `consumer_paths`, `regen_command`, `drift_check_command`를 표로 기록합니다.
- **생성물 드리프트 제어**: 생성 파일은 수동 수정 금지이며, diff에 생성 파일이 포함되면 `regen_command` 실행 증거와 `drift_check_command` 통과 증거를 함께 제출합니다.

## 6. Phase 분해 및 구현 워크플로우 (Phase Workflow)
계획과 구현은 **phase 단위**로 진행합니다. 큰 작업을 한 번에 처리하지 않고, 검증 가능한 작은 단위로 나눕니다.

### 6.1. 계획 단계의 Phase 분해
본 프로젝트의 phase 분해는 계획 문서(`docs/plan.md`)의 로드맵을 기준 골격으로 삼습니다.

1. **거버넌스·설계 문서 + 스캐폴딩**: AGENTS.md, plan.md, ADR, 아키텍처 산출물(§3.4), exporter 패키지 뼈대
2. **정적 exporter + 스택 기동**: 계약 TV-C1 구현(정적 데이터), Prometheus/compose 구성
3. **Grafana 대시보드 생성기**: 계약 TV-C2 구현, 화면 ①~⑤ 재현, **인간 정적 검토 체크포인트**
4. **Windows 네이티브 모드 + README**
5. **동적 시뮬레이션 (Deferred)**: 인간 승인 후에만 착수(§4-7)

수락 기준(Acceptance Criteria)의 소재는 **PPTX 화면 구성요소 ①~⑤와 상단 필터바의 재현 여부**, 그리고 §0.1의 기술 선언(포트, 바인딩, 계약)입니다.

계획 문서에는 **각 phase에서 어떤 작업을 진행할지**를 명시해야 합니다. 각 phase 항목은 다음을 포함합니다.
- phase 번호와 목표(무엇을 완성하는가)
- 포함 작업 목록과 산출물
- 해당 phase의 수락 기준(Acceptance Criteria)
- 의존성(선행 phase)

### 6.2. Phase별 구현 절차 (닫힌 게이트)
구현에 들어가면 각 phase를 다음 순서로 진행하며, **모든 게이트를 통과해야 해당 phase가 종료**됩니다.

1. **구현 (Implement)**: 해당 phase의 작업을 구현합니다. 할당 스코프(§5)를 준수합니다.
2. **테스트 (Test)**: 해당 phase의 구현에 대해 §3.3의 테스트·린트·커버리지 게이트를 모두 통과합니다. **구현과 테스트를 모두 마쳐야** 다음 단계로 갑니다.
3. **codex 플러그인 리뷰 (Review)**: 해당 phase의 작업 결과를 **codex 플러그인으로 리뷰**받습니다. 리뷰 결과는 `docs/reviews/phase-<N>-codex-review.md`에 저장하며, 각 지적은 **고유 ID, severity, 파일/라인, 원문 요약**을 포함해야 합니다.
4. **리뷰 지적 수정 (Fix)**: 리뷰에서 지적된 문제는 **모두 수정 완료**해야 합니다.
   - 각 지적 ID별 처리 상태를 `docs/reviews/phase-<N>-codex-resolution.md`에 **Fixed / Rejected / Escalated**로 기록합니다. `Fixed`는 대응 커밋/파일/테스트 증거를 연결합니다.
   - **Rejected 또는 Escalated 항목은 인간 승인자 판정 전까지 phase 종료 불가**입니다.
   - 수정 후 **codex 리뷰를 재실행**하여 미해결 blocking finding이 없다는 출력 증거를 첨부합니다.
5. **회고 작성 (Retrospective)**: 아래 §6.3에 따라 회고를 작성합니다.
6. **dev 브랜치 통합 (Commit & Push)**: 해당 phase의 작업 결과를 **`dev` 브랜치에 commit & push** 합니다. 커밋은 §7 규칙을 따릅니다.

   - phase 종료 게이트 점검 예시 (`top_view_mockup/`에서 실행, 각 게이트는 실패 시 0이 아닌 종료 코드로 멈춰야 함):
     ```bash
     N=1   # phase 번호로 치환
     # 1) 린트/타입/테스트/커버리지 게이트 (exporter/에서 — §3.3 전 항목)
     (cd exporter && ruff check . && mypy . && pytest --cov=exporter --cov-fail-under=80) \
       || { echo "❌ 린트/타입/테스트/커버리지 미통과"; exit 1; }
     # 2) codex 리뷰·처리 기록 존재 (§6.2-3,4)
     [ -f "docs/reviews/phase-${N}-codex-review.md" ] && [ -f "docs/reviews/phase-${N}-codex-resolution.md" ] \
       && echo "✅ 리뷰·처리 기록 존재" || { echo "❌ phase $N 리뷰/처리 기록 누락 → §6.2"; exit 1; }
     # 3) 회고 문서 존재
     find docs/retrospectives -type f -name "phase-${N}-*.md" -print -quit 2>/dev/null | grep -q . \
       && echo "✅ 회고 존재" || { echo "❌ phase $N 회고 누락 → §6.3"; exit 1; }
     # 4) 현재 브랜치가 dev 인지 확인
     git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ git 저장소 아님 → §4 이스케이프"; exit 2; }
     current_branch=$(git symbolic-ref --quiet --short HEAD) || { echo "❌ detached HEAD 상태 → §7 확인"; exit 1; }
     [ "$current_branch" = "dev" ] && echo "✅ dev 브랜치" \
       || { echo "❌ dev 브랜치가 아님: $current_branch → §7 확인"; exit 1; }
     ```

### 6.3. Phase 회고 (Retrospective)
각 phase가 끝나면 **회고**를 작성합니다. 회고 문서는 `docs/retrospectives/phase-<N>-<slug>.md`에 둡니다. 회고에는 다음을 포함합니다.
- 한 일과 결과(완료된 수락 기준)
- 잘된 점 / 어려웠던 점 / 다음 phase에 반영할 개선점
- codex 리뷰 지적과 그 처리 결과
- **인간이 확인해야 할 항목(Human Check Items)**: 에이전트가 자의로 판단하면 안 되는 사항(아키텍처 트레이드오프, 보안 결정, 범위 변경, 미해결 리스크, 화면 수치/레이아웃 확정 등)을 인간 확인용으로 명시합니다.
  - 회고에는 정확히 `## Human Check Items` 제목을 포함해야 하며, 그 아래에 표로 `ID | 분류(Security/Architecture/Scope/Risk/Other) | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부`를 기록합니다.
  - **이 섹션은 비어 있으면 안 됩니다.** 확인 항목이 없다고 판단하는 경우에도 `ID=HCI-0`, `분류=None`, `확인 필요 사항=없음`, `근거=<보안/아키텍처/범위 변경/미해결 리뷰 지적이 없음을 확인한 검증 증거>` 행을 적어야 합니다.
  - **단, Rejected/Escalated 리뷰 지적, 범위 변경, 보호 파일 변경, 보안/아키텍처 트레이드오프가 하나라도 있으면 `없음(HCI-0)`을 사용할 수 없습니다.** 해당 항목을 반드시 행으로 나열합니다.

## 7. 커밋 및 브랜치 규칙 (Commit & Branch Rules)
- **원자적 커밋**: 하나의 커밋은 하나의 논리적 변경 단위만 담습니다. 무관한 변경을 섞지 않습니다.
- **커밋 메시지**: 명령형 현재 시제로 변경의 *이유*를 설명합니다. (예: `fix(top-view): 게이지 임계값을 PPTX 수치 기준으로 정정`)
- **검증 통과 후 커밋**: §3.2, §3.3의 모든 검증 명령이 통과하고 증거가 확보된 후에만 커밋합니다.
- **phase 단위 통합**: 각 phase 종료 시 결과를 **`dev` 브랜치에 commit & push** 합니다(§6.2-6).
- **보호 파일**: `AGENTS.md`, 승인된 계획 문서의 수락 기준, 시크릿(`.env`)/CI 설정은 §4에 따라 인간 승인 없이 커밋하지 않습니다.
- **자동 커밋·푸시 금지(예외)**: 일반적으로 인간이 명시적으로 요청하기 전까지 임의 커밋/푸시하지 않습니다. 단, **§6.2의 phase 종료 절차에 따른 `dev` 커밋·푸시는 승인된 워크플로우의 일부**로 허용됩니다.
