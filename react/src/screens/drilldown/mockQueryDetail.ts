/**
 * Query 상세의 목업 생성기 (X6) — 실행계획(explainPlan)과 로그(mockLogs).
 *
 * **메트릭에는 계획도 로그도 없다** — 라벨에 실으면 카디널리티가 폭발한다(계약 원칙,
 * `cleanupCommands.ts` mockSql과 같은 이유). 실제 시스템은 receiver가 SQream
 * `explain`을, 로그 저장소(F4)가 로그를 준다. 여기서는 행 데이터(stmt_id·qid·
 * progress…)에서 **결정론적으로** 만든다 — 같은 입력이면 항상 같은 출력이라
 * 새로고침에도 내용이 바뀌지 않고, 테스트도 벽시계 없이 고정된다.
 *
 * explainPlan은 QueryAnalytics의 EXPLAIN 모달에서 쓰던 것을 옮겨 왔다(X6).
 * qid 없이 부르면 옮기기 전과 **바이트 단위로 같은** 출력을 낸다 — qid를 주면
 * mockSql의 SQL 계열(JOI=조인, AGG/SEL=집계, DEL/UPD=변경, INS/LOA=적재)과
 * 모양을 맞춘 변주가 나온다. SQL 탭과 플랜 탭이 서로 다른 쿼리처럼 보이면 안 된다.
 *
 * mockPhases(X6-f1)는 로그가 서술하는 생애주기 4단계를 `XViewPhases` 형태로 낸다 —
 * 로그 탭 상단의 누적 막대(PhaseBar, X-View와 공용)와 로그 문장이 **같은 수치**를
 * 봐야 하므로 mockLogs도 이 함수를 소비한다(따로 계산하면 초 단위가 어긋난다).
 */
import type { XViewPhases } from "../../lib/xview";

/** 목업 실행계획이 참조하는 테이블 — 정적 `MOCK_TABLES`와 같다. */
export const MOCK_TABLES = ["sales_data", "customer_orders", "web_traffic", "logs_data"];

/** exporter `_synth_phase`와 같은 꼴의 결정론 해시 — 같은 seed면 같은 값. */
function hashOf(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 131 + ch.codePointAt(0)!) % 10_007;
  return h;
}

/** 0~1 결정론 난수 대용 — salt로 줄기를 나눈다. */
function unit(seed: string, salt: number): number {
  return hashOf(`${seed}/${salt}`) / 10_006;
}

function chunksScanned(q: { id: string; scan?: number; qid?: string }): string {
  if (q.scan !== undefined && Number.isFinite(q.scan)) {
    return String(Math.max(1, Math.round(q.scan / (64 * 1024 * 1024))));
  }
  // 팝업 경로(qid 있음)는 scan 메트릭을 조인하지 않는다 — 해시로 40~400을 만든다.
  // qid 없는 기존 경로는 "-" 그대로다(QueryAnalytics 동작 보존).
  if (q.qid) return String(40 + (hashOf(q.id + q.qid) % 361));
  return "-";
}

/** 목업 실행계획 본문. 값은 전부 내부에서 만든 것이라 그대로 텍스트로 넣는다. */
export function explainPlan(q: {
  id: string; worker?: string; scan?: number; qid?: string;
}): string {
  const worker = q.worker || "-";
  const chunks = chunksScanned(q);
  const code = (q.qid ?? "").slice(0, 3);
  const lines = planLines(code, q.id, worker, chunks);
  // 말미의 "목업 실행계획…(M3)" 고지는 X12에서 제거 — 결정론 목업이라는 사실은
  // 파일 머리 주석·문서가 담는다.
  return lines.join("\n");
}

