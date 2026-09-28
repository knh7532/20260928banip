/**
 * 시간대별 GPU 타임라인 (간트) — ECharts 판 (E5 D4, 2026-09-07 승인 — D3 판 교체, 타임라인
 * 불가침 해제). 기본은 SQL 쿼리, props 로 LLM 워크로드판 구성. D3 판과 props·동작이 같다:
 * brush 구간 선택 ↔ `selection` 양방향(재발화 없음), 막대/행 라벨 클릭 → onSelectGpu,
 * 막대 네이티브 title 툴팁("{워커} · {쿼리명}"), 폭에 비례한 스케일(k=폭/1000) + 캔버스 높이
 * = viewBox 높이×k 로 `.timeline__plot-scroll` 세로 스크롤 그대로. 기하·옵션은 lib/timelineOption.
 */
import type { ECharts } from "echarts";
import { type ReactNode, useEffect, useRef } from "react";

import { QUERY_TYPE_LABEL } from "../../api/queries";
import { useEchart } from "../../hooks/useEchart";
import { queryTypeColor, QUERY_TYPE_COLORS } from "../../lib/colors";
import { themeTokens } from "../../lib/echartsTheme";
import { workerName } from "../../lib/format";
import { shortNode } from "../../lib/series";
import type { TimelineRow } from "../../lib/timeline";
import {
  selectionFromBrushEnd, timelineBrushAreas, timelineGeometry, timelineOption, type TlDatum,
} from "../../lib/timelineOption";
import { Panel } from "../Panel";

/** 범례 항목 (L3 — 화면별 범례 주입). */
export interface TimelineLegendItem {
  key: string;
  color: string;
  label: string;
}

export interface TimelineProps {
  rows: TimelineRow[];
  domainStart: number;
  domainEnd: number;
  selection: { startMs: number; endMs: number } | null;
  onSelectRange: (sel: { startMs: number; endMs: number } | null) => void;
  onSelectGpu: (node: string, gpu: string) => void;
  /** 패널 제목 접미사 (R6 — "(선택 인스턴스: …)"). */
  titleSuffix?: string;
  /** 단일 인스턴스 뷰 — 행 라벨을 "GPU-0" 표기로 (PPTX). 필터 기준으로 판정해 전달. */
  singleInstance?: boolean;
  /** 빈 상태 문구 — 첫 로드 중이면 "불러오는 중…"로 구분 (R9 F7.2, MetricStrip과 동일 폴링). */
  emptyText?: string;
  // ── L3 파라미터화 — 기본값 = 현행(GPU/SQream 화면) → 기존 화면 회귀 0 ──
  /** 패널 제목 본문 (기본: SQL 쿼리 타임라인). */
  title?: string;
  /** 패널 도움말. */
  hint?: string;
  /** 세그먼트 type → 색 (기본: 쿼리 유형 6색). */
  colorOf?: (type: string) => string;
  /** 범례 목록 (기본: 쿼리 유형 6종). */
  legendItems?: TimelineLegendItem[];
  /** 행 라벨 표기 (기본: MIG 포함 표기). */
  rowLabelOf?: (node: string, gpu: string, mig: string, single: boolean) => string;
  /** SVG·범례 접근성 라벨 (기본: 쿼리 표기 — 기존 화면 회귀 0). */
  ariaLabel?: string;
  legendAriaLabel?: string;
  /** X4 — 범례 아래 팬 스크롤바 슬롯 (인간 승인 2026-08-14, plan.md §7: 불가침
   *  부분 해제는 이 옵셔널 슬롯과 domain 전달에 한정). 기본 미표시 — LLM 화면 회귀 0. */
  panControl?: ReactNode;
  // ===== 20260916 추가 : 실행시간(초) 이상 막대 강조 =====
  executionThresholdSec?: number | null;
}


/**
 * 타임라인 한 행 = MIG 인스턴스 = SQream 워커 하나이므로 워커 이름을 그대로 쓴다
 * (예: "sqream101") — 표·시계열 범례·드릴다운과 같은 표기(2026-08-08 표기 통일).
 */
function rowLabel(node: string, gpu: string, mig: string, _single: boolean): string {
  const name = workerName(node, gpu, mig);
  return name === "-" ? `${shortNode(node)}·G${gpu}M${mig}` : name;
}

const DEFAULT_LEGEND: TimelineLegendItem[] = Object.keys(QUERY_TYPE_COLORS).map((t) => ({
  key: t, color: queryTypeColor(t), label: QUERY_TYPE_LABEL[t] ?? t,
}));

const BRUSH_CURSOR = {
  type: "takeGlobalCursor", key: "brush", brushOption: { brushType: "lineX", brushMode: "single" },
} as const;

/** ECharts 이벤트 params 중 이 컴포넌트가 읽는 부분 */
interface EvParams { seriesId?: string; data?: TlDatum }

