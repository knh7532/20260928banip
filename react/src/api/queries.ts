/**
 * PromQL 정의 — **이 파일이 유일한 정의처**다 (AGENTS.md §5 계층 규칙).
 * 컴포넌트는 PromQL 문자열을 직접 만들지 않는다.
 *
 * 메트릭·라벨은 형제 프로젝트의 계약(TV-C1)을 **소비만** 한다.
 * `tests/queries.contract.test.ts`가 `queryRegistry()`(아래)를 통해 앱이 실제로 쓰는
 * 전 쿼리를 검사하므로, 새 쿼리를 추가하면 자동으로 계약 대사 대상이 된다.
 *
 * instant vs range (형제 프로젝트 Phase 5 교훈):
 *   - **상태·신원**(실행 중 쿼리, 현재 상태, 쿼리 ID)은 **instant** — 구간 집계로 뽑으면
 *     이미 끝난 쿼리가 되살아나 "실행 중"처럼 보이고, 신원 재사용 시 조인이 깨진다.
 *   - **시계열·타임라인**은 range.
 *   - **구간 집계**(평균/합/증가분)는 `[range]` 창 함수를 instant로 평가한다.
 */

/** 서버·GPU·MIG 필터. 빈 배열이면 전체(All). */
export interface Filters {
  env: string;
  instances: string[];
  gpus: string[];
  migs: string[];
}

export const NODES = ["gpu-server-01", "gpu-server-02", "gpu-server-03"] as const;
export type NodeName = (typeof NODES)[number];

/** 카탈로그 인덱스(타임라인 값) → 쿼리 정보. 계약(TV-C1)의 카탈로그와 동일. */
export const CATALOG: Record<number, { name: string; type: string; database: string }> = {
  1: { name: "Sales_Aggregation", type: "aggregation", database: "sales_db" },
  2: { name: "Customer_Join", type: "join", database: "crm_db" },
  3: { name: "ETL_Load_Daily", type: "etl", database: "staging_db" },
  4: { name: "Fraud_Detection_Scan", type: "fullscan", database: "risk_db" },
  5: { name: "Group_By_Region", type: "select", database: "sales_db" },
  6: { name: "Vacuum_Maintenance", type: "other", database: "dw_master" },
  // X17 (TV-C1 v4.10): 카탈로그 확장 2종 — 유형 축은 기존 6종 그대로(etl)
  7: { name: "Daily_Order_Insert", type: "etl", database: "sales_db" },
  8: { name: "Stale_Orders_Purge", type: "etl", database: "sales_db" },
};

/** query_type → 화면 표기 (원본 시안 범례). */
export const QUERY_TYPE_LABEL: Record<string, string> = {
  select: "SELECT 조회",
  etl: "ETL 적재",
  aggregation: "집계",
  join: "JOIN 쿼리",
  fullscan: "풀스캔",
  other: "기타",
};

/** query_state 값 → 화면 표기 (SQream statement 상태). */
export const QUERY_STATE_LABEL: Record<number, string> = {
  0: "Initializing",
  1: "In Process",
  2: "In Queue",
};

/**
 * 라벨 값을 PromQL 정규식 매처에 안전하게 넣는다 (CDX-R2-01).
 *
 * 두 계층을 **모두** 이스케이프해야 한다:
 *   1. PromQL 문자열 리터럴 — `\`와 `"`를 이스케이프하지 않으면 따옴표를 닫고
 *      임의 식을 주입할 수 있다(URL 쿼리스트링에서 필터가 오므로 신뢰 불가 입력이다).
 *   2. RE2 정규식 — 메타문자가 의도치 않은 매칭을 만들지 않도록.
 *
 * 순서가 중요하다: 먼저 정규식 이스케이프(백슬래시 추가) → 그 결과를 문자열 리터럴로
 * 이스케이프(백슬래시·따옴표를 다시 이스케이프).
 */
export function escapeLabelValue(raw: string): string {
  // 개행·제어문자(코드 < 32) 제거 — 정규식 리터럴에 제어문자를 넣지 않도록 코드로 거른다
  let cleaned = "";
  for (const ch of raw) {
    if (ch.codePointAt(0)! >= 0x20) cleaned += ch;
  }
  const regexEscaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return regexEscaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function alternation(values: readonly string[]): string {
  return values.length === 0 ? ".*" : values.map(escapeLabelValue).join("|");
}

/**
 * 어떤 시계열도 만족할 수 없는 **모순 매처**. 선택이 공집합일 때 쓴다.
 *
 * `gpu=~".+"`(비어 있지 않음)와 `gpu!~".+"`(비어 있음)를 동시에 요구하므로 항상 공집합이다.
 * PromQL은 같은 라벨에 매처를 여러 개 허용하고 AND로 결합한다.
 *
 * `$^`를 쓰면 안 된다 — RE2에서 그 위치는 시작이면서 끝이라 **빈 문자열과 일치**하고,
 * PromQL에서 빈 값을 허용하는 매처는 **그 라벨이 아예 없는 계열까지 선택**한다.
 * 실측(2026-08-08, 계약 대사용 Prometheus):
 *   `count(sqm_query_p95_seconds{gpu=~"$^"})` = 6  ← `gpu=~".*"`와 동일 (무효)
 *   `count(sqm_query_p95_seconds{gpu=~".+", gpu!~".+"})` = 0  ← 의도대로
 * `sqm_query_p95_seconds`는 `gpu` 라벨이 없는 실제 사용 메트릭이므로 이 차이가 화면에 드러난다.
 * (CDX-H-03 → CDX-H2-01)
 */
const NEVER_MATCH_CLAUSE = 'gpu=~".+", gpu!~".+"';

/**
 * Worker 필터 값(평탄화 슬롯 0~7)을 실제 라벨 도메인으로 되돌린다.
 *
 * UI의 Worker 드롭다운은 서버당 8슬롯을 0~7로 다루지만 원시 `mig` 라벨은 `0|1`뿐이다.
 * 슬롯을 그대로 `mig=~"..."`에 넣으면 slot 2 이상에서 매칭이 0건이 되어 화면이 통째로 비었다
 * (2026-08-08 수정). slot = gpu*2 + mig 이므로 두 성분으로 분해해 각각의 라벨에 싣는다.
 *
 * **선택이 공집합이면 `empty`를 반환한다.** 예전에는 GPU 선택과 Worker 선택이 어긋나면
 * (예: `gpu=["0"]` + `slot=[2]`) 교집합이 빈 배열이 되고 `alternation([])`이 `.*`를 만들어
 * **전체 GPU가 잡혔다** — 사용자가 좁힌 결과가 오히려 넓어지는 위험한 확대였다
 * (CDX-H-03, 2026-08-08).
 *
 * 알려진 한계: 라벨 매처는 축마다 독립이라 선택이 (gpu × mig) 직사각형을 이루지 않으면
 * 넓게 잡힌다. 예: `{slot0(g0m0), slot3(g1m1)}` → `gpu=~"0|1", mig=~"0|1"` (4칸).
 * 한 셀렉터로 축 간 OR을 표현할 수 없기 때문이며, 정확히 잡으려면 계약에 슬롯 라벨을
 * 추가하거나 UI를 직사각형 선택으로 제한해야 한다 → plan.md ESC-H8.
 */
function slotFilter(f: Filters): {
  gpus: readonly string[];
  migs: readonly string[];
  empty: boolean;
} {
  const slots = f.migs.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 7);
  if (slots.length === 0) return { gpus: f.gpus, migs: [], empty: false };

  const slotGpus = [...new Set(slots.map((s) => String(Math.floor(s / 2))))];
  const migs = [...new Set(slots.map((s) => String(s % 2)))];
  const gpus = f.gpus.length === 0 ? slotGpus : f.gpus.filter((g) => slotGpus.includes(g));
  // 교집합이 비었다 = 사용자가 서로 배타적인 GPU·Worker를 골랐다. 전체로 넓히지 않고
  // "결과 없음"이 되도록 한다.
  return { gpus, migs, empty: gpus.length === 0 };
}