/** SQL 계열(`SQL_BY_CODE` 3자 코드)별 플랜 골격 — 모르면 기존 일반형. */
function planLines(code: string, id: string, worker: string, chunks: string): string[] {
  switch (code) {
    case "JOI":
      return [
        `1. PushToNetworkQueue   rows=all                 (worker: ${worker})`,
        "2.   GpuJoin            on=channel_name          [GPU]",
        "3.     GpuJoin          on=region_name           [GPU]",
        "4.       GpuJoin        on=customer_key          [GPU]",
        "5.         GpuDecompress                          [GPU]",
        "6.           ReadTable  table=sales.public.orders",
        `                        chunks_scanned=${chunks}`,
        "7.           ReadTable  table=sales.public.customers",
      ];
    case "SEL":
    case "AGG":
      return [
        `1. PushToNetworkQueue   rows=all                 (worker: ${worker})`,
        `2.   Reorder            sort=${code === "AGG" ? "cnt" : "total"} DESC`,
        `3.     GpuReduce        group_by=${code === "AGG" ? "product_id" : "region"}      [GPU]`,
        `4.       GpuTransform   expr=${code === "AGG" ? "sum(qty)" : "sum(amount)"}          [GPU]`,
        "5.         GpuDecompress                          [GPU]",
        `6.           ReadTable  table=sales.public.${code === "AGG" ? "order_items" : "orders"}`,
        `                        chunks_scanned=${chunks}`,
      ];
    case "DEL":
    case "UPD":
      return [
        `1. ${code === "DEL" ? "DeleteRows " : "UpdateRows "}          `
        + `table=sales.public.${code === "DEL" ? "orders" : "customers"}   (worker: ${worker})`,
        `2.   Filter             pred=${code === "DEL"
          ? "order_date < dateadd(day,-400,current_date)" : "lifetime_amount > 1000000"}`,
        "3.     GpuDecompress                            [GPU]",
        `4.       ReadTable      table=sales.public.${code === "DEL" ? "orders" : "customers"}`,
        `                        chunks_scanned=${chunks}`,
      ];
    case "INS":
    case "LOA":
      return [
        `1. WriteTable           table=${code === "INS"
          ? "sales.public.orders_daily" : "etl.public.fact_daily"}   (worker: ${worker})`,
        "2.   Rechunk            target=64MB",
        "3.     GpuCompress                              [GPU]",
        "4.       ReadTable      table=staging.public.orders_raw",
        `                        chunks_scanned=${chunks}`,
      ];
    default: {
      // 기존 QueryAnalytics 일반형 — qid 없이 부르면 이 경로만 탄다(이전과 동일 출력).
      const table = MOCK_TABLES[Number(id) % MOCK_TABLES.length] ?? MOCK_TABLES[0];
      return [
        `1. PushToNetworkQueue   rows=all                 (worker: ${worker})`,
        "2.   Reorder            sort=timestamp DESC",
        "3.     GpuReduce        group_by=region          [GPU]",
        "4.       GpuTransform   expr=sum(amount)         [GPU]",
        "5.         Filter       pred=event_date >= dateadd(day,-30,getdate())",
        "6.           GpuDecompress                        [GPU]",
        `7.             ReadTable  table=public.${table}`,
        `                          chunks_scanned=${chunks}`,
      ];
    }
  }
}

/* ── 구조화 실행계획 (X8 — 플랜 탭 라이브·색상) ───────────────────────── */

export interface PlanStep {
  step: number;
  op: string;
  detail: string;
  gpu: boolean;
  /** done=예산 고정(재조회 불변) · running=경과 반영(재조회마다 증가) · pending=0 */
  seconds: number;
  state: "done" | "running" | "pending";
}

/** 플랜 단계 색 임계(초) — 피드백 X8-#3: 병목을 눈으로 즉시 파악. */
export const PLAN_TIME_RED_S = 100;
export const PLAN_TIME_YELLOW_S = 50;

/** qid 계열별 단계 골격 — `planLines`의 연산자·테이블 어휘와 일치해야 한다
    (드리프트 가드 테스트가 explainPlan 출력과 대사한다). */
function planSkeleton(code: string, id: string): Array<{
  op: string; detail: string; gpu: boolean;
}> {
  switch (code) {
    case "JOI":
      return [
        { op: "PushToNetworkQueue", detail: "rows=all", gpu: false },
        { op: "GpuJoin", detail: "on=channel_name", gpu: true },
        { op: "GpuJoin", detail: "on=region_name", gpu: true },
        { op: "GpuJoin", detail: "on=customer_key", gpu: true },
        { op: "GpuDecompress", detail: "", gpu: true },
        { op: "ReadTable", detail: "table=sales.public.orders", gpu: false },
        { op: "ReadTable", detail: "table=sales.public.customers", gpu: false },
      ];
    case "SEL":
    case "AGG":
      return [
        { op: "PushToNetworkQueue", detail: "rows=all", gpu: false },
        { op: "Reorder", detail: `sort=${code === "AGG" ? "cnt" : "total"} DESC`, gpu: false },
        { op: "GpuReduce",
          detail: `group_by=${code === "AGG" ? "product_id" : "region"}`, gpu: true },
        { op: "GpuTransform",
          detail: `expr=${code === "AGG" ? "sum(qty)" : "sum(amount)"}`, gpu: true },
        { op: "GpuDecompress", detail: "", gpu: true },
        { op: "ReadTable",
          detail: `table=sales.public.${code === "AGG" ? "order_items" : "orders"}`,
          gpu: false },
      ];
    case "DEL":
    case "UPD":
      return [
        { op: code === "DEL" ? "DeleteRows" : "UpdateRows",
          detail: `table=sales.public.${code === "DEL" ? "orders" : "customers"}`,
          gpu: false },
        { op: "Filter",
          detail: `pred=${code === "DEL"
            ? "order_date < dateadd(day,-400,current_date)"
            : "lifetime_amount > 1000000"}`, gpu: false },
        { op: "GpuDecompress", detail: "", gpu: true },
        { op: "ReadTable",
          detail: `table=sales.public.${code === "DEL" ? "orders" : "customers"}`,
          gpu: false },
      ];
    case "INS":
    case "LOA":
      return [
        { op: "WriteTable",
          detail: `table=${code === "INS"
            ? "sales.public.orders_daily" : "etl.public.fact_daily"}`, gpu: false },
        { op: "Rechunk", detail: "target=64MB", gpu: false },
        { op: "GpuCompress", detail: "", gpu: true },
        { op: "ReadTable", detail: "table=staging.public.orders_raw", gpu: false },
      ];
    default: {
      const table = MOCK_TABLES[Number(id) % MOCK_TABLES.length] ?? MOCK_TABLES[0];
      return [
        { op: "PushToNetworkQueue", detail: "rows=all", gpu: false },
        { op: "Reorder", detail: "sort=timestamp DESC", gpu: false },
        { op: "GpuReduce", detail: "group_by=region", gpu: true },
        { op: "GpuTransform", detail: "expr=sum(amount)", gpu: true },
        { op: "Filter", detail: "pred=event_date >= dateadd(day,-30,getdate())", gpu: false },
        { op: "GpuDecompress", detail: "", gpu: true },
        { op: "ReadTable", detail: `table=public.${table}`, gpu: false },
      ];
    }
  }
}

