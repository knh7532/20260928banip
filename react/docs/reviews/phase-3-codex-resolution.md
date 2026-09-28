# Phase 3 codex 리뷰 처리 기록 (Resolution)

전 7건 **Accepted → Fixed**. Rejected/Escalated 없음.

| ID | 처리 | 수정 내용 (파일 증거) |
| --- | --- | --- |
| CDX-P3-01 | Fixed | 테이블 ①② 전 쿼리를 `max by(<TV-C1 라벨>) (...)`로 래핑해 job/instance 제거, organize를 무접미사 컬럼명 기준으로 갱신 (`gen_dashboard.py` running_statements_table/query_perf_table). Prometheus 실측: t1-A `{gpu,node,query_id,sqream_user,stmt_id}` / t1-E `{stmt_id}` / t2-A `{database,gpu,node,query_name,query_type}` |
| CDX-P3-02 | Fixed | state-timeline defaults에 `color: {mode: palette-classic}` 추가 |
| CDX-P3-03 | Fixed | `dashboards.yml` allowUiUpdates: false, 대시보드 `editable: false` — 변경은 생성기 재생성 경로로만 |
| CDX-P3-04 | Fixed | `check_dashboard.py` 재작성 — TV-C1 manifest를 db-schema.md에서 직접 파싱, 전 expr 화이트리스트 토크나이저(미계약 메트릭·라벨 차단), selector별 per-metric 라벨 부분집합 검사, 변수 label_values 쿼리 포함 |
| CDX-P3-05 | Fixed | 패널별 기대 계약 대조 — 10패널 제목/타입/gridPos 전수, ①② refId·instant·format·조인·최종 컬럼 allowlist·핵심 override, ⑤ 게이지 refIds·고정 selector·unit override·sum 집계, ④ unit |
| CDX-P3-06 | Fixed | 변수 검사 확장 — env 단일, instance/gpu multi+All+`.*`+refresh, env→instance→gpu 체인, multi 변수 `=~` 사용 강제 |
| CDX-P3-07 | Fixed | 타임라인 매핑을 ADR-0002 기대 사전과 전수 대조(텍스트·색 정확값·0=transparent·6색 고유성) + color scheme + showLegend |

## 수정 후 게이트 증거

```
wrote top-view.json: 10 panels, 3 variables
OK: top-view.json 검증 통과 — 패널 10개, 변수 3종, 계약 메트릭 14종 대사
재생성 sha256 동일 (멱등): 6444df0f8bf6...
Grafana 재기동 후: dashboards 1 (tv-gpu-sqream), panels 10, editable False, refresh 5s
```

## 확인 리뷰 (re-review) — 2회차

### 1차 확인 (2026-07-14T15:1x UTC)

- 판정: 5건 Resolved(P3-01/02/03/04/07 — P3-04는 리뷰어가 음성 탐침으로 `up`·미계약 selector·라벨 오타 거부까지 확인). **2건 Unresolved**: P3-05(변조 탐침 — exclude 제거·게이지 C 노드 오염·상태 매핑 훼손이 검증기를 통과), P3-06(혼합 =/=~ 통과). **신규 Blocking CDX-P3R-01**: CP949 콘솔에서 검증기가 UnicodeEncodeError로 exit 1.
- 추가 수정: ①② excludeByName 정확 대조, ⑤ 4개 타깃 전부 노드 고정 + 타 노드 혼입 차단, ② 상태 매핑 0/1/2 전 키 텍스트·색 대조, multi 변수 전 출현 `=~` 강제(출현 수 == 매칭 수), `sys.stdout.reconfigure(errors="replace")` + em dash 제거. 변조 탐침 5종 자체 재현 — 전부 exit 1(CAUGHT), baseline exit 0.

### 2차 확인 (최종, 2026-07-14T15:3x UTC)

- 판정: **CDX-P3-05 / P3-06 / P3R-01 전건 Resolved** (excludeByName 기대=실제 일치, 게이지 3종 교차 오염 0, $env 13/13·$instance 10/10·$gpu 9/9 전부 `=~`, `chcp 949` 직접 실행 exit 0).
- **"Phase 3 기준 Blocking 잔존 여부: 없음"** — §6.2-4 게이트 충족. Phase 3 종료 (인간 정적 검토 체크포인트는 회고 HCI-3-1로 개방 유지).