/** `env=~"...", node=~"...", gpu=~"...", mig=~"..."` — 전 패널 공통 셀렉터. */
export function selector(f: Filters): string {
  const { gpus, migs, empty } = slotFilter(f);
  const head =
    `env=~"${escapeLabelValue(f.env)}", ` +
    `node=~"${alternation(f.instances)}"`;
  // 선택이 배타적이면 모순 매처로 확실히 공집합을 만든다. gpu·mig 값만 좁히는 것으로는
  // 부족하다 — 그 라벨이 아예 없는 메트릭이 통과해 버린다(CDX-H2-01).
  if (empty) return `${head}, ${NEVER_MATCH_CLAUSE}`;
  return `${head}, gpu=~"${alternation(gpus)}", mig=~"${alternation(migs)}"`;
}

/** 구간 창 문자열 — 너무 좁으면 집계가 비므로 최소 60초. */
export function windowOf(rangeSec: number): string {
  const sec = Number.isFinite(rangeSec) ? Math.floor(rangeSec) : 0;
  return `${Math.max(60, sec)}s`;
}

// ── 필터바 옵션 (라벨 값) ────────────────────────────────────────────────
export const labelValueMatchers = {
  env: () => "DCGM_FI_DEV_GPU_UTIL",
  node: (env: string) => `DCGM_FI_DEV_GPU_UTIL{env=~"${escapeLabelValue(env)}"}`,
  gpu: (env: string, instances: string[]) =>
    `DCGM_FI_DEV_GPU_UTIL{env=~"${escapeLabelValue(env)}", node=~"${alternation(instances)}"}`,
  mig: (env: string, instances: string[], gpus: string[]) =>
    `DCGM_FI_DEV_GPU_UTIL{env=~"${escapeLabelValue(env)}", ` +
    `node=~"${alternation(instances)}", gpu=~"${alternation(gpus)}"}`,
} as const;

// ── ① 실행 중인 SQream DB 쿼리 (instant, stmt_id로 조인) ─────────────────
export function runningStatements(f: Filters) {
  const s = selector(f);
  return {
    /* X8: worker·service·qid·qid_tags를 by()에 추가 — 전부 sqm_statement_running의
       계약 라벨이다(db-schema §1). qid는 상태 단계 판정(currentPhase)의 시드라
       드릴다운과 같은 판정을 받으려면 반드시 실측해야 한다. */
    /* X18(v4.12): connection_id — 세션 Connection ID(계약 라벨, stmt_id 결정론 파생) */
    identity: "max by(node, gpu, mig, stmt_id, query_id, sqream_user, worker, service,"
      + ` qid, qid_tags, connection_id) (sqm_statement_running{${s}})`,
    memory: "max by(stmt_id) (sqm_statement_memory_bytes)",
    gpuPct: "max by(stmt_id) (sqm_statement_gpu_percent)",
    cpuPct: "max by(stmt_id) (sqm_statement_cpu_percent)",
    startTime: "max by(stmt_id) (sqm_statement_start_time_seconds)",
    // X8: 런타임·진행률 — 상태 컬럼과 팝업 라이브 갱신(pollLive)의 원천.
    duration: "max by(stmt_id) (sqm_statement_duration_seconds)",
    progress: "max by(stmt_id) (sqm_statement_progress_ratio)",
    /* 2026-09-04 16열 표(목업 이식): Disk Spool·Lock Type·VRAM. spool/lock 은 stmt_id 조인,
       VRAM 은 슬롯(node/gpu/mig)의 DCGM FB_USED — 1 워커 = 1 쿼리라 그 문장의 GPU 메모리다. */
    spool: "max by(stmt_id) (sqm_query_spool_bytes)",
    lock: "max by(stmt_id) (sqm_lock_held_seconds)",
    fbUsed: `max by(node, gpu, mig) (DCGM_FI_DEV_FB_USED{${s}})`,
  };
}

// ── ② SQL 쿼리 성능 정보 (instant, query_name으로 조인) ──────────────────
export function queryPerformance(f: Filters) {
  const s = selector(f);
  const env = `env=~"${escapeLabelValue(f.env)}"`;
  return {
    rows: `max by(query_name, query_type, database, node, gpu, mig) (sqm_query_rows_per_second{${s}})`,
    p95: `max by(query_name) (sqm_query_p95_seconds{${env}})`,
    state: `max by(query_name) (sqm_query_state{${env}})`,
  };
}

// ── ③ 타임라인 (range — 세그먼트를 그리려면 구간 시계열이 필요) ───────────
export function timeline(f: Filters): string {
  return `sqm_gpu_timeline_state{${selector(f)}}`;
}

// ── ③b X-View 완료 이벤트 (range — 계약 §2b, Phase X2) ────────────────────
// exporter는 최근 COMPLETED_KEEP=60건 링만 노출하므로 **instant 금지** — range
// 응답에서 (라벨셋, 값=종료 epoch) 전환을 lib/xview.ts가 복원한다 (XR-02).
export function xviewEvents(f: Filters) {
  const s = selector(f);
  return {
    endTimestamp: `sqm_statement_completed_timestamp{${s}}`,
    duration: `sqm_statement_completed_duration_seconds{${s}}`,
    // v4.6 (X3): 단계별 소요 — 호버 툴팁의 생애주기 막대 원천 (phase 4시리즈/이벤트)
    phases: `sqm_statement_completed_phase_seconds{${s}}`,
  };
}

// ── ④ GPU 시계열 4종 (range) ────────────────────────────────────────────
export function gpuTimeseries(f: Filters) {
  const s = selector(f);
  return {
    utilization: `DCGM_FI_DEV_GPU_UTIL{${s}}`,
    memory:
      `DCGM_FI_DEV_FB_USED{${s}} / ` +
      `(DCGM_FI_DEV_FB_USED{${s}} + DCGM_FI_DEV_FB_FREE{${s}}) * 100`,
    temperature: `DCGM_FI_DEV_GPU_TEMP{${s}}`,
    power: `DCGM_FI_DEV_POWER_USAGE{${s}}`,
  };
}

