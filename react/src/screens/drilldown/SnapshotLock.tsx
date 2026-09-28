/**
 * Snapshot & Lock (`#/drilldown/snapshot`) — 정적 `res/sqream/mockup/snapshot-lock.html`.
 *
 * 정적본에서 그대로 지키는 것:
 *  - 조회 실패를 **삼키지 않는다**. 빈 배열로 "거짓 무데이터"를 그리면 안 된다
 *    (정적본 codex 0.13 Major). 실패는 실패로 표시하고 재전파한다.
 *  - 락 라벨은 `{lock_id, stmt_id}`뿐이라 Node·Worker·User는 `sqm_statement_running`을
 *    `stmt_id`로 조인해 채운다. 못 찾으면 `--`.
 *  - 툴바 필터(Node·GPU·Worker)를 **락·스냅샷·spool 전부에** 적용한다. 한때 락은 첫 후보만
 *    보고 필터를 나중에 걸어, 조건에 맞는 후보가 뒤에 있으면 락이 통째로 사라졌다
 *    (codex CDX-S3C-04). spool에는 필터가 아예 없었다.
 *  - 나이·보유 시간 색 구간: 스냅샷 120s/240s, 락 60s/180s.
 *
 * X11 (인간 확정 2026-08-19): 실행 중 문장에 조인되지 않는 락 = **orphaned lock**
 * (crash가 쓰기 문장을 덮치며 남긴 것 — SQream 가이드의 REMOVE_LOCK 정리 대상).
 * 빨강 orphan 배지 + Remove 버튼(orphan만)으로 exporter API에 해제를 요청한다.
 * 신원(워커·사용자)은 최근 실패 이력(sqm_statement_failed_timestamp)으로 폴백한다.
 */
import { useRef, useState } from "react";

import { promQuery, scalarOf, type PromSeries } from "../../api/prom";
import { snapshotLock } from "../../api/queries";
import { ExporterCmdError, removeLock } from "../../api/exporterCmd";
import { Card, Kpi, Pill, Table } from "../../components/drilldown/primitives";
import { usePolling } from "../../hooks/usePolling";
import { ActionDialog } from "../../components/drilldown/ActionDialog";
import { SortReset } from "../../components/drilldown/SortReset";
import { useToast } from "../../components/drilldown/useToast";
import { useTableSort } from "../../components/drilldown/useTableSort";
import { PinChip } from "../../components/drilldown/PinChip";
import type { DrilldownScreenProps } from "../DrilldownDashboard";
import { cleanupCommand } from "./cleanupCommands";
import { displayNode, formatBytes, formatInt, workerName } from "../../lib/format";
import { PageHead } from "../../components/drilldown/PageHead";
import { KILL_SUPPRESS_MS } from "./queryDetailModel";

interface Snapshot { node: string; id: string; age: number }
interface Lock {
  lockId: string; stmtId: string; user: string; node: string; worker: string;
  gpu?: string; held: number;
  /** 실행 중 문장에 조인되지 않음(X11) — REMOVE_LOCK 정리 대상. */
  orphan: boolean;
}
interface Spool { label: string; bytes: number }
interface Kpis { snaps: number; oldest: number; lock: number; spool: number }

const ZERO: Kpis = { snaps: 0, oldest: 0, lock: 0, spool: 0 };

/** 초 → "01:23:45". 정적 `fmtClock`과 같다. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "--";
  const s = Math.max(0, Math.floor(seconds));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function ageTone(sec: number): "red" | "yellow" | "green" | "grey" {
  if (!Number.isFinite(sec)) return "grey";
  if (sec >= 240) return "red";
  if (sec >= 120) return "yellow";
  return "green";
}

function heldTone(sec: number): "red" | "yellow" | "green" | "grey" {
  if (!Number.isFinite(sec)) return "grey";
  if (sec >= 180) return "red";
  if (sec >= 60) return "yellow";
  return "green";
}

/** 워커 이름에서 노드를 되짚는다 — 락 계열에 node 라벨이 없을 때의 마지막 수단. */
function nodeFromWorker(worker: string): string {
  const m = /^sqream([1-3])\d{2}$/.exec(worker);
  return m ? `icspreamh2gpu0${m[1]}` : "";
}

