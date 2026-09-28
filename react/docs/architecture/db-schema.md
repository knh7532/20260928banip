# DB 스키마 정의서 — 계약 TV-C1 (메트릭 이름·라벨 스키마)

이 문서는 **계약 TV-C1의 단일 진실 공급원(SoT)** 이다 (`owner_role=exporter`, AGENTS.md §5.1). 생산자는 `exporter/exporter/metrics.py`, 소비자는 2곳 — Grafana 생성기(`grafana/gen_dashboard.py`·`grafana/gen_llm_dashboard.py`)와 web(`web/src/api/queries.ts`)이다. 이름·라벨 변경은 계획 문서를 통해서만 하며, 드리프트 검증은 `cd exporter && pytest tests/test_contract.py`(+ 소비 측 각자의 계약 테스트)로 한다.

## 영속 저장소

- **시계열**: Prometheus TSDB (scrape 5s, retention 15d)가 유일한 영속 저장소다.
- **RDB: 해당 없음 (N/A)** — 근거: 이 목업은 단일 화면 재현이 목적이며 설정값·알람 이력·사용자 데이터 등 비시계열 영속 데이터가 존재하지 않는다. 화면의 모든 정보는 메트릭(라벨 포함)으로 표현된다. 따라서 erDiagram 대상 엔티티가 없다.

## 공통 라벨

| 라벨 | 값 도메인 | 비고 |
| --- | --- | --- |
| `env` | `production` (단일) | 상단 필터바 "환경" 변수용. exporter `ENV_NAME` 환경변수로 설정 |
| `node` | `gpu-server-01` \| `gpu-server-02` \| `gpu-server-03` | 필터바 "인스턴스(서버)" 변수용. exporter 내부에서 부착(ADR-0001) |
| `gpu` | `"0"` \| `"1"` \| `"2"` \| `"3"` | 필터바 "GPU" 변수용. **물리 GPU 인덱스**(H200 4장) |
| `mig` | `"0"` \| `"1"` | MIG 인스턴스 인덱스 — GPU당 2분할(3g.71gb ×2). 슬롯 = (node, gpu, mig) |

## 메트릭 타입 (계약)

| 메트릭 | 타입 |
| --- | --- |
| `DCGM_FI_DEV_GPU_UTIL` | Gauge |
| `DCGM_FI_DEV_FB_USED` | Gauge |
| `DCGM_FI_DEV_FB_FREE` | Gauge |
| `DCGM_FI_DEV_GPU_TEMP` | Gauge |
| `DCGM_FI_DEV_POWER_USAGE` | Gauge |
| `sqm_statement_running` | Gauge |
| `sqm_statement_memory_bytes` | Gauge |
| `sqm_statement_gpu_percent` | Gauge |
| `sqm_statement_cpu_percent` | Gauge |
| `sqm_statement_start_time_seconds` | Gauge |
| `sqm_statement_completed_timestamp` | Gauge |
| `sqm_statement_completed_duration_seconds` | Gauge |
| `sqm_statement_completed_phase_seconds` | Gauge |
| `sqm_query_rows_per_second` | Gauge |
| `sqm_query_p95_seconds` | Gauge |
| `sqm_query_state` | Gauge |
| `sqm_query_executions_total` | Counter |
| `sqm_gpu_timeline_state` | Gauge |
| `llm_process_running` | Gauge |
| `llm_process_memory_bytes` | Gauge |
| `llm_process_gpu_percent` | Gauge |
| `llm_process_cpu_percent` | Gauge |
| `llm_process_start_time_seconds` | Gauge |
| `llm_service_tps` | Gauge |
| `llm_service_p95_seconds` | Gauge |
| `llm_service_state` | Gauge |
| `llm_requests_total` | Counter |
| `llm_gpu_timeline_state` | Gauge |
| `sqm_worker_up` | Gauge |
| `sqm_worker_subscription` | Gauge |
| `sqm_statement_duration_seconds` | Gauge |
| `sqm_statement_progress_ratio` | Gauge |
| `sqm_statement_queued` | Gauge |
| `sqm_statement_failed_timestamp` | Gauge |
| `sqm_query_cpu_percent` | Gauge |
| `sqm_query_gpu_percent` | Gauge |
| `sqm_query_memory_bytes` | Gauge |
| `sqm_query_data_scanned_bytes` | Gauge |
| `sqm_query_spool_bytes` | Gauge |
| `sqm_slow_query_total` | Counter |
| `sqm_cache_hit_ratio` | Gauge |
| `sqm_session_active` | Gauge |
| `sqm_session_start_time_seconds` | Gauge |
| `sqm_session_running_queries` | Gauge |
| `sqm_table_rows` | Gauge |
| `sqm_table_chunk_count` | Gauge |
| `sqm_table_size_bytes` | Gauge |
| `sqm_table_compressed_bytes` | Gauge |
| `sqm_table_fragmentation_ratio` | Gauge |
| `sqm_table_deleted_rows` | Gauge |
| `sqm_table_last_access_timestamp` | Gauge |
| `sqm_table_access_total` | Counter |
| `sqm_table_chunks_filled_90pct` | Gauge |
| `sqm_table_chunks_under_80pct` | Gauge |
| `sqm_table_chunks_no_deletion` | Gauge |
| `sqm_table_clustering_key` | Gauge |
| `sqm_table_maintenance_progress_ratio` | Gauge |
| `sqm_open_snapshot_count` | Gauge |
| `sqm_open_snapshot_age_seconds` | Gauge |
| `sqm_lock_held_seconds` | Gauge |
| `sqm_log_entries_total` | Counter |
| `sqm_alert_state` | Gauge |
| `sqm_alert_since_timestamp` | Gauge |
| `sqm_sw_version_info` | Gauge |
| `sqm_last_update_timestamp` | Gauge |
| `sqm_license_expiry_timestamp` | Gauge |
| `sqm_data_limit_bytes` | Gauge |
| `sqm_data_used_bytes` | Gauge |

| `node_cpu_seconds_total` | Counter |
| `node_disk_read_bytes_total` | Counter |
| `node_disk_written_bytes_total` | Counter |
| `node_memory_MemTotal_bytes` | Gauge |
| `node_memory_MemAvailable_bytes` | Gauge |

Counter는 `*_created` 보조 시계열을 노출하지 않는다(`disable_created_metrics()`).

> `node_*` 5종은 이름이 node_exporter 관습이고 값은 우리 exporter가 시뮬레이션한다(§8, v4.4 — 그 전에는 소비 전용이었다).

## 1. GPU 메트릭 (DCGM 명명 관습) — 화면 ④ 시계열, ⑤ 서버 요약 게이지

라벨: `env`, `node`, `gpu`, `mig`, `modelName`(고정 "NVIDIA H200"). `gpu`는 물리 GPU 인덱스, `mig`는 MIG 인스턴스 인덱스(3g.71gb 프로파일 ×2)다. 타입은 전부 Gauge.

| 메트릭 | 단위 | 값 의미 |
| --- | --- | --- |
| `DCGM_FI_DEV_GPU_UTIL` | % (0~100) | GPU 사용률 |
| `DCGM_FI_DEV_FB_USED` | MiB | 프레임버퍼 사용량. 메모리사용률(%) = `USED/(USED+FREE)*100` |
| `DCGM_FI_DEV_FB_FREE` | MiB | 프레임버퍼 여유량. MIG 인스턴스당 총량 72704 MiB 고정 (H200 141GB → 3g.71gb) |
| `DCGM_FI_DEV_GPU_TEMP` | °C | GPU 온도 |
| `DCGM_FI_DEV_POWER_USAGE` | W | 전력 사용량. **MOCK 근사**: 실측 DCGM은 물리 GPU 단위지만 목업은 MIG 슬롯 단위로 배분한다 |