// ── ④b All 뷰 노드 평균 시계열 (range — R9 F2.2) ────────────────────────
// 인스턴스 미선택(All)이면 24슬롯 개별선 대신 노드 평균 3선을 그린다 — 4색 반복
// 24선은 식별 불가(밴드처럼 뭉개짐). 상세(슬롯 8선)는 서버 선택 시 본다.
export function gpuTimeseriesAvg(f: Filters) {
  const s = selector(f);
  return {
    utilization: `avg by(node) (DCGM_FI_DEV_GPU_UTIL{${s}})`,
    memory:
      `avg by(node) (DCGM_FI_DEV_FB_USED{${s}} / ` +
      `(DCGM_FI_DEV_FB_USED{${s}} + DCGM_FI_DEV_FB_FREE{${s}})) * 100`,
    temperature: `avg by(node) (DCGM_FI_DEV_GPU_TEMP{${s}})`,
    power: `avg by(node) (DCGM_FI_DEV_POWER_USAGE{${s}})`,
  };
}

// ── ⑤ 서버 요약 카드 (instant, 노드 고정) ───────────────────────────────
export function serverCard(node: NodeName) {
  const n = `node="${escapeLabelValue(node)}"`;
  return {
    utilization: `avg(DCGM_FI_DEV_GPU_UTIL{${n}})`,
    memory:
      `avg(DCGM_FI_DEV_FB_USED{${n}} / ` +
      `(DCGM_FI_DEV_FB_USED{${n}} + DCGM_FI_DEV_FB_FREE{${n}})) * 100`,
    temperature: `avg(DCGM_FI_DEV_GPU_TEMP{${n}})`,
    power: `sum(DCGM_FI_DEV_POWER_USAGE{${n}})`,
  };
}

// ── 사이드바 서버 목록 (instant — 하드코딩 금지, 메트릭에서 산출) ─────────
export function serverStatus(node: NodeName) {
  const n = `node="${escapeLabelValue(node)}"`;
  return {
    // v2.0(MIG): 시리즈 수 = MIG 슬롯 수(8). 물리 GPU 수는 gpu 라벨 고유 수(4).
    gpuTotal: `count(count by(gpu) (DCGM_FI_DEV_GPU_UTIL{${n}}))`,
    migTotal: `count(DCGM_FI_DEV_GPU_UTIL{${n}})`,
    /* "사용 중"은 **워크로드 합집합**이다 — SQream(`sqm_*`, MIG 단위) 또는
       LLM(`llm_*`, GPU 단위) 어느 쪽이든 활동하면 그 슬롯은 사용 중이다.
       예전엔 sqm만 세서, LLM 추론으로 util 80%인 GPU가 사이드바에서는 노는 것으로
       나왔다(인간 신고 2026-08-10 — 실측: util>30% 슬롯 6개인데 busy 3).

       합집합은 벡터 `+`(내부 조인)가 아니라 **`or` 뒤 `max by` 접기**로 만든다.
       `+`는 한쪽 계열이 없으면 다른 쪽 활동까지 버리고, `or vector(0)`이 그 실패를
       "busy 0"으로 위장한다(codex N5-1). `or`의 두 피연산자는 라벨 차원이 달라
       (mig 유/무) 서로를 가리지 않고 전부 살아남고, `max by`가 단위로 접는다.
       한 계열이 통째로 없으면 남은 계열만으로 정확히 동작한다. */
    // MIG 슬롯 단위 — 탑뷰 사이드바(`usageUnit="MIG"`). LLM(GPU 단위)은 DCGM을
    // 슬롯 인벤토리 삼아 두 MIG로 전개한다 — 조정자(main.py)가 LLM 부하를 두 MIG에
    // 동일 적용하는 것과 같은 규칙. DCGM이 없으면 화면 전체가 죽는 구성이므로
    // 인벤토리 조인의 전제로 삼아도 안전하다.
    // DCGM의 `modelName` 라벨을 일부러 **유지**한다: `or`의 양쪽 라벨 차원이 같아지면
    // 0값 sqm 시리즈가 같은 라벨셋의 LLM 전개분을 가린다(or는 LHS 우선). 차원이
    // 다르면 전부 살아남고, 바깥 `max by`가 mig 단위로 접으며 합집합이 된다.
    gpuBusy:
      `count(max by(env, node, gpu, mig) (` +
      `(sqm_gpu_timeline_state{${n}} > bool 0)` +
      ` or (DCGM_FI_DEV_GPU_UTIL{${n}} * 0` +
      ` + on(env, node, gpu) group_left()` +
      ` (max by(env, node, gpu) (llm_gpu_timeline_state{${n}}) > bool 0))` +
      `) > 0) or vector(0)`,
    /* 물리 GPU 단위 — 드릴다운 사이드바(`usageUnit="GPU"`)가 쓴다.
       분자를 MIG(8)로, 분모를 GPU(4)로 재는 바람에 **"8 / 4 GPU 사용 중"**이
       떴다(인간 지적 2026-08-10). 한 GPU의 두 MIG 중 하나만 살아 있어도 그 GPU는
       사용 중이므로 `max by(gpu)`로 접는다. */
    gpuBusyByGpu:
      `count(max by(env, node, gpu) (` +
      `(sqm_gpu_timeline_state{${n}} > bool 0)` +
      ` or (max by(env, node, gpu) (llm_gpu_timeline_state{${n}}) > bool 0)` +
      `) > 0) or vector(0)`,
  };
}

// ── ⑥ KPI 스트립 (instant — R9 F1.1: 이상 유무를 3초 안에 판단할 요약) ────
export function kpi(f: Filters) {
  const s = selector(f);
  const env = `env=~"${escapeLabelValue(f.env)}"`;
  return {
    // `> 0`/`== 2` 필터는 빈 벡터가 될 수 있어 0 폴백이 필요하지만, `or vector(0)`은
    // **시리즈 부재(exporter 장애)까지 0으로 위장**한다 (CDX-R9 2차). `0 * count(원본)`은
    // 원본이 있을 때만 0을 만들므로 "활동 0"과 "데이터 없음"(NaN → "-")이 구분된다.
    migActive:
      `count(sqm_gpu_timeline_state{${s}} > 0) or ` +
      `(0 * count(sqm_gpu_timeline_state{${s}}))`,
    migTotal: `count(sqm_gpu_timeline_state{${s}})`,
    // In Queue는 **환경 전체** 값이다 (CDX-R9): `sqm_query_state`의 계약 라벨은
    // env/query_name/query_type/database뿐 — 위치(node/gpu/mig) 라벨이 없고, 대기 중
    // 쿼리는 슬롯 미배정이라 rows 조인으로 걸러도 부정확하다. UI가 "(환경 전체)"로 명시한다.
    inQueue: `count(sqm_query_state{${env}} == 2) or (0 * count(sqm_query_state{${env}}))`,
    rowsPerSecond: `sum(sqm_query_rows_per_second{${s}})`,
    // P95는 활동 중(rows>0) 쿼리만 평균 — 카탈로그 6종 전부 평균 금지 (CDX-R4, rangeDetail과 동일 원칙)
    p95: `avg(sqm_query_p95_seconds{${env}} and on(query_name) (max by(query_name) (sqm_query_rows_per_second{${s}}) > 0))`,
    /* X8 요약 카드: 대기 **statement 수**(위 inQueue는 카탈로그 쿼리 수 — 다른 축).
       `sqm_statement_queued`의 계약 라벨은 node/service/stmt_id/sqream_user/qid/qid_tags/connection_id(v4.12b)
       — env·gpu·mig가 없어 selector(f)를 쓰면 계약 대사가 깨진다: node 매처만 건다
       (UI가 "(인스턴스 필터만 적용)"으로 명시). 대기 문장은 한 건=시리즈 1개라
       "대기 0 = 시리즈 부재"다 — 자기 자신으론 0 앵커를 못 만드니 **상시 존재하는
       인벤토리 계열**(sqm_worker_up, 워커 24종 상수)로 앵커한다: exporter가 죽으면
       둘 다 비어 NaN("-")이 되고, 살아 있고 큐만 비면 0이다. `or vector(0)`은
       시리즈 부재(장애)까지 0으로 위장해 KPI 결측 원칙과 충돌한다(codex X8-02). */
    queuedCount: `count(sqm_statement_queued{node=~"${alternation(f.instances)}"})`
      + ` or (0 * count(sqm_worker_up{node=~"${alternation(f.instances)}"}))`,
  };
}

