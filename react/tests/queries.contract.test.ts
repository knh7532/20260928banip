/**
 * 계약 대사 (TV-C3, 구 RC-1) — 앱이 실행하는 **모든** PromQL이 계약(TV-C1)
 * 안에 있는지 검사한다.
 *
 * SoT: ../docs/architecture/db-schema.md (owner = exporter — 통합 프로젝트 내)
 * web 영역은 **소비자**이므로 계약에 없는 이름을 쓰면 실패한다.
 * 검사 대상은 `queryRegistry()` — 앱과 테스트가 같은 목록을 쓰므로 새 쿼리가 누락될 수
 * 없다 (CDX-R2-10). 이 테스트는 `npm run build` 경로에 있어 위반 시 dist/가 안 만들어진다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as Q from "../src/api/queries";
import { typeOfQuery } from "../src/lib/xview";
import {
  CATALOG,
  QUERY_STATE_LABEL,
  QUERY_TYPE_LABEL,
  escapeLabelValue,
  gpuTimeseries,
  gpuTimeseriesAvg,
  kpi,
  labelValueMatchers,
  llmGpuTimeseries,
  llmGpuTimeseriesAvg,
  llmProcesses,
  llmRangeDetail,
  llmServerStatus,
  llmServices,
  llmTimeline,
  queryPerformance,
  queryRegistry,
  rangeDetail,
  runningStatements,
  selector,
  serverCard,
  serverStatus,
  timeline,
  xviewEvents,
  NODES,
  type Filters,
} from "../src/api/queries";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, "../docs/architecture/db-schema.md");
const DOC = readFileSync(SCHEMA, "utf-8");

/** 라벨이 없는 메트릭임을 문서에 **명시**하는 표기. 누락과 구분하기 위한 것이다. */
const NO_LABEL_MARKER = "(없음)";

interface MetricSpec {
  labels: Set<string>;
  type: "gauge" | "counter";
}

/** 계약 문서에서 메트릭 → (라벨셋, 타입)을 파싱한다 (형제 검증기와 동일 규칙). */
function contractManifest(): Map<string, MetricSpec> {
  const types = new Map<string, "gauge" | "counter">();
  for (const m of DOC.matchAll(
    /\|\s*`((?:sqm_|DCGM_FI_DEV_|llm_|node_)[A-Za-z0-9_]+)`\s*\|\s*(Gauge|Counter)\s*\|/g,
  )) {
    types.set(m[1], m[2].toLowerCase() as "gauge" | "counter");
  }

  const dcgmLine = DOC.split("\n").find((l) => l.startsWith("라벨: "));
  if (!dcgmLine) throw new Error("db-schema.md에서 DCGM 라벨 서술을 찾지 못했다");
  const dcgmLabels = new Set([...dcgmLine.matchAll(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g)].map((m) => m[1]));

  const manifest = new Map<string, MetricSpec>();
  for (const line of DOC.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|");
    const nameMatch = /(?:sqm_|DCGM_FI_DEV_|llm_|node_)[A-Za-z0-9_]+/.exec(cells[0] ?? "");
    if (!nameMatch) continue;
    const name = nameMatch[0];
    const type = types.get(name);
    if (!type) continue; // 타입 표에 없는 이름은 계약이 아니다
    if (name.startsWith("DCGM_")) {
      manifest.set(name, { labels: new Set(dcgmLabels), type });
      continue;
    }
    /* "메트릭 타입" 표의 행(라벨 칸이 `Gauge`/`Counter`)은 여기서 건너뛴다.
       타입 표만 보고 **빈 라벨셋으로 등록해 버리면 안 된다** — 라벨 표가 빠지거나 깨져도
       메트릭이 "라벨 없음"으로 통과해, 있지도 않은 라벨을 쓰는 쿼리가 전역 ALL_LABELS
       화이트리스트를 타고 빠져나간다(codex CDX-S3A-02, 실증됨).
       라벨이 진짜 없는 메트릭은 라벨 표에 `(없음)`이라고 **명시**돼 있어야 한다. */
    const isTypeRow = /^(Gauge|Counter)$/.test((cells[1] ?? "").trim());
    if (isTypeRow) continue;
    if (manifest.has(name)) continue; // 첫 라벨 표가 이긴다
    const cell = (cells[1] ?? "").trim();
    if (cell === NO_LABEL_MARKER) {
      manifest.set(name, { labels: new Set(), type });
      continue;
    }
    const labels = [...cell.matchAll(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g)].map((m) => m[1]);
    if (labels.length > 0) manifest.set(name, { labels: new Set(labels), type });
  }

  /* 타입 표에 있는데 라벨 표가 없는 메트릭은 **계약 문서의 결함**이다. 조용히 넘기면
     위에서 말한 우회가 생기므로 여기서 터뜨린다. */
  const missing = [...types.keys()].filter((n) => !manifest.has(n));
  if (missing.length > 0) {
    throw new Error(`db-schema.md: 타입 표에만 있고 라벨 표가 없는 메트릭 — ${missing.join(", ")}`);
  }
  return manifest;
}

