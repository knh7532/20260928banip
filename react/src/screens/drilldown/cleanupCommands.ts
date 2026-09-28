/**
 * 정리 작업 명령문 생성 (2026-08-10).
 *
 * 회의록 `260729_SQreamDB_모니터링_회의록.md` §5.1이 근거다:
 *  - Rechunk: 단편화 조회 → 기준 미달 목록 추출 → **실행 명령어까지 자동 생성**
 *  - Cleanup: 대상 목록 조회 → 카탈로그 조인으로 확정 → 대상만 수행
 *  - **실행 방식은 Parallel 확정** (순차는 "월요일 A, 화요일 B" 식으로 일정이 길어짐)
 *  - Cleanup은 ETL 테이블이 많아 물량이 크고 **전 워커를 점유할 수 있어 새벽 권장**
 *
 * 이 화면이 내는 산출물은 **명령문**이다 — 사람이 복사해 실제 승인 경로로 돌릴
 * 수 있어야 하므로 명령문이 틀리면 이 기능은 무의미하다. X10-f2(인간 승인)부터
 * Cleanup/Rechunk 확인은 exporter **합성 통계에도** 반영된다(명령 API — 실제
 * SQream에는 여전히 아무것도 하지 않는다).
 *
 * 임계값은 여기 박지 않는다(ADR S-0004). `tableRows.ts`의 판정을 그대로 쓴다.
 */
import type { TableRow } from "./tableRows";

export type CleanupKind = "RECHUNK" | "CLEANUP_CHUNKS" | "CLEANUP_EXTENTS";

/** `db.schema.table` — SQream이 받는 정규 이름. */
export function qualifiedName(t: Pick<TableRow, "db" | "schema" | "table">): string {
  return `${t.db}.${t.schema}.${t.table}`;
}

const HEAD: Record<CleanupKind, string> = {
  // 근거(회의록 §5.1·유지보수 기준 2026-08-19)는 파일 머리 주석이 담는다 — X12.
  RECHUNK: "-- Rechunk: 단편화된 청크를 재구성한다 — Cleanup Extents 동반",
  CLEANUP_CHUNKS: "-- Cleanup Chunks: 삭제 대기(mark-for-delete) 행이 남긴 청크를 회수한다",
  CLEANUP_EXTENTS: "-- Cleanup Extents: 비어 있는 익스텐트의 메타데이터를 정리한다",
};

/**
 * 대상 목록 → 실행 명령문.
 *
 * 병렬 실행이 확정이므로 문장을 나열하되, **한 줄에 하나**로 둔다 — 실행기가 그대로
 * 병렬 디스패치할 수 있고, 사람이 일부만 떼어 돌리기도 쉽다.
 *
 * X10 (인간 확정 유지보수 기준):
 *  - RECHUNK는 테이블마다 `CLEANUP_EXTENTS`를 **동반**한다 — extent 메타데이터 정리.
 *  - RECHUNK 말미에는 clustering key 테이블(reindex) 대상의
 *    `RECALCULATE_CHUNKS_INDEXES` 블록이 붙는다 — chunk index 재생성(조회 최적화).
 *  - 배치는 매일 새벽 1시에 자동 수행된다 — 화면의 수동 실행은 긴급 조치용이다.
 */
export function cleanupCommand(
  kind: CleanupKind, targets: TableRow[], reindex: TableRow[] = [],
): string {
  const lines = [
    HEAD[kind],
    `-- 대상 ${targets.length}건 · 실행 방식 Parallel`,
    "-- 매일 새벽 1시 자동 수행이 예약되어 있습니다 — 수동 실행은 긴급 조치용입니다.",
    "",
  ];
  if (targets.length === 0) {
    lines.push("-- (대상 없음)");
    return lines.join("\n");
  }
  /* RECHUNK는 3단계다(codex X10-02): Parallel은 **단계 안에서만**이고 단계 사이에는
     배리어가 있다 — 평면 목록을 통째로 병렬 디스패치하면 Extents가 Rechunk를,
     reindex가 둘 다를 앞지를 수 있다. 단계 주석이 실행기의 배리어 지점이다. */
  if (kind === "RECHUNK") {
    lines.push("-- 1단계: Rechunk (단계 내 Parallel)");
    for (const t of targets) lines.push(`SELECT RECHUNK('${qualifiedName(t)}');`);
    lines.push("");
    lines.push("-- 2단계: Cleanup Extents — 1단계 전체 완료 후 (단계 내 Parallel)");
    for (const t of targets) lines.push(`SELECT CLEANUP_EXTENTS('${qualifiedName(t)}');`);
    if (reindex.length > 0) {
      lines.push("");
      lines.push("-- 3단계(마지막): clustering key 테이블의 chunk index 재생성 — 2단계 완료 후");
      for (const t of reindex) {
        lines.push(`SELECT RECALCULATE_CHUNKS_INDEXES('${qualifiedName(t)}');`);
      }
    }
    return lines.join("\n");
  }
  for (const t of targets) {
    const name = qualifiedName(t);
    lines.push(kind === "CLEANUP_CHUNKS"
      ? `SELECT CLEANUP_CHUNKS('${name}');`
      : `SELECT CLEANUP_EXTENTS('${name}');`);
  }
  return lines.join("\n");
}