// ── 선택 구간 상세 (instant — 상태·신원은 시점, 집계는 [window] 창) ───────
export function rangeDetail(f: Filters, rangeSec: number) {
  const s = selector(f);
  const env = `env=~"${escapeLabelValue(f.env)}"`;
  const win = windowOf(rangeSec);
  // 활성 필터(선택 끝 시각 기준): 카탈로그·GPU 시리즈는 Idle에도 값 0으로 상시 존재하므로,
  // 값을 보지 않고 라벨만 세면 전량이 잡힌다 (CDX-R4). 상태·신원은 instant 규칙이므로
  // 구간 함수 대신 `> 0`으로 활동 중인 것만 남긴다(serverStatus.gpuBusy와 같은 방식).
  const activeQueries = `max by(query_name) (sqm_query_rows_per_second{${s}}) > 0`;
  return {
    // 활성 슬롯 (끝 시각에 실행 중인 node/gpu/mig) — 개수는 응답 시리즈 수
    gpuState: `max by(node, gpu, mig) (sqm_gpu_timeline_state{${s}}) > 0`,
    // 끝 시각에 실행 중인 서로 다른 query_id
    queryIds: `max by(query_id) (sqm_statement_running{${s}}) > 0`,
    // rows/s는 **시점별로 먼저 sum한 뒤** 구간 평균을 낸다 (CDX-R2-06):
    // 쿼리가 GPU를 옮기면 라벨셋이 교체되는데, sum(avg_over_time(...))으로 하면
    // 과거·현재 라벨셋의 평균이 모두 더해져 값이 부풀려진다.
    rowsPerSecond: `avg_over_time((sum(sqm_query_rows_per_second{${s}}))[${win}:])`,
    // P95는 **활동 중인 쿼리**의 것만 창 평균낸다(카탈로그 6종 전부 평균 금지, CDX-R4).
    p95: `avg(avg_over_time(sqm_query_p95_seconds{${env}}[${win}]) and on(query_name) (${activeQueries}))`,
    queryCount: `sum(increase(sqm_query_executions_total{${s}}[${win}]))`,
    memoryBytes: `sum(sqm_statement_memory_bytes * on(stmt_id) group_left() sqm_statement_running{${s}})`,
    // 활동 중(rows>0)인 데이터베이스만
    databases: `max by(database) (sqm_query_rows_per_second{${s}}) > 0`,
  };
}

// ═══ LLM 화면 (TV-C1 v3.0 §6 — GPU 단위, mig 없음) ═══════════════════════

/** LLM 워크로드 카탈로그 (타임라인 인덱스 1~8 — 계약 §6.4와 동일). */
export const LLM_CATALOG: Record<
  number,
  { label: string; procName: string; category: string; service?: string; model?: string; engine?: string }
> = {
  1: { label: "vLLM (Llama-3.1-70B)", procName: "python (vLLM)", category: "vllm",
       service: "ChatBot-Service", model: "Llama-3.1-70B", engine: "vLLM" },
  2: { label: "vLLM (CodeLlama-34B)", procName: "python (vLLM)", category: "vllm",
       service: "CodeGen-Service", model: "CodeLlama-34B", engine: "vLLM" },
  3: { label: "vLLM (RAG-QA-Service)", procName: "python (vLLM)", category: "rag",
       service: "RAG-QA-Service", model: "Mistral-7B", engine: "vLLM" },
  4: { label: "TensorRT-LLM (Qwen-14B)", procName: "python (TensorRT-LLM)", category: "tensorrt",
       service: "Summarization-Service", model: "Qwen-14B", engine: "TensorRT-LLM" },
  5: { label: "trainer.py", procName: "python (trainer.py)", category: "train" },
  6: { label: "preprocess.py", procName: "python (preprocess.py)", category: "data" },
  7: { label: "dataloader.py", procName: "python (dataloader.py)", category: "data" },
  8: { label: "eval.py", procName: "python (eval.py)", category: "other" },
};

/** 워크로드 분류 6종 → 화면 범례 표기 (시안). */
export const LLM_CATEGORY_LABEL: Record<string, string> = {
  vllm: "vLLM 추론",
  train: "학습/미세조정",
  data: "데이터 처리",
  rag: "RAG 서비스",
  tensorrt: "TensorRT-LLM",
  other: "기타",
};

/** llm_service_state 값 → 화면 표기. */
export const LLM_SERVICE_STATE_LABEL: Record<number, string> = {
  0: "STOPPED",
  1: "RUNNING",
  2: "STARTING",
};

/**
 * LLM 화면 공통 셀렉터 — **mig 매처 없음**(GPU 단위 화면, 계약 §6). URL에 `mig=`가
 * 남아 있어도 LLM 화면은 이를 소비하지 않는다(필터바도 MIG를 렌더하지 않는다).
 */
export function llmSelector(f: Filters): string {
  return (
    `env=~"${escapeLabelValue(f.env)}", ` +
    `node=~"${alternation(f.instances)}", ` +
    `gpu=~"${alternation(f.gpus)}"`
  );
}

// ── ⑦ 실행 중인 LLM/AI 프로세스 (instant, pid로 조인) ────────────────────
export function llmProcesses(f: Filters) {
  const s = llmSelector(f);
  return {
    identity: `max by(node, gpu, pid, proc_name, os_user) (llm_process_running{${s}})`,
    memory: "max by(pid) (llm_process_memory_bytes)",
    gpuPct: "max by(pid) (llm_process_gpu_percent)",
    cpuPct: "max by(pid) (llm_process_cpu_percent)",
    startTime: "max by(pid) (llm_process_start_time_seconds)",
  };
}

