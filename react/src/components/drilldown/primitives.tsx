/**
 * 드릴다운 화면 공용 조각 (S3).
 *
 * 정적 `res/sqream/mockup/*.html` 10화면이 같은 마크업 관용구를 반복한다 — KPI 타일,
 * 카드, pill 배지, 표, 필터바, 토스트. 화면마다 다시 쓰지 않도록 여기 모은다.
 * 클래스 이름은 정적 CSS와 맞춰 뒀다(`.sqm-` 접두) — 마크업을 1:1로 옮길 수 있어
 * 이관 결과를 원본과 대조하기 쉽다.
 */
import type { ReactNode } from "react";

/* ── 카드 ────────────────────────────────────────────────────────────── */

export function Card({ title, aside, children, body = true, className = "" }: {
  title?: ReactNode;
  /** 제목 오른쪽의 부가 표기(건수·구간 라벨 등). */
  aside?: ReactNode;
  children: ReactNode;
  /** 표를 카드에 꽉 채우려면 false — 정적 화면도 표는 padding 없이 붙인다. */
  body?: boolean;
  className?: string;
}) {
  return (
    <section className={`sqm-card ${className}`.trim()}>
      {title !== undefined && (
        <h3 className="sqm-card__head">
          <span>{title}</span>
          {aside !== undefined && <span className="sqm-card__aside">{aside}</span>}
        </h3>
      )}
      {body ? <div className="sqm-card__body">{children}</div> : children}
    </section>
  );
}

/* ── KPI 타일 ────────────────────────────────────────────────────────── */

export type KpiTone = "blue" | "green" | "orange" | "red" | "purple";

export function Kpi({ icon, tone, label, value, color, alert }: {
  icon: string;
  tone: KpiTone;
  label: string;
  value: ReactNode;
  /** 값 글자색 직접 지정 (임계값 강조). */
  color?: string;
  /** 0보다 크면 경고색 — 정적 `setKpi(..., true)`의 alertIfPositive와 같다. */
  alert?: boolean;
}) {
  const tint = alert ? "var(--orange)" : undefined;
  return (
    <div className="sqm-card sqm-kpi">
      <div className={`sqm-kpi__icon sqm-kpi__icon--${tone}`} aria-hidden="true">{icon}</div>
      <div className="sqm-kpi__text">
        <div className="sqm-kpi__label">{label}</div>
        <div className="sqm-kpi__value" style={color ?? tint ? { color: color ?? tint } : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}

/* ── pill 배지 ───────────────────────────────────────────────────────── */

export type PillTone = "red" | "yellow" | "green" | "blue" | "grey" | "orange";

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`sqm-pill sqm-pill--${tone}`}>{children}</span>;
}

/* ── 표 ──────────────────────────────────────────────────────────────── */

/**
 * 표 머리 한 칸. 정렬 가능한 컬럼은 `{ node, ariaSort }`로 온다 —
 * `aria-sort`는 `th`에 있어야 스크린리더가 읽는다(버튼에 붙이면 소용없다).
 * 기존 호출부가 `ReactNode[]`를 그대로 넘기므로 **둘 다 받는다**.
 */
export type HeadCell = ReactNode | { node: ReactNode; ariaSort: "ascending" | "descending" | "none" };

function headCell(h: HeadCell): { node: ReactNode; ariaSort?: "ascending" | "descending" | "none" } {
  if (typeof h === "object" && h !== null && "ariaSort" in h) {
    return h as { node: ReactNode; ariaSort: "ascending" | "descending" | "none" };
  }
  return { node: h as ReactNode };
}

export function Table({ head, children, empty, error, loading, colSpan }: {
  head: HeadCell[];
  children?: ReactNode;
  /** 성공했지만 행이 없을 때 (정상). */
  empty?: string;
  /** 조회 실패 (정상 상태와 반드시 구분한다 — 정적본 codex 0.14 Major). */
  error?: string;
  /** 첫 응답 전. */
  loading?: boolean;
  colSpan?: number;
}) {
  const span = colSpan ?? head.length;
  return (
    <table className="sqm-table">
      <thead>
        <tr>{head.map((h, i) => {
          const c = headCell(h);
          return <th key={i} aria-sort={c.ariaSort}>{c.node}</th>;
        })}</tr>
      </thead>
      <tbody>
        {error !== undefined ? (
          <tr><td className="sqm-table__error" colSpan={span}>⚠ {error}</td></tr>
        ) : loading ? (
          <tr><td className="sqm-table__empty" colSpan={span}>로드 중…</td></tr>
        ) : empty !== undefined ? (
          <tr><td className="sqm-table__empty" colSpan={span}>{empty}</td></tr>
        ) : children}
      </tbody>
    </table>
  );
}

/* ── 가로 막대 셀 ────────────────────────────────────────────────────── */

export function BarCell({ percent, color, text }: {
  percent: number;
  color: string;
  text?: string;
}) {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div className="sqm-barcell" role="img" aria-label={text ?? `${clamped.toFixed(0)}%`}>
      <div className="sqm-barcell__track">
        <div className="sqm-barcell__fill" style={{ width: `${clamped}%`, background: color }} />
      </div>
      {text !== undefined && <span className="sqm-barcell__text">{text}</span>}
    </div>
  );
}

/* ── 페이저 (표시 전용 — 정적 화면과 동일하게 동작하지 않는다) ─────────── */

export function Pager({ pages, current = 1, note }: {
  pages: Array<number | "…">;
  current?: number;
  note?: string;
}) {
  return (
    <div className="sqm-pager">
      {pages.map((p, i) => (
        <span key={i} className={p === current ? "sqm-pager__cur" : ""}>{p}</span>
      ))}
      <span>Next ›</span>
      {note !== undefined && <span className="sqm-pager__note">{note}</span>}
    </div>
  );
}
