import { useCallback, useEffect, useRef, useState } from "react";

import { fetchMainXView } from "../api/aiReactEchartMainApi";
import type { Filters } from "../api/queries";
import type { XViewEvent } from "../lib/xview";
import { PAN_FACTOR } from "./useCharts";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

// ===== 20260908 추가 시작 : 기본 GPU/SQream 화면 X-View PromQL 제거 =====
export function useXViewEvents(
  filters: Filters,
  rangeSec: number,
  _refreshSec: number,
  selectedStartMs: number | null,
  selectedEndMs: number | null,
): { events: XViewEvent[]; failStreak: number; lastSuccessAt: number | null } {
  const [events, setEvents] = useState<XViewEvent[]>([]);
  const paramsRef = useRef({ filters, rangeSec, selectedStartMs, selectedEndMs });
  paramsRef.current = { filters, rangeSec, selectedStartMs, selectedEndMs };

  const tick = useCallback(async (signal: AbortSignal) => {
    const { filters: f, rangeSec: rs, selectedStartMs: ss, selectedEndMs: se } = paramsRef.current;
    // ===== 20260908 추가 시작 : Overview X-View 선택 조회기간 사용 =====
    const endMs = se ?? (Math.floor(Date.now() / 1000) * 1000);
    const startMs = ss ?? (endMs - rs * PAN_FACTOR * 1000);
    // ===== 20260908 추가 끝 : Overview X-View 선택 조회기간 사용 =====
    const rows = await fetchMainXView(startMs, endMs, signal);
    const selected = rows.filter((r) => {
      if (f.instances.length && !f.instances.includes(r.node)) return false;
      if (f.gpus.length && r.gpu && !f.gpus.includes(r.gpu)) return false;
      return true;
    }).map((r) => ({
      ...r,
      endMs: Number(r.endMs),
      durationSec: Number(r.durationSec),
      phases: r.phases && [r.phases.compileSec, r.phases.queuedSec, r.phases.initializingSec, r.phases.executingSec].every((v) => v != null)
        ? {
            compileSec: Number(r.phases.compileSec),
            queuedSec: Number(r.phases.queuedSec),
            initializingSec: Number(r.phases.initializingSec),
            executingSec: Number(r.phases.executingSec),
          }
        : null,
    })) as XViewEvent[];
    setEvents(selected);
  }, []);

  const { failStreak, lastSuccessAt } = usePolling(tick, 0, [
    filters.env, filters.instances.join(","), filters.gpus.join(","), filters.migs.join(","), rangeSec, selectedStartMs, selectedEndMs,
  ]);
  useEffect(() => { if (failStreak >= DISCONNECT_THRESHOLD) setEvents([]); }, [failStreak]);
  return { events, failStreak, lastSuccessAt };
}
// ===== 20260908 추가 끝 : 기본 GPU/SQream 화면 X-View PromQL 제거 =====