export function Timeline({
  rows,
  domainStart,
  domainEnd,
  selection,
  onSelectRange,
  onSelectGpu,
  titleSuffix,
  singleInstance = false,
  emptyText,
  title = "시간대별 GPU 세션 & SQL 쿼리 실행 타임라인",
  hint = "GPU별 쿼리 실행 구간입니다. 막대 색은 쿼리 유형을 뜻합니다. 막대나 왼쪽 라벨을 클릭하면 해당 GPU로 필터하고, 가로로 드래그하면 선택 구간 상세를 봅니다.",
  colorOf = queryTypeColor,
  legendItems = DEFAULT_LEGEND,
  rowLabelOf = rowLabel,
  ariaLabel = "GPU 쿼리 실행 타임라인",
  legendAriaLabel = "쿼리 유형 범례",
  panControl,
  executionThresholdSec,
}: TimelineProps) {
  return (
    <Panel title={`${title} ${titleSuffix ?? ""}`.trimEnd()} hint={hint} className="panel--timeline">
      <div className="timeline">
        <div className="timeline__plot-scroll">
          {rows.length === 0 ? (
            <div className="timeline__empty">{emptyText ?? "표시할 타임라인 데이터가 없습니다"}</div>
          ) : (
            // canvas 는 행이 있을 때 마운트되는 내부 컴포넌트가 만든다(useEchart init 은 마운트 1회)
            <TimelineCanvas
              rows={rows} domainStart={domainStart} domainEnd={domainEnd} selection={selection}
              onSelectRange={onSelectRange} onSelectGpu={onSelectGpu} singleInstance={singleInstance}
              colorOf={colorOf} rowLabelOf={rowLabelOf} ariaLabel={ariaLabel}
              executionThresholdSec={executionThresholdSec}
            />
          )}
        </div>
        <ul className="timeline__legend" aria-label={legendAriaLabel}>
          {legendItems.map((item) => (
            <li key={item.key}>
              <span className="timeline__swatch" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
        {panControl}
      </div>
    </Panel>
  );
}

function TimelineCanvas({
  rows, domainStart, domainEnd, selection, onSelectRange, onSelectGpu, singleInstance,
  colorOf, rowLabelOf, ariaLabel, executionThresholdSec,
}: {
  rows: TimelineRow[];
  domainStart: number;
  domainEnd: number;
  selection: { startMs: number; endMs: number } | null;
  onSelectRange: TimelineProps["onSelectRange"];
  onSelectGpu: TimelineProps["onSelectGpu"];
  singleInstance: boolean;
  colorOf: (type: string) => string;
  rowLabelOf: (node: string, gpu: string, mig: string, single: boolean) => string;
  ariaLabel: string;
  executionThresholdSec?: number | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onRange = useRef(onSelectRange);
  onRange.current = onSelectRange;
  const onGpu = useRef(onSelectGpu);
  onGpu.current = onSelectGpu;
  const domainRef = useRef({ startMs: domainStart, endMs: domainEnd });
  domainRef.current = { startMs: domainStart, endMs: domainEnd };
  const selRef = useRef(selection);
  selRef.current = selection;
  const drawRef = useRef({ rows, singleInstance, colorOf, rowLabelOf, executionThresholdSec });
  drawRef.current = { rows, singleInstance, colorOf, rowLabelOf, executionThresholdSec };
  const widthRef = useRef<number | undefined>(undefined);

  /** 폭(k) 기준으로 캔버스 높이·옵션·브러시 선택을 모두 다시 넣는다. */
  const apply = (c: ECharts) => {
    const d = drawRef.current;
    const geo = timelineGeometry(d.rows.length, widthRef.current);
    const host = hostRef.current;
    if (host) host.style.height = `${geo.height}px`;
    if (widthRef.current) c.resize({ width: geo.width, height: geo.height });
    c.setOption(
      timelineOption(d.rows, domainRef.current, geo, themeTokens(),
        { colorOf: d.colorOf, rowLabelOf: d.rowLabelOf, single: d.singleInstance, highlightThresholdMs: d.executionThresholdSec != null && d.executionThresholdSec > 0 ? d.executionThresholdSec * 1000 : null }),
      { replaceMerge: ["series"] },
    );
    c.dispatchAction(BRUSH_CURSOR);
    c.dispatchAction({ type: "brush", areas: timelineBrushAreas(selRef.current, domainRef.current) });
  };

  const chart = useEchart(hostRef, {
    onInit: (c, size) => {
      // 호스트는 마운트 직후 높이가 0 이라 useEchart 의 실측(size)이 비어 온다 — 폭은 이미 있으므로
      // 직접 읽어 k 를 정하고 apply 가 캔버스를 (폭, H×k) 로 명시 resize 한다.
      widthRef.current = hostRef.current?.clientWidth || size?.width || undefined;
      apply(c);
      c.on("click", (raw: unknown) => {
        const p = raw as EvParams;
        if ((p.seriesId === "segments" || p.seriesId === "rowlabels") && p.data) {
          onGpu.current(p.data.node, p.data.gpu);
        }
      });
      // 네이티브 title 툴팁(A안) — SVG <title> 과 같은 문구·같은 브라우저 툴팁
      c.on("mouseover", (raw: unknown) => {
        const p = raw as EvParams;
        if (p.seriesId === "segments" && p.data?.title && hostRef.current) hostRef.current.title = p.data.title;
      });
      c.on("mouseout", () => { hostRef.current?.removeAttribute("title"); });
      c.on("brushEnd", (raw: unknown) => {
        onRange.current(selectionFromBrushEnd(raw, domainRef.current));
      });
    },
    onResize: (c, size) => {
      widthRef.current = size.width;
      apply(c);
    },
  });

  // 데이터·도메인·주입 함수·단일 뷰가 바뀌면 다시 그린다 (CDX-L-03: colorOf/rowLabelOf identity 포함).
  useEffect(() => {
    const c = chart.current;
    /* v8 ignore next -- init 효과가 선행한다 */
    if (!c) return;
    apply(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, rows, domainStart, domainEnd, singleInstance, colorOf, rowLabelOf, executionThresholdSec]);

  // 외부 selection 반영 — 프로그램적 brush 이동은 brushEnd 를 내지 않아 루프가 없다.
  useEffect(() => {
    const c = chart.current;
    /* v8 ignore next */
    if (!c) return;
    c.dispatchAction({ type: "brush", areas: timelineBrushAreas(selection, { startMs: domainStart, endMs: domainEnd }) });
  }, [chart, selection, domainStart, domainEnd]);

  return <div ref={hostRef} className="timeline__chart" role="img" aria-label={ariaLabel} />;
}
