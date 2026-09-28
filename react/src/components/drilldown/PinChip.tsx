/**
 * 시점 고정 표시 — 차트 카드 우측 상단 (인간 지시 2026-08-10).
 *
 * 처음엔 툴바 아래 **전폭 띠**로 만들었는데 화면 제목 위를 가로질러 거슬렸다.
 * 인간 지시대로 고정을 만든 그 차트의 카드 머리로 옮겼다 — 원인과 표시가 한자리에 있다.
 *
 * 차트가 없는 화면(Worker·Session·Table Usage·Snapshot·Alarms·System Info)에서는
 * 걸어 둘 카드가 없으므로 `PageHead`에 붙인다. **어느 화면에서든 풀 수 있어야 한다** —
 * 고정은 화면을 옮겨도 유지되므로, 표시가 없는 화면이 하나라도 있으면 거기서는
 * 값이 안 변하는 이유를 알 수 없다.
 *
 * 보존 기간 경고를 여기서 낸다. Prometheus retention을 벗어난 시각을 물으면 빈 결과가
 * 오는데, 그건 "그때 데이터가 없었다"가 아니라 "이제 물을 수 없다"이다.
 */
import { useEffect, useState } from "react";

import { promQuery } from "../../api/prom";

/** 보존 기간 확인용 — 항상 존재하는 합성 메트릭이라 "그 시점에 스크레이프가 있었나"를 답한다. */
const PROBE = "count(up)";

export function PinChip({ pinnedMs, onClear }: {
  /** `null`이면 아무것도 그리지 않는다 — 호출부가 조건문을 쓰지 않아도 되게. */
  pinnedMs: number | null;
  onClear: () => void;
}) {
  const [outOfRange, setOutOfRange] = useState(false);

  useEffect(() => {
    if (pinnedMs === null) return;
    const ac = new AbortController();
    setOutOfRange(false);
    promQuery(PROBE, ac.signal, pinnedMs)
      .then((rows) => setOutOfRange(rows.length === 0))
      // 조회 자체가 실패한 것은 보존 기간 문제가 아니다 — 조용히 둔다.
      .catch(() => {});
    return () => ac.abort();
  }, [pinnedMs]);

  if (pinnedMs === null) return null;

  const d = new Date(pinnedMs);
  const p = (n: number) => String(n).padStart(2, "0");
  const clock = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  const full = d.toLocaleString("ko-KR", { hour12: false });

  return (
    <span
      className={`sqm-pinchip${outOfRange ? " sqm-pinchip--stale" : ""}`}
      role="status"
      title={outOfRange
        ? `${full} 시점 고정 — 이 시점의 데이터가 없습니다. 보존 기간 밖일 수 있습니다.`
        : `${full} 시점 고정 — 표는 이 시각의 값입니다. 차트는 계속 흐릅니다.`}
    >
      ⏱ {clock} 고정
      {outOfRange && <b className="sqm-pinchip__warn"> · 보존 밖</b>}
      <button type="button" className="sqm-pinchip__x" onClick={onClear} aria-label="시점 고정 해제">
        ✕
      </button>
    </span>
  );
}