// ── ⑧ LLM/AI 서비스 정보 (instant, service로 조인) ───────────────────────
export function llmServices(f: Filters) {
  const s = llmSelector(f);
  const env = `env=~"${escapeLabelValue(f.env)}"`;
  return {
    tps: `max by(service, model, engine, node, gpu) (llm_service_tps{${s}})`,
    p95: `max by(service) (llm_service_p95_seconds{${env}})`,
    state: `max by(service) (llm_service_state{${env}})`,
  };
}

// ── ⑨ LLM 타임라인 (range — GPU 단위 12행) ──────────────────────────────
export function llmTimeline(f: Filters): string {
  return `llm_gpu_timeline_state{${llmSelector(f)}}`;
}

// ── ⑩ GPU 단위 시계열 4종 (range — 두 MIG를 집계 소거, 계약 무변경) ───────
export function llmGpuTimeseries(f: Filters) {
  const s = llmSelector(f);
  const used = `sum by(node, gpu) (DCGM_FI_DEV_FB_USED{${s}})`;
  const free = `sum by(node, gpu) (DCGM_FI_DEV_FB_FREE{${s}})`;
  return {
    utilization: `avg by(node, gpu) (DCGM_FI_DEV_GPU_UTIL{${s}})`,
    memory: `${used} / (${used} + ${free}) * 100`,
    temperature: `avg by(node, gpu) (DCGM_FI_DEV_GPU_TEMP{${s}})`,
    power: `sum by(node, gpu) (DCGM_FI_DEV_POWER_USAGE{${s}})`,
  };
}

// ── ⑩b LLM All 뷰 노드 평균 시계열 (range — gpuTimeseriesAvg 미러, mig 매처 없음) ──
// 인스턴스 미선택(All)이면 12선 대신 노드 평균 3선 — GPU/SQream 화면과 동일 규칙(R9 F2.2).
export function llmGpuTimeseriesAvg(f: Filters) {
  const s = llmSelector(f);
  return {
    utilization: `avg by(node) (DCGM_FI_DEV_GPU_UTIL{${s}})`,
    memory:
      `avg by(node) (DCGM_FI_DEV_FB_USED{${s}} / ` +
      `(DCGM_FI_DEV_FB_USED{${s}} + DCGM_FI_DEV_FB_FREE{${s}})) * 100`,
    temperature: `avg by(node) (DCGM_FI_DEV_GPU_TEMP{${s}})`,
    power: `avg by(node) (DCGM_FI_DEV_POWER_USAGE{${s}})`,
  };
}

// ── LLM 사이드바 서버 상태 (instant — GPU 단위 "n / 4 GPU 사용 중") ───────
export function llmServerStatus(node: NodeName) {
  const n = `node="${escapeLabelValue(node)}"`;
  return {
    gpuTotal: `count(count by(gpu) (DCGM_FI_DEV_GPU_UTIL{${n}}))`,
    /* 워크로드 합집합 — serverStatus.gpuBusyByGpu 와 같은 식이다. 예전엔 llm만 세서
       같은 서버 카드가 화면(GPU 뷰 vs LLM 뷰)에 따라 다른 숫자를 보였다.
       카드의 "사용 중"은 화면과 무관하게 같은 뜻이어야 한다(2026-08-10). */
    gpuBusy:
      `count(max by(env, node, gpu) (` +
      `(sqm_gpu_timeline_state{${n}} > bool 0)` +
      ` or (max by(env, node, gpu) (llm_gpu_timeline_state{${n}}) > bool 0)` +
      `) > 0) or vector(0)`,
  };
}

// ── LLM 선택 구간 상세 (instant — 시안 8항목, 기존 rangeDetail과 같은 규칙) ─
export function llmRangeDetail(f: Filters, rangeSec: number) {
  const s = llmSelector(f);
  const env = `env=~"${escapeLabelValue(f.env)}"`;
  const win = windowOf(rangeSec);
  // 활동 서비스(구간 끝 시각에 TPS>0)만 P95 평균 — 정지 서비스 평균 금지 (rangeDetail과 동일 원칙)
  const activeServices = `max by(service) (llm_service_tps{${s}}) > 0`;
  return {
    // 활성 GPU (끝 시각에 워크로드 실행 중) — 개수는 응답 시리즈 수
    gpuState: `max by(node, gpu) (llm_gpu_timeline_state{${s}}) > 0`,
    // 끝 시각에 실행 중인 프로세스 (프로세스명 목록)
    procs: `max by(pid, proc_name) (llm_process_running{${s}}) > 0`,
    // 끝 시각에 활동 중인 모델 목록
    models: `max by(model) (llm_service_tps{${s}}) > 0`,
    // TPS는 시점별 sum 후 구간 평균 (rows/s와 동일 규칙 — 라벨셋 교체 과대계상 방지)
    tps: `avg_over_time((sum(llm_service_tps{${s}}))[${win}:])`,
    p95: `avg(avg_over_time(llm_service_p95_seconds{${env}}[${win}]) and on(service) (${activeServices}))`,
    requestCount: `sum(increase(llm_requests_total{${s}}[${win}]))`,
    memoryBytes: `sum(llm_process_memory_bytes * on(pid) group_left() llm_process_running{${s}})`,
  };
}

/* ══════════════ 드릴다운 화면 (S3, v4.0 계약) ══════════════
 *
 * 정적 화면(`res/sqream/mockup/*.html`)을 React 라우트로 흡수하면서 그 PromQL을 여기로
 * 옮긴다. 계약 TV-C1 §7에 편입된 33종만 쓸 수 있고, 그 밖의 이름을 적으면
 * `queries.contract.test.ts`가 막는다.
 *
 * 드릴다운 화면은 탑뷰와 필터 축이 다르다 — 탑뷰는 env/node/gpu/mig, 드릴다운은
 * 화면마다 자기 축(테이블·세션·워커)을 쓴다. 그래서 `selector(f)`를 그대로 쓰지 않는다.
 */

/** System Info — 버전·데이터 한도. 클러스터 단일 값이라 필터 축이 없다. */
export function systemInfo() {
  return {
    version: "sqm_sw_version_info",
    lastUpdate: "sqm_last_update_timestamp",
    licenseExpiry: "sqm_license_expiry_timestamp",
    dataLimit: "sqm_data_limit_bytes",
    dataUsed: "sqm_data_used_bytes",
  };
}


/** exporter 구분 — 정적 화면이 쓰던 것과 같다. 두 exporter가 같은 이름을 낼 때를 대비한다. */
const TV = 'job="top-view-exporter"';