카디널리티: 3노드 × 4GPU × 2MIG = 메트릭당 24시리즈 고정.

### ⑤ 서버 요약 집계 PromQL (추가 메트릭 없음)

서버 카드는 노드별 고정 패널이므로 selector에 실제 노드명을 쓴다 (아래는 `gpu-server-01` 예시 — 02/03 카드는 노드명만 교체):

```promql
avg(DCGM_FI_DEV_GPU_UTIL{node="gpu-server-01"})
avg(DCGM_FI_DEV_FB_USED{node="gpu-server-01"} / (DCGM_FI_DEV_FB_USED{node="gpu-server-01"} + DCGM_FI_DEV_FB_FREE{node="gpu-server-01"})) * 100
avg(DCGM_FI_DEV_GPU_TEMP{node="gpu-server-01"})
sum(DCGM_FI_DEV_POWER_USAGE{node="gpu-server-01"})
```

시계열 패널 등 필터바 연동 쿼리는 템플릿 변수 매처를 쓴다: `{env=~"$env", node=~"$instance", gpu=~"$gpu"}`.

## 2. 실행 중 Statement 메트릭 — 화면 ① 테이블

신원 라벨은 `sqm_statement_running` 한 곳에만 두고, 수치 메트릭은 `stmt_id` 단일 키로 조인한다(Grafana Table `joinByField(stmt_id)`). 타입은 전부 Gauge.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_statement_running` | `env`, `node`, `gpu`, `mig`, `worker`, `service`, `stmt_id`, `query_id`, `sqream_user`, `qid`, `qid_tags`, `connection_id` | 실행 중이면 1 (신원 라벨 캐리어). `connection_id`(v4.12)는 세션 Connection ID — `stmt_id` 에서 결정론 파생 |
| `sqm_statement_memory_bytes` | `stmt_id` | 사용 메모리 (bytes — 화면은 GB 단위 표시) |
| `sqm_statement_gpu_percent` | `stmt_id` | GPU 사용률 % |
| `sqm_statement_cpu_percent` | `stmt_id` | CPU 사용률 % (멀티코어 합산 — 100 초과 가능) |
| `sqm_statement_start_time_seconds` | `stmt_id` | 시작 시각 (unix epoch 초) |

**노출 규칙**: statement 라벨셋은 **실행 중에만 존재**한다. 쿼리 종료 시 5개 메트릭 모두 해당 `stmt_id` 라벨셋을 `remove()`한다. 동시 노출은 최대 24건(MIG 인스턴스당 1쿼리)이다.

**`worker` 라벨** (2026-08-08 추가): `sqream{노드번호}{GPU}{MIG+1}` 형식으로, `node`/`gpu`/`mig`에서
`sim_params.worker_name()`이 유도한다. 드릴다운 계열(MOCK-ONLY, sqm_query_* / statement_duration)은
`stmt_id`+`worker`만 갖고 `node`/`gpu`/`mig`가 없으므로, 이 라벨이 있어야 두 계열이
`on(stmt_id, worker)`로 조인된다(Grafana `01-main` Query Overview). 값은 `node`/`gpu`/`mig`에서
결정론적으로 유도되므로 카디널리티 상한은 변하지 않는다.

**`connection_id` 라벨** (v4.12, 2026-09-07 — Phase X18, 인간 지시): 화면 ① 표의 "Connection ID" 열이 계약에
값이 없어 "-"로 비어 있던 것을 채운다. SQream 의 connection id 는 세션 정수인데, 목업은 신원(`stmt_id`)에서
`sim_params.connection_id()`로 **결정론 파생**한다(`5000 + 신원 순번`, 72종). `stmt_id` 와 1:1 이므로
누적 라벨셋 상한(72)은 변하지 않는다. 소비자는 `sqm_statement_running` 의 `by()` 에 이 라벨을 더해 읽는다
(TV-C3 `runningStatements.identity`).

> **TSDB 누적 카디널리티**: `remove()`는 **노출 중단**일 뿐이며 이미 수집된 시계열은 retention(15d) 동안 TSDB에 남는다. 따라서 신원을 무한 증가시키지 않고 **슬롯(MIG 인스턴스)에 고정된 신원 3종**에서 재사용한다 — `stmt_id`는 항상 같은 `node`/`gpu`/`mig`/`query_id`/`sqream_user`와만 결합하므로, 누적 라벨셋이 `24 슬롯 × 3 = 72`개로 상한된다(`sqm_statement_running` 기준. 나머지 4종은 `stmt_id`만 쓰므로 각 72개). 이 상한을 바꾸는 변경은 계획 문서를 통해서만 한다.

### 2b. 완료 이벤트 메트릭 (v4.5, Phase X1) — 화면 ③ 우측 X-View 산점도

완료된 statement 1건을 (종료 시각, 소요시간, 성공/실패)로 남긴다 — 점 1개 = 완료 쿼리 1건. 타입은 전부 Gauge.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_statement_completed_timestamp` | `env`, `node`, `gpu`, `mig`, `stmt_id`, `query_id`, `sqream_user`, `query_name`, `status`, `reason` | 종료 시각 (unix epoch 초) |
| `sqm_statement_completed_duration_seconds` | `env`, `node`, `gpu`, `mig`, `stmt_id`, `query_id`, `sqream_user`, `query_name`, `status`, `reason` | 소요 시간 (초 — 샘플링된 논리 지속 `end_ts - start_ts`) |
| `sqm_statement_completed_phase_seconds` | `env`, `node`, `gpu`, `mig`, `stmt_id`, `query_id`, `sqream_user`, `query_name`, `status`, `reason`, `phase` | 단계별 소요 (초, v4.6 — Phase X3). `phase` ∈ `compile` \| `queued` \| `initializing` \| `executing` (이벤트당 4시리즈 — **v4.7에서 `preparing` → `compile` 어휘 개정**, 인간 지시). `queued`는 큐 실측(제출→배정), `compile`(0.4~2.5s)·`initializing`(0.3~1.5s)은 stmt_id 결정론 합성, `executing`은 실행 지속과 동일. 소비는 X-View 호버 툴팁의 생애주기 막대뿐 — **화면(산점도·타임라인) 거동 무영향** |

- `status` = `success` \| `failed`, `reason`은 §7.1 실패 사유 열거형 재사용(성공은 빈 문자열). 판정은 `stmt_id` 기준 **결정론**이라 `sqm_statement_failed_timestamp`와 어긋나지 않는다.
- **노출 규칙**: 최근 완료 `COMPLETED_KEEP=60`건의 링이다. 이것은 **노출(exposition) 상한일 뿐**이다 — 완료율 합 ~10.8건/분에서 링 한 바퀴는 ~5.6분으로 scrape 5s를 크게 웃돌아, 모든 완료 이벤트가 TSDB에 최소 1회 샘플링된다.
- **소비 의미론 (중요)**: **instant 조회 금지** — 최근 ~5.6분만 보인다. 시간창 재구성은 **range 쿼리(`/query_range`)로 (라벨셋, 값=종료 epoch) 전환을 복원**한다. dedupe 키 = (전체 라벨셋, 종료 epoch 값). 동일 라벨셋의 값 갱신(신원 재사용)은 range 복원에서 정보 손실이 아니다 — 과거 샘플은 TSDB에 잔존한다.
- **퇴출 규칙**: 링에서 밀려나면 두 메트릭의 라벨셋을 **함께** remove()한다. 같은 라벨셋이 링에 2회 있을 때는 참조계수가 0이 될 때만 지운다(최신 게이지 보호).
- **TSDB 누적 카디널리티**: 신원(stmt_id 72종)이 슬롯 고정이고 status/reason이 stmt_id에서 결정론 파생이므로, 조합 축은 query_name뿐이다 — 일반 슬롯 21×3신원×비ETL 5종 + ETL 슬롯 3×3신원×ETL 3종 = **누적 라벨셋 ≤ 342/메트릭** (phase 메트릭은 ×4 = ≤1,368; v4.10 카탈로그 확장 반영). 이 상한을 바꾸는 변경은 계획 문서를 통해서만 한다.
- **실패 유형 ↔ 발생 시점 (SQream 가이드, v4.6 문서화)**: `reason` 열거형은 불변(5종)이며, 화면 표기는 아래 매핑을 따른다. 가이드에는 사전 단계 실패(Syntax/Parsing·Compilation — Compile 단계(v4.7 어휘), Initialization — Initializing)도 있으나 **목업 시뮬레이터는 실행 단계 실패만 생성**하므로 화면에는 아래 5행만 나타난다.

