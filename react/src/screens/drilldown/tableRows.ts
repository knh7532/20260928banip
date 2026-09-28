/**
 * 테이블 계열 화면(Table Usage · Table Activity)의 클라이언트 조인 (S3).
 *
 * ⚠ 조인 키는 **구조적 키** `JSON.stringify([db, schema, table])`다.
 * 점 연결(`db.schema.table`)은 라벨에 점이 있으면 충돌한다
 * (`schema="a.b",table="c"` ↔ `schema="a",table="b.c"`) — 정적본이 codex Phase 0.13
 * Major로 잡혔던 부분이라 같은 방식을 유지한다.
 */
import type { PromSeries } from "../../api/prom";

export interface TableRow {
  db: string;
  schema: string;
  table: string;
  rows?: number;
  chunks?: number;
  size?: number;
  comp?: number;
  algos?: string[];
  frag?: number;
  deleted?: number;
  /** X10 (계약 v4.8) — 유지보수 판정용 청크 통계. */
  filled90?: number;
  under80?: number;
  nodel?: number;
  clustering?: number;
  /** X10-f3 (계약 v4.9) — 유지보수 실행 중일 때만: 현재 단계·전체 진행도. */
  maintStage?: string;
  maintProgress?: number;
  /** Table Activity 전용 */
  access?: Record<string, number>;
  lastAccess?: number;
  sizeDelta?: number;
}

export function tableKey(m: Record<string, string>): string {
  return JSON.stringify([m.db, m.schema, m.table]);
}

/** 여러 메트릭 결과를 (db, schema, table) 하나의 행으로 모은다. */
export class TableJoin {
  private readonly map = new Map<string, TableRow>();

  entry(m: Record<string, string>): TableRow {
    const key = tableKey(m);
    let row = this.map.get(key);
    if (!row) {
      row = { db: m.db ?? "", schema: m.schema ?? "", table: m.table ?? "" };
      this.map.set(key, row);
    }
    return row;
  }

  /** 단순 대입 — 테이블당 시계열이 하나인 메트릭용. */
  assign(series: PromSeries[], set: (row: TableRow, value: number, m: Record<string, string>) => void) {
    for (const s of series) set(this.entry(s.metric), Number(s.value?.[1]), s.metric);
  }

  values(): TableRow[] {
    return [...this.map.values()];
  }
}

/** SQream 청크당 행 상한 — 평균 청크 행·단편화율(인간 확정 어휘 X10-f3)의 분모. */
export const CHUNK_ROW_CAP = 1_048_576;

/** Rechunk 임계값 (매일 새벽 1시 배치 — 인간 확정. 4개 동시 만족 시 대상). */
export const RECHUNK_AVG_ROWS = 900_000;      // ① 평균 청크 행 수 <
export const RECHUNK_FILLED_RATIO = 0.60;     // ② 단편화율 90%↑ 청크 비율 <
export const RECHUNK_NODEL_MIN = 2;           // ③ NoDel_Cnt ≥ (table_frag_info)
export const RECHUNK_UNDER80_MIN = 10;        // ④ 단편화율 80%↓ 청크 합계 >

/** 평균 청크 행 수 = rows / chunks — 상한(CHUNK_ROW_CAP)과 대조해 읽는다. */
export function avgChunkRows(t: TableRow): number | undefined {
  return t.rows !== undefined && t.chunks ? t.rows / t.chunks : undefined;
}

export interface RechunkCheck {
  pass: boolean;
  /** 툴팁 한 줄 — "① 평균 청크 행 649,802 < 900,000" 꼴. */
  text: string;
}

/**
 * Rechunk 4임계 판정 상세 (X10) — 통계가 하나라도 결측이면 undefined(판정 불가).
 * 숫자 표기는 en-US 고정 — 로케일마다 천 단위 구분이 달라지면 테스트가 흔들린다.
 */
export function rechunkChecks(t: TableRow): RechunkCheck[] | undefined {
  const avg = avgChunkRows(t);
  if (avg === undefined || t.chunks === undefined || t.filled90 === undefined
    || t.under80 === undefined || t.nodel === undefined) return undefined;
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
  const filledRatio = t.filled90 / t.chunks;
  return [
    { pass: avg < RECHUNK_AVG_ROWS, text: `① 평균 청크 행 ${n(avg)} < 900,000` },
    { pass: filledRatio < RECHUNK_FILLED_RATIO,
      text: `② 단편화율 90%↑ 청크 ${Math.round(filledRatio * 100)}% < 60%` },
    { pass: t.nodel >= RECHUNK_NODEL_MIN, text: `③ NoDel_Cnt ${n(t.nodel)} ≥ 2` },
    { pass: t.under80 > RECHUNK_UNDER80_MIN, text: `④ 단편화율 80%↓ 청크 ${n(t.under80)} > 10` },
  ];
}

/** Rechunk 대상 = 4임계 **동시** 만족 (매일 01:00 배치 — Cleanup Extent 동반). */
export function isRechunkTarget(t: TableRow): boolean {
  const checks = rechunkChecks(t);
  return checks !== undefined && checks.every((c) => c.pass);
}

/** 유지보수 단계 표시명 (X10-f3) — stage enum(계약 v4.9) → 화면 표기. */
export const STAGE_LABELS: Record<string, string> = {
  cleanup_chunk: "Cleanup Chunk",
  rechunk: "Rechunk",
  cleanup_extent: "Cleanup Extent",
  recalc_index: "Recalculate Chunk Indexes",
};

/**
 * Cleanup Chunk 대상 판정 (X10, 인간 기준) — **delete/update 레코드가 존재하는
 * 테이블**(deleted > 0). 구 규칙(삭제 비율 1.5% OR 단편화 50%)은 목업이 지어낸
 * 것이었고 실데이터에서 대상이 0건이었다 — 실제 배치 기준으로 대체한다.
 */
export function isCleanupTarget(t: TableRow): boolean {
  return t.deleted !== undefined && t.deleted > 0;
}

/** 단편화 색 구간 — 정적 `fragClass`와 같다. */
export function fragTone(f: number | undefined): "red" | "yellow" | "green" | "grey" {
  if (f === undefined) return "grey";
  if (f >= 0.5) return "red";
  if (f >= 0.3) return "yellow";
  return "green";
}

/** 삭제 대기 비율 색 구간 — 정적 `delCls`와 같다. */
export function deletedTone(t: TableRow): "red" | "yellow" | "green" | "grey" {
  if (t.deleted === undefined || !t.rows) return "grey";
  const r = t.deleted / t.rows;
  if (r >= 0.03) return "red";
  if (r >= 0.015) return "yellow";
  return "green";
}

/* `sortByNumber`는 `components/drilldown/useTableSort`로 옮겼다(2026-08-10).
   정렬이 전 화면 기능이 되면서 이 파일에만 두면 화면마다 다시 쓰게 된다.
   "결측은 방향과 무관하게 항상 뒤"라는 규칙도 그쪽이 이어받았다. */
