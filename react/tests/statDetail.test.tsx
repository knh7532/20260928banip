/*
 * Session Statistics 카드 내역 (인간 지시 2026-08-10).
 *
 * 실패 내역에 Statement ID · Q-Type · Worker를 넣고 사유까지 적는다.
 * 그러려면 메트릭이 **문장 단위**여야 해서 계약을 v4.3으로 올렸다 — 여기서 그 경계를
 * 잠근다. 화면이 사유를 지어내거나, 배정 전 워커를 만들어 내면 실패한다.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatDetail } from "../src/screens/drilldown/StatDetail";
import { mainDashboard } from "../src/api/queries";

const q = mainDashboard();
const NOW = 1_786_000_000;

function installFetch(byExpr: Record<string, unknown[]>) {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const expr = new URL(url, "http://x").searchParams.get("query") ?? "";
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        status: "success",
        data: { resultType: "vector", result: byExpr[expr] ?? [] },
      }),
    });
  }));
}

afterEach(() => vi.unstubAllGlobals());

const failedRow = (over: Record<string, string>, at: number) => ({
  metric: {
    stmt_id: "100137", node: "gpu-server-01", worker: "sqream101",
    sqream_user: "etl_svc", qid: "LOA-12H", qid_tags: "BULK,JOIN:2",
    reason: "lock_timeout", ...over,
  },
  value: [NOW, String(at)],
});

describe("Failed Queries 내역", () => {
  it("Statement ID·Q-Type·Worker·사유를 모두 보여 준다", async () => {
    installFetch({ [q.detailFailed]: [failedRow({}, NOW - 90)] });
    render(<StatDetail kind="failed" atMs={NOW * 1000} onClose={() => {}} />);

    const dlg = within(await screen.findByRole("dialog"));
    expect(dlg.getByText("100137")).toBeInTheDocument();
    expect(dlg.getByText("LOA-12")).toBeInTheDocument();          // Q-Type 배지 (등급 문자 제거, 2026-08-10)
    expect(dlg.getByText("sqream101")).toBeInTheDocument();        // Worker
    expect(dlg.getByText("etl_svc")).toBeInTheDocument();
    // 사유는 코드가 아니라 사람이 읽는 문구로
    expect(dlg.getByText(/테이블 락 대기 초과/)).toBeInTheDocument();
  });

  it("모르는 사유 코드는 지어내지 않고 코드를 그대로 보여 준다", async () => {
    /* exporter가 앞서가 새 코드를 낼 수 있다. 임의로 번역하면 틀린 설명이 붙는다. */
    installFetch({ [q.detailFailed]: [failedRow({ reason: "meteor_strike" }, NOW - 10)] });
    render(<StatDetail kind="failed" atMs={null} onClose={() => {}} />);
    expect(await screen.findByText("meteor_strike")).toBeInTheDocument();
  });

  it("최신 실패가 위로 온다 — 값이 실패 시각이다", async () => {
    installFetch({
      [q.detailFailed]: [
        failedRow({ stmt_id: "111", reason: "out_of_memory" }, NOW - 600),
        failedRow({ stmt_id: "222", reason: "spool_limit" }, NOW - 30),
      ],
    });
    render(<StatDetail kind="failed" atMs={NOW * 1000} onClose={() => {}} />);
    const idCells = () => [...document.querySelectorAll("td b")].map((e) => e.textContent);
    await waitFor(() => expect(idCells()).toHaveLength(2));
    expect(idCells()[0]).toBe("222");
  });

  it("보관 한도를 각주로 밝힌다 — 전부인 것처럼 보이면 안 된다", async () => {
    installFetch({ [q.detailFailed]: [failedRow({}, NOW - 5)] });
    render(<StatDetail kind="failed" atMs={null} onClose={() => {}} />);
    expect(await screen.findByText(/최근 12건/)).toBeInTheDocument();
  });
});

/* "Queued Queries 내역"은 X14-f1(인간 지시)로 카드와 함께 삭제됐다 — 실제
   시스템은 1초 이상 대기하는 쿼리를 정지·에러 처리해 큐 표시가 의미 없다. */

describe("공통", () => {
  it("고정 시점을 물려받아 질의에 `time=`을 붙인다", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ status: "success", data: { resultType: "vector", result: [] } }),
      });
    }));
    const pinned = (NOW - 300) * 1000;
    render(<StatDetail kind="spool" atMs={pinned} onClose={() => {}} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain(`time=${Math.floor(pinned / 1000)}`);
  });

  it("조회 실패를 '내역 없음'과 구분해서 말한다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<StatDetail kind="failed" atMs={null} onClose={() => {}} />);
    expect(await screen.findByText(/내역 조회 실패/)).toBeInTheDocument();
    expect(screen.queryByText("내역 없음")).toBeNull();
  });
});
