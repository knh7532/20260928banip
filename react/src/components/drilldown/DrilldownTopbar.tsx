/**
 * 드릴다운 공통 상단바 (2026-08-09) — 정적 `mockup/*.html`의 `header.topbar` 이관.
 *
 * S3에서 **빠뜨렸던 것**이다. 툴바(CDX-S3C-01)와 같은 성격의 누락으로, 11개 정적
 * 화면이 전부 갖고 있던 헤더가 React에는 아예 없었다.
 *
 * 원본과 맞춘 것:
 *  - 로고 "SQream DB Monitoring"에서 `SQ`만 강조색.
 *  - CLUSTER STATUS·NODES는 **실데이터**다. 정적 `assets/app.js`의 공통 updater가
 *    쓰던 두 식을 그대로 쓴다.
 *  - VERSION은 원본에서도 하드코딩이었다. 노출할 실메트릭이 없어 그대로 둔다.
 *  - 👤/⚙ Admin은 원본에서도 **동작 없는 장식**이다. 클릭 핸들러를 붙이지 않는다 —
 *    누르면 뭔가 될 것처럼 보이는 편이 아무 일도 안 하는 것보다 나쁘다.
 *
 * 원본과 **일부러 다르게 한 것** (codex 리뷰 2026-08-09):
 *  - 🔔 배지는 하드코딩 "3"이 아니라 실제 firing 알람 수다. Alarms 화면이 실데이터를
 *    읽는데 배지만 고정값이면 두 숫자가 어긋나 보인다.
 *  - 조회 실패를 HEALTHY로 위장하지 않는다. 실패·빈 응답·비유한 값은 전부 `--`다.
 *  - 세 지표를 **독립 판정**한다. 하나가 실패해도 성공한 나머지는 살린다.
 *  - 마지막 갱신 시각을 항상 보여 준다. 자동 갱신이 꺼져 있으면 그 사실도 함께
 *    말한다 — 멈춘 HEALTHY가 현재 상태처럼 보이는 것이 가장 위험하다.
 */
import { useState } from "react";

import { fetchCommonStatus } from "../../api/aiReactEchartCommonApi";
import { formatClock } from "../../lib/format";
import { usePolling } from "../../hooks/usePolling";
// 스타일을 컴포넌트가 직접 들고 온다 — 탑뷰·상세 어디에 놓아도 따라오게.
import "../../styles/topbar.css";

/** 원본 헤더의 고정 표기. 실메트릭이 생기면 그때 대체한다. */
const VERSION = "2026.08";

type Health = "healthy" | "degraded" | "unknown";

/**
 * 갱신 시각 표기 — **KST 고정**이다.
 *
 * 처음엔 `getHours()`로 브라우저 로컬 시간을 썼는데, 이 컴포넌트가 탑뷰의 옛
 * `Header`를 대체하면서 문제가 됐다(codex 지적 2026-08-09). 그 헤더는 `formatClock()`
 * 으로 KST를 고정했고, 모니터링 대상이 한국 현장 장비라 로컬 타임존을 따라가면
 * 비-KST 브라우저에서 같은 시각이 다르게 보인다. 같은 진원지를 쓴다.
 */
function clockOf(ms: number | null): string {
  return ms === null ? "--:--:--" : formatClock(ms / 1000);
}

export function DrilldownTopbar({ refreshMs, dataUpdatedMs, sticky = false, statusPollMs }: {
  /** 툴바의 자동 갱신 주기와 같은 값. 0이면 최초 1회만 조회한다(Off). */
  refreshMs: number;
  /**
   * 화면 데이터의 마지막 갱신 시각. 주면 stamp가 **이 값**을 쓴다.
   *
   * 탑뷰에서 없앤 `Header`가 보여 주던 "갱신 HH:MM:SS"가 바로 이 값(테이블·차트·
   * 구간상세 세 폴링 중 최근 성공)이다. 상단바 자체 시각은 자기 두 쿼리 기준이라
   * 의미가 다르므로, 화면이 더 정확한 값을 알고 있으면 그것을 우선한다.
   * 상세 대시보드는 넘기지 않으므로 자기 시각을 쓴다.
   */
  dataUpdatedMs?: number | null;
  /** 탑뷰처럼 스크롤 컨테이너 안에 놓일 때 상단 고정. */
  sticky?: boolean;
  /** 공통 상태 API의 별도 polling 주기. 0이면 최초 1회만 조회. */
  statusPollMs?: number;
}) {
  const [health, setHealth] = useState<Health>("unknown");
  const [nodes, setNodes] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<number | null>(null);

  // ===== 20260908 추가 시작 : Drilldown Topbar Prometheus 제거 - 공통 PostgreSQL REST 조회 =====
  const { lastSuccessAt } = usePolling(async (signal) => {
    const body = await fetchCommonStatus(Date.now(), signal);
    if (signal.aborted) return;
    setHealth(body.healthy ? "healthy" : "degraded");
    setNodes(Number.isFinite(Number(body.nodes)) ? Number(body.nodes) : null);
    setAlerts(Number.isFinite(Number(body.alerts)) ? Number(body.alerts) : null);
  }, statusPollMs ?? refreshMs, [statusPollMs ?? refreshMs]);
  // ===== 20260908 추가 끝 : Drilldown Topbar Prometheus 제거 - 공통 PostgreSQL REST 조회 =====

  const label = health === "healthy" ? "HEALTHY" : health === "degraded" ? "DEGRADED" : "--";
  const paused = refreshMs === 0;

  // 화면이 알려 준 데이터 시각이 있으면 그것을 쓴다. `undefined`가 아니라 `null`도
  // 유효한 값이다 — "아직 한 번도 성공 못 했다"는 뜻이라 `--:--:--`가 맞다.
  const stampMs = dataUpdatedMs !== undefined ? dataUpdatedMs : lastSuccessAt;

  return (
    <header className={`sqm-topbar ${sticky ? "sqm-topbar--sticky" : ""}`.trim()}>
      <div className="sqm-topbar__logo">
        <span className="sqm-topbar__sq">SQ</span>ream DB Monitoring
      </div>

      <div className="sqm-topbar__status">
        <span className="sqm-topbar__chip">
          CLUSTER STATUS:{" "}
          <b><span className={`sqm-topbar__health sqm-topbar__health--${health}`}>{label}</span></b>
        </span>
        <span className="sqm-topbar__chip">NODES: <b>{nodes === null ? "--" : nodes}</b></span>
        <span className="sqm-topbar__chip">VERSION: <b>{VERSION}</b></span>
        {/* 언제 기준인지 없으면 멈춘 값이 현재 상태처럼 보인다(codex D). */}
        <span className={`sqm-topbar__stamp ${paused ? "sqm-topbar__stamp--paused" : ""}`.trim()}>
          {clockOf(stampMs)} 기준{paused ? " · 자동 갱신 꺼짐" : ""}
        </span>
      </div>

      <div className="sqm-topbar__right">
        <span className="sqm-topbar__bell" title={alerts === null ? "알람 수 조회 실패" : `firing 알람 ${alerts}건`}>
          🔔
          {alerts !== null && alerts > 0 && <span className="sqm-topbar__badge">{alerts}</span>}
        </span>
        {/* 원본과 동일한 장식. 동작이 없으므로 스크린리더에서 감춘다. */}
        <span aria-hidden="true">👤</span>
        <span className="sqm-topbar__admin" aria-hidden="true">⚙ Admin ▾</span>
      </div>
    </header>
  );
}
