/*
 * X6 — Query 상세 팝업(QueryDetailModal) 검증.
 *
 * 잠그는 것: ① 탭 3종(SQL 기본·로그·플랜)과 전환, ② 내용의 결정론(목업 생성기 배선),
 * ③ Kill 규약 — 사유 필수 다이얼로그 → POST → 성공/이미 종료(404)/연결 실패의 세 갈래.
 * 실패 시 팝업은 남는다 — 대상을 다시 고르게 하면 안 된다.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueryDetailModal, type QueryDetailRow } from "../src/screens/drilldown/QueryDetailModal";
import { mockPhases, mockPlanSteps } from "../src/screens/drilldown/mockQueryDetail";
import type { LiveStatMap } from "../src/screens/drilldown/queryDetailModel";

const ROW: QueryDetailRow = {
  id: "100137", qid: "JOI-14H", qidTags: "JOIN:3,TXTKEY", user: "dba1",
  node: "gpu-server-01", worker: "sqream101", service: "etl_service", elapsed: 125, prog: 0.4,
  startEpoch: 1787000000,
};

function renderModal(over: Partial<QueryDetailRow> = {}, pinned = false) {
  const onClose = vi.fn();
  const onKilled = vi.fn();
  const showToast = vi.fn();
  render(<QueryDetailModal row={{ ...ROW, ...over }} pinned={pinned}
    onClose={onClose} onKilled={onKilled} showToast={showToast} />);
  return { onClose, onKilled, showToast };
}

/** Kill 확인 다이얼로그까지 연다 — 사유를 넣고 실행 직전 상태로. */
function openKillDialog(reason = "Long Query로 워커 점유 — 티켓 #1234") {
  fireEvent.click(screen.getByRole("button", { name: "Kill" }));
  const dlg = screen.getByRole("dialog", { name: "Kill Statement" });
  fireEvent.change(within(dlg).getByLabelText("수행 사유"), { target: { value: reason } });
  return { dlg, reason };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("탭", () => {
  it("SQL·로그·플랜 3탭이 있고 기본은 SQL이다", () => {
    renderModal();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["SQL", "로그", "플랜"]);
    expect(screen.getByRole("tab", { name: "SQL" })).toHaveAttribute("aria-selected", "true");
    // JOI 계열 목업 SQL — cleanupCommands.mockSql 배선
    expect(screen.getByRole("tabpanel", { name: "SQL" }).textContent).toContain("JOIN");
  });

  it("로그 탭 — 생애주기 목업 로그, 화면에 목업 고지는 없다 (X12)", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "로그" }));
    expect(screen.getByRole("tab", { name: "로그" })).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "로그" });
    expect(panel.textContent).toContain("Statement 100137 received");
    expect(panel.textContent).toContain("sqream101");
    expect(panel.textContent).not.toContain("목업");
  });

  it("로그 탭 상단에 X-View 공용 누적 막대가 뜬다 — 수치는 로그와 단일 원천 (X6-f1)", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "로그" }));
    const panel = screen.getByRole("tabpanel", { name: "로그" });
    // X-View와 같은 DOM(4세그) — 실행 중이라 실패 강조는 없다
    expect(panel.querySelectorAll(".xview__tip-seg")).toHaveLength(4);
    expect(panel.querySelector(".xview__tip-seg--fail")).toBeNull();
    // Executing 범례 = elapsed 그대로, 실행 중 캡션 명시
    expect(panel.textContent).toContain("125.0 s");
    expect(panel.textContent).toContain("Executing은 현재까지");
    // Compile 범례 수치 = 로그 문장의 수치 (mockPhases 단일 원천 가드)
    const compile = mockPhases(ROW).compileSec.toFixed(1);
    expect(panel.textContent).toContain(`${compile} s`);
    expect(panel.textContent).toContain(`Compile finished in ${compile}s`);
  });

  it("플랜 탭 — qid 계열(JOI)에 맞는 구조화 실행계획 표 (X8)", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "플랜" }));
    const panel = screen.getByRole("tabpanel", { name: "플랜" });
    expect(panel.textContent).toContain("GpuJoin");
    expect(panel.textContent).not.toContain("목업"); // 고지는 X12에서 제거
    // X8: <pre> 텍스트가 아니라 단계 표다 — 소요시간·상태 열이 있다
    expect(panel.querySelector(".sqm-plansteps table")).not.toBeNull();
    expect(panel.textContent).toContain("소요시간");
  });

  it("initialTab=plan이면 플랜 탭이 기본이다 — 탑뷰 클릭 진입 (X8)", () => {
    const noop = vi.fn();
    render(<QueryDetailModal row={ROW} initialTab="plan"
      onClose={noop} onKilled={noop} showToast={noop} />);
    expect(screen.getByRole("tab", { name: "플랜" })).toHaveAttribute("aria-selected", "true");
  });

  it("pollLive 미제공이면 주기 select가 없다 (하위 호환)", () => {
    renderModal();
    expect(screen.queryByLabelText("자동 갱신 주기")).toBeNull();
  });

  it("pollLive — 자체 주기 라이브 갱신·주기 설정·종료 배너·Kill 잠금 (X8)", async () => {
    vi.useFakeTimers();
    try {
      let elapsed = 10;
      let present = true;
      const pollLive = vi.fn((): Promise<LiveStatMap> => {
        const map: LiveStatMap = new Map();
        if (present) map.set("100137", { elapsed, prog: 0.5 });
        return Promise.resolve(map);
      });
      const noop = vi.fn();
      render(<QueryDetailModal row={ROW} initialTab="plan" pollLive={pollLive}
        onClose={noop} onKilled={noop} showToast={noop} />);

      // 초기 tick 소화 + 기본 주기 5초
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(pollLive).toHaveBeenCalled();
      const select = screen.getByLabelText<HTMLSelectElement>("자동 갱신 주기");
      expect(select.value).toBe("5000");

      // 다음 tick에서 elapsed 40 — running 단계 수치가 그 기준으로 갱신된다
      elapsed = 40;
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      const running = mockPlanSteps({ id: "100137", qid: "JOI-14H", elapsed: 40 })
        .find((s) => s.state === "running")!;
      expect(screen.getByRole("tabpanel", { name: "플랜" }).textContent)
        .toContain(`${running.seconds.toFixed(1)}s`);

      // 주기 변경(3초) 후에도 폴링이 이어진다
      fireEvent.change(select, { target: { value: "3000" } });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

      // 맵에서 사라짐 = 종료 — 배너(role=status, alert 아님)와 Kill 잠금
      present = false;
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(screen.getByRole("status").textContent).toContain("종료된 statement");
      expect(screen.getByRole("button", { name: "Kill" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("SQL 복사 버튼이 결과를 토스트로 알린다", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { showToast } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalled();
  });

  it("닫기는 onClose만 부른다", () => {
    const { onClose, onKilled } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onKilled).not.toHaveBeenCalled();
  });
});

describe("Kill", () => {
  it("확인 다이얼로그 — 사유 필수·STOP_STATEMENT 명령문, 목업 표기는 없다 (X12)", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Kill" }));
    const dlg = screen.getByRole("dialog", { name: "Kill Statement" });
    expect(dlg.textContent).toContain("Statement 100137");
    expect(dlg.textContent).toContain("SELECT STOP_STATEMENT('100137');");
    expect(dlg.textContent).not.toContain("합성 데이터");
    expect(dlg.textContent).not.toContain("ADR-0004");
    expect(within(dlg).getByRole("button", { name: "Kill 실행" })).toBeDisabled();
  });

  it("성공 — POST 후 onKilled·onClose·성공 토스트", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { onClose, onKilled, showToast } = renderModal();

    const { dlg, reason } = openKillDialog();
    fireEvent.click(within(dlg).getByRole("button", { name: "Kill 실행" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onKilled).toHaveBeenCalledWith("100137");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v1/statements/100137/kill");
    expect(init.method).toBe("POST");
    // start_time = 세대 토큰(X6-R1) — 행이 본 시작 epoch가 함께 간다
    expect(JSON.parse(init.body as string)).toEqual({ reason, start_time: 1787000000 });
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("고정 시점(pinned)에서는 Kill이 비활성이다 — 과거 스냅숏의 행이다 (X6-R1)", () => {
    renderModal({}, true);
    expect(screen.getByRole("button", { name: "Kill" })).toBeDisabled();
  });

  it("세대 토큰(startEpoch)이 없으면 Kill이 비활성이다 — fail-closed (X6-R4)", () => {
    /* 토큰 없는 kill은 재사용된 stmt_id의 다른 문장을 죽일 수 있어 exporter도
       400으로 거부한다 — UI는 아예 열지 않는다. */
    renderModal({ startEpoch: NaN });
    expect(screen.getByRole("button", { name: "Kill" })).toBeDisabled();
  });

  it("404(이미 종료) — 실패가 아니라 목록 갱신이다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    const { onClose, onKilled } = renderModal();

    const { dlg } = openKillDialog();
    fireEvent.click(within(dlg).getByRole("button", { name: "Kill 실행" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onKilled).toHaveBeenCalledWith("100137");
  });

  it("연결 실패 — 팝업은 남고 목록은 그대로다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const { onClose, onKilled, showToast } = renderModal();

    const { dlg } = openKillDialog();
    fireEvent.click(within(dlg).getByRole("button", { name: "Kill 실행" }));

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(onKilled).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // 확인 다이얼로그는 닫히고 상세 팝업만 남는다
    expect(screen.queryByRole("dialog", { name: "Kill Statement" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Statement 100137" })).toBeInTheDocument();
  });
});
