/*
 * 계약 변경 잠금 (2026-08-10) — QID 라벨 · 알람 worker 라벨.
 *
 * 둘 다 **exporter가 만들고 화면은 표시만 한다.** 화면이 점수를 다시 계산하거나
 * 워커를 추론하면 계약이 두 개가 된다 — 여기서 그 경계를 잠근다.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QidPill } from "../src/components/drilldown/QidPill";
import { buildAlarms } from "../src/screens/drilldown/alarmRows";
import type { PromSeries } from "../src/api/prom";

describe("QidPill", () => {
  it("계열에 따라 색 클래스를 준다 (문서 §2.1 롤업 5계열)", () => {
    const cases: Array<[string, string]> = [
      ["JOI-14H", "sqm-qid--read"],
      ["LOA-12H", "sqm-qid--ingest"],
      ["DEL-05M", "sqm-qid--modify"],
      ["CLE-00L", "sqm-qid--ddl"],
      ["UTI-00L", "sqm-qid--util"],
    ];
    for (const [qid, cls] of cases) {
      const { container, unmount } = render(<QidPill qid={qid} />);
      expect(container.querySelector(`.${cls}`), `${qid} → ${cls}`).toBeTruthy();
      unmount();
    }
  });

  it("등급을 클래스로 구분한다 — C는 표에서 바로 보여야 한다", () => {
    const { container } = render(<QidPill qid="JOI-22C" />);
    expect(container.querySelector(".sqm-qid--gC")).toBeTruthy();
  });

  it("호버 텍스트에 가점 근거를 담는다 (점수만으로는 조치를 못 정한다)", () => {
    render(<QidPill qid="JOI-14H" tags="JOIN:3,TXTKEY,NOWHERE,BIGTBL" />);
    const title = screen.getByText("JOI-14").getAttribute("title") ?? "";  // 등급 문자는 화면에서 뗀다(2026-08-10)
    expect(title).toContain("조회");
    expect(title).toContain("JOIN:3");
    expect(title).toContain("TXTKEY");
  });

  it("태그가 없으면 '가점 없음'이라고 말한다 — 빈 툴팁을 남기지 않는다", () => {
    render(<QidPill qid="CLE-00L" />);
    expect(screen.getByText("CLE-00").getAttribute("title")).toContain("가점 없음");
  });

  it("qid가 비면 지어내지 않고 `--`를 낸다", () => {
    const { container } = render(<QidPill qid="" />);
    expect(container.textContent).toBe("--");
    expect(container.querySelector(".sqm-qid")).toBeNull();
  });
});

describe("알람 worker 라벨", () => {
  const series = (m: Record<string, string>, v: string): PromSeries =>
    ({ metric: m, value: [0, v] }) as never;

  it("같은 노드의 서로 다른 워커 알람이 합쳐지지 않는다", () => {
    /* worker를 중복 키에서 빼면 두 알람이 한 건으로 뭉개진다 —
       이 프로젝트에서 실제로 그렇게 될 뻔했다. */
    const states = [
      series({ alertname: "SlowQuery", severity: "warning", node: "gpu-server-02", worker: "sqream241" }, "2"),
      series({ alertname: "SlowQuery", severity: "warning", node: "gpu-server-02", worker: "sqream242" }, "2"),
    ];
    const since = [
      series({ alertname: "SlowQuery", severity: "warning", node: "gpu-server-02", worker: "sqream241" }, "100"),
      series({ alertname: "SlowQuery", severity: "warning", node: "gpu-server-02", worker: "sqream242" }, "200"),
    ];

    const rows = buildAlarms(states, since);
    expect(rows, "두 워커 알람이 한 건으로 합쳐졌다").toHaveLength(2);
    // since가 서로 섞이지 않았는지 — 키가 뭉개지면 같은 값이 들어온다
    const byWorker = new Map(rows.map((r) => [r.worker, r.since]));
    expect(byWorker.get("sqream241")).toBe(100);
    expect(byWorker.get("sqream242")).toBe(200);
  });

  it("워커를 특정할 수 없는 알람은 빈 문자열로 온다 (노드·클러스터 레벨)", () => {
    const rows = buildAlarms(
      [series({ alertname: "DiskPressure", severity: "warning", node: "gpu-server-03" }, "2")],
      [],
    );
    expect(rows[0].worker).toBe("");
  });
});
