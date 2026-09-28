/** 화면 표기용 포맷터 — 단위·자릿수는 원본 시안 표기를 따른다. */

/** bytes → "22.3 GB" (십진 GB, 소수 1자리). exporter가 십진 GB로 노출한다. */
/**
 * 워커 한 개의 쿼리 메모리 한도 — SQream `limitQueryMemoryGB = 314`.
 *
 * Top Queries의 `RAM Memory Utilization`이 이 값을 분모로 쓴다. **한 곳에서만**
 * 정의한다 — 화면마다 314를 적으면 현장 설정이 바뀔 때 한 군데가 남는다.
 */
export const WORKER_MEM_LIMIT_GB = 314;
export const WORKER_MEM_LIMIT_BYTES = WORKER_MEM_LIMIT_GB * 1024 ** 3;

export function formatGB(bytes: number): string {
  if (!Number.isFinite(bytes)) return "-";
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** 백분율 → "72%" (정수). */
export function formatPercent(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return "-";
  return `${v.toFixed(decimals)}%`;
}

/** 큰 수 → "1.85M" / "963K". 음수는 절댓값 기준으로 축약하고 부호를 유지한다. */
export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return "-";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)}K`;
  return `${sign}${a.toFixed(0)}`;
}

/** rows/s → "1.85M rows/s". 결측(비유한)이면 단위 없이 "-" (CDX-R3-08). */
export function formatRowsPerSec(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${formatCompact(v)} rows/s`;
}

/** 초 → "1.28 s". */
export function formatSeconds(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return "-";
  return `${v.toFixed(decimals)} s`;
}

/** 토큰 처리량 → "185.4 tok/s" (시안 표기). 결측(비유한)이면 단위 없이 "-". */
export function formatTps(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${v.toFixed(1)} tok/s`;
}

/** 온도 → "61°C". */
export function formatTemp(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${v.toFixed(0)}°C`;
}

/** 전력 → "986 W" / "1.02 kW". */
export function formatWatt(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return v >= 1000 ? `${(v / 1000).toFixed(2)} kW` : `${v.toFixed(0)} W`;
}

/** 정수 천단위 구분 → "12,458". */
export function formatInt(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return Math.round(v).toLocaleString("en-US");
}

/**
 * 시각·날짜는 **KST(Asia/Seoul) 고정 표기**한다 (CDX-R3-06).
 *
 * 현장은 한국이지만 대시보드를 여는 브라우저의 로컬 타임존은 KST가 아닐 수 있다.
 * 로컬 시각을 뽑고 "KST"만 덧붙이면 UTC 브라우저에서 9시간 어긋난다 —
 * `Intl.DateTimeFormat`의 `timeZone`으로 실제 KST를 계산한다. `h23`로 0~23시를 강제한다.
 */