const desc = (a: number, b: number) =>
  (Number.isFinite(b) ? b : -Infinity) - (Number.isFinite(a) ? a : -Infinity);

/** 워커 이름에서 GPU 번호를 되짚는다 (`sqream{노드}{GPU}{MIG+1}`). */
function gpuFromWorker(worker: string): string {
  return /^sqream[1-3](\d)[1-2]$/.exec(worker)?.[1] ?? "";
}

/**
 * 툴바 필터에 걸리는지 — 정적 `matchesDetail`과 같은 규칙.
 * 빈 필터는 전부 통과. node는 표시 어휘 기준으로 비교한다.
 */
function matchesDetail(
  f: { server: string; gpu: string; mig: string },
  node: string, worker: string, metricGpu?: string,
): boolean {
  if (f.server && node !== displayNode(f.server)) return false;
  const gpu = metricGpu || gpuFromWorker(worker);
  if (f.gpu && gpu !== f.gpu) return false;
  if (f.mig) {
    const slot = Number(f.mig);
    const expected = workerName(f.server, String(Math.floor(slot / 2)), String(slot % 2));
    if (worker !== expected) return false;
  }
  return true;
}

export function SnapshotLock({ refreshMs, filters, title, pinnedMs, onClearPin }: DrilldownScreenProps) {
  const { server } = filters;
  const [kpis, setKpis] = useState<Kpis>(ZERO);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [spool, setSpool] = useState<Spool[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** Remove 대상 orphan 락(X11) — 확인 다이얼로그. */
  const [removeTarget, setRemoveTarget] = useState<Lock | null>(null);
  /** Remove 접수된 lock_id → 억제 만료(ms) — kill(X6)과 같은 낙관 규약. */
  const removedRef = useRef(new Map<string, number>());

  const only = server ? displayNode(server) : "";
  const detail = { server: filters.server, gpu: filters.gpu, mig: filters.mig };

  usePolling(async (signal) => {
    // 고정 시점이 있으면 그 시각의 값을 묻는다(instant 전용).
    const at = pinnedMs ?? undefined;
    const q = snapshotLock();
    try {
      const [nSnap, oldest, maxLock, spoolTotal, snapSeries, lockSeries, runSeries,
        failedSeries, spoolSeries] =
        await Promise.all([
          promQuery(q.openCount, signal, at), promQuery(q.maxAge, signal, at),
          promQuery(q.maxLock, signal, at), promQuery(q.spoolTotal, signal, at),
          promQuery(q.snapshots, signal, at), promQuery(q.locks, signal, at),
          promQuery(q.statements, signal, at), promQuery(q.failed, signal, at),
          promQuery(q.spool, signal, at),
        ]);
      setKpis({
        snaps: scalarOf(nSnap), oldest: scalarOf(oldest),
        lock: scalarOf(maxLock), spool: scalarOf(spoolTotal),
      });

      setSnaps(snapSeries
        .map((r) => ({
          node: displayNode(r.metric.node ?? ""),
          id: r.metric.snapshot_id ?? "",
          age: Number(r.value?.[1]),
        }))
        .filter((s) => !only || s.node === only)
        .sort((a, b) => desc(a.age, b.age)));

      // stmt_id로 실행 중 문장을 찾아 Node·Worker·User를 채운다.
      const runByStmt = new Map<string, PromSeries[]>();
      for (const r of runSeries) {
        const id = r.metric.stmt_id ?? "";
        runByStmt.set(id, [...(runByStmt.get(id) ?? []), r]);
      }
      /* orphan 락의 신원 폴백(X11) — 문장이 이미 죽어 running 조인이 비면 최근
         실패 이력(worker·node·user 라벨 보유)에서 찾는다. FAILED_KEEP(12건)
         퇴출 후에는 다시 "--"(허용 한계). */
      const failedByStmt = new Map<string, Record<string, string>>();
      for (const r of failedSeries) failedByStmt.set(r.metric.stmt_id ?? "", r.metric);
      // Remove 접수 억제(X11) — kill과 같은 낙관 규약: 반영(tick)까지 한 주기 숨긴다.
      const removed = removedRef.current;
      const nowMs = Date.now();
      for (const [id, until] of removed) if (until <= nowMs) removed.delete(id);
      setLocks(lockSeries
        .filter((r) => !removed.has(r.metric.lock_id ?? ""))
        .map((r) => {
          /* 후보 중 **필터와 맞는 것을 먼저** 고른다. 첫 후보만 보면 그것이 다른 노드일 때
             락이 사라진다(codex CDX-S3C-04). 정적 `find(matchesDetail) || candidates[0]`. */
          const candidates = runByStmt.get(r.metric.stmt_id ?? "") ?? [];
          const orphan = candidates.length === 0;
          const meta = (candidates.find((c) => matchesDetail(
            detail,
            displayNode(c.metric.node ?? "") || nodeFromWorker(c.metric.worker ?? ""),
            c.metric.worker ?? "", c.metric.gpu,
          )) ?? candidates[0])?.metric
            ?? failedByStmt.get(r.metric.stmt_id ?? "") ?? {};
          const worker = meta.worker ?? r.metric.worker ?? "";
          return {
            lockId: r.metric.lock_id ?? "",
            stmtId: r.metric.stmt_id ?? "",
            user: meta.sqream_user ?? "",
            node: displayNode(meta.node ?? "") || nodeFromWorker(worker),
            worker,
            gpu: meta.gpu,
            held: Number(r.value?.[1]),
            orphan,
          };
        })
        .filter((l) => matchesDetail(detail, l.node, l.worker, l.gpu))
        .sort((a, b) => desc(a.held, b.held)));

      setSpool(spoolSeries
        // spool에도 같은 필터를 건다 — 정적본과 같다.
        .filter((r) => matchesDetail(
          detail,
          displayNode(r.metric.node ?? "") || nodeFromWorker(r.metric.worker ?? ""),
          r.metric.worker ?? "", r.metric.gpu))
        .map((r) => ({
          label: r.metric.worker || r.metric.stmt_id || "",
          bytes: Number(r.value?.[1]) || 0,
        }))
        .filter((s) => s.bytes > 0)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 12));

      setFailed(false);
      setLoaded(true);
    } catch (error) {
      setFailed(true);
      throw error; // 삼키면 "거짓 무데이터"가 된다
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refreshMs, [refreshMs, only, filters.gpu, filters.mig]);

  const spoolMax = Math.max(1, ...spool.map((s) => s.bytes));
  const dash = (n: number, fmt: (v: number) => string) => (failed ? "--" : fmt(n));

  /* CLEANUP_EXTENTS를 여기 두는 이유: 익스텐트 회수는 **열린 스냅샷이 막는다.**
     이 화면이 Open Snapshots·Active Locks를 보여 주므로, 막히는 이유를 같은 화면에서
     본다. Table Usage에 두면 누르기 전에 여기로 와서 확인해야 한다. */
  const [cleanExtents, setCleanExtents] = useState(false);
  const [toast, showToast] = useToast();

  const snapSort = useTableSort<Snapshot>({
    node: (r) => r.node, id: (r) => r.id, age: (r) => r.age,
  }, { key: "age", desc: true });
  const lockSort = useTableSort<Lock>({
    lockId: (r) => r.lockId, stmtId: (r) => r.stmtId, user: (r) => r.user,
    node: (r) => r.node, worker: (r) => r.worker, held: (r) => r.held,
  }, { key: "held", desc: true });

  return (
    <div className="sqm-page">
      <PageHead title={title}>
        <PinChip pinnedMs={pinnedMs} onClear={onClearPin} />
        <button type="button" className="sqm-btn" onClick={() => setCleanExtents(true)}>
          CLEANUP EXTENTS
        </button>
        <a className="sqm-btn" href="/grafana/dashboards" target="_blank" rel="noopener">
          Grafana 원본으로 열기 ↗
        </a>
      </PageHead>

      <div className="sqm-grid sqm-grid--kpi4">
        <Kpi icon="📷" tone="blue" label="OPEN SNAPSHOTS" value={dash(kpis.snaps, formatInt)} />
        <Kpi icon="⏳" tone="orange" label="OLDEST SNAPSHOT" value={dash(kpis.oldest, clock)}
          alert={!failed && kpis.oldest > 0} />
        <Kpi icon="🔒" tone="red" label="LONGEST LOCK" value={dash(kpis.lock, clock)}
          alert={!failed && kpis.lock > 0} />
        <Kpi icon="💽" tone="green" label="TOTAL SPOOLING" value={dash(kpis.spool, formatBytes)} />
      </div>

      <Card title="Disk Spooling (GPU→Disk Spill)">
        {failed ? (
          <p className="sqm-table__error">⚠ Spool 조회 실패 — 데이터 소스에 연결할 수 없습니다.</p>
        ) : spool.length === 0 ? (
          <p className="sqm-table__empty" style={{ padding: "80px 0" }}>Disk spooling 없음</p>
        ) : (
          <div className="sqm-spool">
            {spool.map((s) => (
              <div key={s.label} className="sqm-spool__row">
                <span>{s.label}</span>
                <div className="sqm-barcell__track">
                  <div className="sqm-barcell__fill"
                    style={{ width: `${Math.max(1, (s.bytes / spoolMax) * 100)}%`, background: "var(--orange)" }} />
                </div>
                <span style={{ textAlign: "right" }}>{formatBytes(s.bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="sqm-grid sqm-grid--two sqm-mt">
        <Card title="Open Snapshots" body={false}
          aside={<>{failed ? "조회 실패" : `${snaps.length} open`} <SortReset sort={snapSort} /></>}>
          <Table
            head={[snapSort.th("node", "Node"), snapSort.th("id", "Snapshot ID"),
              snapSort.th("age", "Age")]}
            loading={!loaded && !failed}
            error={failed ? "스냅샷 조회 실패 — 데이터 소스에 연결할 수 없습니다." : undefined}
            empty={snaps.length === 0 ? "열린 스냅샷 없음" : undefined}
          >
            {snapSort.apply(snaps).map((s) => (
              <tr key={`${s.node}/${s.id}`}>
                <td>{s.node}</td>
                <td><b>#{s.id}</b></td>
                <td><Pill tone={ageTone(s.age)}>{clock(s.age)}</Pill></td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Active Locks" body={false}
          aside={<>{failed ? "조회 실패" : `${locks.length} held`} <SortReset sort={lockSort} /></>}>
          <Table
            head={[lockSort.th("lockId", "Lock ID"), lockSort.th("stmtId", "Statement ID"),
              lockSort.th("user", "User"), lockSort.th("node", "Node"),
              lockSort.th("worker", "Worker"), lockSort.th("held", "Held"), ""]}
            loading={!loaded && !failed}
            error={failed ? "락 조회 실패 — 데이터 소스에 연결할 수 없습니다." : undefined}
            empty={locks.length === 0 ? "보유 중인 락 없음" : undefined}
          >
            {lockSort.apply(locks).map((l) => (
              <tr key={`${l.lockId}/${l.stmtId}`}>
                <td>
                  <b>{l.lockId}</b>
                  {/* orphan(X11) — 실행 중 문장에 조인되지 않는 락: 죽은 워커가
                      남긴 것으로, 자연히 풀리지 않아 REMOVE_LOCK 정리 대상이다. */}
                  {l.orphan && <> <Pill tone="red">orphan</Pill></>}
                </td>
                <td>{l.stmtId}</td>
                <td>{l.user || "--"}</td>
                <td>{l.node || "--"}</td>
                <td>{l.worker || "--"}</td>
                <td><Pill tone={heldTone(l.held)}>{clock(l.held)}</Pill></td>
                <td>
                  {/* Remove는 orphan만 — 실행 중 문장의 락 제거는 위험해 exporter도
                      409로 거부한다(fail-closed). 고정 시점(pin)에서는 숨긴다. */}
                  {l.orphan && pinnedMs === null ? (
                    <button type="button" className="sqm-btn sqm-btn--tiny"
                      onClick={() => setRemoveTarget(l)}>
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {/* REMOVE_LOCK (X11, 인간 승인) — orphaned lock 해제. 200은 "접수", 시리즈
          제거는 다음 tick — 낙관 제거 + TTL 억제(kill X6 규약)로 화면을 맞춘다. */}
      {removeTarget !== null && (
        <ActionDialog
          title="Remove Lock"
          target={removeTarget.lockId}
          warning={<>
            죽은 워커가 남긴 <b>orphaned lock</b>을 해제합니다(SUPERUSER 작업).
            잔존 락은 해당 테이블의 후속 DDL·쓰기를 막을 수 있어 수동 정리가
            필요합니다. 실행 중 문장의 락은 exporter가 409로 거부합니다.
          </>}
          command={`SELECT REMOVE_LOCK('<locked object>', '${removeTarget.stmtId}');`}
          confirmLabel="Remove 실행"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={(reason) => {
            const lock = removeTarget;
            setRemoveTarget(null);
            removeLock(lock.lockId, reason).then(() => {
              removedRef.current.set(lock.lockId, Date.now() + KILL_SUPPRESS_MS);
              setLocks((cur) => cur.filter((l) => l.lockId !== lock.lockId));
              showToast(
                <>
                  ✅ <b>{lock.lockId}</b> 제거 접수 — 다음 갱신에 목록에서
                  사라집니다
                  <br />사유: {reason}
                </>, 8000);
            }).catch((e: unknown) => {
              const detail = e instanceof ExporterCmdError && e.status === 404
                ? "이미 제거됐거나 알 수 없는 락입니다"
                : e instanceof ExporterCmdError && e.status === 409 && e.detail !== undefined
                  ? `거부됨 — ${e.detail}`
                  : `요청 실패 — ${e instanceof Error ? e.message : String(e)}`;
              showToast(<>⚠ <b>{lock.lockId}</b> Remove: {detail}</>, 8000);
            });
          }}
        />
      )}

      {cleanExtents && (
        <ActionDialog
          title="Cleanup Extents"
          target="클러스터 전체"
          warning={<>
            비어 있는 익스텐트를 회수합니다. 디스크 I/O가 크고 오래 걸리며,
            <b> 업무시간에 수행하면 전체 성능이 떨어집니다</b>.
          </>}
          extraWarning={snaps.length > 0
            ? <>📷 열린 스냅샷 <b>{snaps.length}건</b> — 스냅샷이 참조 중인 익스텐트는
                회수되지 않습니다. 먼저 스냅샷을 닫거나, 회수량이 적을 것을 감안하세요.</>
            : undefined}
          command={cleanupCommand("CLEANUP_EXTENTS", [
            { db: "sqream", schema: "public", table: "*" },
          ])}
          confirmLabel="Cleanup Extents 요청"
          onCancel={() => setCleanExtents(false)}
          onCopyResult={(ok) => showToast(ok
            ? "📋 명령문을 클립보드에 복사했습니다."
            : "⚠ 복사에 실패했습니다 — 명령문을 직접 선택해 복사하세요.")}
          onConfirm={(reason) => {
            setCleanExtents(false);
            showToast(
              <>
                ✅ <b>CLEANUP_EXTENTS</b> 요청이 기록되었습니다
                <br />
                사유: {reason}
                {snaps.length > 0 && <><br />열린 스냅샷 {snaps.length}건이 함께 기록됩니다.</>}
              </>, 9000);
          }}
        />
      )}
      {toast}
    </div>
  );
}