/** Main Dashboard (`#/drilldown/main`) — 정적 `mockup/index.html`. */
export function mainDashboard() {
  return {
    cpu: '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100',
    gpu: "avg(DCGM_FI_DEV_GPU_UTIL)",
    diskIo: "sum(rate(node_disk_read_bytes_total[1m]) + rate(node_disk_written_bytes_total[1m]))",
    // 호스트 RAM 사용률. `node_*`는 mockup 프로젝트의 apptomo-agent가 내는 외부 메트릭이고
    // 위 CPU·Disk I/O와 같은 출처다 — 새 메트릭을 만들지 않았다.
    ram: "(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100",
    /* X7-b: 위 4식의 노드별 판 — Cluster Performance가 선택 지표를 노드 누적으로
       그린다. 평균 4식은 현재값 스트립이 계속 쓴다. `by (node)` 선례는
       workerMonitoring.nodeCpu. RAM은 분자·분모를 같은 `by (node)`로 묶어
       벡터 매칭을 노드 기준으로 정확히 만든다. */
    cpuByNode: '100 - avg by (node)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100',
    gpuByNode: "avg by (node)(DCGM_FI_DEV_GPU_UTIL)",
    ramByNode: "(1 - sum by (node)(node_memory_MemAvailable_bytes)"
      + " / sum by (node)(node_memory_MemTotal_bytes)) * 100",
    diskIoByNode: "sum by (node)(rate(node_disk_read_bytes_total[1m])"
      + " + rate(node_disk_written_bytes_total[1m]))",
    sessions: "count(sqm_session_active)",
    running: "count(sqm_statement_running)",
    memory: "sum(DCGM_FI_DEV_FB_USED) / (sum(DCGM_FI_DEV_FB_USED) + sum(DCGM_FI_DEV_FB_FREE)) * 100",
    users: "count(count by (sqream_user)(sqm_session_active))",
    /* 예전엔 **에러 로그 건수**였다. 카드를 누르면 나오는 내역이 실패한 쿼리 목록인데
       숫자는 로그 건수라 둘이 안 맞았다(113건 vs 12줄). 같은 것을 세게 바꾼다. */
    errors1h: "count(sqm_statement_failed_timestamp) or vector(0)",
    /* Queued Queries 카드·내역은 X14-f1(인간 지시)로 삭제 — 실제 시스템은 1초
       이상 대기하는 쿼리를 정지·에러 처리해 큐 표시가 의미 없다. 자리는
       Longest Running(statements의 duration 최댓값 — 신규 쿼리 없이 파생). */
    // Cache Hit Rate를 Disk Spill로 교체했다(인간 지시 2026-08-10). 캐시 적중률은
    // 손댈 여지가 없는 숫자였고, 스풀은 메모리가 모자라 디스크로 샌 양이라 조치가 따른다.
    spool: "sum(sqm_query_spool_bytes)",
    statements: "sqm_statement_running",
    duration: "sqm_statement_duration_seconds",
    progress: "sqm_statement_progress_ratio",
    /* Kill 세대 토큰(X6-R1) — 팝업이 본 문장의 시작 epoch. stmt_id는 슬롯 신원
       풀에서 재사용되므로, kill 요청에 함께 보내 exporter가 같은 세대인지 대조한다
       (늦게 도착한 kill이 재사용된 id의 **다른 문장**을 죽이는 ABA 방지). */
    startTime: "sqm_statement_start_time_seconds",
    workers: `sqm_worker_up{${TV}}`,
    /* X11 — 재시작 절차 게이트: worker_up 0인데 WorkerDown 알람이 없으면 "정상
       정지(Stopped, graceful shutdown 완료)"다 — 신규 메트릭 없이 알람 시리즈
       존재 여부로 crash/정상 정지를 가른다. */
    workerAlerts: 'sqm_alert_state{alertname=~"WorkerDown|WorkerUnresponsive"}',
    /* X11 — orphaned lock 경고(Restart 다이얼로그): 실행 중 문장에 조인되지 않는
       락 = 죽은 워커가 남긴 잔존 락(REMOVE_LOCK 정리 대상, Snapshot & Lock 화면). */
    locks: "sqm_lock_held_seconds",
    topGpu: "topk(5, sqm_query_gpu_percent)",
    topScanned: "sqm_query_data_scanned_bytes",
    topMemory: "sqm_query_memory_bytes",
    /* Session Statistics 카드를 누르면 보여 줄 내역. 전부 계약 안의 메트릭이다.
       `detailFailed`는 **문장 단위** 시리즈라 Query ID·Q-Type·Worker를 그대로
       뽑아 쓴다(계약 v4.3). 예전에는 노드 합계뿐이라 건수까지만 알 수 있었다. */
    detailUsers: "count by (sqream_user)(sqm_session_active)",
    detailSpool: "sqm_query_spool_bytes",
    detailFailed: "sqm_statement_failed_timestamp",
  };
}

/** Worker Monitoring (`#/drilldown/worker`) — 정적 `mockup/worker.html`. */
export function workerMonitoring() {
  return {
    nodeCpu: '100 - avg by (node)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100',
    fbUsed: `sum by (node)(DCGM_FI_DEV_FB_USED{${TV}})`,
    fbFree: `sum by (node)(DCGM_FI_DEV_FB_FREE{${TV}})`,
    workers: `sqm_worker_up{${TV}}`,
    /* v4.11(E5) — 워커 구독 큐 집합(SHOW_SUBSCRIBED_INSTANCES 재현). 큐마다 시리즈
       하나(값 1). 자기 이름 큐 포함이라 표시 계층이 걸러 낸다(전 워커 공통 정보). */
    subs: `sqm_worker_subscription{${TV}}`,
    workerCpu: `max by (worker)(sqm_query_cpu_percent{${TV}})`,
    workerMemory: `sum by (worker)(sqm_query_memory_bytes{${TV}})`,
    /* 워커(=MIG 슬롯)의 하드웨어 GPU 사용률 — dcgmi가 내는 per-MIG 게이지(X9).
       `sqm_query_gpu_percent`는 "쿼리가 쓰는 GPU%"라 쿼리가 없으면 시리즈 자체가
       없다 — 슬롯의 사용률은 DCGM 쪽이 맞다. 키는 `workerName(node,gpu,mig)`으로
       역산 없이 워커 행과 조인한다. */
    migUtil: `max by (node, gpu, mig) (DCGM_FI_DEV_GPU_UTIL{${TV}})`,
    /* 워커별 호스트 RAM(X9-f2) — 계약에 워커별 RAM 게이지가 없어, 실행 중 문장의
       호스트 메모리(sqm_statement_memory_bytes)를 신원 캐리어(sqm_statement_running)로
       워커에 귀속시켜 합산한다(mainDashboard().memoryBytes와 같은 조인 — 위 :342).
       실행 문장이 없는 워커는 시리즈 부재 → 0 (이 화면의 cpu/mem 비결합 규약과 동일).
       분모 368GB는 화면 상수(논리 할당) — 물리 RAM(node_memory_* 512GiB)과 별개 축이다. */
    workerRam: "sum by (worker) (sqm_statement_memory_bytes"
      + ` * on (stmt_id) group_left(worker) sqm_statement_running{${TV}})`,
    /* 쿼리 ID 열(X9-f3) — 워커에서 실행 중인 문장(탑뷰 계열, 워커당 최대 1개:
       exporter 슬롯 = 워커). 클릭하면 QueryDetailModal(SQL/로그/플랜+Kill)을 연다.
       duration/progress는 팝업 pollLive, startTime은 Kill 세대 토큰(X6-R1)이다. */
    running: `sqm_statement_running{${TV}}`,
    stmtDuration: `sqm_statement_duration_seconds{${TV}}`,
    stmtProgress: `sqm_statement_progress_ratio{${TV}}`,
    stmtStartTime: `sqm_statement_start_time_seconds{${TV}}`,
    /* X11 — mainDashboard와 같은 재시작 절차 게이트 조인(주석은 그쪽 참조):
       알람 부재 = 정상 정지(Stopped), 락 = orphan 경고. */
    workerAlerts: 'sqm_alert_state{alertname=~"WorkerDown|WorkerUnresponsive"}',
    locks: "sqm_lock_held_seconds",
  };
}

