# Phase X6 구현 후 codex 리뷰 (AGENTS §6.2-3 종료 게이트)

- **검토 대상**: X6 워킹트리 미커밋 변경분 전체 — Query 팝업 탭 3종(SQL/로그/플랜) + Statement Kill 목업 반영(exporter 명령 API 신설)
- **reviewer**: codex exec — codex-cli 0.147.0, GPT-5 계열, `model_reasoning_effort=medium`, sandbox read-only (Implementor=claude-fable-5와 상이한 모델·실행 주체)
- **검토 시각**: 2026-08-18 (KST 저녁)
- **검토 불변식**: TV-C1 무변경(`killed_by_admin` 기존 enum) · 자유 문자열 라벨 금지 · 타임라인 불가침 파일 무수정 · HTTP 스레드 메트릭 변이 금지(예약만) · 시드 재현성 · qid 없는 `explainPlan` 출력 불변
- **reviewer 자체 검증**: exporter X6 테스트 10 passed 실행 · web typecheck/lint 통과 · invalid Content-Length를 **소켓 레벨로 직접 재현**(X6-R2의 근거) · 읽기 전용 샌드박스라 vitest/전체 pytest는 실행 불가

## 지적 사항 (원문 요약)

| ID | severity | file:line | failure |
|---|---|---|---|
| X6-R1 | blocking | QueryDetailModal.tsx:51 · query_sim.py:155 | Kill 요청이 재사용 가능한 `stmt_id`만 전달·검증한다. 고정 시점(pinnedMs)의 과거 행을 누르거나 팝업을 오래 열어 둔 사이 같은 id가 새 실행에 재할당되면 **화면이 본 문장이 아닌 다른 문장을 죽이는 ABA**가 발생한다. `start_ts` 같은 세대 토큰을 LOCK 안에서 대조하고, 고정 시점에서는 Kill을 막아야 한다. 테스트도 이 경계를 잠그지 않는다 |
| X6-R2 | major | http_api.py:72 | `Content-Length`를 검증·상한 없이 `int()`·`read(length)`에 사용 — 비정수 값이 예외로 스레드를 끝내 **응답(CORS 헤더 포함)이 아예 안 나간다**(직접 재현됨). 큰 값·불완전 본문은 워커 스레드를 무기한 대기시킬 수 있다. 0.0.0.0 무인증 서버이므로 형식·범위 검사, 본문 상한, 400/413 응답 필요 |
| X6-R3 | minor | system.md:29 | 컴포넌트 다이어그램·데이터 흐름이 X6의 브라우저→exporter POST 명령 경로(예약→tick 변이)를 표시하지 않아 상위 아키텍처 설명이 실제 구조와 불일치 |

**총평 (원문)**: 미해결 blocking 1건·major 1건 — X6 종료 게이트 통과 불가. 불변 제약(TV-C1/타임라인 보호/라벨 유입/HTTP 스레드 변이/난수 소비/explainPlan 기본 분기)은 전부 위반 없음.

→ 처리: `phase-X6-codex-resolution.md`

## 재확인 회차 (수렴 규칙)

| 회차 | 구성 | 결과 |
|---|---|---|
| 1 | codex exec · reasoning=low · R1~R3 처리분 확인 | R2·R3 **resolved** · R1 잔재로 신규 **X6-R4**(blocking — start_time 결측·NaN 시 fail-open) + **X6-R5**(minor — 음수 CL·±5s 경계·토큰 결측 테스트 부재). 예약 잔류 없음·5s 허용치 타당·pinned/직렬화 테스트 존재는 확인 |
| 2 | codex exec · reasoning=low · R4/R5 처리분 확인 | **X6-R4·R5 모두 resolved · 신규 지적 없음 · 미해결 blocking 0·major 0**. 정상 UI 경로 오차단 없음 확인. read-timeout 테스트 생략은 "비용>효용으로 타당, R5 미해결 사유 아님" 판정 — **수렴, 종료 게이트 통과** |
