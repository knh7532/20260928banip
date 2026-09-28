/**
 * "정렬 초기화" 버튼 — 표가 기본 정렬이 아닐 때만 나타난다 (인간 지시 2026-08-10).
 *
 * 항상 보이면 누를 이유가 없을 때도 자리를 차지하고, 눌러도 아무 일이 안 일어나
 * "고장인가" 싶게 만든다. `useTableSort`의 `dirty`가 판단한다.
 */
export function SortReset({ sort }: { sort: { dirty: boolean; reset: () => void } }) {
  if (!sort.dirty) return null;
  return (
    <button type="button" className="sqm-sortreset" onClick={sort.reset}>
      정렬 초기화
    </button>
  );
}
