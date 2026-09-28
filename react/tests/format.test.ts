import {
  displayNode,
  formatClock,
  formatCompact,
  formatDateKST,
  formatGB,
  formatGpu,
  formatInt,
  formatPercent,
  formatRowsPerSec,
  formatSeconds,
  formatTemp,
  formatWatt,
  instanceSuffix,
  workerName,
} from "../src/lib/format";

describe("format 유틸", () => {
  it("formatGB — 십진 GB 1자리", () => {
    expect(formatGB(22_300_000_000)).toBe("22.3 GB");
    expect(formatGB(Number.NaN)).toBe("-");
  });

  it("formatPercent", () => {
    expect(formatPercent(72)).toBe("72%");
    expect(formatPercent(72.4, 1)).toBe("72.4%");
    expect(formatPercent(Number.NaN)).toBe("-");
  });

  it("formatCompact — K/M/B (음수는 절댓값 축약 + 부호)", () => {
    expect(formatCompact(1_850_000)).toBe("1.85M");
    expect(formatCompact(963_000)).toBe("963K");
    expect(formatCompact(2_100_000_000)).toBe("2.10B");
    expect(formatCompact(42)).toBe("42");
    expect(formatCompact(-1_850_000)).toBe("-1.85M"); // CDX-R3-08
    expect(formatCompact(Number.NaN)).toBe("-");
  });

  it("formatRowsPerSec — 비유한이면 단위 없이 '-' (CDX-R3-08)", () => {
    expect(formatRowsPerSec(1_850_000)).toBe("1.85M rows/s");
    expect(formatRowsPerSec(Number.NaN)).toBe("-");
    expect(formatRowsPerSec(Number.POSITIVE_INFINITY)).toBe("-");
  });

  it("formatSeconds", () => {
    expect(formatSeconds(1.28)).toBe("1.28 s");
    expect(formatSeconds(Number.NaN)).toBe("-");
  });

  it("formatTemp", () => {
    expect(formatTemp(61.4)).toBe("61°C");
  });

  it("formatWatt — W / kW", () => {
    expect(formatWatt(986)).toBe("986 W");
    expect(formatWatt(1020)).toBe("1.02 kW");
  });

  it("formatInt — 천단위", () => {
    expect(formatInt(12458)).toBe("12,458");
    expect(formatInt(Number.NaN)).toBe("-");
  });

  it("테스트 런타임 타임존은 UTC로 고정돼 있다 (KST 회귀 검출 전제)", () => {
    // 이 값이 5가 아니라 14면 런타임이 KST라 로컬-시간 회귀를 놓친다 (vite.config env.TZ).
    expect(new Date(Date.UTC(2026, 6, 15, 5, 0, 0)).getHours()).toBe(5);
  });

  it("formatClock — KST HH:MM:SS (타임존 고정, CDX-R3-06)", () => {
    // 2026-07-15T05:32:01Z → KST(+9)는 14:32:01 — 실행 머신 타임존과 무관
    const sec = Date.UTC(2026, 6, 15, 5, 32, 1) / 1000;
    expect(formatClock(sec)).toBe("14:32:01");
    // 자정 경계: 2026-07-15T15:00:00Z → KST 00:00:00 (h23로 24시 아님)
    expect(formatClock(Date.UTC(2026, 6, 15, 15, 0, 0) / 1000)).toBe("00:00:00");
    expect(formatClock(Number.NaN)).toBe("-");
    expect(formatClock(Number.MAX_VALUE)).toBe("-"); // 범위 밖 → Invalid Date 방어 (CDX-R3-07)
  });

  it("formatDateKST — KST 날짜 (타임존 고정)", () => {
    // 2026-07-15T15:30:00Z 는 KST로 이미 7/16 00:30 → 날짜는 16일
    const sec = Date.UTC(2026, 6, 15, 15, 30, 0) / 1000;
    expect(formatDateKST(sec)).toContain("16");
    expect(formatDateKST(Number.NaN)).toBe("-");
  });

  it("formatGpu", () => {
    expect(formatGpu("0")).toBe("GPU-0");
  });

  it("workerName — node/gpu/mig → SQream 워커 이름 (exporter 규칙과 동일)", () => {
    // sqream{노드번호}{GPU}{MIG+1} — MIG만 1-based
    expect(workerName("gpu-server-01", "0", "0")).toBe("sqream101");
    expect(workerName("gpu-server-01", "1", "1")).toBe("sqream112");
    expect(workerName("gpu-server-03", "3", "1")).toBe("sqream332");
    // 라벨이 없거나 형식이 어긋나면 "-"
    expect(workerName("", "0", "0")).toBe("-");
    expect(workerName("gpu-server-01", "x", "0")).toBe("-");
  });
});

describe("R6 — displayNode / instanceSuffix", () => {
  it("displayNode: 메트릭 키를 운영 서버명으로 표시한다", () => {
    expect(displayNode("gpu-server-01")).toBe("icspreamh2gpu01");
    expect(displayNode("other-node")).toBe("other-node"); // 패턴 밖은 그대로
  });

  it("instanceSuffix: 0개 → All", () => {
    expect(instanceSuffix([])).toBe("(인스턴스: All)");
  });

  it("instanceSuffix: 1개 → 선택 인스턴스 표기 (PPTX)", () => {
    expect(instanceSuffix(["gpu-server-01"])).toBe("(선택 인스턴스: icspreamh2gpu01)");
  });

  it("instanceSuffix: 2개 이상 → N개 선택 (All로 뭉개지 않음)", () => {
    expect(instanceSuffix(["gpu-server-01", "gpu-server-02"])).toBe("(인스턴스: 2개 선택)");
  });
});