/** Query Analytics (`#/drilldown/query`) — 정적 `mockup/query-analytics.html`. */
export function queryAnalytics() {
  return {
    avgCpu: "avg(sqm_query_cpu_percent)",
    avgGpu: "avg(sqm_query_gpu_percent)",
    running: "count(sqm_statement_running)",
    maxLock: "max(sqm_lock_held_seconds) or vector(0)",
    avgDuration: "avg(sqm_statement_duration_seconds)",
    heavyCount: "count(count by (stmt_id)(sqm_query_gpu_percent > 80)) or vector(0)",
    scanned: "sum(sqm_query_data_scanned_bytes) or vector(0)",
    slow5m: "sum(increase(sqm_slow_query_total[5m])) or vector(0)",
    statements: "sqm_statement_running",
    duration: "sqm_statement_duration_seconds",
    cpu: "sqm_query_cpu_percent",
    gpu: "sqm_query_gpu_percent",
    memory: "sqm_query_memory_bytes",
    scannedBytes: "sqm_query_data_scanned_bytes",
    locks: "sqm_lock_held_seconds",
  };
}

/** Session Monitoring (`#/drilldown/session`) — 정적 `mockup/session.html`. */
export function sessionMonitoring() {
  return {
    active: `count(sqm_session_active{${TV}})`,
    running: `count(sqm_statement_running{${TV}})`,
    avgCpu: `avg(sqm_query_cpu_percent{${TV}})`,
    avgGpu: `avg(DCGM_FI_DEV_GPU_UTIL{${TV}})`,
    sessions: `sqm_session_active{${TV}}`,
    started: `sqm_session_start_time_seconds{${TV}}`,
    queries: `sqm_session_running_queries{${TV}}`,
    workers: `sqm_worker_up{${TV}}`,
  };
}

/** Snapshot & Lock (`#/drilldown/snapshot`) — 정적 `mockup/snapshot-lock.html`. */
export function snapshotLock() {
  return {
    openCount: "sum(sqm_open_snapshot_count)",
    maxAge: "max(sqm_open_snapshot_age_seconds) or vector(0)",
    maxLock: "max(sqm_lock_held_seconds) or vector(0)",
    spoolTotal: "sum(sqm_query_spool_bytes) or vector(0)",
    snapshots: "sqm_open_snapshot_age_seconds",
    locks: "sqm_lock_held_seconds",
    statements: "sqm_statement_running",
    /* X11 — orphaned lock의 워커·사용자 폴백: 락의 문장이 이미 죽었으면(orphan)
       running 조인이 비므로, 최근 실패 이력(worker·user 라벨 보유)으로 채운다.
       FAILED_KEEP(12건) 퇴출 후에는 다시 "--" — 허용 한계(command-api.md). */
    failed: "sqm_statement_failed_timestamp",
    spool: "sqm_query_spool_bytes",
  };
}

/** Table Usage (`#/drilldown/usage`) — 정적 `mockup/table-usage.html`. */
export function tableUsage() {
  return {
    tableCount: "count(sqm_table_rows)",
    totalRows: "sum(sqm_table_rows)",
    totalSize: "sum(sqm_table_size_bytes)",
    totalCompressed: "sum(sqm_table_compressed_bytes)",
    rows: "sqm_table_rows",
    chunks: "sqm_table_chunk_count",
    size: "sqm_table_size_bytes",
    compressed: "sqm_table_compressed_bytes",
    fragmentation: "sqm_table_fragmentation_ratio",
    deleted: "sqm_table_deleted_rows",
    /* X10 (계약 v4.8) — 유지보수 배치(매일 01:00) 판정용 청크 통계.
       Rechunk 4임계(②·③·④)와 recalculate chunks indexes 대상(clustering key). */
    filled90: "sqm_table_chunks_filled_90pct",
    under80: "sqm_table_chunks_under_80pct",
    noDeletion: "sqm_table_chunks_no_deletion",
    clusteringKey: "sqm_table_clustering_key",
    /* X10-f3 (계약 v4.9) — 유지보수 실행 진행도. 실행 중에만 시리즈가 있고
       stage 라벨(cleanup_chunk·rechunk·cleanup_extent·recalc_index)이 현재 단계다. */
    maintProgress: "sqm_table_maintenance_progress_ratio",
  };
}

/** Table Activity에서 쓰는 접근 유형 4종 — 정적 화면과 같은 순서·색. */
export const ACCESS_TYPES = ["SELECT", "INSERT", "COPYFROM", "DELETE"] as const;
export type AccessType = typeof ACCESS_TYPES[number];

/**
 * Table Activity (`#/drilldown/activity`) — 정적 `mockup/table-activity.html`.
 *
 * 구간이 화면 선택에 따라 달라진다(30분/1시간/6시간/24시간). 정적본과 같이
 * **allowlist 안의 값만** 받는다 — 임의 문자열이 PromQL에 끼어들지 않게 하려는 것이다.
 */
export function tableActivity(rangeSec: number = 3600) {
  const r = ALLOWED_ACTIVITY_RANGES.includes(rangeSec) ? rangeSec : 3600;
  const total = (t: AccessType) =>
    `sum(increase(sqm_table_access_total{access_type="${t}"}[${r}s]))`;
  const perTable = (t: AccessType) =>
    `sum by (db, schema, table)(increase(sqm_table_access_total{access_type="${t}"}[${r}s]))`;
  return {
    selects: total("SELECT"),
    inserts: total("INSERT"),
    copyfroms: total("COPYFROM"),
    deletes: total("DELETE"),
    lastAccess: "max(sqm_table_last_access_timestamp)",
    perSelect: perTable("SELECT"),
    perInsert: perTable("INSERT"),
    perCopyfrom: perTable("COPYFROM"),
    perDelete: perTable("DELETE"),
    perTableLastAccess: "max by (db, schema, table)(sqm_table_last_access_timestamp)",
    perTableSize: `sum by (db, schema, table)(delta(sqm_table_size_bytes[${r}s]))`,
  };
}

/**
 * 화면이 고를 수 있는 구간.
 *
 * 정적 `ALLOWED_RANGES`는 [1800, 3600, 21600, 86400]이었고 화면 자체 셀렉트만 봤다.
 * S3에서는 **툴바가 구간의 주인**이고 툴바에는 300(5분)이 있다 — 넣지 않으면 사용자가
 * 5분을 골라도 이 화면만 조용히 1시간을 쓴다(codex CDX-S3D-01). 그래서 300을 더한다.
 */
export const ALLOWED_ACTIVITY_RANGES: number[] = [300, 1800, 3600, 21600, 86400];

