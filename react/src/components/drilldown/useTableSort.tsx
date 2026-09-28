/**
 * 표 컬럼 정렬 — 상세 대시보드 공용 (인간 지시 2026-08-10).
 *
 * `TableUsage`에 이미 완성된 선례가 있었다(`sortKey`/`sortDesc`/`sortByNumber`/화살표).
 * 화면마다 다시 쓰면 구현이 열 벌이 되므로 그걸 여기로 끌어올렸다 — `TableUsage`도
 * 이 훅을 쓴다.
 *
 * 규칙 셋:
 *  1. **미정의는 방향과 무관하게 항상 뒤.** 정적본은 결측을 `-Infinity`로 두어
 *     내림차순에서만 뒤로 갔고, 오름차순으로 뒤집으면 빈 값이 표 맨 위를 채웠다.
 *  2. 숫자와 문자열을 구분한다. 문자열을 `-`로 빼면 전부 `NaN`이라 순서가 안 잡힌다.
 *  3. **정렬은 화면 상태일 뿐 데이터가 아니다.** 원본 배열을 건드리지 않는다
 *     (`sort`는 제자리 정렬이라 폴링이 넣어 준 배열을 뒤집으면 다음 렌더가 어긋난다).
 */
import { useCallback, useMemo, useRef, useState } from "react";

/** 정렬 키가 뽑아내는 값. `undefined`·`NaN`·`null`은 "없음"으로 보고 뒤로 보낸다. */
export type SortValue = number | string | undefined | null;

export interface SortSpec {
  /** 기본 정렬 키. 생략하면 처음에는 원본 순서 그대로다. */
  key?: string;
  /** 기본 방향. 생략 시 내림차순 — 표에서 궁금한 것은 대개 큰 값이다. */
  desc?: boolean;
}

export interface TableSort<T> {
  /** 정렬을 적용한 새 배열. 입력이 그대로면 참조도 그대로다. */
  apply: (rows: T[]) => T[];
  /** 헤더 셀 — `Table`의 `head`에 그대로 넣는다. `aria-sort`까지 함께 준다. */
  th: (key: string, label: string) => { node: JSX.Element; ariaSort: AriaSort };
  /** 기본값과 다른 상태인가 — "정렬 초기화" 버튼을 보일지 판단한다. */
  dirty: boolean;
  reset: () => void;
  /** 화면이 정렬을 직접 지정한다 — 예: "CLEANUP 대상만"을 켜면 삭제 대기 내림차순. */
  setSort: (key: string, desc: boolean) => void;
  key: string | null;
  desc: boolean;
}

type AriaSort = "ascending" | "descending" | "none";

function compare(a: SortValue, b: SortValue): number {
  // 문자열끼리는 로케일 비교 — 워커 이름·테이블 이름이 여기 걸린다.
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return (a as number) - (b as number);
}

function missing(v: SortValue): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  return v === "" || v === "--";
}

/**
 * @param pickers 컬럼 키 → 값 추출기. 여기 없는 키는 정렬할 수 없다(오타를 조용히
 *   넘기지 않도록 `th()`가 개발 중 콘솔에 경고한다).
 */
export function useTableSort<T>(
  pickers: Record<string, (row: T) => SortValue>,
  spec: SortSpec = {},
): TableSort<T> {
  const defKey = spec.key ?? null;
  const defDesc = spec.desc ?? true;
  /* 호출부는 매 렌더 `pickers` 리터럴을 새로 만든다. 의존 배열에 넣으면 `apply`·`th`가
     매번 새 참조가 되어 화면의 `useMemo`가 계속 다시 돈다. 그렇다고 빼 두면 추출기가
     바깥 상태를 붙잡는 날 **낡은 값으로 정렬**한다. ref로 항상 최신 것을 본다. */
  const pickRef = useRef(pickers);
  pickRef.current = pickers;
  const [key, setKey] = useState<string | null>(defKey);
  const [desc, setDesc] = useState(defDesc);

  const toggle = useCallback((next: string) => {
    setKey((cur) => {
      if (cur === next) {
        setDesc((d) => !d);
        return cur;
      }
      // 새 컬럼은 항상 내림차순부터 — 한 번 누르면 큰 값이 위로 온다.
      setDesc(true);
      return next;
    });
  }, []);

  const reset = useCallback(() => { setKey(defKey); setDesc(defDesc); }, [defKey, defDesc]);
  const setSort = useCallback((next: string, nextDesc: boolean) => {
    setKey(next); setDesc(nextDesc);
  }, []);

  const apply = useCallback((rows: T[]): T[] => {
    if (key === null) return rows;
    const pick = pickRef.current[key];
    if (!pick) return rows;

    const known: T[] = [];
    const blank: T[] = [];
    for (const row of rows) (missing(pick(row)) ? blank : known).push(row);
    // 원본을 건드리지 않는다 — `known`은 이미 새 배열이라 여기서만 정렬한다.
    known.sort((a, b) => (desc ? -1 : 1) * compare(pick(a), pick(b)));
    return [...known, ...blank];
  }, [key, desc]);

  const th = useCallback((col: string, label: string) => {
    if (import.meta.env?.DEV && !pickRef.current[col]) {
      console.warn(`useTableSort: '${col}' 추출기가 없다 — 정렬이 조용히 안 먹는다`);
    }
    const active = key === col;
    return {
      node: (
        <button
          type="button"
          className={`sqm-th-sort${active ? " is-active" : ""}`}
          onClick={() => toggle(col)}
        >
          {label}
          <span aria-hidden="true">{active ? (desc ? " ▼" : " ▲") : " ⇅"}</span>
        </button>
      ),
      ariaSort: (active ? (desc ? "descending" : "ascending") : "none") as AriaSort,
    };
  }, [key, desc, toggle]);

  return useMemo(
    () => ({ apply, th, dirty: key !== defKey || desc !== defDesc, reset, setSort, key, desc }),
    [apply, th, key, desc, defKey, defDesc, reset, setSort],
  );
}