| reason | 실패 유형 (가이드) | 발생 시점 | 쉽게 말하면 |
| --- | --- | --- | --- |
| `lock_timeout` | Execution Error | Executing | 실행하다 실패 |
<!-- v4.7: 가이드의 사전 단계 표기(Preparing)는 생애주기 막대의 어휘 개정에 따라
     Compile 단계에 대응한다 (Syntax/Parsing·Compilation 참조 항목 — 목업 미출현). -->
| `out_of_memory` | Resource Error | Executing | 자원이 부족함 |
| `spool_limit` | I/O / Storage Error | Executing | 데이터를 못 읽거나 씀 |
| `connection_lost` | Connection Error | 실행 전후 | 연결이 끊김 (X11: 워커 crash가 덮친 문장도 이 값 — 프로세스 사망은 클라이언트에 연결 오류로 나타난다) |
| `killed_by_admin` | Stopped / Cancelled | Executing | 실패가 아니라 의도적 중단 |

## 3. 쿼리 성능 메트릭 — 화면 ② 테이블

고정 쿼리 카탈로그 8종(v4.10)에 대해 시계열이 상시 존재한다 — **동시 노출은 항상 8개**다. 다만 `sqm_query_rows_per_second`는 배정 슬롯이 바뀌면 라벨셋이 바뀌므로(이전 것은 `remove()`) TSDB **누적**으로는 최대 192개가 될 수 있다(아래 표 참조). 타입은 `sqm_query_executions_total`(Counter)을 제외하고 Gauge다.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_query_rows_per_second` | `env`, `query_name`, `query_type`, `database`, `node`, `gpu`, `mig` | 처리 행수/초 (실행 중이 아니면 0). **노출 규칙**: 카탈로그 쿼리 1건은 **항상 정확히 1개의 라벨셋**만 노출한다 — 배정 슬롯이 바뀌면 이전 라벨셋을 `remove()`한다(테이블 조인 중복 방지). **TSDB 누적**: 슬롯 이동으로 라벨셋이 바뀌므로 보존기간 동안 누적 시계열은 최대 `8 쿼리 × 24 MIG = 192`개다(동시 노출은 항상 8개) |
| `sqm_query_p95_seconds` | `env`, `query_name`, `query_type`, `database` | 응답시간 P95 (초). **MOCK 근사**: 실제 시스템은 histogram_quantile로 산출하나 목업은 사전계산 게이지로 대체 |
| `sqm_query_state` | `env`, `query_name`, `query_type`, `database` | 0=IDLE, 1=RUNNING, 2=QUEUED (화면 표기: Initializing / In Process / In Queue) |
| `sqm_query_executions_total` | `env`, `node`, `gpu`, `mig` | MIG 인스턴스별 누적 쿼리 실행 수 — 화면 "선택 구간 상세"의 쿼리 수 항목. **타입: Counter**(쿼리 종료 시 +1). 대시보드는 `increase(...[$__range])`로 구간 쿼리 수를 구한다. TV-C1 v1.1에서 추가, **v1.2(2026-07-15, Phase 5)에서 Gauge → Counter로 전환** |

### 쿼리 카탈로그 (계약의 일부 — 타임라인 인덱스 겸용, ADR-0002)

| 인덱스 | query_name | query_type | database |
| --- | --- | --- | --- |
| 1 | `Sales_Aggregation` | `aggregation` | `sales_db` |
| 2 | `Customer_Join` | `join` | `crm_db` |
| 3 | `ETL_Load_Daily` | `etl` | `staging_db` |
| 4 | `Fraud_Detection_Scan` | `fullscan` | `risk_db` |
| 5 | `Group_By_Region` | `select` | `sales_db` |
| 6 | `Vacuum_Maintenance` | `other` | `dw_master` |
| 7 | `Daily_Order_Insert` | `etl` | `sales_db` |
| 8 | `Stale_Orders_Purge` | `etl` | `sales_db` |

`query_type` 도메인(6종)과 화면 표기: `select`=SELECT 조회, `etl`=ETL 적재, `aggregation`=집계, `join`=JOIN 쿼리, `fullscan`=풀스캔, `other`=기타. 한글 표기는 대시보드 value mapping/organize에서 부여한다(라벨 값은 ASCII 유지).

## 4. 타임라인 메트릭 — 화면 ③ State timeline (ADR-0002)

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_gpu_timeline_state` | `env`, `node`, `gpu`, `mig` | 0=Idle, 1~8=위 카탈로그 인덱스 (MIG 인스턴스당 동시 1쿼리 — v4.10에서 7·8 추가) |

카디널리티: 24시리즈 고정(상시 존재) — range 쿼리로 과거 구간 복원 가능.

## 5. 동적 시뮬레이션 파라미터 (Phase 5)

`exporter/exporter/sim_params.py`가 아래 값을 상수로 정의하고, `tests/test_sim_params.py`가 이 문서와 대사한다. 값은 고정 수치가 아니라 **기저값과 규칙**이며, 실제 노출값은 매 tick 변한다(사인파 + 랜덤워크 + 스파이크 + 쿼리 부하).

### 5.1 시간 압축 (인간 확정 2026-07-15)

데모에서 타임라인 세그먼트가 빨리 쌓이도록 시간축을 압축한다. 대시보드 기본 시간범위는 **Last 30 minutes**다.

| 파라미터 | 값 |
| --- | --- |
| 시뮬레이션 tick | 1초 (`TICK_SECONDS`) |
| 쿼리 지속 | 30초 ~ 180초 (로그정규 **중앙값 75초**, 절단 후 평균은 이보다 다소 큼) |
| 노드별 쿼리 도착 | 지수분포(포아송). 평균 간격은 서버 성격별 11 / 18 / 30초 |

> 실제 운영의 쿼리 지속·도착 간격은 이보다 길다. 이 압축은 **시연 목적의 의도된 왜곡**이며 실제 구현 이관 시 조정 대상이다.

### 5.2 서버 성격 (기저값)

서버 카드 수치는 원본 시안의 고정값에 맞추지 않는다(**자유 변동** — 인간 확정 2026-07-15). 서버마다 성격만 다르게 준다.

| node | 성격 | GPU사용률 기저 | 메모리 기저 | 온도 기저 | MIG 슬롯당 전력 기저 | 도착 평균 | 스파이크율 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpu-server-01 | busy | 44% | 48% | 58°C | 75W | 11초 | 0.004/tick |
| gpu-server-02 | normal | 34% | 40% | 52°C | 65W | 18초 | 0.003/tick |
| gpu-server-03 | idle-burst | 24% | 34% | 48°C | 55W | 30초 | 0.010/tick |

도착 간격은 서버 이용률을 결정한다: 이용률 ≈ (평균 지속 / 도착 간격) / MIG 슬롯 수(8) → busy 약 0.85, normal 0.52, idle-burst 0.31. busy 서버에서는 슬롯이 자주 꽉 차서 **In Queue** 상태가 실제로 나타난다.