/**
 * Table Activity의 **빈도 차트·스파크라인** — 언제나 `[5m]` **롤링**이다.
 *
 * ⚠ 화면이 고른 구간(30분~24시간)은 **차트의 가로 범위**일 뿐, 각 점의 창이 아니다.
 * 한때 KPI용 `[${range}s]` 식을 차트에도 그대로 물려, 1시간을 고르면 각 점이 5분이 아니라
 * 한 시간을 뜻하게 됐다(codex CDX-S3C-02). 정적본은 처음부터 `[5m]` 고정이었다.
 */
export function tableActivityTrend() {
  const rolling = (t: AccessType) =>
    `sum(increase(sqm_table_access_total{access_type="${t}"}[5m]))`;
  return {
    selects: rolling("SELECT"),
    inserts: rolling("INSERT"),
    copyfroms: rolling("COPYFROM"),
    deletes: rolling("DELETE"),
    perTable: "sum by (db, schema, table)(increase(sqm_table_access_total[5m]))",
  };
}

/** Log Monitoring (`#/drilldown/logs`) — 정적 `mockup/logs.html`. */
export function logMonitoring() {
  return {
    total24h: "sum(increase(sqm_log_entries_total[24h]))",
    errors24h: 'sum(increase(sqm_log_entries_total{level="error"}[24h]))',
    warnings24h: 'sum(increase(sqm_log_entries_total{level="warning"}[24h]))',
    info24h: 'sum(increase(sqm_log_entries_total{level="info"}[24h]))',
  };
}

/** Log Monitoring 분포 차트 (range 질의) — 정적 `registerPromChart`와 같은 식. */
export function logDistribution() {
  return {
    info: 'sum(increase(sqm_log_entries_total{level="info"}[1m]))',
    warning: 'sum(increase(sqm_log_entries_total{level="warning"}[1m]))',
    error: 'sum(increase(sqm_log_entries_total{level="error"}[1m]))',
  };
}

/** Alarms (`#/drilldown/alarms`) — 정적 `mockup/alarms.html`. */
export function alarms() {
  return {
    state: "sqm_alert_state",
    since: "sqm_alert_since_timestamp",
  };
}

/**
 * 드릴다운 공통 상단바 — 정적 `mockup/*.html`의 `header.topbar`.
 *
 * S3 이관에서 **통째로 빠뜨렸다**(2026-08-09 인간 지적). 11개 정적 화면 전부가 이
 * 헤더를 갖고 있었고 CLUSTER STATUS·NODES는 장식이 아니라 매 틱 갱신되는 실데이터였다.
 * 정적 `assets/app.js`의 공통 updater가 쓰던 두 식을 그대로 옮긴다.
 */
export function drilldownTopbar() {
  return {
    // 워커가 하나라도 내려가면 min이 0 → DEGRADED. 원본과 같은 판정식이다.
    up: `min(sqm_worker_up{${TV}})`,
    nodes: `count(count by(node)(sqm_worker_up{${TV}}))`,
    // 🔔 배지. 원본은 "3" 하드코딩이었는데 Alarms 화면은 실데이터를 읽고 있어
    // 두 숫자가 어긋나 보였다(codex E). state 2 = firing — 아직 확인하지 않은 알람이다.
    alerts: "count(sqm_alert_state == 2)",
  };
}

/** 쿼리 실행 방식 — 계약 테스트가 instant/range 규칙을 강제하는 데도 쓴다. */
export type QueryMode = "instant" | "range";

export interface QueryDef {
  /** `panel.key` 형태의 식별자 */
  id: string;
  expr: string;
  mode: QueryMode;
}

/**
 * **앱이 실행하는 모든 PromQL의 단일 목록** (CDX-R2-10).
 *
 * 컴포넌트도 테스트도 이 레지스트리를 통해 쿼리를 얻으므로, 새 쿼리를 추가하면
 * 계약 대사 대상에서 빠질 수 없다.
 */
export function queryRegistry(f: Filters, rangeSec: number): QueryDef[] {
  const defs: QueryDef[] = [];
  const add = (prefix: string, mode: QueryMode, obj: Record<string, string>) => {
    for (const [k, expr] of Object.entries(obj)) defs.push({ id: `${prefix}.${k}`, expr, mode });
  };

  add("labelValues", "instant", {
    env: labelValueMatchers.env(),
    node: labelValueMatchers.node(f.env),
    gpu: labelValueMatchers.gpu(f.env, f.instances),
    mig: labelValueMatchers.mig(f.env, f.instances, f.gpus),
  });
  add("runningStatements", "instant", runningStatements(f));
  add("queryPerformance", "instant", queryPerformance(f));
  add("kpi", "instant", kpi(f));
  defs.push({ id: "timeline", expr: timeline(f), mode: "range" });
  add("xviewEvents", "range", xviewEvents(f));
  add("gpuTimeseries", "range", gpuTimeseries(f));
  add("gpuTimeseriesAvg", "range", gpuTimeseriesAvg(f));
  for (const node of NODES) {
    add(`serverCard.${node}`, "instant", serverCard(node));
    add(`serverStatus.${node}`, "instant", serverStatus(node));
  }
  add("rangeDetail", "instant", rangeDetail(f, rangeSec));
  // LLM 화면 (v3.0) — 신규 쿼리도 같은 레지스트리에 들어와 계약 대사를 우회할 수 없다
  add("llmProcesses", "instant", llmProcesses(f));
  add("llmServices", "instant", llmServices(f));
  defs.push({ id: "llmTimeline", expr: llmTimeline(f), mode: "range" });
  add("llmGpuTimeseries", "range", llmGpuTimeseries(f));
  add("llmGpuTimeseriesAvg", "range", llmGpuTimeseriesAvg(f));
  for (const node of NODES) {
    add(`llmServerStatus.${node}`, "instant", llmServerStatus(node));
  }
  add("llmRangeDetail", "instant", llmRangeDetail(f, rangeSec));
  // 드릴다운 화면 (S3) — 정적 HTML에서 옮겨 온 쿼리도 같은 레지스트리를 지난다
  add("systemInfo", "instant", systemInfo());
  add("mainDashboard", "instant", mainDashboard());
  add("workerMonitoring", "instant", workerMonitoring());
  add("queryAnalytics", "instant", queryAnalytics());
  add("sessionMonitoring", "instant", sessionMonitoring());
  add("snapshotLock", "instant", snapshotLock());
  add("tableUsage", "instant", tableUsage());
  // 구간이 식에 박히므로 allowlist 전 구간을 등록한다 — 기본값만 등록하면 나머지가
  // 계약 대사를 우회한다(codex CDX-S3C-02).
  for (const r of ALLOWED_ACTIVITY_RANGES) {
    add(`tableActivity.${r}`, "instant", tableActivity(r));
  }
  add("tableActivityTrend", "range", tableActivityTrend());
  add("logMonitoring", "instant", logMonitoring());
  add("logDistribution", "range", logDistribution());
  add("alarms", "instant", alarms());
  // 공통 상단바 — 화면과 무관하게 항상 뜬다. 레지스트리(TV-C3)에도 들어가야
  // 계약 대사에서 누락으로 잡히지 않는다.
  add("drilldownTopbar", "instant", drilldownTopbar());
  return defs;
}
