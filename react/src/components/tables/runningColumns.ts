import type { StatementRow } from "../../hooks/useDashboardData";
import { formatClock, workerName } from "../../lib/format";
import { statusOf } from "../../lib/statusMeta";
import { currentPhase } from "../../screens/drilldown/mockQueryDetail";

/* RunningQueries 의 열 정의·표기·정렬 헬퍼 — 컴포넌트 파일과 분리(react-refresh 규칙). */

/** 표 상수 — 목업과 동일(GRAM 상한 364GB = limitQueryMemoryGB, VRAM 71GB). */
export const MEM_LIMIT_GB = 364;
export const VRAM_LIMIT_GB = 71;
export const LONG_RUNNING_SEC = 1800;

export type ColType =
  | "stamp" | "node" | "worker" | "conn" | "link" | "svc" | "lock" | "user" | "status"
  | "elapsed" | "prog" | "mem" | "spool" | "vram" | "gpu" | "cpu" | "actions";

/** 열 순서 저장 키(localStorage) — 드래그로 바꾼 순서를 브라우저에 기억한다 (2026-09-04). */
export const COLUMN_ORDER_KEY = "topview.running-queries.column-order";

/** 저장된 순서를 읽는다 — 손상·구버전(열 집합 불일치)은 기본 순서로. */
export function loadColumnOrder(defaults: readonly ColType[]): ColType[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) return [...defaults];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaults];
    const set = new Set(defaults);
    if (parsed.length !== defaults.length || !parsed.every((k) => set.has(k as ColType))
      || new Set(parsed).size !== parsed.length) return [...defaults];
    return parsed as ColType[];
  } catch {
    return [...defaults];
  }
}

export function saveColumnOrder(order: readonly ColType[]): void {
  try {
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // 저장 불가 환경(프라이빗 모드 등) — 순서는 세션 동안만 유지된다
  }
}

/** 드래그한 열(from)을 대상 열(to) 자리에 끼워 넣은 새 순서. 같은 열이면 그대로. */
export function moveColumn(order: readonly ColType[], from: ColType, to: ColType): ColType[] {
  if (from === to) return [...order];
  const next = order.filter((k) => k !== from);
  const idx = next.indexOf(to);
  next.splice(idx < 0 ? next.length : idx, 0, from);
  return next;
}

interface Column {
  key: ColType;
  label: string;
  width: number;
  num?: boolean;
}

/** 16열 정의 — 목업 COLUMNS(topview_table1 lib/columns.ts) 순서·폭 그대로 (합계 1550px). */
export const RUNNING_COLUMNS: readonly Column[] = [
  { key: "stamp", label: "Query Start", width: 130 },
  { key: "node", label: "Hostname", width: 102 },
  { key: "worker", label: "Worker", width: 68 },
  { key: "conn", label: "Connection ID", width: 88 },
  { key: "link", label: "Statement ID", width: 82 },
  { key: "svc", label: "Service", width: 90 },
  { key: "lock", label: "Lock Type", width: 66 },
  { key: "user", label: "User Name", width: 70 },
  { key: "status", label: "상태", width: 78 },
  { key: "elapsed", label: "Elapsed Time(초)", width: 104, num: true },
  { key: "prog", label: "진행율(%)", width: 86, num: true },
  { key: "mem", label: "사용 메모리(GRAM)", width: 178, num: true },
  { key: "spool", label: "Disk Spool", width: 70, num: true },
  { key: "vram", label: "GPU 메모리(VRAM)", width: 158, num: true },
  { key: "gpu", label: "GPU 사용률(%)", width: 90, num: true },
  { key: "cpu", label: "CPU 사용률(%)", width: 90, num: true },
  /* 2026-09-04 (인간 지시): 로그 탭 바로 열기 + Kill — 이전 표의 Statement ID 상세에서
     하던 것을 행 단위 버튼으로. 정렬·값 없음. */
  { key: "actions", label: "작업", width: 118 },
];

const p2 = (n: number) => String(n).padStart(2, "0");

/** 시작 시각 전체 표기 — 날짜는 KST 고정(formatClock 과 같은 시간대), 시각은 formatClock. */
export function formatStampKST(sec: number): string {
  if (!Number.isFinite(sec)) return "-";
  const d = new Date(sec * 1000 + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${formatClock(sec)}`;
}

/** 경과 표기 — 목업 elapsedKo("1시간 2분 3초"). 결측은 "-". */
export function formatElapsedKo(sec: number): string {
  if (!Number.isFinite(sec)) return "-";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}시간`);
  if (h || m) parts.push(`${m}분`);
  parts.push(`${r}초`);
  return parts.join(" ");
}

/** 정렬 값 — 결측(null)은 방향과 무관하게 항상 뒤 (목업 pick 규칙). */
export function sortValueOf(r: StatementRow, key: ColType): number | string | null {
  const num = (v: number) => (Number.isFinite(v) ? v : null);
  switch (key) {
    case "stamp": return num(r.startTimeSec);
    case "node": return r.node || null;
    case "worker": return (r.worker || workerName(r.node, r.gpu, r.mig)) || null;
    case "conn": return r.connectionId || null;
    case "link": return num(Number(r.stmtId));
    case "svc": return r.service || null;
    case "lock": return Number.isFinite(r.lockHeldSec) ? "Held" : null;
    case "user": return r.user || null;
    case "status": return phaseOf(r).order;
    case "elapsed": return num(r.elapsedSec);
    case "prog": return num(r.progress);
    case "mem": return num(r.memoryBytes);
    case "spool": return Number.isFinite(r.spoolBytes) && r.spoolBytes > 0 ? r.spoolBytes : null;
    case "vram": return num(r.vramBytes);
    case "gpu": return num(r.gpuPct);
    case "cpu": return num(r.cpuPct);
    case "actions": return null;
  }
}

export interface SortState { key: ColType; desc: boolean }

export function sortRows(rows: StatementRow[], sort: SortState | null): StatementRow[] {
  if (!sort) return rows;
  const { key, desc } = sort;
  return [...rows].sort((a, b) => {
    const av = sortValueOf(a, key);
    const bv = sortValueOf(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "ko");
    return desc ? -cmp : cmp;
  });
}


export function phaseOf(r: StatementRow) {
  const key = currentPhase({ id: r.stmtId, qid: r.qid, elapsed: r.elapsedSec });
  const st = statusOf(key);
  // 정렬용 순서 — 상태 축 In Queue < Preparing < Initializing < Executing
  const order = ["state--queue", "state--compile", "state--init", "state--run"].indexOf(st.badgeClass);
  return { st, order };
}