const MANIFEST = contractManifest();
const ALL_LABELS = new Set([...MANIFEST.values()].flatMap((s) => [...s.labels]));

/** 허용 PromQL 함수·키워드 (이 밖의 식별자는 전부 계약 위반으로 본다). */
const FUNCS = new Set([
  "max", "avg", "sum", "count", "by", "on", "group_left", "or", "vector",
  "avg_over_time", "increase", "and",
  // 드릴다운 화면 (S3)에서 추가로 쓰는 것
  "rate", "topk", "delta", "min",
  // 비교를 필터가 아니라 0/1 값으로 — 사이드바 busy 합집합(sqm ∪ llm)이 쓴다 (2026-08-10)
  "bool",
]);

/**
 * Prometheus가 **스크레이프 시점에 모든 시계열에 붙이는** 라벨.
 *
 * exporter가 선언하지 않아도 항상 존재하므로, 계약 라벨셋에 없다고 해서 위반이 아니다.
 * 정적 화면이 `sqm_worker_up{job="top-view-exporter"}`처럼 쓰고 있고, 그것은 유효하다.
 */
const SCRAPE_LABELS = new Set(["job", "instance"]);
/** Counter에만 쓸 수 있는 함수 (CDX-R2-12). */
const COUNTER_ONLY = new Set(["increase", "rate", "irate", "resets"]);

const F: Filters = { env: "production", instances: [], gpus: [], migs: [] };
const REGISTRY = queryRegistry(F, 1800);

/**
 * 모든 `{...}` selector를 뽑는다 — 바로 앞에 메트릭 이름이 있어야 한다.
 * 무명 selector(`{env="production"}` 처럼 메트릭 없이 라벨만)는 metric=""로 잡아
 * 계약 위반으로 처리한다 (CDX-R2-11).
 */
function selectors(expr: string): Array<{ metric: string; labels: string[] }> {
  const out: Array<{ metric: string; labels: string[] }> = [];
  for (const m of expr.matchAll(/([A-Za-z_][A-Za-z0-9_]*)?\s*\{([^}]*)\}/g)) {
    // subquery 리터럴 `[1800s:]`은 {}가 아니므로 여기 안 걸린다.
    const labels = [...m[2].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=~|!~|!=|=)/g)].map((x) => x[1]);
    out.push({ metric: m[1] ?? "", labels });
  }
  return out;
}

