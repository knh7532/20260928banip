import { LLM_CATEGORY_LABEL } from "../api/queries";
import { FilterBar } from "../components/FilterBar";
import { Header } from "../components/Header";
import {
  Sidebar,
  type SidebarRoute,
} from "../components/Sidebar";
import { MetricStrip } from "../components/charts/MetricStrip";
import { ServerGauges } from "../components/charts/ServerGauges";
import {
  Timeline,
  type TimelineLegendItem,
} from "../components/charts/Timeline";
import { LlmRangeDetail } from "../components/detail/LlmRangeDetail";
import { TimeRangePanel } from "../components/detail/TimeRangePanel";
import { LlmProcesses } from "../components/tables/LlmProcesses";
import { LlmServices } from "../components/tables/LlmServices";
import {
  DEFAULT_STATE,
  useFilters,
} from "../hooks/useFilters";
import { useLlmCharts } from "../hooks/useLlmCharts";
import { useLlmData } from "../hooks/useLlmData";
import { useLlmRangeDetail } from "../hooks/useLlmRangeDetail";
import { useRangeSelection } from "../hooks/useRangeSelection";
import { DISCONNECT_THRESHOLD } from "../hooks/usePolling";
import {
  llmCategoryColor,
  LLM_CATEGORY_COLORS,
} from "../lib/colors";
import { instanceSuffix } from "../lib/format";
import { shortNode } from "../lib/series";

/**
 * LLM 대시보드 데이터 모드.
 *
 * simulation:
 * 기존 sqm_* Prometheus 시뮬레이션 데이터
 *
 * real:
 * 실제 GPU Agent 수집 데이터용 화면
 */
export type LlmDashboardMode =
    | "simulation"
    | "real";

interface LlmDashboardProps {
  mode: LlmDashboardMode;
  onNavigate: (route: SidebarRoute) => void;
}

/**
 * LLM 타임라인 범례.
 */
const LLM_LEGEND: TimelineLegendItem[] =
    Object.keys(LLM_CATEGORY_COLORS).map(
        (category) => ({
          key: category,
          color: LLM_CATEGORY_COLORS[category],
          label:
              LLM_CATEGORY_LABEL[category] ??
              category,
        }),
    );

/**
 * GPU 단위 행 라벨.
 *
 * 단일 인스턴스:
 * GPU-0
 *
 * 복수 인스턴스:
 * S01·GPU0
 */
function llmRowLabel(
    node: string,
    gpu: string,
    _mig: string,
    single: boolean,
): string {
  return single
      ? `GPU-${gpu}`
      : `${shortNode(node)}·GPU${gpu}`;
}

/**
 * GPU/LLM 모니터링 화면.
 *
 * #/llm:
 * 시뮬레이션 모드
 *
 * #/rllm:
 * 실데이터 모드
 */
