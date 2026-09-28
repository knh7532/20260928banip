import { ChatWidget } from "./components/ChatWidget";
import { drilldownViewFromHash, llmDrilldownViewFromHash, useRoute } from "./hooks/useRoute";

import { GpuDashboard } from "./screens/GpuDashboard";
import { LlmDashboard } from "./screens/LlmDashboard";
import { DrilldownDashboard } from "./screens/DrilldownDashboard";
import { LlmDrilldownDashboard } from "./screens/LlmDrilldownDashboard";

export default function App() {
    const { route, navigate } = useRoute();

    return (
        <>
            {screenFor(route, navigate)}
            {/* AI Agent 채팅 — 전 화면 공통이라 셸 **바깥 형제**로 둔다.
                `.app-shell`은 2열 그리드다. fixed 요소는 흐름에서 빠져 암묵 트랙을
                만들지 않지만, 바깥에 두면 §4-16 같은 사고를 애초에 피한다. */}
            <ChatWidget />
        </>
    );
}

function screenFor(route: ReturnType<typeof useRoute>["route"],
                   navigate: ReturnType<typeof useRoute>["navigate"]) {
    if (route === "llm") {
        return (
            <LlmDashboard
                mode="simulation"
                onNavigate={navigate}
            />
        );
    }

    /*
     * GPU/LLM REAL(#/rllm)은 요청에 따라 범위에서 제외했다 (2026-08-08).
     * 이 화면은 Prometheus가 아니라 포털 백엔드 /api/gpu-monitor/** 를 쓰는 별개 계열이고,
     * 해당 컨트롤러가 인수인계에 없어 목업만으로는 채울 수 없다.
     * 사이드바 메뉴와 함께 제거했으며, 재구성해 둔 소스는
     * sqream-monitoring-handoff-20260807/portal-reference-20260808/rllm-reconstruction/ 에 보관돼 있다.
     * 되살리려면 그 5개 파일을 되돌리고 이 분기와 Sidebar 항목을 복원하면 된다.
     */

    if (route === "drilldown") {
        return <DrilldownDashboard view={drilldownViewFromHash(location.hash)} onNavigate={navigate} />;
    }

    if (route === "llm-drilldown") {
        return <LlmDrilldownDashboard view={llmDrilldownViewFromHash(location.hash)} onNavigate={navigate} />;
    }

    return <GpuDashboard onNavigate={navigate} />;
}
