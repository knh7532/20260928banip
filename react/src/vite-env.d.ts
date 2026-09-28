/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Spring Portal API base URL. 같은 origin이면 미설정. */
  readonly VITE_PORTAL_API_BASE?: string;
  /** 모니터링 어시스턴트(Chainlit) 주소. 미설정 시 앱이 떠 있는 호스트의 :8000을 쓴다. */
  readonly VITE_AGENT_URL?: string;
  /** exporter 명령 API(X6 kill) 주소. 미설정 시 앱이 떠 있는 호스트의 :9090을 쓴다. */
  readonly VITE_EXPORTER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