물리 GPU별로 기저에 편차를 주고(GPU-0이 가장 바쁘고 GPU-3이 가장 한가함) MIG 인스턴스 간에도 소편차를 둔다(합이 0이라 노드 평균 순서는 보존). 실행 중 쿼리가 있으면 그 쿼리의 **부하 강도(load)** 에 비례해 아래가 가산된다.

| 가산 대상 | 최대 가산분 (load=1.0) |
| --- | --- |
| GPU 사용률 | +38 %p |
| 메모리 사용률 | +24 %p |
| 온도 | +9 °C |
| MIG 슬롯당 전력 | +60 W |

기저값은 **지표가 상한(100%)에 붙지 않도록** 조정했다(30분 시뮬레이션에서 포화 비율 0.2% 미만 — 스파이크 순간만). 실행 중 GPU의 평균 사용률은 유휴 GPU보다 뚜렷이 높다(대략 62% vs 35%).

### 5.3 물리 한계 (불변식)

| 지표 | 범위 |
| --- | --- |
| GPU 사용률 | 0 ~ 100 % |
| 메모리 사용률 | 5 ~ 96 % |
| 온도 | 35 ~ 92 °C |
| MIG 슬롯당 전력 | 30 ~ 350 W |

`FB_USED + FB_FREE = 72704 MiB`(항상, MIG 인스턴스당), `FB_USED = round(72704 × 메모리사용률/100)`.

### 5.4 쿼리 카탈로그 (8종 — 계약의 일부, v4.10)

