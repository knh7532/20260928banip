// @vitest-environment node
//
// jsdom의 AbortSignal과 Node의 fetch(undici)가 서로를 인식하지 못해 실패하므로
// 이 파일만 node 환경에서 돌린다. 브라우저 런타임에서는 둘 다 같은 구현이라 무관하다.
/**
 * 라이브 통합 테스트 — 실제 Prometheus(:3002)에 `queries.ts`의 쿼리를 그대로 던진다.
 *
 * 기본적으로 **건너뛴다**(CI·오프라인에서 깨지지 않도록). 실행하려면:
 *   PROM_LIVE=1 npm run test -- live.integration
 *
 * 형제 프로젝트의 exporter/Prometheus가 떠 있어야 한다.
 */
import { promQuery, promQueryRange } from "../src/api/prom";
import {
  gpuTimeseries,
  labelValueMatchers,
  queryPerformance,
  rangeDetail,
  runningStatements,
  serverCard,
  serverStatus,
  timeline,
  type Filters,
} from "../src/api/queries";

const LIVE = process.env.PROM_LIVE === "1";
const F: Filters = { env: "production", instances: [], gpus: [], migs: [] };

describe.skipIf(!LIVE)("라이브 Prometheus 연동", () => {
  it("① 실행 중 쿼리 — 조인 키(stmt_id)가 맞물린다", async () => {
    const q = runningStatements(F);
    const [identity, memory] = await Promise.all([promQuery(q.identity), promQuery(q.memory)]);
    expect(identity.length).toBeGreaterThan(0);
    expect(identity.length).toBeLessThanOrEqual(12); // GPU당 1쿼리
    const ids = new Set(identity.map((s) => s.metric.stmt_id));
    const memIds = new Set(memory.map((s) => s.metric.stmt_id));
    for (const id of ids) expect(memIds.has(id), `stmt_id ${id}의 메모리 없음`).toBe(true);
  });

  it("② 쿼리 성능 — 카탈로그 8종이 중복 없이 온다 (v4.10)", async () => {
    const q = queryPerformance(F);
    const [rows, p95, state] = await Promise.all([
      promQuery(q.rows),
      promQuery(q.p95),
      promQuery(q.state),
    ]);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((s) => s.metric.query_name)).size).toBe(8);
    expect(p95).toHaveLength(8);
    expect(state).toHaveLength(8);
    for (const s of state) expect([0, 1, 2]).toContain(Number(s.value?.[1]));
  });

  it("③ 타임라인 — 24 MIG의 구간 시계열이 온다", async () => {
    const result = await promQueryRange(timeline(F), 1800, { maxStepSec: 15 });
    expect(result).toHaveLength(24);
    const values = result[0]?.values ?? [];
    expect(values.length).toBeGreaterThan(1);
    for (const [, v] of values) expect(Number(v)).toBeGreaterThanOrEqual(0);
  });

  it("④ GPU 시계열 4종 — 24 시리즈씩", async () => {
    const q = gpuTimeseries(F);
    for (const expr of Object.values(q)) {
      const r = await promQueryRange(expr, 1800);
      expect(r.length, expr).toBe(24);
    }
  });

  it("⑤ 서버 카드 — 4지표가 스칼라로 온다", async () => {
    const q = serverCard("gpu-server-01");
    for (const expr of Object.values(q)) {
      const r = await promQuery(expr);
      expect(r, expr).toHaveLength(1);
      expect(Number.isFinite(Number(r[0].value?.[1]))).toBe(true);
    }
  });

  it("사이드바 서버 상태 — GPU 총수/사용 중", async () => {
    const q = serverStatus("gpu-server-01");
    const total = await promQuery(q.gpuTotal);
    const busy = await promQuery(q.gpuBusy);
    expect(Number(total[0].value?.[1])).toBe(8);
    expect(Number(busy[0].value?.[1])).toBeGreaterThanOrEqual(0);
  });

  it("구간 상세 — 6개 쿼리가 모두 오류 없이 온다 (many-to-many 없음)", async () => {
    const q = rangeDetail(F, 1800);
    for (const [key, expr] of Object.entries(q)) {
      const r = await promQuery(expr);
      expect(r.length, `${key}: 결과 없음`).toBeGreaterThan(0);
    }
  });

  it("필터바 라벨 값이 온다", async () => {
    const env = await promQuery(`count(${labelValueMatchers.env()})`);
    expect(Number(env[0].value?.[1])).toBe(24);
  });

  it("구간 rows/s가 시점별 합의 평균이다 (라벨셋 교체 시 과대계상 없음)", async () => {
    const d = rangeDetail(F, 1800);
    const [avg, current] = await Promise.all([
      promQuery(d.rowsPerSecond),
      promQuery(`sum(sqm_query_rows_per_second{env=~"production"})`),
    ]);
    const avgVal = Number(avg[0]?.value?.[1] ?? 0);
    const curVal = Number(current[0]?.value?.[1] ?? 0);
    // 구간 평균은 현재 합과 같은 스케일이어야 한다 (합의 합이 아니다)
    expect(avgVal).toBeGreaterThan(0);
    expect(avgVal).toBeLessThan(Math.max(curVal, 1) * 5);
  });
});
