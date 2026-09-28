import { useCallback, useEffect, useRef, useState } from "react";
import type { Filters } from "../api/queries";
import { fetchRealtime } from "../api/realtimeApi";
import { workerName } from "../lib/format";
import type { StatementRow } from "./useDashboardData";
import { DISCONNECT_THRESHOLD, usePolling } from "./usePolling";

// ===== 20260925 추가 시작 : 실행 중 SQL만 5/10/30초 실시간 갱신 =====
export function useRealtimeQueries(filters: Filters, refreshSec: number): {
  rows: StatementRow[]; failStreak: number; lastSuccessAt: number | null;
} {
  const [rows, setRows] = useState<StatementRow[]>([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const tick = useCallback(async (signal: AbortSignal) => {
    const f = filtersRef.current;
    const hostname = f.instances.length === 1 ? f.instances[0] : "";
    const gpu = f.gpus.length === 1 ? f.gpus[0] : "";
    const worker = f.migs.length === 1 ? f.migs[0] : "";
    const body = await fetchRealtime(hostname, gpu, worker, signal);

    // 매 갱신마다 이전 화면에 누적하지 않고 현재 server_status 스냅샷으로 통째로 교체한다.
    const selected = body.filter((r) => {
      if (f.instances.length && !f.instances.includes(r.hostname ?? "")) return false;
      if (f.gpus.length && !f.gpus.includes(String(r.gpuId ?? ""))) return false;
      if (f.migs.length && !f.migs.includes(r.instanceId ?? "")) return false;
      return true;
    });
    setRows(selected.map((r) => {
      const gpuText = r.gpuId == null ? "" : String(r.gpuId);
      const giText = r.giId == null ? "" : String(r.giId);
      const startMs = r.statementStartTime ? Date.parse(r.statementStartTime) : Number.NaN;
      return {
        stmtId: r.statementId == null ? "" : String(r.statementId),
        queryId: "", user: "", node: r.hostname ?? "", gpu: gpuText, mig: giText,
        worker: r.instanceId || workerName(r.hostname ?? "", gpuText, giText), service: r.service ?? "",
        qid: r.statementStatus ?? "", qidTags: "",
        connectionId: r.connectionId == null ? "" : String(r.connectionId),
        memoryBytes: Number(r.memoryUsedBytes ?? Number.NaN),
        gpuPct: Number(r.grEngineActivePercent ?? Number.NaN),
        cpuPct: Number(r.cpuUsagePercent ?? Number.NaN),
        startTimeSec: Number.isFinite(startMs) ? startMs / 1000 : Number.NaN,
        elapsedSec: Number(r.statementStatusTimeSeconds ?? Number.NaN),
        progress: Number.NaN, spoolBytes: Number.NaN,
        vramBytes: r.gpuMemoryUsedMib == null ? Number.NaN : Number(r.gpuMemoryUsedMib) * 1024 * 1024,
        lockHeldSec: Number.NaN,
      };
    }));
  }, []);

  const { failStreak, lastSuccessAt } = usePolling(tick, refreshSec * 1000, [
    filters.env, filters.instances.join(","), filters.gpus.join(","), filters.migs.join(","),
  ]);
  useEffect(() => { if (failStreak >= DISCONNECT_THRESHOLD) setRows([]); }, [failStreak]);
  return { rows, failStreak, lastSuccessAt };
}
// ===== 20260925 추가 끝 : 실행 중 SQL만 5/10/30초 실시간 갱신 =====
