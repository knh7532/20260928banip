import { useCallback, useState } from "react";

import type { RangeSelection } from "./useRangeDetail";

/**
 * 타임라인 브러시 선택 상태 (R6) — App 지역 state였던 것을 훅으로 승격.
 * `clear`는 RangeDetail의 × 닫기 버튼이 사용한다 (PPTX 상세 패널 ×).
 */
export function useRangeSelection(): {
  selection: RangeSelection | null;
  setSelection: (sel: RangeSelection | null) => void;
  clear: () => void;
} {
  const [selection, setSelection] = useState<RangeSelection | null>(null);
  const clear = useCallback(() => setSelection(null), []);
  return { selection, setSelection, clear };
}
