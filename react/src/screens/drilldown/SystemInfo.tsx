/**
 * System Info (`#/drilldown/metadata`) — 정적 `res/sqream/mockup/metadata.html`의 React 이관.
 *
 * S3 파일럿. 이 화면을 먼저 고른 이유는 가장 작고(정적 151줄) 쓰는 메트릭이 4종뿐이라
 * **배선(라우팅·토큰 스코프·폴링·오류 표시)** 만 검증하기 좋아서다.
 *
 * 정적 화면과 달라지는 것:
 *  - 문서를 새로 로드하지 않는다 (S3의 목적).
 *  - 상단 브랜드바·탭은 React 셸(사이드바 + 서브메뉴)이 이미 담당하므로 옮기지 않는다.
 *  - 조회 실패를 화면에 명시한다 — 낡은 값을 남기지 않는다(정적본의 codex 0.15 Major 대응 유지).
 */
import { useState } from "react";

import { promQuery, scalarOf, type PromSeries } from "../../api/prom";
import { systemInfo } from "../../api/queries";
import { usePolling } from "../../hooks/usePolling";
import { PinChip } from "../../components/drilldown/PinChip";
import type { DrilldownScreenProps } from "../DrilldownDashboard";
import { formatAgo, formatBytesSI, formatIsoDate } from "../../lib/format";
import { PageHead } from "../../components/drilldown/PageHead";
import { licenseState } from "./licenseState";

/** 갱신 이력 — 목업 고정값. 실제 시스템에서는 패키지/배포 이력이 출처다(계약 밖). */
const HISTORY = [
  { date: "2026-08-07", version: "2026.08", note: "모니터링 UI 및 Worker 가시성 개선" },
  { date: "2026-08-03", version: "2026.08-rc1", note: "Node·Worker 모니터링 개선" },
  { date: "2026-07-21", version: "2026.07.2", note: "쿼리·세션 분석 기능 업데이트" },
  { date: "2026-07-08", version: "2026.07.1", note: "대시보드 안정성 업데이트" },
] as const;

interface SystemState {
  version: string;
  build: string;
  lastUpdate: number;
  dataLimit: number;
  dataUsed: number;
  /** 라이선스 만료 시각(unix sec). 계약에 있었는데 화면이 안 쓰고 있었다. */
  licenseExpiry: number;
}

const EMPTY: SystemState = {
  version: "--", build: "--", lastUpdate: NaN, dataLimit: NaN, dataUsed: NaN,
  licenseExpiry: NaN,
};

function firstMetric(series: PromSeries[]): Record<string, string> {
  return series[0]?.metric ?? {};
}