/**
 * 구조화 목업 실행계획 (X8) — 단계별 소요시간이 **살아 움직인다**.
 *
 * 결정론(벽시계 금지): 입력은 elapsed(런타임 메트릭)뿐이다. 단계 예산은 해시로
 * 고정되고(총 1~10분), 해시로 고른 **병목 1단계가 전체의 45~70%**를 가져가
 * elapsed가 자라면 그 단계가 노랑(50s)→빨강(100s) 임계를 실제로 넘는다.
 * 실행 순서는 표시 역순(leaf ReadTable → root)이며 elapsed가 예산을 차례로
 * 소비한다: 지난 단계=예산 고정(done, 재조회 불변) · 현재 단계=잔여(running,
 * 재조회마다 증가) · 나머지=pending(0). elapsed가 총예산을 넘으면 root가
 * running으로 계속 자란다. elapsed 결측은 0(전 단계 대기)이다.
 */
export function mockPlanSteps(q: {
  id: string; qid?: string; elapsed?: number;
}): PlanStep[] {
  const code = (q.qid ?? "").slice(0, 3);
  const skel = planSkeleton(code, q.id);
  const seed = q.id + (q.qid ?? "");
  const total = 60 + 540 * unit(seed, 9);
  const bottleneck = hashOf(`${seed}/bn`) % skel.length;

  const weights = skel.map((_, i) => 0.5 + unit(seed, 20 + i));
  // 병목 가중 = 나머지 합의 0.82~2.32배 → 비중 45~70%가 보장된다(r/(1+r)).
  const othersSum = weights.reduce((acc, w, i) => (i === bottleneck ? acc : acc + w), 0);
  weights[bottleneck] = othersSum * (0.82 + 1.5 * unit(seed, 40));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const budgets = weights.map((w) => (w / wsum) * total);

  const elapsed = Number.isFinite(q.elapsed) ? Math.max(0, q.elapsed as number) : 0;
  const seconds = skel.map(() => 0);
  const states: PlanStep["state"][] = skel.map(() => "pending");
  let remaining = elapsed;
  for (let k = skel.length - 1; k >= 0; k -= 1) { // 표시 역순 = 실행 순서
    const isRoot = k === 0;
    if (remaining >= budgets[k] && !isRoot) {
      seconds[k] = budgets[k];
      states[k] = "done";
      remaining -= budgets[k];
    } else {
      seconds[k] = remaining;
      states[k] = "running";
      break; // 그 위(root 방향)는 pending 유지
    }
  }
  return skel.map((s, i) => ({
    step: i + 1, op: s.op, detail: s.detail, gpu: s.gpu,
    seconds: seconds[i], state: states[i],
  }));
}

export interface MockLogLine {
  /** 문장 시작 기준 오프셋 — `T+MM:SS.d`. 벽시계를 쓰지 않는다(결정론). */
  at: string;
  level: "Info" | "Warning";
  msg: string;
}