export function LlmDashboard({
                               mode,
                               onNavigate,
                             }: LlmDashboardProps) {
  const isReal = mode === "real";

  const {
    state,
    setState,
    selectGpu,
    selectInstance,
    reset,
  } = useFilters();

  const filters = {
    env: state.env,
    instances: state.instances,
    gpus: state.gpus,
    migs: state.migs,
  };

  const {
    selection,
    setSelection,
    clear: clearSelection,
  } = useRangeSelection();

  const suffix =
      instanceSuffix(state.instances) ?? "";

  const single =
      state.instances.length === 1;

  /*
   * 현재 단계에서는 simulation과 real이
   * 동일한 기존 Prometheus 훅을 사용한다.
   *
   * 다음 단계에서 mode가 real인 경우
   * 실데이터 전용 훅으로 교체한다.
   */
  const {
    data,
    failStreak: tableFail,
    lastSuccessAt: tableAt,
  } = useLlmData(
      filters,
      state.refreshSec,
  );

  const {
    data: charts,
    failStreak: chartFail,
    lastSuccessAt: chartAt,
  } = useLlmCharts(
      filters,
      state.rangeSec,
      state.refreshSec,
  );

  const {
    detail,
    failStreak: detailFail,
    lastSuccessAt: detailAt,
  } = useLlmRangeDetail(
      filters,
      state.rangeSec,
      selection,
      state.refreshSec,
  );

  const disconnected =
      Math.max(
          tableFail,
          chartFail,
          detailFail,
      ) >= DISCONNECT_THRESHOLD;

  const successTimes = [
    tableAt,
    chartAt,
    detailAt,
  ].filter(
      (time): time is number =>
          time !== null,
  );

  const lastUpdatedMs =
      successTimes.length > 0
          ? Math.max(...successTimes)
          : null;

  const loadingText = (
      updatedAt: number | null,
  ): string =>
      !disconnected && updatedAt === null
          ? "불러오는 중…"
          : "";

  const resetRange = () => {
    setState({
      rangeSec:
      DEFAULT_STATE.rangeSec,
    });

    clearSelection();
  };

  const resetAll = () => {
    reset();
    clearSelection();
  };

  /**
   * 서버 카드에 표시된 GPU 수 합계.
   */
  const gpuTotal =
      data.servers.reduce(
          (total, server) => {
            if (
                !Number.isFinite(
                    server.gpuTotal,
                )
            ) {
              return Number.NaN;
            }

            return (
                total +
                server.gpuTotal
            );
          },
          0,
      );

    const dashboardTitle = isReal
        ? "GPU/LLM Real Monitoring Dashboard"
        : "GPU/LLM Monitoring Dashboard";

  const connectionMessage = isReal
      ? "⚠ 실데이터 API에 연결할 수 없습니다 — 수집 데이터가 없어 화면을 비웠습니다."
      : "⚠ Spring API에 연결할 수 없습니다 — 데이터가 없어 화면을 비웠습니다.";

  return (
      <div className="app-shell">
        <Sidebar
            servers={data.servers}
            selectedInstances={
              state.instances
            }
            onSelectInstance={
              selectInstance
            }
            /*
             * SidebarRoute에 현재 rllm이 없으므로
             * LLM 메뉴 활성화 상태는 llm으로 유지한다.
             */
            route="llm"
            onNavigate={onNavigate}
            usageUnit="GPU"
        />

        <main className="content">
          <div className="dashboard-canvas">
            <Header
                lastUpdatedMs={
                  lastUpdatedMs
                }
                title={dashboardTitle}
            />

            <FilterBar
                state={state}
                setState={setState}
                onResetRange={
                  resetRange
                }
                onResetAll={resetAll}
                showMig
            />

            {disconnected && (
                <div
                    className="conn-banner"
                    role="alert"
                >
                  {connectionMessage}
                </div>
            )}

            <section
                className="dashboard-top"
                aria-label="프로세스·서비스 테이블"
            >
              <LlmProcesses
                  rows={
                    data.processes
                  }
                  titleSuffix={suffix}
                  emptyText={loadingText(
                      tableAt,
                  )}
              />

              <LlmServices
                  rows={
                    data.services
                  }
                  titleSuffix={suffix}
                  emptyText={loadingText(
                      tableAt,
                  )}
              />
            </section>

            <section
                className="dashboard-middle"
                aria-label="타임라인 및 선택 구간"
            >
              <Timeline
                  rows={
                    charts.timelineRows
                  }
                  domainStart={
                    charts.domain
                        .startMs
                  }
                  domainEnd={
                    charts.domain
                        .endMs
                  }
                  selection={
                    selection
                  }
                  onSelectRange={
                    setSelection
                  }
                  onSelectGpu={
                    selectGpu
                  }
                  titleSuffix={
                    suffix
                  }
                  singleInstance={
                    single
                  }
                  emptyText={loadingText(
                      chartAt,
                  )}
                  title="시간대별 GPU 프로세스 & LLM 실행 타임라인"
                  hint="GPU별로 어떤 LLM/AI 워크로드가 실행 중인지 시간 흐름으로 보여줍니다. 막대 색은 워크로드 분류를 뜻합니다. 막대나 왼쪽 라벨을 클릭하면 해당 GPU로 필터하고, 가로로 드래그하면 선택 구간 상세를 봅니다."
                  colorOf={
                    llmCategoryColor
                  }
                  legendItems={
                    LLM_LEGEND
                  }
                  rowLabelOf={
                    llmRowLabel
                  }
                  ariaLabel="GPU LLM 워크로드 타임라인"
                  legendAriaLabel="워크로드 분류 범례"
              />

              <div className="detail-col">
                <TimeRangePanel
                    detail={detail}
                    hasSelection={
                        selection !== null
                    }
                />

                <LlmRangeDetail
                    detail={detail}
                    hasSelection={
                        selection !== null
                    }
                    disconnected={
                      disconnected
                    }
                    gpuTotal={
                      gpuTotal
                    }
                    onClose={
                      clearSelection
                    }
                />
              </div>
            </section>

            <section
                className="dashboard-bottom"
                aria-label="GPU 지표 및 서버 게이지"
            >
              <MetricStrip
                  series={
                    charts.series
                  }
                  emptyText={loadingText(
                      chartAt,
                  )}
                  domain={
                    charts.domain
                  }
                  hint="선택한 시간 범위의 GPU 지표 추이입니다. All 뷰는 서버(노드)별 평균 3선, 서버 선택 시 물리 GPU별 라인입니다(MIG 두 슬롯을 집계). 라인 색은 물리 GPU 번호를 뜻합니다. 네 차트는 같은 시간축을 공유하며 시간 눈금은 맨 아래 차트에 표시됩니다. 상단 필터·시간 범위와 연동됩니다."
              />

              <ServerGauges
                  servers={
                    data.servers
                  }
                  showMig={false}
              />
            </section>
          </div>
        </main>
      </div>
  );
}
