# Phase U2~U4 codex 통합 리뷰 (EXC-U4 — U1~U4 통합 1회)

- 대상: 통합 이관 커밋 `d038446..3d9a087` (U1 거버넌스 문서 → U2 React 이관 → U3 Python 스택·SoT 이관 → U4 실행 모드 통합)
- 리뷰어: OpenAI Codex (codex-rescue 플러그인 경유, Claude `claude-fable-5`와 상이한 모델·실행 주체). 세션 ID는 플러그인 회신에 미포함 — 회신 원문만 기록.
- 일시: 2026-07-19

## 수행 기록

| 회차 | 범위 | 결과 |
| --- | --- | --- |
| 1차 | 광범위(경로 정합·잔존 참조·스크립트 일관성·거버넌스 정합·git 이력 5개 관점) | **타임아웃**(10분, exit 143) — 진행 흔적(경로 해석·계약 테스트 파싱·set -u 배열 검사·ps1 검증)은 있었으나 최종 결과 미회신 |
| 2차 | 핵심 결합점 6항목으로 축소 재시도 | **완료 — 전 항목 OK, Blocking 잔존 없음** |

> **범위 고지(HCI-U-4)**: 최종 판정은 2차의 **핵심 결합점 6항목**에 대한 것이다. 1차의 광범위 검토는
> 타임아웃으로 미완이므로, 이 리뷰는 이관 diff 전량에 대한 완전 검토가 아니다. 잔여 위험은
> 기계 게이트(양 스택 테스트·드리프트·구경로 grep·E2E ALL CHECKS PASSED)가 보완한다.

## 2차 리뷰 판정 (원문 요지)

1. **OK** — `web/tests/queries.contract.test.ts`: `HERE=web/tests`, SCHEMA → `docs/architecture/db-schema.md`(실존).
2. **OK** — `web/tests/tokens.contract.test.ts`: `ROOT=web`, DOC → `docs/design-tokens.md`(실존).
3. **OK** — `docker-compose.yml`: web 서비스 볼륨 2개(web/dist·web/docker/nginx.conf) 실존, 4서비스 구성.
4. **OK** — `native-linux/web-serve.sh`·`web-package-dist.sh`: 기본 DIST `<루트>/web/dist`, 복사 대상 전부 실존, `${WEB[@]+"${WEB[@]}"}`는 `set -u` 안전 (02-package-bundle.sh).
5. **OK** — `systemd/top-view-dashboard-web.service`: ExecStart의 Python·dist 경로가 `/opt/llm_gpu_top_view_mockup` 기준으로 일관.
6. **OK** — `native/verify-native.ps1` 웹 체크 블록: PS7 전용 문법 없음, Windows PowerShell 5.1 파서 검사 통과.

**Blocking 잔존 여부: 없음**

## 지적 목록

지적 0건 — 처리 기록은 `phase-U2-U4-codex-resolution.md` 참조.