function offset(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `T+${String(m).padStart(2, "0")}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

/** 스풀 경고 임계 — exporter drilldown_sim의 스풀 규칙과 감각을 맞춘다. */
const SPOOL_WARN_PROG = 0.72;

/**
 * 로그가 서술하는 생애주기 4단계 (X6-f1) — 준비 단계는 exporter의 합성
 * 범위(compile 0.4~2.5s, queue 0~4s, init 0.3~1.5s)를 미러링한 결정론 해시,
 * executing은 "현재까지 경과"(실행 중이라 계속 자란다 — 완료 이벤트의
 * X-View와 의미가 다르다).
 */
export function mockPhases(q: {
  id: string; qid?: string; elapsed?: number;
}): XViewPhases {
  const seed = q.id + (q.qid ?? "");
  return {
    compileSec: 0.4 + 2.1 * unit(seed, 1),
    queuedSec: 4.0 * unit(seed, 2),
    initializingSec: 0.3 + 1.2 * unit(seed, 3),
    executingSec: Number.isFinite(q.elapsed) ? Math.max(0, q.elapsed as number) : 0,
  };
}

/**
 * 현재 단계 (X7-a) — Query Overview의 Status 열이 쓴다. 행의 elapsed를 합성 준비
 * 단계(compile→queue→init, 합계 ≤~8s) 시작점에 겹쳐 읽는다: 갓 도착한 행만 잠깐
 * 앞 단계를 보이고, 그 뒤는 Executing이다(포아송 도착 + 5s 폴링이라 앞 단계 행이
 * 표에 꾸준히 섞인다). 판정은 `mockPhases` 단일 원천 — 따로 계산하면 로그 탭
 * 수치와 어긋난다. 로그 탭 서사는 전 생애주기를 항상 그린다(허용 불일치 —
 * 팝업은 주로 오래된 행에서 열린다).
 */
export function currentPhase(q: {
  id: string; qid?: string; elapsed?: number;
}): keyof XViewPhases {
  const p = mockPhases(q);
  const e = p.executingSec; // = max(0, elapsed), 결측이면 0
  if (e < p.compileSec) return "compileSec";
  if (e < p.compileSec + p.queuedSec) return "queuedSec";
  if (e < p.compileSec + p.queuedSec + p.initializingSec) return "initializingSec";
  return "executingSec";
}

/**
 * 생애주기형 목업 로그 — compile → queue → 배정 → GPU 초기화 → 청크 스캔 진행.
 * 단계 소요는 `mockPhases`가 단일 원천이다 — 로그 탭 상단 누적 막대와 문장의
 * 수치가 어긋나면 안 된다.
 */
export function mockLogs(q: {
  id: string; qid?: string; user?: string; worker?: string; node?: string;
  service?: string; elapsed?: number; prog?: number;
}): MockLogLine[] {
  const phases = mockPhases(q);
  const compileS = phases.compileSec;
  const queuedS = phases.queuedSec;
  const initS = phases.initializingSec;
  const elapsed = phases.executingSec;
  const prog = Number.isFinite(q.prog) ? Math.min(1, Math.max(0, q.prog as number)) : 0;

  let t = 0;
  const lines: MockLogLine[] = [{
    at: offset(t),
    level: "Info",
    msg: `Statement ${q.id} received`
      + ` (user=${q.user || "-"}, service=${q.service || "-"}) — compiling.`,
  }];
  t += compileS;
  lines.push({
    at: offset(t), level: "Info",
    msg: `Compile finished in ${compileS.toFixed(1)}s${q.qid ? ` — classified ${q.qid}` : ""}.`,
  });
  t += queuedS;
  lines.push({
    at: offset(t), level: "Info",
    msg: `Assigned to worker ${q.worker || "-"} (node ${q.node || "-"})`
      + ` after ${queuedS.toFixed(1)}s in queue.`,
  });
  t += initS;
  lines.push({
    at: offset(t), level: "Info",
    msg: "GPU context initialized — device memory reserved.",
  });

  // 실행 구간 이벤트 — 도달한 이정표까지만 낸다. 스풀 경고(0.72)가 75% 이정표보다
  // 먼저 일어나므로 시각으로 모아 정렬한다(시간 역행 로그는 즉시 어색하다).
  const events: Array<[number, MockLogLine["level"], string]> = [];
  for (const mark of [0.25, 0.5, 0.75]) {
    if (prog >= mark) {
      events.push([elapsed * mark, "Info", `Chunk scan progress ${Math.round(mark * 100)}%.`]);
    }
  }
  if (prog > SPOOL_WARN_PROG) {
    events.push([elapsed * SPOOL_WARN_PROG, "Warning",
      "Spool usage rising — memory pressure, spilling to disk."]);
  }
  events.sort((a, b) => a[0] - b[0]);
  for (const [sec, level, msg] of events) lines.push({ at: offset(t + sec), level, msg });
  lines.push({
    at: offset(t + elapsed), level: "Info",
    msg: `Executing… progress ${Math.round(prog * 100)}%.`,
  });
  return lines;
}
