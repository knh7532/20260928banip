/*
 * X11 → X14 → X14-f1 — RestartGuideDialog(Worker Recovery) 단위 검증.
 *
 * 화면 통합 흐름(CLE 차단·stopped 직행)은 drilldownScreens.test.tsx가 잠근다.
 * 여기는 컴포넌트 단독의 분기를 잠근다: 유형별 뷰(crash=자동 기동 서사+수동
 * 트리거 / hang=정지·재기동(kill) 2종 병렬(X14-f1 사다리 폐기 → X15 kill
 * 모델 — Graceful Shutdown UI 폐기) / stopped=방어 분기),
 * 실행 전 안내(hang 재기동의 kill 명령 미리보기·강제 종료 경고 — 인간 지시),
 * 유형별 카피(락 보유/무락), 세대 토큰 결측 비활성, orphan 락 배너,
 * STOP_STATEMENT의 실패 분기(404=이미 종료 → onKilled / 409=서버 거부 / 네트워크).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RestartGuideDialog, type RestartGuideInfo,
} from "../src/screens/drilldown/RestartGuideDialog";
import { qidHoldsLock, qidSeries } from "../src/components/drilldown/qidSeries";

afterEach(() => vi.unstubAllGlobals());

const base: RestartGuideInfo = {
  worker: "sqream101",
  node: "icspreamh2gpu01",
  query: { id: "100501", qid: "SEL-01L", startEpoch: 1_787_000_000 },
  kind: "hang",
  orphanLocks: 0,
};

/** X15 — hang Recovery의 실체(인간 현장 확인 명령, awk 공백·grep -w 정정본
    — 후자는 codex X15-01: 부분 일치 오살 차단). */
const KILL_CMD =
  `pgrep -a sqreamd | grep -w sqream101 | awk '{print "kill " $1}' | sh`;

function renderGuide(info: RestartGuideInfo, over: {
  onKilled?: (id: string) => void;
  showToast?: (m: unknown, ms?: number) => void;
} = {}) {
  return render(
    <RestartGuideDialog
      info={info}
      onClose={() => {}}
      onKilled={over.onKilled ?? (() => {})}
      showToast={(over.showToast ?? (() => {})) as never}
    />,
  );
}

function stopVia(reason: string): void {
  fireEvent.click(screen.getByRole("button", { name: "STOP_STATEMENT" }));
  fireEvent.change(screen.getByLabelText("수행 사유"), { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: "정지 실행" }));
}

