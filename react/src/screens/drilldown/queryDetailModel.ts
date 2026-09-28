/**
 * Query 상세 팝업의 상수·타입 (X8) — 컴포넌트 파일과 분리(react-refresh 규칙:
 * 컴포넌트 파일이 상수를 함께 내보내면 fast refresh가 꺼진다. phaseMeta와 같은 이유).
 */

/** 팝업 자동 갱신 주기(ms) — 피드백 X8-#2: 설정 가능, 기본 5초.
    하한 3초: 초 단위 과도 폴링은 부하 우려(피드백 원문). */
export const PLAN_REFRESH_OPTIONS = [3000, 5000, 10000] as const;
export const PLAN_REFRESH_DEFAULT_MS = 5000;

/** kill 후 폴링 재출현 억제(ms) — 드릴다운 MainDashboard의 TTL과 동값(상호참조:
    kill 반영 tick ≤1s + scrape 5s + 폴링 간격을 덮고, 신원 풀 재사용보다 짧다). */
export const KILL_SUPPRESS_MS = 15_000;

/** 화면이 팝업에 주는 라이브 조회 콜백 — 팝업은 PromQL을 만들지 않는다(거버넌스:
    PromQL은 queries.ts 단일 진원지). 각 화면이 자기 **등재된** duration/progress
    exprs로 전체 맵을 만들고, 팝업이 자기 stmt_id를 lookup한다. miss = 종료. */
export type LiveStat = { elapsed: number; prog: number };
export type LiveStatMap = Map<string, LiveStat>;
export type PollLive = (signal: AbortSignal) => Promise<LiveStatMap>;