const KST = "Asia/Seoul";
const CLOCK_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: KST,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** epoch(초) → Date. 비유한·범위 밖(Invalid Date)이면 null. */
function toValidDate(unixSec: number): Date | null {
  if (!Number.isFinite(unixSec)) return null;
  const d = new Date(unixSec * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** unix epoch(초) → "14:32:01" (KST). 잘못된 값이면 "-". */
export function formatClock(unixSec: number): string {
  const d = toValidDate(unixSec);
  return d === null ? "-" : CLOCK_FMT.format(d);
}

/** 경과 초 → "HH:MM:SS" (X8 — ① 테이블 런타임 컬럼). 결측(NaN)·음수는 "-".
    드릴다운 화면들의 로컬 clock()과 같은 규칙이다(그쪽은 무수정). */
export function formatElapsed(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  const s = Math.floor(seconds);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** unix epoch(초) → "2026. 07. 16." (KST 날짜). 잘못된 값이면 "-". */
export function formatDateKST(unixSec: number): string {
  const d = toValidDate(unixSec);
  return d === null ? "-" : DATE_FMT.format(d);
}

/** GPU 라벨 → "GPU-0". */
export function formatGpu(gpu: string): string {
  return `GPU-${gpu}`;
}

/* ── 노드·워커 표시명 (단일 진원지) ───────────────────────────────────────────
 * 원시 라벨과 화면 표기를 분리한다.
 *   원시 라벨(계약 TV-C1): node="gpu-server-0N", worker="sqream{N}{GPU}{GI}"
 *   화면 표기            : "icspreamh2gpu0N",   "sqream{N}{GPU}{MIG+1}"
 * 노드·워커를 화면에 쓰는 곳은 예외 없이 아래 함수를 거친다. 변환이 여러 벌로 갈리면
 * 같은 대상이 화면마다 다른 이름으로 나온다 (2026-08-08 표기 통일).
 */

/** 노드 라벨 → 화면 표기. "gpu-server-01" → "icspreamh2gpu01". */
export function displayNode(node: string): string {
  const match = /^gpu-server-(\d+)$/.exec(node);
  return match ? `icspreamh2gpu${match[1]}` : node;
}

/**
 * 물리 슬롯 → SQream 워커 이름. exporter의 `sim_params.worker_name()`과 같은 규칙이라
 * 계산값이 원시 `worker` 라벨과 항상 일치한다. MIG만 1-based.
 * 예) ("gpu-server-01", "1", "0") → "sqream111"
 */
export function workerName(
    node: string,
    gpu: string | number,
    mig: string | number,
): string {
  const match = /(\d+)$/.exec(node ?? "");
  const g = Number(gpu);
  const m = Number(mig);
  if (!match || !Number.isInteger(g) || !Number.isInteger(m)) return "-";
  return `sqream${Number(match[1])}${g}${m}`;
}

/** 평탄화된 워커 슬롯(0~7) → 워커 이름 (필터 드롭다운용). */
export function displayWorker(node: string, slot: string): string {
  const slotNo = Number(slot);
  if (!Number.isInteger(slotNo) || slotNo < 0 || slotNo > 7) return slot;
  return workerName(node, Math.floor(slotNo / 2), slotNo % 2);
}

/**
 * 패널 제목의 인스턴스 접미사 (R6 — PPTX "(선택 인스턴스: …)" 재현).
 * 0개(All) → "(인스턴스: All)", 1개 → "(선택 인스턴스: icspreamh2gpu01)",
 * 2개 이상 → "(인스턴스: N개 선택)" — "All"로 뭉개면 사실과 다르다.
 */
export function instanceSuffix(instances: string[]): string {
  if (instances.length === 0) return "(인스턴스: All)";
  if (instances.length === 1) return `(선택 인스턴스: ${displayNode(instances[0])})`;
  return `(인스턴스: ${instances.length}개 선택)`;
}

/* ── 드릴다운 화면 (S3) — 정적 `mockup/assets/app.js`에서 흡수한 표기 규칙 ──
 * 표기 규칙의 단일 진원지를 유지하기 위해 여기 둔다(ADR H-0002). 정적 화면을 지울 때까지는
 * 두 구현이 공존하므로, 바꿀 때 `app.js`의 같은 함수도 함께 고칠 것.
 */

/** bytes → "84.2 TB". 이진 접두(1024). 잘못된 값이면 "--". */
export function formatBytes(v: number): string {
  if (!Number.isFinite(v)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let idx = 0;
  let x = Math.abs(v);
  while (x >= 1024 && idx < units.length - 1) {
    x /= 1024;
    idx += 1;
  }
  return `${v < 0 ? "-" : ""}${x.toFixed(1)} ${units[idx]}`;
}

/**
 * bytes → "300.0 TB". **십진 접두(1000)** 이고 라이선스 한도·사용량 전용이다.
 *
 * `formatBytes`는 1024로 나누면서 라벨은 `TB`를 붙인다(정적 `app.js`에서 온 규칙이라
 * 함부로 못 바꾼다). 그걸로 라이선스 한도를 그리면 300 TB 계약이 **272.8 TB**로 보인다 —
 * 계약서 숫자와 화면 숫자가 다르면 그 화면은 못 믿는다.
 *
 * 저장장치·라이선스는 관례상 십진이므로 여기만 1000으로 나눈다. 측정된 사용량
 * (테이블 크기·스풀 등)에는 쓰지 않는다 — 그쪽은 기존 표기를 유지한다.
 */
export function formatBytesSI(v: number): string {
  if (!Number.isFinite(v)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let idx = 0;
  let x = Math.abs(v);
  while (x >= 1000 && idx < units.length - 1) {
    x /= 1000;
    idx += 1;
  }
  return `${v < 0 ? "-" : ""}${x.toFixed(1)} ${units[idx]}`;
}

/** unix epoch(초) → "12 minutes ago". 잘못된 값이면 "--". */
export function formatAgo(unixSec: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(unixSec)) return "--";
  const diff = Math.max(0, nowMs / 1000 - unixSec);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

/** unix epoch(초) → "2026-08-07" (로컬 달력일). 잘못된 값이면 "--". */
export function formatIsoDate(unixSec: number): string {
  if (!Number.isFinite(unixSec)) return "--";
  const d = new Date(unixSec * 1000);
  if (Number.isNaN(d.getTime())) return "--";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 큰 건수 → "84.2 B" / "278 K" (정적 `fmtBig`과 동일).
 *
 * `formatCompact`와 **다르다** — 저쪽은 "84.20B"(공백 없음, 소수 2자리)이고 탑뷰 표기다.
 * 여기는 드릴다운 표기라 원본을 그대로 따른다. 999.5에서 단위를 올려 "1000 K"를 막는다.
 */
export function formatBig(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return "--";
  const units = ["", " K", " M", " B"];
  let x = v;
  let i = 0;
  while (Math.abs(x) >= 999.5 && i < units.length - 1) {
    x /= 1000;
    i += 1;
  }
  const d = digits ?? (i >= 2 ? 1 : 0);
  return `${x.toFixed(i === 0 ? 0 : d)}${units[i]}`;
}

/** unix epoch(초) → "2026-08-07 21:54:21" (로컬). 잘못된 값이면 "--". */
export function formatStamp(unixSec: number): string {
  if (!Number.isFinite(unixSec)) return "--";
  const d = new Date(unixSec * 1000);
  if (Number.isNaN(d.getTime())) return "--";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${formatIsoDate(unixSec)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ══════════ 차트 축·범례 숫자 표기 (정적 화면 이관, 2026-08-09) ══════════
 *
 * 상세 대시보드 차트를 C3로 갈아끼우면서 이 포맷터를 빠뜨렸다. 그 결과 y축에
 * `65.06763563699022` 같은 원시 실수가 그대로 찍혔다(인간 지적).
 * 정적 `mockup/assets/app.js`의 `chartNumber()`를 그대로 옮긴다 — 값·자릿수 동일.
 */
export type ChartUnit = "percent" | "bytesPerSec" | "seconds" | "number";

export function chartNumber(value: number, unit: ChartUnit = "number"): string {
  if (!Number.isFinite(value)) return "--";
  if (unit === "percent") return value.toFixed(value >= 10 ? 0 : 1) + "%";
  if (unit === "bytesPerSec") {
    if (value >= 1e9) return (value / 1e9).toFixed(1) + " GB/s";
    if (value >= 1e6) return (value / 1e6).toFixed(1) + " MB/s";
    if (value >= 1e3) return (value / 1e3).toFixed(0) + " KB/s";
    return value.toFixed(0) + " B/s";
  }
  if (unit === "seconds") {
    if (value >= 60) return (value / 60).toFixed(1) + " min";
    return value.toFixed(value >= 10 ? 0 : 1) + " s";
  }
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2);
}

/**
 * 축 최대값 — 정적본 `axisMax()`와 같은 규칙.
 *
 * percent 축은 **100 고정**이다(데이터가 낮아도 축이 늘었다 줄었다 하지 않는다).
 * 그 밖에는 최댓값보다 10% 여유를 둔 "깔끔한" 수로 올린다. 0 이하면 1.
 */
export function chartAxisMax(values: number[], unit: ChartUnit = "number"): number {
  if (unit === "percent") return 100;
  const raw = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  if (raw <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.ceil((raw / power) * 1.1) * power;
}
