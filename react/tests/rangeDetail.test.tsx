// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";

import { RangeDetail } from "../src/components/detail/RangeDetail";
import { TimeRangePanel } from "../src/components/detail/TimeRangePanel";
import type { RangeDetailData } from "../src/hooks/useRangeDetail";

const detail: RangeDetailData = {
  // 2026-07-15T05:00:00Z ~ 05:30:00Z (KST 14:00~14:30)
  startMs: Date.UTC(2026, 6, 15, 5, 0, 0),
  endMs: Date.UTC(2026, 6, 15, 5, 30, 0),
  gpuCount: 3,
  queryIdCount: 5,
  databases: ["sales_db", "crm_db"],
  rowsPerSecond: 1_850_000,
  p95Seconds: 1.28,
  queryCount: 42,
  memoryBytes: 22_300_000_000,
};

const noop = () => {};

/** dt 라벨의 형제 dd 값을 읽는다. */
function valueOf(label: string): string {
  const dt = screen.getByText(label);
  const row = dt.closest(".detail__row") as HTMLElement;
  return within(row).getByText((_, el) => el?.classList.contains("detail__val") ?? false).textContent ?? "";
}

describe("RangeDetail — 7항목 (R7: 시간 구간은 TimeRangePanel로 분리)", () => {
  it("선택 있음: 단위와 함께 7항목을 렌더한다", () => {
    render(<RangeDetail detail={detail} hasSelection={true} migTotal={24} onClose={noop} />);
    expect(screen.queryByText("시간 구간")).toBeNull(); // R7: 소패널로 분리
    expect(valueOf("활성 MIG")).toBe("3 / 24"); // R9 F8.2: 분모 표기
    expect(valueOf("쿼리 ID")).toBe("5개");
    expect(valueOf("데이터베이스")).toBe("sales_db, crm_db");
    expect(valueOf("처리행수/초")).toBe("1.85M rows/s");
    expect(valueOf("응답시간 (P95)")).toBe("1.28 s");
    expect(valueOf("쿼리 수(구간 완료)")).toBe("42"); // R9 F8.3: 의미 명시
    expect(valueOf("사용 메모리")).toBe("22.3 GB");
    // 선택 중엔 브러시 안내 없음 (R9 F6.1)
    expect(screen.queryByText(/드래그하면 구간/)).toBeNull();
  });

  it("전체 상태(선택 없음): 브러시 안내 인라인 + 분모 결측은 '-' (R9 F6.1/F8.2)", () => {
    render(<RangeDetail detail={detail} hasSelection={false} migTotal={Number.NaN} onClose={noop} />);
    expect(screen.getByText(/타임라인을 가로로 드래그하면 구간을 선택/)).toBeInTheDocument();
    expect(valueOf("활성 MIG")).toBe("3 / -");
  });

  it("연결 끊김이면 로딩 대신 끊김 안내 (R7 C-4)", () => {
    render(<RangeDetail detail={null} hasSelection={false} disconnected onClose={noop} />);
    expect(screen.getByText("연결 끊김 — 데이터 없음")).toBeInTheDocument();
  });

  it("DB가 없으면 '-'", () => {
    render(<RangeDetail detail={{ ...detail, databases: [] }} hasSelection={true} onClose={noop} />);
    expect(valueOf("데이터베이스")).toBe("-");
  });

  it("detail이 null이면 로딩 안내", () => {
    render(<RangeDetail detail={null} hasSelection={false} onClose={noop} />);
    expect(screen.getByText("데이터를 불러오는 중…")).toBeInTheDocument();
  });

  it("결측 수치는 '-'로 표기", () => {
    render(
      <RangeDetail
        detail={{ ...detail, rowsPerSecond: Number.NaN, p95Seconds: Number.NaN, memoryBytes: Number.NaN }}
        hasSelection={true}
        onClose={noop}
      />,
    );
    expect(valueOf("처리행수/초")).toBe("-");
    expect(valueOf("응답시간 (P95)")).toBe("-");
    expect(valueOf("사용 메모리")).toBe("-");
  });
});

describe("RangeDetail — × 닫기 (R6)", () => {
  it("선택 있음: × 활성, 클릭 시 onClose 호출", () => {
    const onClose = vi.fn();
    render(<RangeDetail detail={detail} hasSelection={true} onClose={onClose} />);
    const btn = screen.getByRole("button", { name: "선택 구간 해제" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("선택 없음: ×는 렌더되지만 비활성 (PPTX 상시 표기)", () => {
    const onClose = vi.fn();
    render(<RangeDetail detail={detail} hasSelection={false} onClose={onClose} />);
    const btn = screen.getByRole("button", { name: "선택 구간 해제" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("TimeRangePanel — 시간 구간 소패널 (R7)", () => {
  it("구간·전체 배지를 렌더한다", () => {
    render(<TimeRangePanel detail={detail} hasSelection={false} />);
    const panel = screen.getByRole("region", { name: "시간 구간" });
    expect(panel.textContent).toContain("14:00:00");
    expect(panel.textContent).toContain("14:30:00");
    expect(within(panel).getByText("전체")).toBeInTheDocument();
  });

  it("선택 중엔 배지 없음, detail null이면 '-'", () => {
    const { rerender } = render(<TimeRangePanel detail={detail} hasSelection={true} />);
    expect(screen.queryByText("전체")).toBeNull();
    rerender(<TimeRangePanel detail={null} hasSelection={false} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
