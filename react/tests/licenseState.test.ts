/*
 * 라이선스 만료 판정 (2026-08-10).
 *
 * 시각을 주입해 검증한다 — `Date.now()`에 기대면 오늘 통과하고 90일 뒤 깨진다.
 */
import { describe, expect, it } from "vitest";

import { formatBytes, formatBytesSI } from "../src/lib/format";
import { LICENSE_WARN_DAYS, licenseState } from "../src/screens/drilldown/licenseState";

/** 2026-08-10 00:00:00 UTC. */
const NOW = Date.UTC(2026, 7, 10);
const at = (daysFromNow: number) => (NOW + daysFromNow * 86_400_000) / 1000;

describe("licenseState", () => {
  it("여유가 있으면 초록", () => {
    const s = licenseState(at(365), NOW);
    expect(s.tone).toBe("green");
    expect(s.days).toBe(365);
    expect(s.label).toBe("365일 남음");
  });

  it("90일 이내면 주황 — 갱신 리드타임 앞에서 알아야 한다", () => {
    expect(licenseState(at(LICENSE_WARN_DAYS), NOW).tone).toBe("orange");
    expect(licenseState(at(LICENSE_WARN_DAYS + 1), NOW).tone).toBe("green");
    expect(licenseState(at(1), NOW).tone).toBe("orange");
  });

  it("지났으면 빨강이고 '지남'이라고 말한다", () => {
    const s = licenseState(at(-3), NOW);
    expect(s.tone).toBe("red");
    expect(s.label).toBe("3일 지남");
  });

  it("값이 없으면 '만료됨'으로 접지 않는다 — 조회 실패와 만료는 다르다", () => {
    for (const bad of [NaN, Infinity]) {
      const s = licenseState(bad, NOW);
      expect(s.tone, `${bad}`).toBe("muted");
      expect(s.label).toBe("--");
      expect(Number.isNaN(s.days)).toBe(true);
    }
  });

  it("exporter가 심는 만료값(2027-12-31)은 아직 초록이다", () => {
    // drilldown_sim.py의 LICENSE_EXPIRY와 같은 값. 둘이 어긋나면 여기서 드러난다.
    expect(licenseState(1_830_211_200, NOW).tone).toBe("green");
    expect(licenseState(1_830_211_200, NOW).days).toBe(508);
  });
});

describe("formatBytesSI — 라이선스 숫자", () => {
  it("십진이다 — 300 TB 계약이 300.0 TB로 보인다", () => {
    expect(formatBytesSI(300 * 10 ** 12)).toBe("300.0 TB");
    expect(formatBytesSI(214 * 10 ** 12)).toBe("214.0 TB");
  });

  it("이진 표기(`formatBytes`)와 다르다 — 이 차이가 이 함수의 존재 이유다", () => {
    // 같은 값을 1024로 나누면 272.8 TB가 되어 계약서 숫자와 어긋난다
    expect(formatBytes(300 * 10 ** 12)).toBe("272.8 TB");
  });

  it("잘못된 값은 '--'", () => {
    expect(formatBytesSI(NaN)).toBe("--");
  });
});
