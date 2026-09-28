import type { ECharts } from "echarts";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEchart } from "../../hooks/useEchart";
import { themeTokens } from "../../lib/echartsTheme";
import type { DurationRange, XViewEvent } from "../../lib/xview";
import {
  xviewGeometry, xviewKey, xviewOption, xviewScales, zoneLabel, zoneSelection,
} from "../../lib/xviewOption";
import { XViewEventDetail } from "../detail/XViewEventDetail";

/** 툴팁 예상 크기(px) — 뷰포트 밖 넘침 판정용 보수적 추정치 (현행과 동일). */
const TIP_EST_W = 290;
const TIP_EST_H = 310;
/** 드래그로 판정할 최소 이동(px) — 미만이면 클릭(고정)으로 취급. */
const DRAG_MIN_PX = 4;
/** 드래그 구간 최소 폭(ms). */
const DRAG_MIN_MS = 1000;

interface TipState {
  ev: XViewEvent;
  x: number;
  y: number;
  flip: boolean;
  flipY: boolean;
  pinned: boolean;
}

interface Zone { x: number; y: number; w: number; h: number; label: string; labelTop: number; labelLeft: number; k: number }

export interface XViewChartProps {
  events: XViewEvent[];
  domainStart: number;
  domainEnd: number;
  onZoom?: (factor: number, anchorMs: number) => void;
  onResetView?: () => void;
  onDragRange?: (startMs: number, endMs: number, duration?: DurationRange) => void;
}

/** ECharts 이벤트 params 중 이 컴포넌트가 읽는 부분. */
interface PointParams {
  data?: { key?: string };
  event?: { event?: { clientX: number; clientY: number } };
}

/**
 * X-View 산점도 (ECharts, E5 D2 — D3 판 교체). 점 1개 = 완료 쿼리 1건, X=종료 시각, Y=소요시간(초).
 * 브러시는 없다: 구간 선택은 타임라인(③)이 소유하고 이 차트는 그 결과만 그린다. 동작은 D3 판과 같다:
 * 호버/클릭 고정 포털 툴팁, 휠 줌·더블클릭 리셋, 문서 레벨 2D 드래그(영역·건수 라벨·
 * 영역 밖 dim) → onDragRange. 영역·라벨은 canvas 위 HTML 오버레이(.xv-overlay).
 */
