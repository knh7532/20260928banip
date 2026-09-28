# Phase X1·X2 구현 — codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: 커밋 `d482e47`(X1 exporter — 완료 이벤트 메트릭 2종) + `063320b`(X2 web — X-View 패널) 반영 워킹트리
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=medium`, sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-13T07:5xZ
- **스코프**: exporter(metrics.py·query_sim.py·테스트 2종), db-schema.md §2b, web(lib/xview·useXViewEvents·XViewChart·XViewPanel·GpuDashboard·queries.ts·app.css·테스트 5종)
- **검사 불변식**: ① additive-only ② 타임라인 절대 무수정 ③ web 계층 규칙 ④ instant 금지(range 복원만) ⑤ LLM 화면 회귀 0

## 지적 사항 (원문)

| ID | severity | file:line | failure | evidence | fix |
|---|---|---|---|---|---|
| CDX-X-01 | minor | `docs/plan.md:177,190` | 완료된 X1·X2가 여전히 `초안·승인 대기`로 표시되어 계획 상태와 모순된다. | 두 phase 수락 기준은 모두 `[x]`이고 §7에는 2026-08-13 착수 승인이 기록됐으며 구현 커밋도 존재한다. | 제목을 `구현 완료` 또는 실제 종료 게이트 상태로 갱신한다. |

**총평 (원문)**: blocking·major 지적은 없습니다. XR-01~08·NX-01~03 구현, additive-only 계약, range-only 복원, 라벨 순서, 참조계수 퇴출, React 훅 규칙, 계층 규칙, D3 격리, LLM 레이아웃 분리가 계획과 정합합니다. Timeline·`lib/timeline.ts`·Grafana는 변경 목록에 없어 절대 무수정 조건도 충족합니다.

검증 결과 `web` typecheck·lint와 exporter ruff는 통과했습니다. pytest·Vitest는 읽기 전용 실행 환경에서 임시 파일 생성을 거부해 재실행하지 못했으며, mypy 2.1은 동일 환경에서 내부 오류가 발생했습니다. CDX-X-01 정리 후 종료 게이트 통과로 판단합니다.

> 리뷰어 환경 주석: pytest·vitest·mypy는 리뷰 샌드박스(read-only)의 제약으로 리뷰어가 직접 재실행하지 못했다. 동일 트리에서 Implementor 측 실행 증거 — exporter `ruff 0·mypy 0·pytest 100 passed(cov 99.32%)`, web `lint·typecheck·test:coverage(592 passed)·build exit 0` — 는 plan.md X1/X2 수락 기준과 커밋 메시지에 기록되어 있다.
