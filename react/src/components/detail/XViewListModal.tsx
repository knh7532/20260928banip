import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { queryTypeColor } from "../../lib/colors";
import { formatClock } from "../../lib/format";
import { summarize, typeOfQuery, type XViewEvent, type DurationRange } from "../../lib/xview";
import { XViewEventDetail } from "./XViewEventDetail";

type SortKey = "endMs" | "durationSec" | "queuedSec";

function sortValue(e: XViewEvent, key: SortKey): number {
  if (key === "queuedSec") return e.phases?.queuedSec ?? -1; // 단계 정보 없으면 후순위
  return e[key];
}

/**
 * X-View 구간 쿼리 목록 (X5-b, 인간 지시 — 드래그한 시간대의 쿼리를 목록으로 보고
 * 하나씩 넘기며 분석한다).
 *
 * 좌측 목록(정렬: 종료/소요/대기) + 우측 상세(`XViewEventDetail` — 툴팁과 동일
 * 표기). 클릭·↑↓·이전/다음으로 순회, Esc·바깥 클릭·×로 닫는다. body 포털.
 */
export function XViewListModal({
  events,
  startMs,
  endMs,
  duration,
  onClose,
}: {
  /** 드래그 구간의 표시 집합 (구간+상태·유형 필터 적용 — 산점도와 동일) */
  events: XViewEvent[];
  startMs: number;
  endMs: number;
  /** 2D 드래그의 소요시간(y) 범위 — 가로만 끌었으면 없다. 헤더 표기 전용(필터는 호출자). */
  duration?: DurationRange;
  onClose: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("endMs");
  const [sortDesc, setSortDesc] = useState(false);
  // 선택은 인덱스가 아니라 **안정 키**로 저장한다 (CDX-X5-03): 모달이 열린 동안
  // 폴링으로 events가 갱신·재정렬돼도 선택이 같은 쿼리를 따라간다.
  const [selKey, setSelKey] = useState<string | null>(null);
  const lastIdxRef = useRef(0); // 선택 항목이 사라졌을 때의 인접 보정용

  const keyOf = (e: XViewEvent) => `${e.stmtId}|${e.endMs}`;

  const sorted = useMemo(() => {
    const arr = [...events].sort((a, b) => sortValue(a, sortKey) - sortValue(b, sortKey));
    return sortDesc ? arr.reverse() : arr;
  }, [events, sortKey, sortDesc]);
  const sum = useMemo(() => summarize(events), [events]);

  // 파생 인덱스 — 키가 없거나(초기) 항목이 사라졌으면 마지막 위치로 clamp 보정
  const found = selKey ? sorted.findIndex((e) => keyOf(e) === selKey) : -1;
  const idx = found >= 0
    ? found
    : Math.min(selKey ? lastIdxRef.current : 0, Math.max(sorted.length - 1, 0));
  lastIdxRef.current = idx;
  const current = sorted[idx] ?? null;

  const move = (delta: number) => {
    const next = Math.min(Math.max(idx + delta, 0), sorted.length - 1);
    if (sorted[next]) {
      setSelKey(keyOf(sorted[next]));
      lastIdxRef.current = next;
    }
  };
  // 키보드 핸들러가 항상 최신 목록·인덱스를 보게 한다 (stale length 방지)
  const moveRef = useRef(move);
  moveRef.current = move;

  const toggleSort = (key: SortKey) => {
    setSelKey(null); // 정렬 축이 바뀌면 첫 행부터 다시 본다 (예측 가능성)
    lastIdxRef.current = 0;
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key !== "endMs"); // 소요·대기는 내림차순이 기본(느린 것부터)
    }
  };

  // Esc 닫기 · ↑↓ 순회 (하나씩 보면서 분석 — 인간 요구의 핵심 동선)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveRef.current(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveRef.current(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const arrow = (key: SortKey) => (sortKey === key ? (sortDesc ? " ▼" : " ▲") : "");

  return createPortal(
    <div className="xview-modal__backdrop" onMouseDown={onClose}>
      <div
        className="xview-modal"
        role="dialog"
        aria-label="구간 쿼리 목록"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="xview-modal__head">
          <div>
            <strong>구간 쿼리 목록</strong>
            <span className="xview-modal__range">
              {formatClock(startMs / 1000)} ~ {formatClock(endMs / 1000)}
              {duration && ` · 소요 ${duration.minSec.toFixed(1)}s ~ ${duration.maxSec.toFixed(1)}s`}
              {" "}· 완료 {sum.count}건 · 에러 {sum.failedCount}건
            </span>
          </div>
          <button type="button" className="panel__close" aria-label="목록 닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="xview-modal__body">
          <div className="xview-modal__list" role="listbox" aria-label="구간 내 쿼리">
            <div className="xview-modal__cols">
              <button type="button" onClick={() => toggleSort("endMs")}>
                종료{arrow("endMs")}
              </button>
              <span>쿼리</span>
              <button type="button" onClick={() => toggleSort("durationSec")}>
                소요{arrow("durationSec")}
              </button>
              <button type="button" onClick={() => toggleSort("queuedSec")}>
                대기{arrow("queuedSec")}
              </button>
            </div>
            <div className="xview-modal__rows">
              {sorted.map((e, i) => (
                <button
                  key={`${e.stmtId}|${e.endMs}`}
                  type="button"
                  role="option"
                  aria-selected={i === idx}
                  className={`xview-modal__row${i === idx ? " xview-modal__row--active" : ""}`}
                  onClick={() => { setSelKey(keyOf(e)); lastIdxRef.current = i; }}
                >
                  <span className="xview-modal__cell">{formatClock(e.endMs / 1000)}</span>
                  <span className="xview-modal__cell xview-modal__cell--name">
                    <span
                      className="xview__chip-swatch"
                      style={{ background: queryTypeColor(typeOfQuery(e.queryName)) }}
                    />
                    {e.queryName}
                    {e.status === "failed" && <span className="xview__tip-fail"> ✕</span>}
                  </span>
                  <span className="xview-modal__cell">{e.durationSec.toFixed(1)}s</span>
                  <span className="xview-modal__cell">
                    {e.phases ? `${e.phases.queuedSec.toFixed(1)}s` : "-"}
                  </span>
                </button>
              ))}
              {sorted.length === 0 && (
                <div className="xview__empty">구간에 완료된 쿼리가 없습니다</div>
              )}
            </div>
          </div>
          <div className="xview-modal__detail">
            {current ? (
              <>
                <XViewEventDetail ev={current} />
                <div className="xview-modal__nav">
                  <button type="button" onClick={() => move(-1)} disabled={idx <= 0}>
                    ← 이전
                  </button>
                  <span>
                    {idx + 1} / {sorted.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(1)}
                    disabled={idx >= sorted.length - 1}
                  >
                    다음 →
                  </button>
                </div>
              </>
            ) : (
              <div className="xview__empty">선택된 쿼리가 없습니다</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
