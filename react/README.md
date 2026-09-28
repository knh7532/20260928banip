# react/ — GPU/SQream · GPU/LLM 모니터링 대시보드 React UI (transplant 모듈)

> **transplant 포맷 안내**: 이 폴더는 `llm_gpu_top_view_mockup/web/` 의 React 앱을 모듈형 포맷으로 옮긴
> 것이다. 기동·검증은 이 폴더의 `setup-react / build-react / start-react / stop-react / verify-react`
> (.ps1/.sh) 로 하며, 포트는 transplant 규약을 따른다 — **Prometheus :3002 · exporter/명령 API :9090 ·
> 정적 서버 :8082 · AI 에이전트 :8000**. 아래 본문의 `native/`·`native-linux/` 경로 설명은 원본 문서의
> 실행 모드 설명이며, 이 폴더에서는 같은 역할을 위 스크립트가 한다. 문서(계약 TV-C1 `db-schema.md`,
> ADR, 회고, 리뷰)는 `react/docs/` 에 있다.
>
> | 원본(목업) | transplant |
> | --- | --- |
> | `native/web-serve.ps1` / `native-linux/web-serve.sh --bg` | `react/start-react.ps1` / `react/start-react.sh` |
> | `web-stop`, `web-verify` | `react/stop-react.*`, `react/verify-react.*` |
> | `web/.env` (VITE_PROM_URL 등) | `react/.env` — start-react 가 기동 시 `dist/runtime-config.js` 로 주입 |
> | `../docs/architecture/db-schema.md` | `react/docs/architecture/db-schema.md` |
> | 레거시 `#/detail/*` (구 transplant SQream 상세 화면) | `#/drilldown/*` 로 자동 리다이렉트 (`useRoute.ts`) |

# web/ — GPU/SQream 모니터링 대시보드 React UI (React + Apache ECharts)

원본 시안 `서류/gpu_dashboard.pptx` 를 **React** 로 재현한 단일 화면 대시보드다. iframe 없이
**브라우저가 Prometheus HTTP API 를 직접 호출**하고, 차트는 **Apache ECharts** 하나로 그린다(ADR R-0008, 2026-09-07 — C3/D3 제거).
통합 프로젝트(`llm_gpu_top_view_mockup/`)의 UI 영역으로, 같은 프로젝트의 Grafana 판과
**같은 exporter/Prometheus** 를 소비한다.

- 데이터 계약(TV-C1) SoT: `../docs/architecture/db-schema.md` (web 영역은 **소비자** — TV-C3)
- 팔레트·레이아웃 SoT: `../docs/design-tokens.md`
- 설계·의사결정: `../docs/plan.md`, `../docs/adr/`, 회고 `../docs/retrospectives/`, 리뷰 `../docs/reviews/`

## 화면 구성

| 영역 | 내용 |
| --- | --- |
| 좌측 사이드바 | AX Portal 메뉴 + GPU 서버 목록 카드(상태·GPU 사용 수, 메트릭 산출) |
| 상단 | 제목 + KST 실시간 시계, 필터바(환경/인스턴스/GPU 다중선택/시간범위/자동갱신) |
| 표 2종 | 실행 중인 SQream 쿼리 · SQL 쿼리 성능 정보(상태 배지 Initializing/In Process/In Queue) |
| 타임라인(ECharts custom) | GPU별 쿼리 실행 간트 — 유형색 막대, 드래그로 구간 선택, 막대/라벨 클릭 GPU 필터 |
| 선택 구간 상세 | 8항목(시간구간·GPU·쿼리ID·DB·행수/초·P95·쿼리수·메모리) |
| 시계열 4종(ECharts) | GPU 사용률·메모리·온도·전력 (GPU별 라인) |
| 서버 게이지(ECharts gauge) | 서버 3종 × 지표 4개 게이지 |

## 아키텍처 — 브라우저가 Prometheus 직접 호출

```
[브라우저] ──HTTP──> Prometheus :3002   (Access-Control-Allow-Origin: * → 프록시 불필요)
    │
    └─ 정적 파일(dist/) 은 아래 셋 중 하나로 서빙 (:8082)
```

Prometheus base URL 은 빌드 시 `VITE_PROM_URL` 로 고정하거나, **비워두면 런타임에**
`http://<대시보드가 열린 호스트>:3002` 을 자동 타깃한다. 따라서 **Prometheus 와 대시보드를
같은 호스트에 두면 재빌드 없이** 동작한다(하드코딩 호스트 없음).

## 1. 빌드 (개발 PC — Node 필요)

현장 서버에는 Node 가 없다. **빌드는 개발 PC에서만** 하고 산출물 `dist/` 만 반입한다.

```bash
npm ci
npm run build          # clean → typecheck → 계약 테스트 → vite build → dist/
```

`npm run verify` 로 게이트(lint·typecheck·커버리지)를 확인할 수 있다.
다른 호스트의 Prometheus 를 볼 경우에만 `.env` 에 `VITE_PROM_URL` 을 지정하고 빌드한다
(`.env.example` 참고).

## 2. 실행 모드

### A. 네이티브 — RHEL 8.x, Node/Docker 불필요 (현장 1순위)

이식형 Python(3.12) 또는 시스템 `python3` 의 표준 라이브러리 `http.server` 로 `dist/` 를 서빙한다.

실행 스크립트는 프로젝트 루트의 `native-linux/`에 있다 (web/ 기준 `../native-linux/`):

