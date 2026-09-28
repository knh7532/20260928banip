# Phase R3 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, `codex exec` read-only)
- 검토 시각: 2026-07-16
- 대상: `src/hooks/useDashboardData.ts`, `src/lib/join.ts`, `src/lib/format.ts`, `src/components/{Sidebar,Header,FilterBar,Panel}.tsx`, `src/components/tables/{RunningQueries,QueryPerformance}.tsx`, `src/App.tsx`, `src/styles/app.css`, 테스트 5종
- 기준: ① 조인 정확성(stmt_id/query_name) ② React 규칙·경쟁 ③ 하드코딩 금지 ④ 단위·표기 안전성 ⑤ 접근성·의미 ⑥ 테스트 견고성

## 결과 요약: 14건 — Blocking 1 / Major 7 / Minor 6

| ID | Severity | 위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-R3-01 | **Blocking** | useDashboardData.ts / join.ts | 단일 키 조인 + `indexBy` 마지막 승자 덮어쓰기 → 키 충돌 시 오조인을 조용히 숨김 |
| CDX-R3-02 | Major | useDashboardData.ts | 결측(NaN)을 `b - a`로 비교해 정렬이 깨짐(90%가 위로 안 옴) |
| CDX-R3-03 | Major | FilterBar.tsx | 이름은 다중선택이나 실제는 단일 `<select>` — URL의 `gpu=0,2` 복원 시 매칭 옵션 없음·다중 선택 불가 |
| CDX-R3-04 | Major | RunningQueries/QueryPerformance | `stmtId`/`queryName` 단일 값을 React key로 — 충돌 시 행 재사용·경고 |
| CDX-R3-05 | Minor | FilterBar.tsx | instance 변경 시 이전 GPU 옵션 미초기화 + 실패 무시 → 없는 GPU 선택 가능 |
| CDX-R3-06 | Major | Header.tsx | 로컬 시각에 "KST"만 덧붙임 → UTC 브라우저에서 9시간 어긋남 |
| CDX-R3-07 | Minor | format.ts | 범위 밖 epoch(`Number.MAX_VALUE`)가 `NaN:NaN:NaN` |
| CDX-R3-08 | Minor | format.ts | 비유한 rows/s에 단위 부착("- rows/s"), 음수 축약 불일치 |
| CDX-R3-09 | Minor | Panel.tsx | 제목이 `span`이라 heading/region 탐색 불가 |
| CDX-R3-10 | Minor | Panel.tsx | 도움말이 포커스 불가 `span`+`title`뿐 — 키보드·터치 접근 불가 |
| CDX-R3-11 | Minor | QueryPerformance.tsx | 빈 결과에 안내 행 없음(RunningQueries와 불일치) |
| CDX-R3-12 | Major | dashboardData.test.ts | 조인 테스트가 유일 키 정상 입력만 — 충돌·순서·NaN 미검출 |
| CDX-R3-13 | Major | app.test.tsx | 인스턴스/GPU 단일 선택만 — 다중선택 요구 미검증 |
| CDX-R3-14 | Major | components.test.tsx | Sidebar "메트릭 산출" 테스트가 props 주입뿐 — 데이터 출처 미검사 |

(부수: format.test 로컬-시간 회귀 미검출, app.test combobox 순번 조회 — 확인 리뷰에서 함께 처리)