export function SystemInfo({ refreshMs, title, pinnedMs, onClearPin }: DrilldownScreenProps) {
  const [data, setData] = useState<SystemState>(EMPTY);
  const [failed, setFailed] = useState(false);
  /* 첫 응답 전에는 "로드 중…"을 보인다 — 정적 화면과 같다. 빈 표를 `--`로 채워 두면
     "값이 없다"와 "아직 안 왔다"가 구분되지 않는다(codex CDX-S3B-04). */
  const [loaded, setLoaded] = useState(false);

  const { failStreak } = usePolling(async (signal) => {
    // 고정 시점이 있으면 그 시각의 값을 묻는다(instant 전용).
    const at = pinnedMs ?? undefined;
    const q = systemInfo();
    try {
      const [version, lastUpdate, dataLimit, dataUsed, licenseExpiry] = await Promise.all([
        promQuery(q.version, signal, at),
        promQuery(q.lastUpdate, signal, at),
        promQuery(q.dataLimit, signal, at),
        promQuery(q.dataUsed, signal, at),
        promQuery(q.licenseExpiry, signal, at),
      ]);
      const info = firstMetric(version);
      setData({
        // `??`가 아니라 `||` — 빈 문자열도 "--"로 본다 (정적 화면과 같은 폴백).
        version: info.version || "--",
        build: info.build || "--",
        lastUpdate: scalarOf(lastUpdate, NaN),
        dataLimit: scalarOf(dataLimit, NaN),
        dataUsed: scalarOf(dataUsed, NaN),
        licenseExpiry: scalarOf(licenseExpiry, NaN),
      });
      setFailed(false);
      setLoaded(true);
    } catch (error) {
      // 낡은 값을 남기지 않는다 — 실패는 실패로 보여야 한다.
      setData(EMPTY);
      setFailed(true);
      throw error; // usePolling이 failStreak로 집계
    }
  }, pinnedMs === null ? refreshMs : 0, [refreshMs, pinnedMs]);

  const { version, build, lastUpdate, dataLimit, dataUsed, licenseExpiry } = data;
  const license = licenseState(licenseExpiry);
  const pct = Number.isFinite(dataLimit) && Number.isFinite(dataUsed) && dataLimit > 0
    ? (dataUsed / dataLimit) * 100
    : null;
  const usageColor = pct === null ? "var(--green)"
    : pct >= 90 ? "var(--red)"
      : pct >= 75 ? "var(--yellow)" : "var(--green)";

  return (
    <div className="sqm-page">
      <PageHead title={title} sub="버전 · 데이터 한도"><PinChip pinnedMs={pinnedMs} onClear={onClearPin} /></PageHead>

      {failStreak >= 3 && (
        <div className="sqm-card sqm-table__error" role="alert">
          ⚠ 시스템 정보를 {failStreak}회 연속으로 조회하지 못했습니다 — Spring API를 확인하세요.
        </div>
      )}

      <div className="sqm-grid sqm-grid--kpi4" style={{ marginBottom: 16 }}>
        <Kpi icon="ℹ" tone="blue" label="SW VERSION" value={version} />
        <Kpi icon="⟳" tone="green" label="LAST UPDATE" value={formatAgo(lastUpdate)} />
        <Kpi
          icon="▦" tone="green" label="DATA LIMIT USAGE"
          value={pct === null ? "--" : `${pct.toFixed(1)}%`}
          color={usageColor}
        />
        {/* 만료는 지나고 나서 알면 늦다 — 90일 앞에서 주황으로 바뀐다. */}
        <Kpi
          icon="⎘" tone="green" label="LICENSE EXPIRY"
          value={Number.isFinite(licenseExpiry) ? formatIsoDate(licenseExpiry) : "--"}
          color={license.tone === "muted" ? undefined : `var(--${license.tone})`}
        />
      </div>

      <div className="sqm-grid sqm-grid--two">
        <section className="sqm-card">
          <h3 className="sqm-card__head">System &amp; Data Limit</h3>
          <div className="sqm-card__body">
            {failed ? (
              <p className="sqm-table__error">
                ⚠ 시스템 정보 조회 실패 — Spring API에 연결할 수 없습니다.
              </p>
            ) : !loaded ? (
              <p className="sqm-table__empty">로드 중…</p>
            ) : (
              <table className="sqm-table">
                <tbody>
                  <Row k="SW Version" v={version} />
                  <Row k="Build" v={build} />
                  <Row k="Last Update" v={`${formatIsoDate(lastUpdate)} (${formatAgo(lastUpdate)})`} />
                  <Row
                    k="License Expiry"
                    v={Number.isFinite(licenseExpiry)
                      ? `${formatIsoDate(licenseExpiry)} (${license.label})`
                      : "--"}
                  />
                  {/* 라이선스 숫자는 십진 TB다 — `formatBytes`(1024)로 그리면
                      300 TB 계약이 272.8 TB로 보인다. */}
                  <Row k="Data Limit" v={formatBytesSI(dataLimit)} />
                  <Row k="Data Used" v={formatBytesSI(dataUsed)} />
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 14 }}>
              <div className="sqm-bar">
                <span>Data Limit Usage</span>
                <span>
                  {pct === null
                    ? (failed ? "조회 실패" : "--")
                    : `${formatBytesSI(dataUsed)} / ${formatBytesSI(dataLimit)} (${pct.toFixed(1)}%)`}
                </span>
              </div>
              <div
                className="sqm-bar__track"
                role="progressbar"
                aria-label="데이터 한도 사용률"
                aria-valuenow={pct === null ? undefined : Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                {/* 0%도 보이도록 최소 2% — 정적 화면과 같은 규칙 */}
                <div
                  className="sqm-bar__fill"
                  style={{
                    width: `${pct === null ? 0 : Math.min(100, Math.max(2, pct))}%`,
                    background: usageColor,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="sqm-card">
          <h3 className="sqm-card__head">Update History</h3>
          <table className="sqm-table">
            <thead>
              <tr><th>Date</th><th>Version</th><th>Note</th></tr>
            </thead>
            <tbody>
              {HISTORY.map((h) => (
                <tr key={h.date}>
                  <td>{h.date}</td>
                  <td><b>{h.version}</b></td>
                  <td>{h.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon, tone, label, value, color }: {
  icon: string;
  tone: "blue" | "green";
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="sqm-card sqm-kpi">
      <div className={`sqm-kpi__icon sqm-kpi__icon--${tone}`} aria-hidden="true">{icon}</div>
      <div>
        <div className="sqm-kpi__label">{label}</div>
        <div className="sqm-kpi__value" style={color ? { color } : undefined}>{value}</div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="sqm-table__key">{k}</td>
      <td><b>{v}</b></td>
    </tr>
  );
}