```bash
bash native-linux/web-serve.sh            # 포그라운드, 0.0.0.0:8082 (Ctrl-C 종료)
bash native-linux/web-serve.sh --bg       # 백그라운드 (run/react.pid, logs/react.log)
bash native-linux/web-stop.sh             # 백그라운드 종료 (PID 소유 확인 후에만)
PORT=8083 DIST=/opt/app/dist bash native-linux/web-serve.sh
```

> Python 탐색 순서: `native-linux/.venv/bin/python` → `/opt/ai/python-3.12/bin/python3.12`
> → 시스템 `python3`. 스택의 이식형 Python 을 재사용할 수 있다.

### B. Docker (nginx) — Docker 가 있는 환경 (2순위)

프로젝트 루트의 통합 `docker-compose.yml` 이 `web` 서비스(`nginx:alpine`)로 `web/dist/` 를
읽기 전용 마운트해 8082 로 제공한다. 프록시는 없다(브라우저가 Prometheus 직접 호출).

```bash
cd .. && docker compose up -d web     # http://<host>:8082 (웹만) / up -d 는 전 스택
docker compose down
```

### C. 개발 서버 (개발 PC, 핫리로드)

```bash
npm run dev            # http://127.0.0.1:5173 (loopback 전용)
```

> **개발 PC(Windows) 정적 서빙 테스트**: `powershell -ExecutionPolicy Bypass -File ../native/web-serve.ps1`
> (Windows PowerShell 5.1 또는 pwsh 7 모두 동작). 점검은 `... -File ../native/web-verify.ps1`.

## 3. 망분리 반출 절차

인터넷/레지스트리가 없는 현장으로 옮길 때. 현장 서버가 **빈 서버**여도 되도록
반출 세트는 dist/ 뿐 아니라 **실행 스크립트·compose·README 를 함께** 묶는다.

1. **개발 PC**: `npm run build` → `bash ../native-linux/web-package-dist.sh`
   - `dist/checksums.sha256` (내부 파일별 해시) 생성
   - `top-view-web-deploy.tar.gz` + `.tar.gz.sha256` 생성 — 아카이브 안에
     `top-view-web/{dist, native-linux/web-*.sh, docker/nginx.conf, README.md, .env.example}` 포함
   - 전체 스택(exporter+Prometheus+Grafana 포함) 반출은 `../native-linux/01-fetch-bundle.sh` + `02-package-bundle.sh`
2. **반입**: 두 파일(`*.tar.gz`, `*.tar.gz.sha256`)을 USB 등으로 현장 서버에 복사.
3. **현장 서버**: 무결성 확인 후 전개 (npm 오프라인 번들 불필요)
   ```bash
   sha256sum -c top-view-web-deploy.tar.gz.sha256     # 반입 손상 확인
   mkdir -p /opt && tar -xzf top-view-web-deploy.tar.gz -C /opt   # → /opt/top-view-web/
   ```
4. **기동·점검**:
   ```bash
   cd /opt/top-view-web
   DIST=$PWD/dist bash native-linux/web-serve.sh --bg   # → 0.0.0.0:8082
   DIST=$PWD/dist bash native-linux/web-verify.sh       # 아래 4종 점검 (dist 체크섬 포함)
   ```

## 4. 검증 (verify)

`../native-linux/web-verify.sh` (현장) / `../native/web-verify.ps1` (개발 PC — Windows PowerShell
5.1 이상, `?.` 등 미사용) 가 확인하는 항목:

1. `dist/` 산출물 존재 + `checksums.sha256` 무결성
2. 정적 서버(:8082) `GET /` → 200 + `index.html` 에 `<div id="root">`
3. Prometheus(:3002) 도달 + **CORS 헤더**(`Access-Control-Allow-Origin`) — 브라우저 직접 호출 전제
4. 번들에 **하드코딩 IP:3002 없음** + 런타임 `location.hostname` 기반인지

```bash
bash ../native-linux/web-verify.sh                           # 기본 127.0.0.1:8082 / :3002
bash ../native-linux/web-verify.sh http://gpu-host:8082 http://gpu-host:3002
```

## 5. 포트·CORS

| 서비스 | 포트 | 바인딩 | 비고 |
| --- | --- | --- | --- |
| React 정적(native/docker) | 8082 | 0.0.0.0 | 다중 PC 접속(사설망 한정) |
| Prometheus | 9091 | — | 브라우저가 직접 호출 (형제 스택이 제공) |
| Vite dev 서버 | 5173 | 127.0.0.1 | 개발 PC 전용 |

- Prometheus 는 기본 `--web.cors.origin=.*` 로 CORS(*) 를 반환하므로 프록시 없이 직접 호출된다.
  범위를 좁히려면 스택 기동 시 `PROM_CORS_ORIGIN='https?://host:8082'` 로 제한한다.
- 8082/9091 은 같은 스택(9801/9091/3001)과 무충돌(9091 은 공유 소비).

## 6. 거버넌스

phase 별 폐쇄 게이트로 진행했다(구현 → 게이트 → codex 리뷰 → 수정 → 확인 → 회고 → dev 커밋).
- 구 React 프로젝트 이력: Phase R1~R9 — 리뷰·회고는 통합 `../docs/reviews/phase-R*-codex-*.md`,
  `../docs/retrospectives/phase-R*.md` (통합 이후는 `../docs/plan.md`의 U 로드맵)
- 계약 대사(TV-C3, 구 RC-1): `tests/queries.contract.test.ts` — 앱 PromQL 이 TV-C1 을 벗어나면 빌드 실패