describe("RestartGuideDialog — 유형별 뷰 (X14)", () => {
  it("crash: 자동 기동 서사 + 수동 트리거 Recovery (X15)", () => {
    renderGuide({ ...base, query: undefined, kind: "crash" });
    expect(screen.getByText(/connection_lost로 실패 처리/)).toBeInTheDocument();
    expect(screen.getByText(/Down \(프로세스 다운·연결 끊김\)/)).toBeInTheDocument();
    // 자동 기동 스크립트가 되살린다 — 버튼은 못 살릴 때의 수동 트리거
    expect(screen.getByText(/자동 기동 스크립트가 재기동합니다\(보통 1~3분\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    expect(screen.queryByText(/실행 중 statement 정지/)).toBeNull();
    expect(screen.getByRole("button", { name: "Recovery" })).toBeEnabled();
    // Recovery → 확인 다이얼로그 — 프로세스가 이미 없어 kill 명령 미표기
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(screen.getByText(/다운된 워커를 수동 재기동/)).toBeInTheDocument();
    expect(screen.queryByText(/pgrep -a sqreamd/)).toBeNull();
    expect(screen.getByRole("button", { name: "Recovery 실행" })).toBeDisabled();
  });

  it("crash 직후 1-tick 창(문장 잔존) — Recovery가 잠기고 사유 title이 붙는다", () => {
    renderGuide({ ...base, kind: "crash" });
    const btn = screen.getByRole("button", { name: "Recovery" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/실패 처리 반영 중/);
  });

  it("stopped: 재기동 대기 안내 + 단일 Recovery", () => {
    renderGuide({ ...base, query: undefined, kind: "stopped" });
    expect(screen.getByText(/정상 종료가 완료됐습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    // stopped 경고문 — 절차 강제 문구(X11)는 X14-f1에서 폐기됐다
    expect(screen.getByText(/정지된 워커를 재기동합니다/)).toBeInTheDocument();
    expect(screen.queryByText(/graceful shutdown/)).toBeNull();
    expect(screen.getByRole("button", { name: "Recovery 실행" })).toBeDisabled();
  });

  it("hang + 조회 계열: 조치 2종 병렬(X15) — 정지·재기동 활성, shutdown 옵션 부재", () => {
    renderGuide(base);
    expect(screen.getByText(/No response \(프로세스 생존/)).toBeInTheDocument();
    expect(screen.getByText(/락 없음 — 중단해도 안전/)).toBeInTheDocument();
    expect(screen.queryByText(/트랜잭션이 롤백/)).toBeNull();
    expect(screen.getByRole("button", { name: "STOP_STATEMENT" })).toBeEnabled();
    // 사다리·관찰 박스는 폐기됐다(인간 지시) — 순차 잠금 문구 부재
    expect(screen.queryByText(/먼저 완료하세요/)).toBeNull();
    expect(screen.queryByText(/스스로 복귀할 수 있습니다/)).toBeNull();
    // 정상 종료 옵션은 X15에서 폐기(자동 기동 스크립트 모델)
    expect(screen.queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    // 재기동 = 워커 서버 kill — 실행 전 안내에 명령 미리보기·강제 종료 결과
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(screen.getByText(KILL_CMD)).toBeInTheDocument();
    expect(screen.getByText(/자동 기동 스크립트가 곧/)).toBeInTheDocument();
    expect(screen.getByText("icspreamh2gpu01")).toBeInTheDocument(); // 실행 위치
    expect(screen.getByText(/connection_lost로 강제 종료/)).toBeInTheDocument();
    expect(screen.queryByText(/트랜잭션이 롤백/)).toBeNull(); // SEL은 락 없음
    expect(screen.getByRole("button", { name: "Recovery 실행" })).toBeDisabled();
  });

  it("hang + 쓰기 계열 재기동 안내 — 롤백·배치 재실행 경고가 실린다 (X14-f1)", () => {
    renderGuide({ ...base, query: { id: "100504", qid: "LOA-12H", startEpoch: 1 } });
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    // 가이드의 락 경고에도 롤백 문구가 있어, 안내문 단락(강제 종료+롤백이 한
    // 문단)으로 좁혀 잠근다 — <b> 분절이라 textContent 함수 매처(기존 관용구).
    expect(screen.getByText((_t, el) =>
      /connection_lost로 강제 종료.*트랜잭션이 롤백되어 배치 재실행/s
        .test(el?.textContent ?? "") && el?.tagName === "P")).toBeInTheDocument();
  });

  it("hang + 문장 없음: 정지 옵션 없음 — 재기동(kill)만 활성", () => {
    renderGuide({ ...base, query: undefined });
    expect(screen.queryByRole("button", { name: "STOP_STATEMENT" })).toBeNull();
    expect(screen.queryByText(/스스로 복귀할 수 있습니다/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    expect(screen.getByRole("button", { name: "Recovery" })).toBeEnabled();
    // 문장이 없으니 재기동 안내에 강제 종료 문구는 없다 — kill·자동 기동만
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(screen.getByText(/워커 프로세스를 kill합니다/)).toBeInTheDocument();
    expect(screen.getByText(KILL_CMD)).toBeInTheDocument();
    expect(screen.queryByText(/강제 종료/)).toBeNull();
  });

  it("EXP는 ingest 계열이지만 락이 없다 — 롤백 경고를 내지 않는다 (codex X11-02)", () => {
    renderGuide({ ...base, query: { id: "100503", qid: "EXP-03M", startEpoch: 1 } });
    expect(screen.getByText(/락 없음 — 중단해도 안전/)).toBeInTheDocument();
    expect(screen.queryByText(/트랜잭션이 롤백/)).toBeNull();
  });

  it("세대 토큰(startEpoch) 결측이면 정지 버튼이 비활성이다 — X6-R4 fail-closed", () => {
    renderGuide({ ...base, query: { id: "100501", qid: "SEL-01L", startEpoch: NaN } });
    const btn = screen.getByRole("button", { name: "STOP_STATEMENT" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/시작 시각 메트릭/);
  });

  it("orphan 락이 있으면 REMOVE_LOCK 안내 배너를 낸다 (유형 무관)", () => {
    renderGuide({ ...base, query: undefined, kind: "crash", orphanLocks: 2 });
    expect(screen.getByText(/잔존\(orphan\) 락 2건/)).toBeInTheDocument();
    expect(screen.getByText(/REMOVE_LOCK으로 해제/)).toBeInTheDocument();
  });

  it("CLE인데 진행도 결측이면 막대 없이 차단 안내만 낸다", () => {
    renderGuide({ ...base, query: { id: "100502", qid: "CLE-00L", startEpoch: 1 } });
    expect(screen.getByText(/중단 금지/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("CLE 실행 중 — 정지·재기동 전 조치 차단(X15 kill 모델에서도 CLE만 유지)", () => {
    renderGuide({ ...base, query: { id: "100502", qid: "CLE-00L", startEpoch: 1 } });
    expect(screen.queryByRole("button", { name: "STOP_STATEMENT" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Graceful Shutdown" })).toBeNull();
    const recovery = screen.getByRole("button", { name: "Recovery" });
    expect(recovery).toBeDisabled();
    expect(recovery.getAttribute("title")).toMatch(/cleanup류 실행 중/);
  });

  it("정지 404 = 이미 종료 — onKilled로 반영하고 안내한다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    const onKilled = vi.fn();
    const showToast = vi.fn();
    renderGuide(base, { onKilled, showToast });
    stopVia("승인 #1");
    await waitFor(() => expect(onKilled).toHaveBeenCalledWith("100501"));
    expect(showToast).toHaveBeenCalled();
  });

  it("정지 409 = 서버 거부(fail-closed 이중화) — 문장은 유지하고 사유를 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false, status: 409,
      json: () => Promise.resolve({
        ok: false, error: "cleanup statement cannot be stopped (SQream guide)" }),
    })));
    const onKilled = vi.fn();
    const showToast = vi.fn();
    renderGuide(base, { onKilled, showToast });
    stopVia("승인 #1");
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(onKilled).not.toHaveBeenCalled();
  });

  it("정지 네트워크 실패 — 접수로 오인하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const onKilled = vi.fn();
    const showToast = vi.fn();
    renderGuide(base, { onKilled, showToast });
    stopVia("승인 #1");
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(onKilled).not.toHaveBeenCalled();
  });

  it("정지 접수(200) — onKilled 반영 후 확인 다이얼로그가 닫힌다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200 })));
    const onKilled = vi.fn();
    renderGuide(base, { onKilled });
    stopVia("승인 #1");
    await waitFor(() => expect(onKilled).toHaveBeenCalledWith("100501"));
    expect(screen.queryByRole("button", { name: "정지 실행" })).toBeNull();
  });

  it("하위 확인 다이얼로그는 취소하면 가이드로 돌아온다 — kill 명령 미리보기 포함", () => {
    // hang + 문장 없음 — Recovery 확인(kill 명령 미리보기) 취소
    const hangReady = renderGuide({ ...base, query: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(screen.getByText(KILL_CMD)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("button", { name: "Recovery 실행" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Recovery sqream101" })).toBeInTheDocument();
    hangReady.unmount();

    // stopped — Recovery 확인 취소(프로세스가 없어 kill 명령 미표기)
    renderGuide({ ...base, query: undefined, kind: "stopped" });
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(screen.queryByText(KILL_CMD)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("button", { name: "Recovery 실행" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Recovery sqream101" })).toBeInTheDocument();
  });

  it("닫기는 onClose로 위임한다 — 절차 상태는 저장하지 않으므로 잃을 것이 없다", () => {
    const onClose = vi.fn();
    render(
      <RestartGuideDialog info={{ ...base, query: undefined, kind: "stopped" }}
        onClose={onClose} onKilled={() => {}} showToast={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("qidSeries (X11 — QidPill과 공유하는 롤업)", () => {
  it("코드 3글자로 계열을 판정하고, 미지·결측은 util 폴백이다", () => {
    expect(qidSeries("LOA-12H")).toBe("ingest");
    expect(qidSeries("SEL-01L")).toBe("read");
    expect(qidSeries("CLE-00L")).toBe("ddl");
    expect(qidSeries("ZZZ-99C")).toBe("util");
    expect(qidSeries("")).toBe("util");
  });

  it("락 보유 판정은 exporter LOCK_CODES와 같다 — EXP·조회는 락 없음 (X11-02)", () => {
    expect(qidHoldsLock("LOA-12H")).toBe(true);
    expect(qidHoldsLock("CLE-00L")).toBe(true);
    expect(qidHoldsLock("DEL-05M")).toBe(true);
    expect(qidHoldsLock("EXP-03M")).toBe(false); // ingest 계열이지만 테이블 락 없음
    expect(qidHoldsLock("SEL-01L")).toBe(false);
    expect(qidHoldsLock("")).toBe(false);
  });
});