export function XViewChart({
  events,
  domainStart,
  domainEnd,
  onZoom,
  onResetView,
  onDragRange,
}: XViewChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipDivRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [inZone, setInZone] = useState<Set<string> | null>(null);
  const setTipRef = useRef(setTip);
  setTipRef.current = setTip;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const onResetRef = useRef(onResetView);
  onResetRef.current = onResetView;
  const onDragRangeRef = useRef(onDragRange);
  onDragRangeRef.current = onDragRange;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const domainRef = useRef({ startMs: domainStart, endMs: domainEnd });
  domainRef.current = { startMs: domainStart, endMs: domainEnd };
  const sizeRef = useRef<{ width: number; height: number } | undefined>(undefined);
  const dragRef = useRef<{
    startClientX: number; lastClientX: number; startClientY: number; lastClientY: number;
  } | null>(null);
  const eventByKey = useRef(new Map<string, XViewEvent>());
  eventByKey.current = new Map(events.map((e) => [xviewKey(e), e]));

  const pinnedKey = tip?.pinned ? xviewKey(tip.ev) : null;

  const buildOption = () => xviewOption(
    eventsRef.current, domainRef.current, xviewGeometry(sizeRef.current), themeTokens(),
    { pinnedKey, inZone },
  );

  const chart = useEchart(hostRef, {
    onInit: (c, size) => {
      sizeRef.current = size;
      c.setOption(buildOption());
      wire(c);
    },
    onResize: (c, size) => {
      sizeRef.current = size;
      c.setOption(buildOption());
    },
  });

  /* 이벤트 배선 — 점 위 호버/클릭은 ECharts 시리즈 이벤트로, 좌표는 원 마우스 이벤트에서. */
  function wire(c: ECharts) {
    const at = (e: XViewEvent, evt: { clientX: number; clientY: number }, pinned: boolean): TipState => ({
      ev: e, x: evt.clientX, y: evt.clientY,
      flip: evt.clientX + TIP_EST_W > window.innerWidth,
      flipY: evt.clientY + TIP_EST_H > window.innerHeight,
      pinned,
    });
    // ECharts 이벤트 params 타입(ECElementEvent)은 data 가 OptionDataItem 이라 우리 키를 모른다
    // — unknown 으로 받아 필요한 필드만 좁힌다.
    const find = (p: PointParams) => (p.data?.key ? eventByKey.current.get(p.data.key) : undefined);
    const show = (raw: unknown) => {
      const p = raw as PointParams;
      const ev = find(p);
      const evt = p.event?.event;
      if (!ev || !evt) return;
      setTipRef.current((prev) => (prev?.pinned ? prev : at(ev, evt, false)));
    };
    const hide = () => setTipRef.current((prev) => (prev?.pinned ? prev : null));
    c.on("mouseover", show);
    c.on("mousemove", show);
    c.on("mouseout", hide);
    c.on("click", (raw: unknown) => {
      const p = raw as PointParams;
      const ev = find(p);
      const evt = p.event?.event;
      if (!ev || !evt) return;
      setTipRef.current(at(ev, evt, true));
    });
    const zr = typeof c.getZr === "function" ? c.getZr() : null;
    zr?.on("globalout", hide);
  }

  // 데이터·도메인·고정·dim 이 바뀌면 옵션을 다시 넣는다(재생성 없음).
  useEffect(() => {
    const c = chart.current;
    /* v8 ignore next -- init 효과가 선행한다 */
    if (!c) return;
    c.setOption(buildOption(), { replaceMerge: ["series"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, events, domainStart, domainEnd, pinnedKey, inZone]);

  // 폴링으로 목록이 갱신되면 호버 툴팁은 무효, 고정 툴팁은 같은 이벤트가 있으면 유지.
  useEffect(() => {
    setTipRef.current((prev) => {
      if (!prev?.pinned) return null;
      const still = events.find(
        (e) => e.stmtId === prev.ev.stmtId && e.endMs === prev.ev.endMs && e.queryName === prev.ev.queryName,
      );
      return still ? { ...prev, ev: still } : null;
    });
  }, [events, domainStart, domainEnd]);

  // 고정 해제: 바깥 mousedown 또는 Escape (툴팁 내부 클릭은 유지).
  const pinnedNow = tip?.pinned === true;
  useEffect(() => {
    if (!pinnedNow) return;
    const onDown = (e: MouseEvent) => {
      if (tipDivRef.current?.contains(e.target as Node)) return;
      setTipRef.current(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTipRef.current(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinnedNow]);

  // 휠 줌 — preventDefault 를 위해 non-passive 네이티브 리스너. 앵커는 커서 시각.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (evt: WheelEvent) => {
      if (!onZoomRef.current) return;
      evt.preventDefault();
      const rect = host.getBoundingClientRect();
      const geo = xviewGeometry(sizeRef.current ?? { width: rect.width, height: rect.height });
      const s = xviewScales(domainRef.current, eventsRef.current, geo);
      const factor = evt.deltaY < 0 ? 1 / 1.2 : 1.2;
      onZoomRef.current(factor, s.xInv(s.clampX(evt.clientX - rect.left)));
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  // 2D 드래그 — 문서 레벨 추적(현행 상태기계 그대로). 좌표는 호스트 상자 기준 픽셀.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const local = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      return { px: clientX - rect.left, py: clientY - rect.top, rect };
    };
    const hasYExtent = (d: { startClientY: number; lastClientY: number }) =>
      Math.abs(d.lastClientY - d.startClientY) >= DRAG_MIN_PX;
    const scalesNow = (rect: DOMRect) => {
      const geo = xviewGeometry(sizeRef.current ?? { width: rect.width, height: rect.height });
      return { geo, s: xviewScales(domainRef.current, eventsRef.current, geo) };
    };
    const drawZone = () => {
      const d = dragRef.current;
      if (!d || Math.abs(d.lastClientX - d.startClientX) < DRAG_MIN_PX) return;
      const a = local(d.startClientX, d.startClientY);
      const b = local(d.lastClientX, d.lastClientY);
      const { geo, s } = scalesNow(a.rect);
      const x0 = s.clampX(a.px);
      const x1 = s.clampX(b.px);
      const [top, bottom] = hasYExtent(d)
        ? [s.clampY(a.py), s.clampY(b.py)]
        : [geo.plot.y0, geo.plot.y1];
      const z = { x: Math.min(x0, x1), y: Math.min(top, bottom), w: Math.abs(x1 - x0), h: Math.abs(bottom - top) };
      const sel = zoneSelection(z, eventsRef.current, s);
      const label = zoneLabel(sel.total, sel.failed);
      // 라벨 상자도 차트와 같은 스케일(k)로 — SVG 시절 viewBox 단위였다 (codex E5-01)
      const k = geo.k;
      const tw = (label.length * 6.2 + 12) * k;
      const labelTop = z.y - 17 * k < geo.plot.y0 ? z.y + 1 * k : z.y - 17 * k;
      const labelLeft = Math.min(z.x, geo.plot.x1 - tw);
      setZone({ ...z, label, labelTop, labelLeft, k });
      setInZone(sel.keys);
    };
    const clearZone = () => { setZone(null); setInZone(null); };
    const onDocMove = (evt: MouseEvent) => {
      if (!dragRef.current) return;
      dragRef.current.lastClientX = evt.clientX;
      dragRef.current.lastClientY = evt.clientY;
      drawZone();
    };
    const onDocUp = (evt: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      clearZone();
      const moved = Math.abs(evt.clientX - d.startClientX) >= DRAG_MIN_PX;
      const a = local(d.startClientX, d.startClientY);
      const b = local(evt.clientX, evt.clientY);
      const { s } = scalesNow(a.rect);
      const loMs = s.xInv(Math.min(s.clampX(a.px), s.clampX(b.px)));
      const hiMs = s.xInv(Math.max(s.clampX(a.px), s.clampX(b.px)));
      let duration: DurationRange | undefined;
      if (hasYExtent({ ...d, lastClientY: evt.clientY })) {
        const yA = s.yInv(s.clampY(a.py));
        const yB = s.yInv(s.clampY(b.py));
        duration = { minSec: Math.max(0, Math.min(yA, yB)), maxSec: Math.max(yA, yB) };
      }
      if (moved && hiMs - loMs >= DRAG_MIN_MS) {
        // 이 드래그가 만드는 click 1회만 캡처 단계에서 삼킨다 (CDX-X5-01)
        const swallow = (ce: MouseEvent) => ce.stopPropagation();
        document.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 0);
        onDragRangeRef.current?.(loMs, hiMs, duration);
      }
    };
    document.addEventListener("mousemove", onDocMove);
    document.addEventListener("mouseup", onDocUp);
    return () => {
      document.removeEventListener("mousemove", onDocMove);
      document.removeEventListener("mouseup", onDocUp);
    };
  }, []);

  const onMouseDown = (evt: React.MouseEvent) => {
    if (!onDragRangeRef.current || evt.button !== 0) return;
    dragRef.current = {
      startClientX: evt.clientX, lastClientX: evt.clientX,
      startClientY: evt.clientY, lastClientY: evt.clientY,
    };
  };

  return (
    <div className="xview__plotwrap">
      <div
        ref={hostRef}
        className="xview__chart"
        role="img"
        aria-label="쿼리 완료 산점도 (X-View)"
        onMouseDown={onMouseDown}
        onDoubleClick={() => onResetRef.current?.()}
      />
      {zone && (
        <div className="xv-overlay" aria-hidden="true">
          <div className="xvo-zone" style={{ left: zone.x, top: zone.y, width: zone.w, height: zone.h }} />
          <div
            className="xvo-count"
            style={{
              left: zone.labelLeft, top: zone.labelTop,
              fontSize: 10 * zone.k, height: 16 * zone.k, lineHeight: `${14 * zone.k}px`, padding: `0 ${6 * zone.k}px`,
            }}
          >
            {zone.label}
          </div>
        </div>
      )}
      {tip &&
        createPortal(
          <div
            ref={tipDivRef}
            className={`xview__tip${tip.pinned ? " xview__tip--pinned" : ""}`}
            role="tooltip"
            style={{
              left: tip.x + (tip.flip ? -12 : 12),
              top: tip.y + (tip.flipY ? -10 : 10),
              transform:
                [tip.flip ? "translateX(-100%)" : "", tip.flipY ? "translateY(-100%)" : ""]
                  .join(" ")
                  .trim() || undefined,
            }}
          >
            <XViewEventDetail ev={tip.ev} />
          </div>,
          document.body,
        )}
    </div>
  );
}
