/**
 * 모니터링 어시스턴트(Chainlit) 주소 해석 — `ChatWidget`과 분리했다.
 *
 * 컴포넌트 파일이 함수를 함께 내보내면 react-refresh가 꺼진다(`toolbarModel.ts`와 같은 이유).
 *
 * **왜 포털 서브경로(`/agent`)가 아니라 포트인가.**
 * 처음엔 포털이 `/agent/`로 프록시하는 단일 오리진 배치를 노렸다. 그런데
 * Chainlit 2.11은 자산을 절대경로(`/assets/...`)로 내보내고, 그걸 맞추려는
 * `--root-path /agent`는 **기동 자체가 실패한다**(starlette `Routed paths must
 * start with '/'`, 실측 2026-08-09). 즉 이 버전에서 서브경로 마운트는 불가다.
 *
 * 그래서 기본값은 **앱이 떠 있는 호스트의 :8000**이다. 대시보드와 에이전트를 같은
 * 서버에 두는 일반적인 배치에서는 설정이 필요 없다. 다른 호스트면 `VITE_AGENT_URL`로
 * 지정한다. (단일 오리진이 필요해지면 Chainlit 업그레이드가 선행 조건이다 → ESC-H13)
 */
import { runtimeOverride } from "../runtimeConfig";

const DEFAULT_PORT = 8000;

export function agentUrl(): string {
  const runtime = runtimeOverride("agentUrl");
  if (runtime) return runtime.replace(/\/+$/, "");
  const configured: string | undefined = import.meta.env.VITE_AGENT_URL;
  if (configured && configured.trim() !== "") return configured.replace(/\/+$/, "");
  // SSR·테스트 등 location이 없을 수 있다.
  if (typeof location === "undefined") return `http://localhost:${DEFAULT_PORT}`;
  const proto = location.protocol === "https:" ? "https:" : "http:";
  return `${proto}//${location.hostname}:${DEFAULT_PORT}`;
}