| 인덱스 | query_name | query_type | database | 기준 rows/s | 기준 P95(초) | 부하 강도 | 기준 메모리(GB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `Sales_Aggregation` | `aggregation` | `sales_db` | 1,850,000 | 1.28 | 0.85 | 22.3 |
| 2 | `Customer_Join` | `join` | `crm_db` | 1,130,000 | 1.05 | 0.70 | 18.4 |
| 3 | `ETL_Load_Daily` | `etl` | `staging_db` | 963,000 | 0.92 | 0.95 | 31.8 |
| 4 | `Fraud_Detection_Scan` | `fullscan` | `risk_db` | 785,000 | 0.88 | 0.80 | 19.6 |
| 5 | `Group_By_Region` | `select` | `sales_db` | 640,000 | 0.34 | 0.45 | 6.2 |
| 6 | `Vacuum_Maintenance` | `other` | `dw_master` | 120,000 | 2.10 | 0.25 | 3.1 |
| 7 | `Daily_Order_Insert` | `etl` | `sales_db` | 890,000 | 0.78 | 0.65 | 14.2 |
| 8 | `Stale_Orders_Purge` | `etl` | `sales_db` | 310,000 | 1.45 | 0.50 | 8.6 |

기준값은 원본 시안의 쿼리 성능 표에서 가져왔으며, 실행 중에는 기준값 근처에서 변동한다(rows/s는 ±40%, P95는 ±80% 범위).

### 5.5 쿼리 라이프사이클 (불변식)

1. **도착은 슬롯과 무관한 노드별 포아송 과정**이다. 도착한 쿼리는 해당 노드의 빈 MIG 인스턴스에 배정되고, 빈 슬롯이 없으면 노드 큐에서 대기한다(`sqm_query_state=2`, In Queue). 큐 상한은 노드당 4이며, 넘치는 도착은 버린다(무한 증가 방지).
2. **MIG 인스턴스 1개에 동시 1쿼리** — 타임라인 1행 1값 의미론을 보장한다(동시 실행 statement 상한 = 24).
3. **종료 시 statement 메트릭 5종의 라벨셋을 `remove()`** 한다 — 실행 중인 쿼리만 화면에 남는다.
4. **신원은 슬롯에 고정된 3종에서 재사용**한다(§2 카디널리티 참조). `stmt_id`가 여러 슬롯을 떠돌지 않으므로 누적 라벨셋이 72로 상한된다.
5. 쿼리 종료 시 `sqm_query_executions_total{node,gpu,mig}`(Counter)이 1 증가한다. **24개 자식 시계열은 기동 시 0으로 미리 생성**되므로 첫 완료도 `increase()`가 정확히 잡는다.
6. 카탈로그 쿼리 1건은 **항상 정확히 1개의 `sqm_query_rows_per_second` 라벨셋**만 노출한다(배정 슬롯 변경 시 이전 라벨셋 제거).
7. **수집 일관성**: 시뮬레이터의 tick과 Prometheus scrape(collect)는 같은 락으로 직렬화된다 — 한 scrape가 statement 5종의 반쪽 상태(예: running은 제거됐는데 memory는 남은 상태)를 보지 않는다.

### 5.6 재현성

`RANDOM_SEED`(기본 42)를 고정하면 같은 tick 수열에서 같은 값이 나온다. 테스트는 고정 골든값이 아니라 **위 불변식과 범위**를 검증한다.

## 6. LLM 메트릭 (v3.0, DEF-U1) — 화면 "GPU/LLM 모니터링" (시안 llm_dashboard.pptx)

**additive-only**: 이 절의 메트릭은 v2.0까지의 기존 계약에 이름 충돌 없이 추가된 것이며, 기존 메트릭의 이름·라벨·타입은 불변이다. 공통 라벨은 `env`·`node`·`gpu`만 쓴다 — **mig 라벨 없음**(시안이 GPU 단위이고 화면 필터바에도 MIG가 없다). 슬롯 = (node, gpu) 12개. 생산자는 exporter의 LLM 시뮬레이터(llm_sim.py, 파라미터 llm_params.py)다.

### 6.1 실행 중 프로세스 — 화면 ① 테이블

신원 라벨은 `llm_process_running` 한 곳에만 두고, 수치 메트릭은 `pid` 단일 키로 조인한다(§2의 statement 패턴 미러). 타입은 전부 Gauge.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `llm_process_running` | `env`, `node`, `gpu`, `pid`, `proc_name`, `os_user` | 실행 중이면 1 (신원 라벨 캐리어) |
| `llm_process_memory_bytes` | `pid` | 사용 메모리 (bytes — 화면은 GB 단위 표시) |
| `llm_process_gpu_percent` | `pid` | GPU 사용률 % |
| `llm_process_cpu_percent` | `pid` | CPU 사용률 % (멀티코어 합산 — 100 초과 가능) |
| `llm_process_start_time_seconds` | `pid` | 시작 시각 (unix epoch 초) |

**노출 규칙**: 프로세스 라벨셋은 **실행 중에만 존재**한다. 종료 시 5개 메트릭 모두 해당 `pid` 라벨셋을 remove()한다. 동시 노출은 최대 12건(GPU당 1워크로드).

> **TSDB 누적 카디널리티**: 신원(pid/os_user)은 **(GPU 슬롯 × 워크로드)에 결정론 고정**한다 — pid가 슬롯·워크로드를 떠돌지 않으므로 누적 라벨셋이 `서비스 4(홈 슬롯 고정) + 배치 4종 × 12슬롯 = 52`개로 상한된다(나머지 4종은 `pid`만 쓰므로 각 52). 이 상한을 바꾸는 변경은 계획 문서를 통해서만 한다.

### 6.2 LLM/AI 서비스 — 화면 ② 테이블

서비스 4종은 **홈 GPU에 고정**돼 라벨셋이 상시 존재한다(각 1개 — 동시·누적 모두 4). 조인 키는 `service`.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `llm_service_tps` | `env`, `service`, `model`, `engine`, `node`, `gpu` | 토큰/초 (RUNNING이 아니면 0). 신원+위치 캐리어 |
| `llm_service_p95_seconds` | `env`, `service` | 지연 P95 (초). **MOCK 근사**: 사전계산 게이지 |
| `llm_service_state` | `env`, `service` | 0=STOPPED, 1=RUNNING, 2=STARTING(재시작 창·대기) |

### 6.3 요청 수·타임라인 — 화면 ③ 타임라인·④ 선택 구간 상세

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `llm_requests_total` | `env`, `node`, `gpu` | GPU별 누적 완료 요청 수. **타입: Counter** — 서비스 RUNNING 동안 TPS/평균토큰수(27) 비율로 증가. 화면 "요청 수"는 `increase(...[$__range])`. **12개 자식은 기동 시 0으로 선생성** |
| `llm_gpu_timeline_state` | `env`, `node`, `gpu` | 0=Idle, 1~8=아래 워크로드 카탈로그 인덱스 (GPU당 동시 1워크로드) |

카디널리티: 타임라인 12시리즈 고정(상시 존재), 요청 수 12시리즈 고정.

### 6.4 워크로드 카탈로그 (계약의 일부 — 타임라인 인덱스 겸용, ADR-0002 패턴)

| 인덱스 | 표시 라벨(간트) | proc_name | category | 연계 서비스 / 모델 / 엔진 | 부하 강도 | 기준 메모리(GB) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | vLLM (Llama-3.1-70B) | python (vLLM) | vllm | ChatBot-Service / Llama-3.1-70B / vLLM (TPS 185.4, P95 1.28s) | 0.85 | 22.3 |
| 2 | vLLM (CodeLlama-34B) | python (vLLM) | vllm | CodeGen-Service / CodeLlama-34B / vLLM (TPS 112.7, P95 1.05s) | 0.70 | 18.4 |
| 3 | vLLM (RAG-QA-Service) | python (vLLM) | rag | RAG-QA-Service / Mistral-7B / vLLM (TPS 96.3, P95 0.92s) | 0.60 | 12.8 |
| 4 | TensorRT-LLM (Qwen-14B) | python (TensorRT-LLM) | tensorrt | Summarization-Service / Qwen-14B / TensorRT-LLM (TPS 78.5, P95 0.88s) | 0.65 | 14.2 |
| 5 | trainer.py | python (trainer.py) | train | — | 0.90 | 31.8 |
| 6 | preprocess.py | python (preprocess.py) | data | — | 0.35 | 3.1 |
| 7 | dataloader.py | python (dataloader.py) | data | — | 0.40 | 6.2 |
| 8 | eval.py | python (eval.py) | other | — | 0.30 | 4.5 |

`category` 도메인(6종)과 화면 범례·색: vllm=vLLM 추론(초록), train=학습/미세조정(주황), data=데이터 처리(보라), rag=RAG 서비스(청록), tensorrt=TensorRT-LLM(빨강), other=기타(회색) — **기존 쿼리 유형 6색 토큰을 재사용**한다(design-tokens.md, 신규 색 없음). 기준 TPS·P95는 시안 표 수치이며 실행 중 기준값 근처에서 변동한다.

### 6.5 LLM 라이프사이클 (불변식)

1. **GPU 1개에 동시 1워크로드** — 타임라인 1행 1값 의미론(동시 실행 프로세스 상한 = 12).
2. **장수 서비스 4종은 홈 GPU(gpu-server-01의 0~3)에 상주**한다: 상주 세그먼트(로그정규 중앙값 480초, 240~1200초) ↔ 재시작 창(60~240초, `llm_service_state`=2 STARTING, 프로세스 노출 제거·TPS 0)을 반복한다. 재시작 창이 끝났는데 홈 GPU에 배치가 돌고 있으면 **선점 없이** STARTING으로 대기한다.
3. **단명 배치**(카탈로그 5~8)는 노드별 포아송 도착(평균 간격 90/45/70초) → 빈 GPU 배정, 없으면 노드 큐 대기(상한 4, 초과 도착은 버림). 지속은 로그정규 중앙값 150초(60~300초). 재시작 창의 홈 GPU에도 낄 수 있다 — 시안처럼 서비스·배치 막대가 섞인다.
4. **종료 시 프로세스 메트릭 5종의 라벨셋을 remove()** 한다 — 실행 중인 것만 화면에 남는다.
5. **GPU 부하 결합(v3.0, 인간 확정 2026-07-19)**: DCGM 지표의 부하 오프셋은 `max(SQream 쿼리 부하, LLM 워크로드 부하)`다 — LLM 부하는 해당 GPU의 두 MIG 슬롯에 동일 적용된다. **주의: 스키마는 additive지만 기존 DCGM 지표의 값 거동은 이 결합으로 달라질 수 있다**(지배 워크로드가 지표를 결정). max 결합이므로 §5.2의 포화 특성 상한은 기존 최악 사례(load 0.95)를 넘지 않는다.
6. 수집 일관성·재현성은 §5.5-7·§5.6과 동일(같은 락·같은 seed 체계).

## 7. 드릴다운 메트릭 (v4.0, 2026-08-09 — S3-A) — 화면 SQream 상세 10종

**additive-only**: 이 절의 34종은 기존 계약에 이름 충돌 없이 추가된 것이며, §1~§6의 이름·라벨·타입은 불변이다.

**내력**: 이 34종은 원래 `exporter/drilldown_sim.py`가 **계약 밖에서** 직접 만들던 것이다. 그래서 정적 드릴다운 화면(`res/sqream/mockup/*.html`)만 소비할 수 있었고, React가 쓰려 하면 `web/tests/queries.contract.test.ts`가 "미계약 메트릭"으로 막았다 — SPA화 S3(정적 10화면을 React 라우트로 흡수)의 실질적 차단 요인이었다. 이제 `metrics.CONTRACT` 한 곳에서 만들어지며 이 문서와 양방향 대사된다.

> **`[MOCK-ONLY]` 표시는 유지한다.** 계약에 편입됐다는 것과 실제 SQream에서 온다는 것은 다른 얘기다. 현장 연동 시 help에 이 표시가 붙은 것부터 실데이터로 대체하면 된다 — 34종 전부가 대상이다.

생산자는 `exporter/drilldown_sim.py`(`DrilldownSimulator`)다. 타입이 Counter인 3종을 뺀 나머지는 Gauge다.

### 7.1 워커·실행 — 화면 Worker Monitoring / Query Analytics / Main Dashboard

실행 중 statement의 **수치**는 `stmt_id`+`worker` 두 키로 조인한다(§2의 신원 라벨과 다른 계열이다 — §2는 탑뷰용 `sqm_statement_*`, 여기는 드릴다운용 `sqm_query_*`). `worker` 라벨이 조인 키에 함께 들어가는 이유는 한 statement가 정확히 워커 하나에서 돌기 때문이고, Grafana `joinByField(stmt_id)`와 PromQL `on(stmt_id, worker)`가 이 규칙에 기대고 있다.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_worker_up` | `node`, `worker`, `service` | 워커가 살아 있으면 1 (`service`는 **대표 큐** — 기본 `sqream` 또는 ETL 전용 `etl_service`. v4.11 실명 개정, 구 `etl` 폐기) |
| `sqm_worker_subscription` | `node`, `worker`, `service` | **v4.11** — 워커가 구독한 서비스 큐마다 시리즈 하나(값 1). 실측 `SHOW_SUBSCRIBED_INSTANCES` 재현: ETL 전용 = {`etl_service`, 자기 이름 큐} — **기본 `sqream` 큐 미구독(완전 격리)**, 일반 = {`select_service`, 자기 이름 큐, `sqream`}. 자기 이름 큐(예: `sqream111`)는 특정 워커 지정 실행용. 정적 구성이라 기동 시 1회 발행(24워커 → 6+63=69시리즈) |
| `sqm_statement_duration_seconds` | `stmt_id`, `worker` | 실행 경과 (초) |
| `sqm_statement_progress_ratio` | `stmt_id`, `worker` | 진행률 0.0~1.0 |
| `sqm_statement_queued` | `node`, `service`, `stmt_id`, `sqream_user`, `qid`, `qid_tags`, `connection_id` | 대기 중 statement **하나가 시리즈 하나**(값 1). `connection_id`(v4.12b)는 세션 Connection ID — 대기 신원(`Q+제출순번`)에서 `9000+순번` 으로 파생(running 의 5000 번대와 구분). **목업 한계**: 배정되면 슬롯 신원으로 바뀌므로 연결 번호도 바뀐다. 노드 합계는 `sum()`으로 얻는다. **`worker`가 없다** — 배정 전이라서 대기 중인 것이고, 지어내면 거짓이 된다. `service`는 제출된 서비스 큐 — v4.11부터 3종: 조회 계열 `select_service` · ETL 적재 `etl_service` · DDL/util 기본 `sqream`(카탈로그 `query_type`에서 파생 — X17 qid 파생 규칙과 동일) |
| `sqm_statement_failed_timestamp` | `stmt_id`, `node`, `worker`, `sqream_user`, `qid`, `qid_tags`, `reason` | 실패한 statement와 그 **사유**. 값은 실패 시각(unix sec)이라 최신순 정렬에 그대로 쓴다. `reason`은 **열거형**이다(`lock_timeout`·`out_of_memory`·`spool_limit`·`connection_lost`·`killed_by_admin`) — 자유 문자열을 라벨에 실으면 시계열이 무한히 늘어난다. exporter가 최근 12건만 남기고 오래된 것은 시리즈까지 지운다 |
| `sqm_query_cpu_percent` | `stmt_id`, `worker` | CPU 사용률 % |
| `sqm_query_gpu_percent` | `stmt_id`, `worker` | GPU 사용률 % |
| `sqm_query_memory_bytes` | `stmt_id`, `worker` | 사용 메모리 (bytes) |
| `sqm_query_data_scanned_bytes` | `stmt_id`, `worker` | 스캔한 데이터량 (bytes) |
| `sqm_query_spool_bytes` | `stmt_id`, `worker` | 디스크 스필 (bytes, 0이면 스필 없음) |
| `sqm_slow_query_total` | `node` | 느린 쿼리 누적 건수 (**Counter**) |
| `sqm_cache_hit_ratio` | (없음) | 캐시 적중률 % (클러스터 단일 값 — 라벨 없음) |

### 7.2 세션 — 화면 Session Monitoring

세 메트릭이 같은 라벨셋을 공유한다. 세션은 워커 하나에 접속하므로 `worker`가 라벨에 있고, 화면은 이 값을 그대로 쓴다(예전에 세션 ID 해시로 워커를 지어내던 것을 2026-08-08에 걷어냈다).

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_session_active` | `session_id`, `sqream_user`, `node`, `worker` | 접속 중이면 1 (신원 라벨 캐리어) |
| `sqm_session_start_time_seconds` | `session_id`, `sqream_user`, `node`, `worker` | 세션 시작 시각 (unix seconds) |
| `sqm_session_running_queries` | `session_id`, `sqream_user`, `node`, `worker` | 이 세션이 돌리는 쿼리 수 |

### 7.3 테이블 사용량·활동 — 화면 Table Usage / Table Activity

테이블 식별자는 **`db`+`schema`+`table` 세 라벨**이다. `public` 스키마가 여러 DB에 걸쳐 있으므로 `db`를 빼면 행을 특정할 수 없다(2026-08-09 Grafana 표에서 실제로 문제가 됐다).

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_table_rows` | `db`, `schema`, `table` | 행 수 |
| `sqm_table_chunk_count` | `db`, `schema`, `table` | 청크 수 |
| `sqm_table_size_bytes` | `db`, `schema`, `table` | 원본 크기 (bytes) |
| `sqm_table_compressed_bytes` | `db`, `schema`, `table`, `compression` | 압축 후 크기 (bytes, `compression`은 알고리즘명) |
| `sqm_table_fragmentation_ratio` | `db`, `schema`, `table` | 단편화 비율 0.0~1.0 |
| `sqm_table_deleted_rows` | `db`, `schema`, `table` | 논리 삭제된 행 수 (정리 대상) |
| `sqm_table_last_access_timestamp` | `db`, `schema`, `table` | 마지막 접근 시각 (unix seconds) |
| `sqm_table_access_total` | `db`, `schema`, `table`, `access_type` | 접근 누적 건수 (**Counter**, `access_type`은 SELECT/INSERT/COPYFROM/DELETE) |
| `sqm_table_chunks_filled_90pct` | `db`, `schema`, `table` | 단편화율 90% 이상 청크 수 (v4.8 — 단편화율 = 청크 행 수 / 상한 1,048,576 표기, 인간 확정 어휘 2026-08-19. Rechunk 임계 ②의 분자) |
| `sqm_table_chunks_under_80pct` | `db`, `schema`, `table` | 단편화율 80% 미만 청크 수 (v4.8 — Rechunk 임계 ④) |
| `sqm_table_chunks_no_deletion` | `db`, `schema`, `table` | 삭제 레코드 없는 청크 수 = NoDel_Cnt (v4.8 — table_frag_info 유래, Rechunk 임계 ③) |
| `sqm_table_clustering_key` | `db`, `schema`, `table` | clustering key 보유 여부 1/0 (v4.8 — recalculate chunks indexes 대상) |
| `sqm_table_maintenance_progress_ratio` | `db`, `schema`, `table`, `stage` | 유지보수 실행의 전체 진행도 0.0~1.0 (v4.9 — **실행 중에만 존재**, 테이블당 현재 단계 시리즈 하나. `stage`는 고정 enum: `cleanup_chunk`·`rechunk`·`cleanup_extent`·`recalc_index`. 단계 전환·완료 시 이전 시리즈 remove — 알람 시리즈 수명 규약) |

유지보수 배치(매일 새벽 1시, 인간 확정 2026-08-19)의 판정이 이 통계를 소비한다 — **Cleanup Chunk**: `sqm_table_deleted_rows > 0`(delete/update 레코드 존재 테이블). **Rechunk**: 4임계 동시 만족 — ① `rows/chunk_count < 900,000` ② `chunks_filled_90pct/chunk_count < 60%` ③ `chunks_no_deletion ≥ 2` ④ `chunks_under_80pct > 10`. Rechunk 시 Cleanup Extent 동반, 말미에 clustering key 테이블 전체 recalculate chunks indexes. 논리 정합(생산 규약): `deleted == 0 ⇔ chunks_no_deletion == chunk_count`, `filled_90pct + under_80pct ≤ chunk_count`, `rows/chunk_count ≤ 1,048,576`.

### 7.4 스냅샷·락 — 화면 Snapshot & Lock

`sqm_lock_held_seconds`의 `stmt_id`는 §7.1과 같은 어휘이므로 실행 중 문장과 조인된다.
락은 **쓰기 계열**(INS·LOA·DEL·UPD·TRU·DDL·CLE) 실행 문장에만 존재하고(X11 —
SQream 락 모델: SELECT는 락 없음), `lock_id`는 `LOCK-{stmt_id}` 채번이라 누적
카디널리티는 신원 풀 상한(72)을 넘지 않는다. **조인 실패 = orphaned lock**이다 —
crash가 쓰기 문장을 덮치면 락이 문장 사망 후에도 잔존·증가하며, 제거는
REMOVE_LOCK 명령 API뿐이다(command-api.md — 값·수명 의미론이며 라벨·타입 불변).

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_open_snapshot_count` | `node` | 열린 스냅샷 수 |
| `sqm_open_snapshot_age_seconds` | `node`, `snapshot_id` | 스냅샷 경과 시간 (초) |
| `sqm_lock_held_seconds` | `lock_id`, `stmt_id` | 락 보유 시간 (초) |

### 7.5 로그·알람 — 화면 Log Monitoring / Alarms

`sqm_log_entries_total`은 **Counter**다 — 화면은 `increase(...[$range])`로 구간 건수를 구한다. 로그 **원문**은 이 계약 밖이다(실제 시스템에서는 로그 저장소 담당).

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_log_entries_total` | `node`, `level` | 로그 누적 건수 (**Counter**, `level`은 info/warning/error) |
| `sqm_alert_state` | `alertname`, `severity`, `node`, `worker` | 알람 상태 (0=정상, 1=pending, 2=firing). `worker`는 워커 단위 알람만 채워지고 노드·클러스터 레벨은 **빈 문자열**. `alertname`은 값이라 계약 무변경으로 추가된다 — 워커 장애는 유형별 두 이름(X14): `WorkerDown`(crash)·`WorkerUnresponsive`(hang) |
| `sqm_alert_since_timestamp` | `alertname`, `severity`, `node`, `worker` | 현재 상태 진입 시각 (unix seconds) |

### 7.6 시스템 정보 — 화면 System Info

라이선스·버전 정보는 라벨이 없거나(단일 값) 정보성 라벨만 갖는다. `sqm_sw_version_info`는 값이 항상 1인 info 메트릭 관습을 따른다.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `sqm_sw_version_info` | `version`, `build` | 항상 1 (버전 정보 캐리어) |
| `sqm_last_update_timestamp` | (없음) | 마지막 갱신 시각 (unix seconds, 라벨 없음) |
| `sqm_license_expiry_timestamp` | (없음) | 라이선스 만료 시각 (unix seconds, 라벨 없음) |
| `sqm_data_limit_bytes` | (없음) | 라이선스 데이터 한도 (bytes, 라벨 없음) |
| `sqm_data_used_bytes` | (없음) | 라이선스 데이터 사용량 (bytes, 라벨 없음) |

## 8. 호스트 메트릭 (v4.4, 2026-08-10) — 이름은 외부 관습, 값은 시뮬레이션

이 절의 5종은 이름·라벨이 **node_exporter 관습**이다. v4.2까지는 mockup 스택의 외부
수집기(`gpu-node-0N` 컨테이너)가 내는 것을 **소비만** 했는데, 단일 exporter 구성
(네이티브 키트)에는 그 출처가 없어 Main Dashboard·Worker 화면의 CPU/RAM/Disk 패널이
비었다(실제 신고 2026-08-10). v4.4부터 **우리 exporter가 같은 이름으로 시뮬레이션**해
자급한다 — `node_sim.py`, `metrics.CONTRACT` 편입, `[MOCK-ONLY]` help 표기.

**켜고 끄기**: 기본 켜짐. 외부 node_exporter를 함께 긁는 구성(포털 에뮬 —
`prometheus.portal.yml`)에서는 이중 계상이 되므로 `NODE_SIM=0`으로 끈다
(`docker-compose.portal.yml`이 설정).

**라벨 주의**: 아래 라벨은 exporter가 **생산하는** 라벨이다. `instance`·`job`은
Prometheus가 scrape 시점에 붙이므로 여기 없다(소비 쿼리도 그 둘로 필터하지 않는다).
이름 관습의 소유권은 여전히 node_exporter에 있다 — 임의로 바꾸지 않는다.

| 메트릭 | 라벨 | 값 의미 |
| --- | --- | --- |
| `node_cpu_seconds_total` | `node`, `cpu`, `mode` | 노드 CPU 시간 누적 (초). 코어(8)×모드(idle/user/system). tick당 각 모드가 dt를 나눠 가져 코어별 합이 벽시계와 같다. 사용률은 `100 - avg(rate(...{mode="idle"}[1m])) * 100` |
| `node_disk_read_bytes_total` | `node`, `device` | 노드 디스크 읽기 누적 (bytes). NVMe 1대(`nvme0n1`), 5~1200 MB/s 변동 |
| `node_disk_written_bytes_total` | `node`, `device` | 노드 디스크 쓰기 누적 (bytes). 2~800 MB/s 변동 |
| `node_memory_MemTotal_bytes` | `node` | 노드 물리 메모리 총량 (bytes) — 512 GiB 고정 |
| `node_memory_MemAvailable_bytes` | `node` | 노드 가용 메모리 (bytes). 사용률은 `(1 - sum(avail) / sum(total)) * 100` — **`MemFree`가 아니라 `MemAvailable`**이다. 캐시·버퍼는 필요하면 회수되므로 `MemFree`로 재면 상시 90%대가 나와 쓸모가 없다 |

`up`은 Prometheus가 스크레이프마다 자동 생성하는 합성 메트릭이라 이 표에 넣지 않는다
(라벨 `job`·`instance`).

> **v4.3 (2026-08-10)** — `sqm_statement_queued`의 라벨을 `node` 1개에서 6개로 넓히고
> `sqm_statement_failed_timestamp`를 추가했다. Session Statistics의 `Queued Queries`·
> `Failed Queries` 카드를 눌렀을 때 **어느 쿼리인지·왜 실패했는지**를 보여 주기 위해서다
> (인간 지시). 노드 합계만 있으면 "3건 대기"까지만 알 수 있었다.
>
> **소비자 영향**: `sum(sqm_statement_queued)`는 그대로 동작한다. 라벨이 늘어난 것뿐이라
> 기존 집계는 무수정이다. 다만 **원시 시리즈를 그대로 그리던 소비자는 줄 수가 늘어난다.**
>
> **생산자 이동**: 이 메트릭은 원래 `drilldown_sim.py`가 노드 단위로 만들었는데, 실제 큐를
> 들고 있는 `query_sim.py`로 옮겼다. 같은 메트릭에 진원지가 둘이면 어느 쪽이 맞는지 알 수 없다.

## 마이그레이션/버전 전략

- 메트릭 이름·라벨·**타입** 변경은 본 문서 개정 + `exporter/tests/test_contract.py` 갱신 + 계획 문서 기록으로만 진행한다(§5.1 계약 절차).
- **개정 이력**
  - **v4.12 (2026-09-07, Phase X18 — 인간 지시 "ㅇㅇ 진행해")** — `sqm_statement_running` 에 `connection_id` 라벨 **additive 추가**(§2). 세션 Connection ID 를 `stmt_id` 에서 결정론 파생(`sim_params.connection_id`, 5000+신원 순번, 72종 1:1) — 누적 라벨셋 상한 72 불변, 메트릭 이름·타입·다른 라벨 불변. 소비자: web 실행 쿼리 표 Connection ID 열(TV-C3 `runningStatements.identity` by() 확장). Grafana(TV-C2)는 이 라벨을 쓰지 않아 무변경.
  - **v4.12b (2026-09-07, Phase X18 후속 — 인간 지시 "ㅇㅇ 진행해")** — `sqm_statement_queued` 에도 `connection_id` 라벨 **additive 추가**(§7.1). 배정 전(worker 없음)에도 세션 연결은 존재하므로 `sim_params.connection_id(stmt_id)` 가 대기 신원 `Q…` 은 `9000+순번` 으로 파생(1:1 — 시리즈 수는 stmt_id 와 동일, 누적 카디널리티 불변). 배정 시 신원이 바뀌므로 연결 번호도 바뀌는 목업 한계는 §7.1 에 기록. 소비자 무변경(web 은 `count()` 만, Grafana 미사용).
  - **v4.11 (2026-08-25, E5 — 인간 승인)** — **워커 구독 모델 실명화**(실측 `SHOW_SUBSCRIBED_INSTANCES` 반영). ① `sqm_worker_subscription{node,worker,service}` **additive 신설**(§7.1) — 구독 큐마다 1, 정적 69시리즈. ② `service` 라벨 **값 어휘 개정**: `etl` → `etl_service`(worker_up 대표 큐·statement 계열), 제출 큐 3종 분화 `select_service`/`etl_service`/`sqream`(queued·running — 카탈로그 read→select_service, etl→etl_service, util→sqream 파생). 라벨 **이름·타입 불변**, 누적 카디널리티 상한 불변(§2b 342 — 일반 21슬롯이 select_service·sqream 둘 다 구독하므로 슬롯당 카탈로그 조합은 그대로다). 소비자 동시 개정: web Worker Monitoring(구독 메트릭 소비)·값 비교 `etl`→`etl_service`.
  - **v4.10 (2026-08-21, Phase X17 — 인간 확정)** — **쿼리 카탈로그 2종 additive 확장**(§3·§5.4): `Daily_Order_Insert`(idx 7)·`Stale_Orders_Purge`(idx 8), 둘 다 `query_type="etl"`(도메인 6종 불변). 타임라인 값역 1~6 → **1~8**(§4). **메트릭 이름·라벨·타입은 전부 불변** — 소비자 동시 개정: Grafana 타임라인 value mapping(TV-C2 재생성)·web `CATALOG`(TV-C3). QID 채번 `INS-02L`·`DEL-05M`(qid.py `_BY_NAME`). 누적 상한 개정: rows/s 144→192, §2b 324→342(phase ×4=1,368).
  - v1.0 — 최초 계약 (정적 데이터).
  - v1.1 (2026-07-15) — `sqm_query_executions_total` 추가(당시 Gauge).
  - **v1.2 (2026-07-15, Phase 5)** — 동적 시뮬레이션 전환에 맞춰 `sqm_query_executions_total`을 **Gauge → Counter**로 변경. 소비 측(Grafana) 쿼리도 `sum(max_over_time(...))` → `sum(increase(...[$__range]))`로 함께 마이그레이션했다. 그 밖의 메트릭 이름·라벨은 불변이므로 나머지 대시보드 쿼리는 무수정이다.
  - **v2.0 (2026-07-17)** — **H200 4장 × MIG 2분할(3g.71gb) 토폴로지 전환** (인간 지시). `mig` 라벨을 gpu 계열 9개 메트릭에 추가(**라벨 스키마 변경 — 소비자 마이그레이션 필요**: `by(node,gpu)` 집계는 `by(node,gpu,mig)`로), `modelName` "NVIDIA H200", FB 총량 40960→72704 MiB(MIG당), 전력 범위 60~400→30~350W(MIG 슬롯당), 카디널리티 12→24 / 36→72 / 72→144, 도착 간격 22/35/60→11/18/30초. **구 v1.x 시계열(mig 라벨 없음)은 갱신이 멈춘 채 retention 동안 잔존**하므로 전환 시 TSDB를 비우는 것을 권장한다.
  - **v3.0 (2026-07-19, Phase L1 — DEF-U1 해제)** — **LLM 메트릭 10종 additive 추가**(§6). 기존 메트릭의 이름·라벨·타입은 불변이므로 **기존 소비자(두 대시보드·web GPU 화면)는 무수정**이다. 단, GPU 부하 결합(§6.5-5, max)으로 기존 DCGM 지표의 **값 거동**은 달라질 수 있다(인간 확정). 신규 시계열 누적 총합 3백 미만.
  - **v4.0 (2026-08-09, S3-A)** — **드릴다운 메트릭 33종 additive 편입**(§7). 원래 `drilldown_sim.py`가 계약 밖에서 만들던 것을 `metrics.CONTRACT`로 옮겼다. 기존 메트릭의 이름·라벨·타입은 불변이므로 **기존 소비자(두 대시보드·web GPU/LLM 화면·정적 드릴다운 10화면)는 무수정**이다. 노출되는 시계열 자체도 이전과 동일하다 — 만드는 위치만 바뀌었다. 목적은 SPA화 S3에서 React가 이 메트릭을 계약 안에서 소비할 수 있게 하는 것이다.
  - **v4.9 (2026-08-19, Phase X10-f3 — 인간 확정)** — **유지보수 진행도 1종 additive 추가**(§7.3): `sqm_table_maintenance_progress_ratio`(`stage` 고정 enum 4값). 기간형 실행 시뮬(Cleanup ~15s, Rechunk ~30s 3단계)의 Progress·진행단계 표시용. 실행 중에만 존재·전환 시 remove. 기존 메트릭 불변, 소비자는 React Table Usage뿐. 누적 시계열 ≤ 8×4=32. 같은 개정에서 §7.3의 "충전율" 표기를 "단편화율"로 교체(인간 확정 어휘 — 수치·메트릭 이름 불변).
  - **v4.8 (2026-08-19, Phase X10 — 인간 확정)** — **테이블 청크 통계 4종 additive 추가**(§7.3): `sqm_table_chunks_filled_90pct` · `sqm_table_chunks_under_80pct` · `sqm_table_chunks_no_deletion` · `sqm_table_clustering_key`. 유지보수 배치(매일 01:00)의 Rechunk 4임계·reindex 대상 판정용. 기존 메트릭의 이름·라벨·타입은 불변이므로 **기존 소비자(두 대시보드·web 기존 화면)는 무수정**이다. 소비자는 React Table Usage(TV-C3)뿐, Grafana(TV-C2) 미적용. 누적 시계열 = 테이블 8 × 4 = 32.
  - **v4.7 (2026-08-14, X4-f1 — 인간 지시)** — 생애주기 첫 단계 어휘 개정: `phase` 값 `preparing` → **`compile`** (SQream 생애주기 표기 정합: 컴파일 → 큐 → 초기화 → 실행). 소비자는 X-View 툴팁뿐이라 동시 개정. 구 `preparing` 시계열은 retention 동안 잔존하나 새 조회에서 phase 4종 짝이 안 맞아 해당 이벤트만 "단계 정보 없음"으로 표시된다(점은 유지).
  - **v4.6 (2026-08-14, Phase X3 — 툴팁 생애주기)** — **`sqm_statement_completed_phase_seconds` 1종 additive 추가**(§2b): 완료 이벤트의 단계별 소요(phase 4값). 기존 메트릭·`reason` 열거형 불변, 소비자는 X-View 호버 툴팁뿐(TV-C2 미적용). 누적 시계열 ≤ 1,296.
  - **v4.5 (2026-08-13, Phase X1 — X-View)** — **완료 이벤트 메트릭 2종 additive 추가**(§2b): `sqm_statement_completed_timestamp` · `sqm_statement_completed_duration_seconds`. 기존 메트릭의 이름·라벨·타입은 불변이므로 **기존 소비자(두 대시보드·web 기존 화면)는 무수정**이다. 소비자는 React X-View 패널(TV-C3, Phase X2)뿐이며 Grafana(TV-C2)에는 적용하지 않는다(인간 확정). 누적 시계열 ≤ 324×2.
- **소비자 영향**: Counter 전환 시 기존 시계열은 값이 큰 Gauge 샘플 뒤에 0부터 시작하는 Counter 샘플이 붙는다. `increase()`는 카운터 리셋을 보정하므로 구간 값은 정상이나, 전환 시점을 포함하는 구간에서는 과도값이 나올 수 있다 — 전환 시 TSDB를 비우거나 전환 시점 이후 구간만 신뢰한다.
