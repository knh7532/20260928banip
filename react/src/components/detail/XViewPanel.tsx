import { useEffect, useRef, useState } from "react";

import { QUERY_TYPE_LABEL } from "../../api/queries";
import { PanScrollbar } from "../charts/PanScrollbar";
import { XViewChart } from "../charts/XViewChart";
import { XViewListModal } from "./XViewListModal";
import { QUERY_TYPE_COLORS } from "../../lib/colors";
import { formatClock, formatInt, formatSeconds } from "../../lib/format";
import {
  ALL_QUERY_TYPES,
  type DurationRange,
  type XViewEvent,
  type XViewKindFilter,
  defaultKindFilter,
  filterByDuration,
  filterByKind,
  filterEvents,
  isKindFilterActive,
  summarize,
} from "../../lib/xview";
import { Panel } from "../Panel";

/**
 * X-View 패널 (Phase X2) — 구 "시간 구간"+"선택 구간 상세" 두 패널을 대체한다.
 *
 * 헤더 요약행(선택 구간·N건·에러 n건·평균 소요)은 **차트에 표시 중인 동일 이벤트
 * 집합**에서 계산한다 (XR-04 — 별도 쿼리로 세면 링 누락 시 점 수와 어긋난다).
 * 브러시 선택이 없으면 현재 시간범위 전체, 있으면 그 구간으로 줌·구간 밖 점 제외.
 *
 * X4: 우측 상단 깔때기 아이콘 → 표시 필터 팝오버 (1행 상태 완료·에러 / 2행 유형
 * 6종 — 인간 확정). 끈 항목은 산점도와 요약행에서 **함께** 빠진다(같은 집합 원칙).
 */
const MIN_ZOOM_WINDOW_MS = 60_000;

