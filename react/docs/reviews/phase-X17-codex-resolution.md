# Phase X17 codex 지적 처리 (2026-08-21)

묶음 리뷰(`phase-X17-codex-review.md` — X16 수렴 + X17) 지적의 처리 기록.
X16 몫은 `phase-X16-codex-resolution.md` 참조.

| ID | 판정 | 처리 | 수렴 증거 |
| --- | --- | --- | --- |
| X17-01 (SERIES 표류 가드가 키만 대사) | **Fixed** | qidService.test.ts가 qid.py SERIES의 `"코드":"한글계열"` **쌍 전체**(14)를 파싱, 한글 계열을 read/ingest/modify/ddl/util로 정규화해 `QID_SERIES` 전체 객체와 `toEqual` 대사 — 코드별 계열 이동도 잡는다 | r2: **RESOLVED** |
| X17-02 (카탈로그 대사 단방향) | **Fixed** (2회전) | 1차: 문서 표 전량 파싱 + `[1..8]` 완전성 + 양방향 일치 + `typeOfQuery` 잠금. r2에서 "두 표를 하나의 Map으로 합치면 한 표 전체 누락을 못 잡음" 재지적 → `parseCatalog(절 제목)`으로 §3·§5.4를 **독립 파싱**(절 존재 단언 + 다음 헤딩까지 슬라이스), 각각 완전성·표 간 동일성·CATALOG 양방향 일치 단언 | r3: **RESOLVED** — **미해결 blocking 0 (수렴)** |

- 최종 게이트: exporter ruff 0·mypy 0·pytest **147** / Grafana gen·check green·top-view.json 드리프트 0 / web lint 0·tsc 0·vitest **779**·커버리지 신규 미달 0(기준선 11파일)·build.
- Rejected/Escalated 없음.
- 참고(범위 밖 발견): `llm-top-view.json` 커밋본이 `gen_llm_dashboard.py` 산출과 다르다(커밋본에 포털 딥링크 — 생성기 미반영). X17에서는 커밋본을 보존(재생성분 원복)했다 — **TV-C2 드리프트 이슈로 별도 처리 필요(HCI)**.
