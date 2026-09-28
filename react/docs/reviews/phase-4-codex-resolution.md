# Phase 4 codex 리뷰 처리 기록 (Resolution)

전 10건 **Accepted → Fixed**. Rejected/Escalated 없음.

| ID | 처리 | 수정 내용 (파일 증거) |
| --- | --- | --- |
| CDX-P4-01 | Fixed | `stop-native.ps1` — startTime 미기록 엔트리는 이름만으로 종료하지 않고 정확 실행파일 allowlist(Test-NativeOwned) 통과 시에만 종료 |
| CDX-P4-02 | Fixed | Test-NativeOwned를 정규화 실행파일 경로 3종(venv python/prometheus/grafana) 정확 대조로 교체 — CommandLine 부분 문자열 검사 제거 |
| CDX-P4-03 | Fixed | `start-native.ps1` — Set-TrackedEnv(기존 값 저장) + try/finally 정확 복원(원래 없던 변수 제거·있던 변수 원값 복구), GF_* 일괄 삭제 제거 |
| CDX-P4-04 | Fixed | Start-Logged가 매 기동 직후 pids.json 기록 — 중간 실패에도 기 시작 프로세스 추적 |
| CDX-P4-05 | Fixed | `verify-native.ps1` — activeTargets 총수==1 ∧ UP==1 ∧ job==top-view-exporter ∧ scrapeUrl~localhost:9801 전부 대조 |
| CDX-P4-06 | Fixed | 전 HTTP 호출 `-TimeoutSec 10` + 공통 90s 데드라인 `Wait-Check` 재시도(health/dashboard/datasource) |
| CDX-P4-07 | Fixed | 신규 검사 — `/api/datasources/uid/prometheus` URL 대조 + datasource 프록시로 실제 PromQL 쿼리(DCGM_FI_DEV_GPU_UTIL ≥1 결과) |
| CDX-P4-08 | Fixed | README에 "네이티브 모드 자격증명은 `.env`만 읽음" 명시 (compose와의 우선순위 차이 고지) |
| CDX-P4-09 | Fixed | `setup-native.ps1` — python 3.12+ 검사(신규 venv 생성 전 + 기존 venv 검사), 주석 3.10→3.12 |
| CDX-P4-10 | Fixed | README — "zip 복사" → "압축 해제된 두 디렉터리 복사"로 정정 |

## 수정 후 재검증 증거 (전체 사이클 재실행)

```
[setup] ... (기존 venv 3.14 버전 검사 통과)
[start] top-view-exporter / prometheus / grafana (3프로세스)
[verify] OK  Prometheus target 1/1 UP (top-view-exporter @ localhost:9801)
[verify] OK  Grafana /api/health
[verify] OK  Grafana dashboard 1/1 (tv-gpu-sqream)
[verify] OK  Grafana datasource proxy query (prometheus)
[verify] OK  exporter DCGM_FI_DEV_GPU_UTIL / sqm_gpu_timeline_state / sqm_statement_running
[verify] ALL CHECKS PASSED   (exit 0)
[stop] 3 processes stopped
세션 GF_SECURITY_ADMIN_PASSWORD 잔존 없음
```

이전 사이클에서 확보한 증거: stop→재기동 후 재시작 이전 타임스탬프의 TSDB 샘플 조회(보존 확인), netstat `0.0.0.0:9801/9091/3001` LISTENING, 포트 집합이 기존 `../mockup`(9100~9500/9090/3000/8080)과 서로소 — 병행 기동 가능.

## 확인 리뷰 (re-review)

- 리뷰어: gpt-5.6-sol (codex-rescue 경유, read-only), 2026-07-14T15:0x UTC (UTC 기준 14:55 제출)
- 판정: **10건 전건 Resolved** (파일·행 단위 근거 인용 — stop 신원 대조 강화, 실행파일 정확 대조, env 저장/복원, pids 증분 기록, 타깃 정밀 검사, 타임아웃+데드라인, datasource 프록시 쿼리, README/버전 검사 정정).
- **"Phase 4 기준 Blocking 잔존 여부: 없음"** — §6.2-4 게이트 충족. Phase 4 종료. 1차(정적) 범위 완료.
