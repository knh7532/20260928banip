import { Sidebar, type SidebarRoute } from "../components/Sidebar";
import type { LlmDrilldownView } from "../hooks/useRoute";
import { NODES } from "../api/queries";

const servers = NODES.map((node) => ({
  node, utilization: 0, memoryPct: 0, temperature: 0, power: 0,
  gpuBusy: 0, gpuTotal: 4, migTotal: 8,
}));

export function LlmDrilldownDashboard({ view, onNavigate }: {
  view: LlmDrilldownView;
  onNavigate: (route: SidebarRoute) => void;
}) {
  return (
    <div className="app-shell">
      <Sidebar servers={servers} selectedInstances={[]}
        onSelectInstance={() => undefined} route="llm"
        onNavigate={onNavigate} usageUnit="GPU" />
      <main className="drilldown-content">
        <iframe key={view} title="LLM 상세 대시보드"
          src={`/res/llm/drilldown.html?v=20260803-1#/${view}`} />
      </main>
    </div>
  );
}