/** 문자열·기간 리터럴을 지운 뒤 남는 식별자 토큰. */
function tokens(expr: string): string[] {
  const stripped = expr
    .replace(/"[^"]*"/g, " ")
    .replace(/\[\d+[smhdwy](?::[\dsmhdwy]*)?\]/g, " "); // [1800s], [1800s:] (subquery)
  return [...stripped.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map((m) => m[0]);
}

describe("계약 대사 (RC-1) — 소비 메트릭 ⊆ TV-C1", () => {
  it("계약 문서를 파싱해 73종 메트릭과 타입을 얻는다 (v4.11 — llm 10 + 드릴다운 40 + 외부 5 + 완료 이벤트 3)", () => {
    expect(MANIFEST.size).toBe(73);
    // v4.5 (Phase X1 — X-View): 완료 이벤트 2종. 소비는 range 복원만(instant 금지).
    expect(MANIFEST.get("sqm_statement_completed_timestamp")?.type).toBe("gauge");
    expect(MANIFEST.get("sqm_statement_completed_duration_seconds")?.labels).toContain("status");
    expect(MANIFEST.get("sqm_statement_completed_duration_seconds")?.labels).toContain("reason");
    // v4.6 (Phase X3): 단계별 소요 — phase 라벨 (호버 툴팁 생애주기 막대)
    expect(MANIFEST.get("sqm_statement_completed_phase_seconds")?.type).toBe("gauge");
    expect(MANIFEST.get("sqm_statement_completed_phase_seconds")?.labels).toContain("phase");
    // §8 외부 exporter 메트릭 — 우리가 만들지 않지만 소비하므로 계약에 있어야 한다
    expect(MANIFEST.get("node_cpu_seconds_total")?.type).toBe("counter");
    expect(MANIFEST.get("node_cpu_seconds_total")?.labels).toContain("mode");
    expect(MANIFEST.get("node_disk_read_bytes_total")?.type).toBe("counter");
    // RAM 사용률(Cluster Performance 4번째 계열). `MemFree`가 아니라 `MemAvailable`이다.
    expect(MANIFEST.get("node_memory_MemTotal_bytes")?.type).toBe("gauge");
    expect(MANIFEST.get("node_memory_MemAvailable_bytes")?.type).toBe("gauge");
    expect(MANIFEST.get("sqm_query_executions_total")?.type).toBe("counter");
    expect(MANIFEST.get("DCGM_FI_DEV_GPU_UTIL")?.type).toBe("gauge");
    expect(MANIFEST.get("DCGM_FI_DEV_GPU_UTIL")?.labels).toContain("modelName");
    // v3.0 llm 계약이 문서 대사에 실제 편입됐는지 (조용한 누락 차단 — RL-1)
    const llm = [...MANIFEST.keys()].filter((k) => k.startsWith("llm_"));
    expect(llm).toHaveLength(10);
    expect(MANIFEST.get("llm_requests_total")?.type).toBe("counter");
    expect(MANIFEST.get("llm_gpu_timeline_state")?.labels).not.toContain("mig");
    expect(MANIFEST.get("llm_process_running")?.labels).toContain("proc_name");

    // v4.0 (S3-A): 드릴다운 33종. 이것이 계약에 없으면 React가 정적 10화면을 흡수할 수 없다.
    const drilldown = [...MANIFEST.keys()].filter((k) =>
      /^sqm_(worker_(up|subscription)|statement_(duration|progress|queued|failed)|query_(cpu|gpu|memory|data|spool)|slow_query|cache_hit|session_|table_|open_snapshot|lock_held|log_entries|alert_|sw_version|last_update|license_|data_)/.test(k));
    // 33 → 34: `sqm_statement_failed_timestamp` 추가(v4.3) — 실패 쿼리와 사유.
    // 34 → 38: 테이블 청크 통계 4종 추가(v4.8, X10) — 유지보수 배치 판정.
    // 38 → 39: 유지보수 진행도 추가(v4.9, X10-f3) — stage 라벨 enum.
    // 39 → 40: 워커 구독 큐 추가(v4.11, E5) — sqm_worker_subscription.
    expect(drilldown.length).toBe(40);
    expect(MANIFEST.get("sqm_table_rows")?.labels).toEqual(new Set(["db", "schema", "table"]));
    expect(MANIFEST.get("sqm_table_chunks_no_deletion")?.labels)
      .toEqual(new Set(["db", "schema", "table"]));
    expect(MANIFEST.get("sqm_table_clustering_key")?.type).toBe("gauge");
    expect(MANIFEST.get("sqm_table_maintenance_progress_ratio")?.labels)
      .toEqual(new Set(["db", "schema", "table", "stage"]));
    expect(MANIFEST.get("sqm_log_entries_total")?.type).toBe("counter");
    expect(MANIFEST.get("sqm_table_access_total")?.type).toBe("counter");
    expect(MANIFEST.get("sqm_slow_query_total")?.type).toBe("counter");
    // 라벨이 **없는** 메트릭도 MANIFEST에 들어와야 한다 — 예전 파서는 이것을 통째로 흘렸다.
    for (const m of ["sqm_cache_hit_ratio", "sqm_last_update_timestamp",
      "sqm_license_expiry_timestamp", "sqm_data_limit_bytes", "sqm_data_used_bytes"]) {
      expect(MANIFEST.has(m), `${m}: 라벨 없는 계약 메트릭이 누락됐다`).toBe(true);
      expect(MANIFEST.get(m)?.labels.size).toBe(0);
    }
  });

  it("레지스트리가 앱의 전 쿼리를 담는다 (누락 시 대사 우회 불가)", () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(40);
    const ids = REGISTRY.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length); // 중복 없음
    expect(ids).toContain("timeline");
    expect(ids).toContain("rangeDetail.queryCount");
    expect(ids).toContain("serverStatus.gpu-server-03.gpuBusy");
    expect(ids).toContain("llmTimeline");
    expect(ids).toContain("llmRangeDetail.requestCount");
    expect(ids).toContain("llmServerStatus.gpu-server-03.gpuBusy");
  });

  it("queries.ts가 export한 모든 PromQL 팩토리가 레지스트리에 반영된다 (CDX-R2-10)", () => {
    // 레지스트리가 실제로 만드는 쿼리 문자열 집합
    const registered = new Set(REGISTRY.map((q) => q.expr));
    // 각 팩토리를 직접 호출해 만든 쿼리가 전부 레지스트리에 있는지 확인한다.
    // 새 팩토리를 만들고 queryRegistry()에 넣는 걸 잊으면 여기서 걸린다.
    const produced: string[] = [
      labelValueMatchers.env(),
      labelValueMatchers.node(F.env),
      labelValueMatchers.gpu(F.env, F.instances),
      labelValueMatchers.mig(F.env, F.instances, F.gpus),
      timeline(F),
      ...Object.values(xviewEvents(F)),
      ...Object.values(runningStatements(F)),
      ...Object.values(queryPerformance(F)),
      ...Object.values(gpuTimeseries(F)),
      ...Object.values(gpuTimeseriesAvg(F)),
      ...Object.values(kpi(F)),
      ...Object.values(rangeDetail(F, 1800)),
      ...NODES.flatMap((n) => [...Object.values(serverCard(n)), ...Object.values(serverStatus(n))]),
      // LLM 화면 (v3.0)
      llmTimeline(F),
      ...Object.values(llmProcesses(F)),
      ...Object.values(llmServices(F)),
      ...Object.values(llmGpuTimeseries(F)),
      ...Object.values(llmGpuTimeseriesAvg(F)),
      ...Object.values(llmRangeDetail(F, 1800)),
      ...NODES.flatMap((n) => Object.values(llmServerStatus(n))),
      // 드릴다운 화면 (S3)
      ...Object.values(Q.systemInfo()),
      ...Object.values(Q.mainDashboard()),
      ...Object.values(Q.workerMonitoring()),
      ...Object.values(Q.queryAnalytics()),
      ...Object.values(Q.sessionMonitoring()),
      ...Object.values(Q.snapshotLock()),
      ...Object.values(Q.tableUsage()),
      ...Q.ALLOWED_ACTIVITY_RANGES.flatMap((r) => Object.values(Q.tableActivity(r))),
      ...Object.values(Q.tableActivityTrend()),
      ...Object.values(Q.logMonitoring()),
      ...Object.values(Q.logDistribution()),
      ...Object.values(Q.alarms()),
      ...Object.values(Q.drilldownTopbar()),
    ];
    for (const expr of produced) {
      expect(registered.has(expr), `레지스트리 누락: ${expr}`).toBe(true);
    }
    // 역방향: queries.ts에 PromQL을 반환하는 export가 위 목록에 다 있는지(대략적 안전망)
    const exportNames = Object.keys(Q).filter(
      (k) => typeof (Q as Record<string, unknown>)[k] === "function",
    );
    // 알려진 쿼리 팩토리 이름 — 새 함수 추가 시 이 목록도 갱신해야 테스트가 통과한다
    const knownFactories = new Set([
      "escapeLabelValue", "selector", "windowOf", "queryRegistry",
      "runningStatements", "queryPerformance", "timeline", "xviewEvents", "gpuTimeseries",
      "gpuTimeseriesAvg", "kpi", "serverCard", "serverStatus", "rangeDetail",
      "llmSelector", "llmProcesses", "llmServices", "llmTimeline",
      "llmGpuTimeseries", "llmGpuTimeseriesAvg", "llmServerStatus", "llmRangeDetail",
      // 드릴다운 화면 (S3)
      "systemInfo",
      "mainDashboard",
      "workerMonitoring",
      "queryAnalytics",
      "sessionMonitoring",
      "snapshotLock",
      "tableUsage",
      "tableActivity",
      "tableActivityTrend",
      "logMonitoring",
      "logDistribution",
      "alarms",
      // 공통 상단바 — S3에서 빠뜨렸다가 되살린 것 (2026-08-09)
      "drilldownTopbar",
    ]);
    const unknown = exportNames.filter((n) => !knownFactories.has(n));
    expect(unknown, `queries.ts에 미등록 export 함수: ${unknown.join(", ")}`).toEqual([]);
  });

  it("모든 vector selector의 메트릭이 계약에 존재한다 (무명 selector 금지)", () => {
    for (const { id, expr } of REGISTRY) {
      for (const { metric } of selectors(expr)) {
        expect(metric !== "", `${id}: 메트릭 없는 무명 selector`).toBe(true);
        expect(MANIFEST.has(metric), `${id}: 미계약 메트릭 selector '${metric}'`).toBe(true);
      }
    }
  });

  it("각 selector의 라벨이 그 메트릭의 계약 라벨셋에 속한다", () => {
    for (const { id, expr } of REGISTRY) {
      for (const { metric, labels } of selectors(expr)) {
        const spec = MANIFEST.get(metric);
        for (const label of labels) {
          const ok = spec?.labels.has(label) || SCRAPE_LABELS.has(label);
          expect(ok, `${id}: '${metric}'에 미계약 라벨 '${label}'`).toBe(true);
        }
      }
    }
  });

  it("PromQL에 계약 밖 식별자가 없다 (함수·메트릭·라벨 화이트리스트)", () => {
    for (const { id, expr } of REGISTRY) {
      for (const t of tokens(expr)) {
        const ok = MANIFEST.has(t) || ALL_LABELS.has(t) || FUNCS.has(t) || SCRAPE_LABELS.has(t);
        expect(ok, `${id}: 화이트리스트 밖 토큰 '${t}'`).toBe(true);
      }
    }
  });

  it("counter 전용 함수의 인자 메트릭은 Counter다 (중첩·공백 무관, CDX-R2-12)", () => {
    // `increase(` 뒤에 나오는 첫 메트릭 이름을 찾는다 — 중간에 공백·개행·중첩이 있어도.
    for (const { id, expr } of REGISTRY) {
      for (const fn of COUNTER_ONLY) {
        let idx = expr.indexOf(`${fn}(`);
        while (idx !== -1) {
          const after = expr.slice(idx + fn.length + 1);
          const metricMatch = /(?:sqm_|DCGM_FI_DEV_|llm_|node_)[A-Za-z0-9_]+/.exec(after);
          expect(metricMatch, `${id}: ${fn}()의 인자 메트릭을 찾지 못함`).not.toBeNull();
          if (metricMatch) {
            const spec = MANIFEST.get(metricMatch[0]);
            expect(spec?.type, `${id}: ${fn}()를 ${metricMatch[0]}(${spec?.type})에 사용`).toBe(
              "counter",
            );
          }
          idx = expr.indexOf(`${fn}(`, idx + 1);
        }
      }
    }
  });

  it("gauge에 counter 전용 함수를 쓰면 실제로 잡힌다 (검사가 우회되지 않음)", () => {
    // 위 검사 로직을 위반 예제로 검증한다.
    const bad = "sum(increase(sqm_query_state{env=~\"production\"}[60s]))"; // state는 Gauge
    const m = /(?:sqm_|DCGM_FI_DEV_|llm_|node_)[A-Za-z0-9_]+/.exec(bad.slice(bad.indexOf("increase(") + 9));
    expect(MANIFEST.get(m![0])?.type).toBe("gauge");
  });

  it("쿼리 카탈로그가 계약 문서와 **양방향** 일치한다 — §3·§5.4 각각 1..8 완전성 (codex X17-02)", () => {
    /* 단방향(CATALOG의 항목을 문서에서 찾기)이면 CATALOG에서 idx를 지워도 통과한다 —
       그러면 타임라인 7·8이 "#7 · other"로, X-View 유형도 "other"로 샌다.
       두 표를 합쳐 파싱하면 한 표 전체 누락을 못 잡으므로(수렴 r2 지적) **절별로**
       파싱해 각각 완전성·상호 일치·CATALOG 일치를 단언한다. */
    const parseCatalog = (sectionTitle: string) => {
      const start = DOC.indexOf(sectionTitle);
      expect(start, `계약 문서에서 "${sectionTitle}" 절을 찾지 못했다`).toBeGreaterThanOrEqual(0);
      const end = DOC.indexOf("\n#", start + sectionTitle.length);
      const body = end === -1 ? DOC.slice(start) : DOC.slice(start, end);
      const out = new Map<number, { name: string; type: string; database: string }>();
      for (const m of body.matchAll(/\|\s*(\d+)\s*\|\s*`([A-Za-z_]+)`\s*\|\s*`([a-z]+)`\s*\|\s*`([a-z_]+)`\s*\|/g)) {
        out.set(Number(m[1]), { name: m[2], type: m[3], database: m[4] });
      }
      return out;
    };
    const keysOf = (m: Map<number, unknown>) => [...m.keys()].sort((a, b) => a - b);
    const ALL = [1, 2, 3, 4, 5, 6, 7, 8]; // v4.10
    const sec3 = parseCatalog("### 쿼리 카탈로그 (계약의 일부");
    const sec54 = parseCatalog("### 5.4 쿼리 카탈로그");
    expect(keysOf(sec3), "§3 카탈로그 완전성").toEqual(ALL);
    expect(keysOf(sec54), "§5.4 카탈로그 완전성").toEqual(ALL);
    expect(Object.fromEntries(sec54), "§3 ↔ §5.4 상호 일치").toEqual(Object.fromEntries(sec3));
    expect(Object.keys(CATALOG).map(Number).sort((a, b) => a - b)).toEqual(ALL);
    for (const [idx, entry] of sec3) {
      expect(CATALOG[idx], `카탈로그 ${idx}`).toEqual(entry);
    }
    // 신규 2종의 X-View 유형 해석까지 잠근다 — CATALOG 누락이면 "other"로 샌다
    expect(typeOfQuery("Daily_Order_Insert")).toBe("etl");
    expect(typeOfQuery("Stale_Orders_Purge")).toBe("etl");
  });

  it("상태·유형 표기가 6종/3종으로 정의되어 있다", () => {
    expect(Object.keys(QUERY_TYPE_LABEL)).toHaveLength(6);
    expect(QUERY_STATE_LABEL[1]).toBe("In Process");
    expect(QUERY_STATE_LABEL[2]).toBe("In Queue");
  });
});