export function XViewPanel({
  events,
  selection,
  domain,
  pan,
  disconnected = false,
  onClose,
  emptyText,
}: {
  events: XViewEvent[];
  selection: { startMs: number; endMs: number } | null;
  /** 선택이 없을 때의 기본 표시 구간(최신 1×) — 타임라인과 같은 조회 도메인. */
  domain: { startMs: number; endMs: number };
  /** X4 — 3× 조회 전체(팬·줌의 좌우 한계). 미지정이면 스크롤바·줌 없음(기존 동작). */
  pan?: { startMs: number; endMs: number };
  /** 연결 끊김(공란) 상태 — 로딩 문구 대신 끊김 안내 (R7 C-4). */
  disconnected?: boolean;
  /** × 클릭 → 브러시 선택 해제 (구 RangeDetail의 × 승계). */
  onClose: () => void;
  /** 첫 로드 중 빈 상태 문구 ("불러오는 중…") — R9 F7.2 구분. */
  emptyText?: string;
}) {
  const hasSelection = selection !== null;

  /** X4 수동 뷰(줌·팬) — **폭과 추적 여부를 분리** 저장한다 (CDX-X4-04):
   *  `anchorEndMs === null`이면 최신 추적 — 매 폴링마다 같은 폭으로 최신 끝을 따라간다. */
  const [manualView, setManualView] = useState<{
    widthMs: number;
    anchorEndMs: number | null;
  } | null>(null);
  // 줌·팬이 스스로 선택을 해제할 때는 선택 리셋 효과를 건너뛴다 (CDX-X4-02) —
  // onClose() → selection=null 재렌더가 방금 만든 수동 뷰를 지우면 안 된다.
  const skipSelReset = useRef(false);
  const selKey = selection ? `${selection.startMs}-${selection.endMs}` : "none";
  useEffect(() => {
    if (skipSelReset.current) {
      skipSelReset.current = false;
      return;
    }
    setManualView(null); // 새 브러시 선택(또는 외부 해제)이면 수동 뷰는 무효
  }, [selKey]);

  const panLimit = pan && pan.endMs > 0 ? pan : domain;
  const baseWindowMs = domain.endMs - domain.startMs;
  // 시간 범위(창 폭)가 바뀌면 이전 줌·팬은 새 3× 조회와 무관하다 — 리셋 (CDX-X4-05).
  // 폴링 갱신은 endMs만 밀 뿐 폭은 안 바뀌므로 여기 걸리지 않는다.
  useEffect(() => {
    setManualView(null);
  }, [baseWindowMs]);

  // 뷰 도출 — 우선순위: 선택 > 수동 > 기본. 수동은 panLimit로 항상 재클램프한다.
  let view: { startMs: number; endMs: number };
  if (selection) {
    view = selection;
  } else if (manualView) {
    const width = Math.min(manualView.widthMs, panLimit.endMs - panLimit.startMs);
    const end =
      manualView.anchorEndMs === null
        ? panLimit.endMs // 추적 — 폴링마다 최신 끝으로
        : Math.min(Math.max(manualView.anchorEndMs, panLimit.startMs + width), panLimit.endMs);
    view = { startMs: end - width, endMs: end };
  } else {
    view = domain;
  }
  const startMs = view.startMs;
  const endMs = view.endMs;
  const ready = endMs > 0; // 도메인 미확정(첫 조회 전)이면 아직 그릴 수 없다
  const viewWidth = endMs - startMs;

  const detachSelection = () => {
    if (selection) {
      skipSelReset.current = true;
      onClose();
    }
  };

  // 휠 줌 (X4) — 커서 시각 앵커 유지, 최소 60s ~ 최대 3× 전체, panLimit로 clamp.
  const handleZoom = (factor: number, anchorMs: number) => {
    if (!ready) return;
    const width = Math.min(
      Math.max(viewWidth * factor, MIN_ZOOM_WINDOW_MS),
      panLimit.endMs - panLimit.startMs,
    );
    const ratio = viewWidth > 0 ? (anchorMs - startMs) / viewWidth : 0.5;
    let s = anchorMs - width * ratio;
    let e = s + width;
    if (s < panLimit.startMs) {
      s = panLimit.startMs;
      e = s + width;
    }
    if (e > panLimit.endMs) {
      e = panLimit.endMs;
      s = e - width;
    }
    detachSelection(); // 선택 위에서 줌하면 선택을 풀고 수동 뷰로 전환
    // 우측 끝에 붙은 줌은 추적으로 저장 — 이후 폴링을 같은 폭으로 따라간다 (CDX-X4-04)
    const anchorEnd = e >= panLimit.endMs - 500 ? null : e;
    setManualView(
      anchorEnd === null && Math.abs(width - baseWindowMs) < 1000
        ? null
        : { widthMs: width, anchorEndMs: anchorEnd },
    );
  };

  const handleResetView = () => {
    detachSelection();
    setManualView(null);
  };

  // 드래그 구간 목록 (X5-b, 인간 정정) — 드래그한 시간대의 쿼리 목록을 연다.
  // 뷰(줌·팬)는 바꾸지 않는다: 확대는 휠 줌이 담당한다.
  const [listRange, setListRange] = useState<{
    startMs: number; endMs: number; duration?: DurationRange;
  } | null>(null);
  const handleDragRange = (s: number, e: number, duration?: DurationRange) => {
    const start = Math.max(s, panLimit.startMs);
    const end = Math.min(e, panLimit.endMs);
    if (end - start < 1000) return;
    // 세로로도 끌었으면 소요시간(y) 범위까지 목록에 적용한다 (2D 선택, 인간 지시 2026-09-04)
    setListRange({ startMs: start, endMs: end, duration });
  };

  // 팬 스크롤바 (X4) — 창 폭 유지한 채 이동. 우측 끝 = 추적(줌 폭 유지), 기본 폭이면 완전 복귀.
  const handlePan = (anchor: number | null) => {
    detachSelection();
    const width = viewWidth > 0 ? viewWidth : baseWindowMs;
    if (anchor === null) {
      setManualView(
        Math.abs(width - baseWindowMs) < 1000 ? null : { widthMs: width, anchorEndMs: null },
      );
      return;
    }
    setManualView({ widthMs: width, anchorEndMs: anchor });
  };

  // X4 표시 필터 — 기본 전부 켜짐. 산점도·요약행이 같은 집합을 쓴다.
  const [kind, setKind] = useState<XViewKindFilter>(defaultKindFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrapRef = useRef<HTMLSpanElement>(null);
  const filterActive = isKindFilterActive(kind);

  // 팝오버 닫기: 바깥 mousedown·Escape (Panel 힌트·X3-f2 고정 해제와 같은 관례)
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterWrapRef.current?.contains(e.target as Node)) return;
      setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  const inWindow = ready ? filterEvents(events, startMs, endMs) : [];
  const shown = filterByKind(inWindow, kind);
  const sum = summarize(shown);
  const allHiddenByFilter = ready && inWindow.length > 0 && shown.length === 0 && filterActive;

  const toggleStatus = (key: "success" | "failed") =>
    setKind((k) => ({ ...k, [key]: !k[key] }));
  const toggleType = (t: string) =>
    setKind((k) => {
      const types = new Set(k.types);
      if (types.has(t)) types.delete(t);
      else types.add(t);
      return { ...k, types };
    });
  const resetKind = () => setKind(defaultKindFilter());

  return (
    <Panel
      title="X-View (쿼리 완료 분포)"
      hint="점 1개 = 완료 쿼리 1건입니다. 가로축은 종료 시각, 세로축은 소요시간이고 색은 쿼리 유형, ✕는 실패입니다. 타임라인에서 가로로 드래그하면 그 구간만 봅니다. 점 클릭 = 상세 고정, 깔때기 = 표시 필터."
      className="panel--xview"
      actions={
        <>
          {manualView && (
            <button
              type="button"
              className="xview__reset-btn"
              onClick={handleResetView}
              aria-label="줌·팬 초기화"
            >
              ⟲ 초기화
            </button>
          )}
          <span className="xview__filterwrap" ref={filterWrapRef}>
            <button
              type="button"
              className={`xview__filter-btn${filterActive ? " xview__filter-btn--active" : ""}`}
              aria-label="표시 필터"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
            >
              {/* 깔때기 아이콘 — 인라인 SVG, currentColor (신규 의존성·토큰 없음) */}
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M1 1h10L7.5 6v4L4.5 11.5V6L1 1z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {filterOpen && (
              <div className="xview__filter-pop" role="dialog" aria-label="X-View 표시 필터">
                <div className="xview__filter-row">
                  <span className="xview__filter-cap">상태</span>
                  <div className="xview__filter-chips">
                    <button
                      type="button"
                      className="xview__chip"
                      aria-pressed={kind.success}
                      onClick={() => toggleStatus("success")}
                    >
                      완료
                    </button>
                    <button
                      type="button"
                      className="xview__chip"
                      aria-pressed={kind.failed}
                      onClick={() => toggleStatus("failed")}
                    >
                      에러 ✕
                    </button>
                  </div>
                </div>
                <div className="xview__filter-row">
                  <span className="xview__filter-cap">쿼리 종류</span>
                  <div className="xview__filter-chips">
                    {ALL_QUERY_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="xview__chip"
                        aria-pressed={kind.types.has(t)}
                        onClick={() => toggleType(t)}
                      >
                        <span
                          className="xview__chip-swatch"
                          style={{ background: QUERY_TYPE_COLORS[t] }}
                        />
                        {QUERY_TYPE_LABEL[t] ?? t}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="xview__filter-reset"
                  disabled={!filterActive}
                  onClick={resetKind}
                >
                  모두 표시
                </button>
              </div>
            )}
          </span>
          <button
            type="button"
            className="panel__close"
            aria-label="선택 구간 해제"
            disabled={!hasSelection}
            onClick={onClose}
          >
            ×
          </button>
        </>
      }
    >
      <div className="xview">
        <div className="xview__summary">
          <span className="xview__range">
            {ready ? (
              <>
                {formatClock(startMs / 1000)} ~ {formatClock(endMs / 1000)}
                {!hasSelection && !manualView && <span className="detail__badge">전체</span>}
                {!hasSelection && manualView && <span className="detail__badge">줌·팬</span>}
                {filterActive && <span className="detail__badge">필터</span>}
              </>
            ) : (
              "-"
            )}
          </span>
          <span>
            완료 <strong>{formatInt(sum.count)}</strong>건
          </span>
          <span>
            에러 <strong>{formatInt(sum.failedCount)}</strong>건
          </span>
          <span>
            평균 <strong>{formatSeconds(sum.avgDurationSec, 1)}</strong>
          </span>
        </div>
        <div className="xview__plot">
          {disconnected ? (
            <div className="xview__empty">연결 끊김 — 데이터 없음</div>
          ) : allHiddenByFilter ? (
            <div className="xview__empty">
              필터로 모두 숨겨졌습니다 — 깔때기의 &quot;모두 표시&quot;로 리셋하세요
            </div>
          ) : !ready || shown.length === 0 ? (
            <div className="xview__empty">
              {emptyText ??
                "완료 이벤트가 아직 없습니다 — 기동 직후에는 첫 쿼리가 끝나는 30~60초 뒤부터 표시됩니다"}
            </div>
          ) : (
            <XViewChart
              events={shown}
              domainStart={startMs}
              domainEnd={endMs}
              onZoom={pan ? handleZoom : undefined}
              onResetView={pan ? handleResetView : undefined}
              onDragRange={handleDragRange}
            />
          )}
        </div>
        {pan && pan.endMs > 0 && ready && (
          <PanScrollbar
            panStartMs={panLimit.startMs}
            panEndMs={panLimit.endMs}
            windowMs={viewWidth}
            anchorEndMs={
              selection ? endMs : manualView ? manualView.anchorEndMs : null
            }
            onPan={handlePan}
            ariaLabel="X-View 과거 구간 스크롤"
          />
        )}
        {/* X5: 하단 상시 범례 (인간 제공 jsx 참고) — 클릭으로 유형 표시/숨김.
            팝오버 필터와 같은 상태(kind.types)를 공유한다. */}
        <div className="xview__legend" aria-label="쿼리 유형 범례 (클릭 토글)">
          {ALL_QUERY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="xview__legend-btn"
              aria-pressed={kind.types.has(t)}
              onClick={() => toggleType(t)}
            >
              <span
                className="xview__chip-swatch"
                style={{ background: QUERY_TYPE_COLORS[t] }}
              />
              {QUERY_TYPE_LABEL[t] ?? t}
            </button>
          ))}
          <span className="xview__legend-hint">● 완료 ✕ 에러 · 드래그로 쿼리 목록</span>
        </div>
        {/* X5-b: 드래그 구간의 쿼리 목록 — 산점도와 같은 필터 집합에서 구간만 추린다 */}
        {listRange && (
          <XViewListModal
            events={filterByKind(
              filterByDuration(
                filterEvents(events, listRange.startMs, listRange.endMs), listRange.duration),
              kind,
            )}
            startMs={listRange.startMs}
            endMs={listRange.endMs}
            duration={listRange.duration}
            onClose={() => setListRange(null)}
          />
        )}
      </div>
    </Panel>
  );
}