/**
 * 쿼리 원문 — Query ID를 눌렀을 때 보여 준다.
 *
 * **메트릭에는 SQL 원문이 없다.** 라벨에 실으면 카디널리티가 폭발한다(문장마다 새 시계열).
 * 실제 시스템은 receiver가 `stmt_id`로 조회해 준다. 여기서는 목업이므로 유형에서
 * 결정론적으로 만든다 — 같은 QID면 항상 같은 문장이 나온다.
 */
export function mockSql(row: {
  id: string; qid?: string; user?: string; worker?: string; service?: string;
}): string {
  const code = (row.qid ?? "").slice(0, 3);
  const body = SQL_BY_CODE[code] ?? SQL_BY_CODE.DEFAULT;
  return [
    // "-- 목업 문장입니다…" 고지 2줄은 X12에서 제거 — 재구성 문장이라는 사실은
    // 위 JSDoc·문서가 담는다.
    `-- statement ${row.id}${row.qid ? ` · ${row.qid}` : ""}`
    + `${row.user ? ` · user=${row.user}` : ""}${row.worker ? ` · worker=${row.worker}` : ""}`,
    "",
    body,
  ].join("\n");
}

const SQL_BY_CODE: Record<string, string> = {
  SEL: "SELECT region, SUM(amount) AS total\n  FROM sales.public.orders\n GROUP BY region\n ORDER BY total DESC;",
  AGG: "SELECT product_id, COUNT(*) AS cnt, SUM(qty) AS qty\n  FROM sales.public.order_items\n GROUP BY product_id;",
  JOI: "SELECT c.customer_name, o.order_date, o.amount\n  FROM sales.public.orders o\n  JOIN sales.public.customers c ON c.customer_key = o.customer_key\n  JOIN sales.public.regions  r ON r.region_name  = c.region_name\n  JOIN sales.public.channels ch ON ch.channel_name = o.channel_name;",
  SOR: "SELECT *\n  FROM sales.public.orders\n ORDER BY order_date DESC, customer_name;",
  SCA: "SELECT *\n  FROM risk.public.transactions\n WHERE txn_id IN (SELECT txn_id FROM risk.public.flagged);",
  INS: "INSERT INTO sales.public.orders_daily\nSELECT * FROM staging.public.orders_raw;",
  LOA: "CREATE TABLE etl.public.fact_daily AS\nSELECT o.*, c.region_name\n  FROM staging.public.orders_raw o\n  JOIN sales.public.customers c ON c.customer_key = o.customer_key;",
  EXP: "COPY sales.public.orders TO '/export/orders.csv' WITH DELIMITER ',';",
  DEL: "DELETE FROM sales.public.orders\n WHERE order_date < DATEADD(day, -400, CURRENT_DATE);",
  UPD: "UPDATE sales.public.customers\n   SET grade = 'A'\n WHERE lifetime_amount > 1000000;",
  TRU: "TRUNCATE TABLE staging.public.orders_raw;",
  DDL: "ALTER TABLE sales.public.orders ADD COLUMN channel_name VARCHAR(32);",
  CLE: "SELECT CLEANUP_CHUNKS('sales.public.orders');",
  UTI: "SELECT SHOW_NODE_INFO(1);",
  DEFAULT: "SELECT 1;",
};