describe("라벨 값 이스케이프 (주입 차단)", () => {
  it("따옴표로 문자열을 닫고 식을 주입할 수 없다", () => {
    const evil = '"} or on() vector(1) or DCGM_FI_DEV_GPU_UTIL{a="';
    const s = selector({ env: evil, instances: [], gpus: [], migs: [] });
    // 주입 시도가 문자열 리터럴 안에 갇힌다 — 셀렉터는 정확히 4개 라벨만 갖는다
    expect(s.match(/=~"/g)).toHaveLength(4);
    expect(escapeLabelValue(evil)).not.toContain('"}');
    expect(escapeLabelValue(evil)).toContain('\\"');
  });

  it("정규식 메타문자를 이스케이프한다", () => {
    expect(escapeLabelValue("gpu-server-01.*")).toBe("gpu-server-01\\\\.\\\\*");
  });

  it("개행·제어문자를 제거한다", () => {
    expect(escapeLabelValue("a\nb\tc")).toBe("abc");
  });

  it("여러 값 선택도 안전하게 결합된다", () => {
    const s = selector({ env: "production", instances: ["gpu-server-01", 'x"y'], gpus: [], migs: [] });
    expect(s).toContain('node=~"gpu-server-01|x\\"y"');
  });
});

describe("Worker 슬롯 → (gpu, mig) 분해 (CDX-H-03)", () => {
  const sel = (gpus: string[], migs: string[]) =>
    selector({ env: "production", instances: [], gpus, migs });

  it("slot 0~7을 gpu·mig 두 성분으로 되돌린다", () => {
    // slot 5 = gpu 2, mig 1 — 예전에는 mig=~"5"가 되어 결과가 0건이었다
    expect(sel([], ["5"])).toContain('gpu=~"2"');
    expect(sel([], ["5"])).toContain('mig=~"1"');
  });

  it("Worker 미선택이면 GPU 선택을 그대로 쓰고 mig는 전체다", () => {
    const s = sel(["1"], []);
    expect(s).toContain('gpu=~"1"');
    expect(s).toContain('mig=~".*"');
  });

  it("GPU와 Worker가 배타적이면 전체로 넓히지 않고 '결과 없음'이 된다", () => {
    // gpu=0 인데 slot 2(=gpu 1) 선택 → 교집합 공집합.
    // 예전에는 alternation([])이 `.*`를 만들어 **전 GPU가 잡혔다**(위험한 확대).
    const s = sel(["0"], ["2"]);
    // 모순 매처 — 같은 라벨에 "비어 있지 않음" + "비어 있음"을 동시에 요구한다.
    expect(s).toContain('gpu=~".+"');
    expect(s).toContain('gpu!~".+"');
    expect(s).not.toContain('gpu=~".*"');
  });

  it("공집합 표현에 `$^`를 쓰지 않는다 (CDX-H2-01)", () => {
    /* `$^`는 RE2에서 빈 문자열과 일치하고, PromQL에서 빈 값을 허용하는 매처는
       **그 라벨이 아예 없는 계열까지 선택**한다. 실측(2026-08-08):
         count(sqm_query_p95_seconds{gpu=~"$^"})            = 6  ← `.*`와 동일 (무효)
         count(sqm_query_p95_seconds{gpu=~".+", gpu!~".+"}) = 0  ← 의도대로
       `sqm_query_p95_seconds`는 gpu 라벨이 없는 **실제 사용 메트릭**이므로 화면에 드러난다. */
    const s = sel(["0"], ["2"]);
    expect(s).not.toContain("$^");
  });

  it("공집합 셀렉터에는 값 기반 gpu·mig 매처를 남기지 않는다", () => {
    // 값 매처를 남기면 "라벨 없는 메트릭 통과" 구멍이 되살아난다.
    const s = sel(["0"], ["2"]);
    expect(s).not.toMatch(/mig=~"[^"]*"/);
    expect(s.match(/gpu/g)).toHaveLength(2);   // gpu=~".+" 와 gpu!~".+" 둘뿐
  });

  it("일치하는 GPU만 남긴다", () => {
    // gpu 0·1 선택 + slot 2·3(= gpu 1) → gpu는 1만 남는다
    const s = sel(["0", "1"], ["2", "3"]);
    expect(s).toContain('gpu=~"1"');
  });

  it("범위를 벗어난 슬롯 값은 무시한다", () => {
    const s = sel([], ["8", "-1", "abc"]);
    expect(s).toContain('gpu=~".*"');
    expect(s).toContain('mig=~".*"');
  });

  it("직사각형이 아닌 선택은 넓게 잡힌다 — 알려진 한계 (ESC-H8)", () => {
    // {slot0(g0m0), slot3(g1m1)} → gpu=~"0|1", mig=~"0|1" = 4칸.
    // 한 셀렉터로 축 간 OR을 표현할 수 없다. 넓어지는 것은 의도된 절충이며,
    // 위 '배타적' 케이스처럼 조용히 전체가 되는 것과는 다르다.
    const s = sel([], ["0", "3"]);
    expect(s).toContain('gpu=~"0|1"');
    expect(s).toContain('mig=~"0|1"');
  });
});

describe("instant vs range 규칙 (형제 Phase 5 교훈)", () => {
  it("상태·신원 쿼리는 구간 함수를 쓰지 않는다", () => {
    const d = rangeDetail(F, 1800);
    for (const expr of [d.gpuState, d.queryIds, d.memoryBytes]) {
      expect(expr).not.toMatch(/_over_time|increase\(/);
    }
    for (const expr of Object.values(runningStatements(F))) {
      expect(expr).not.toMatch(/_over_time|increase\(/);
    }
  });

  it("타임라인·시계열만 range 모드다 (세그먼트·추이를 그려야 하므로)", () => {
    const ranged = REGISTRY.filter((q) => q.mode === "range").map((q) => q.id);
    expect(ranged).toContain("timeline");
    // X2·X3: 완료 이벤트 3종은 **range 전용**이다 — instant는 링(최근 ~5.6분)만 보인다 (§2b)
    expect(ranged).toContain("xviewEvents.endTimestamp");
    expect(ranged).toContain("xviewEvents.duration");
    expect(ranged).toContain("xviewEvents.phases");
    // 슬롯별 4종 + All 뷰 노드 평균 4종 (R9 F2.2)
    expect(ranged.filter((id) => id.startsWith("gpuTimeseries."))).toHaveLength(4);
    expect(ranged.filter((id) => id.startsWith("gpuTimeseriesAvg."))).toHaveLength(4);
    expect(REGISTRY.find((q) => q.id === "runningStatements.identity")?.mode).toBe("instant");
  });

  it("rows/s 구간 평균은 시점별 sum 후 평균이다 (라벨셋 교체 시 과대계상 방지)", () => {
    const d = rangeDetail(F, 1800);
    expect(d.rowsPerSecond).toBe("avg_over_time((sum(sqm_query_rows_per_second{" + selector(F) + "}))[1800s:])");
    expect(d.rowsPerSecond).not.toMatch(/sum\(avg_over_time/);
  });

  it("구간 창은 최소 60초로 보정된다", () => {
    expect(rangeDetail(F, 5).queryCount).toContain("[60s]");
  });
});
