# Phase R3 회고 — 셸·레이아웃·테이블

## 한 일과 결과 (완료된 수락 기준)

| 수락 기준 | 대응 코드·증거 |
| --- | --- |
| 레이아웃 비율이 design-tokens.md와 일치 | `src/styles/app.css` — PPTX 다크 팔레트, 사이드바 그리드·필터바·패널·데이터 테이블·게이지셀·상태배지 |
| 테이블 2종 렌더(조인·단위·상태 배지 3종) | `RunningQueries`(stmt_id 조인)·`QueryPerformance`(query_name 조인, Initializing/In Process/In Queue). `tests/components.test.tsx` |
| 사이드바 서버 카드가 메트릭에서 산출(하드코딩 금지) | `Sidebar`+`useDashboardData` — `gpuTotal>0`→정상, `gpuBusy` 사용 수. **서버별 상이 값**으로 산출 검증(`tests/app.test.tsx`) |
| 커버리지 게이트 통과 | 98.78% (분기 92.26%), perFile 임계값 통과 |

## 잘된 점

- **조인 계층을 계약(TV-C1)에 못박았다**: `stmt_id`/`query_name` 유일성이 계약 보장임을 db-schema로 확인하고, 값 메트릭이 `stmt_id`만 캐리어라 복합키가 설계상 불가함을 근거로 `indexBy`를 "충돌 시 첫 시리즈 유지+경고"로 만들어 계약 위반을 **조용히 삼키지 않게** 했다.
- **요청 간 race를 정면으로 다뤘다**: 신원과 수치를 별도 HTTP로 받으므로 그 사이 쿼리가 끝나면 값이 NaN이 될 수 있다 — `cmpNumDesc`로 비유한값을 정렬 최하위로 보내 표가 뒤집히지 않게 하고, 필터 옵션은 세대 가드로 stale 응답을 무시한다. 둘 다 결정적 테스트로 고정했다.
- **타임존을 표기가 아니라 계산으로 고정**했다: "KST" 라벨만 붙이던 것을 `Intl`의 `Asia/Seoul`로 실제 변환하고, 테스트 런타임을 `TZ=UTC`로 고정해 로컬-시간 회귀를 테스트가 잡도록 만들었다.

## 어려웠던 점

- 리뷰가 **"다중선택인데 단일 `<select>`"**를 Major로 잡았다 — URL은 `gpu=0,2`를 복원하는데 UI가 표현하지 못했다. 체크박스 드롭다운(`<details>`+`role=group`)으로 교체하고 URL 왕복·2개 선택을 테스트로 검증했다.
- Blocking(조인 오조인)은 **계약상 미발생**이었으나, 소비자가 계약 위반을 감지 못하고 잘못된 값을 정상처럼 표시하던 것이 문제였다. "복합키로 바꾸라"는 제안은 값 메트릭 라벨이 없어 불가 → 방어(경고)+계약 명시로 처리했다.
- 확인 리뷰가 잡은 **"테스트가 KST 런타임에선 회귀를 못 잡는다"**는 미묘한 지적이었다. 개발 PC가 KST라 로컬-시간 구현으로 되돌려도 통과하던 것을 `test.env.TZ` 고정으로 실효화했다.

## 다음 phase(R4)에 반영할 개선점

- 차트도 데이터는 `queries.ts`(gpuTimeseries·timeline·rangeDetail)로만 얻는다 — PromQL 하드코딩 금지(계약 계층 규칙).
- 타임라인 D3 간트는 range 결과를 **연속 동일값 구간으로 병합**해 세그먼트화하고, `maxStepSec`로 해상도를 지킨다(R2 교훈).
- 브러시 구간 상세는 **끝 시각(atMs)**에서 instant 평가한다(상태·신원), 집계는 `[window]` 창(R2에서 준비된 `rangeDetail`).
- 시각 표기는 `format.ts`의 KST 포맷터를 재사용한다(차트 축 라벨 포함).

## codex 리뷰 지적과 처리 결과

- 1차: 14건 (Blocking 1 / Major 7 / Minor 6) → 전건 Accepted·Fixed.
- 확인 리뷰: 11개 런타임 지적 해소, 잔여 3 Minor(Panel 팝오버·app 경합·format TZ) 추가 수정 → **"Blocking 잔존 없음"**.
- 상세: `docs/reviews/phase-R3-codex-review.md`, `docs/reviews/phase-R3-codex-resolution.md`.

## Human Check Items

| ID | 분류 | 확인 필요 사항 | 필요한 인간 판단 | 차단 여부 |
| --- | --- | --- | --- | --- |
| HCI-R3-1 | Design | 화면 육안 대조(PPTX와 나란히) — 사이드바·팔레트·레이아웃·테이블. R4 차트가 들어오기 전 골격 확인 | dev 서버(`npm run dev`) 또는 dist로 실제 화면을 PPTX와 비교 | 비차단 |
| HCI-R3-2 | Scope | R3에는 타임라인·시계열·서버 카드 게이지·구간 상세가 아직 없다(그리드에 R4 placeholder) | R4 착수 시 배치 확인 | 비차단 |
| HCI-R3-3 | A11y | 다중선택을 `<details>` 기반으로 구현 — 실제 키보드/스크린리더 조작감은 브라우저 확인 권장 | 접근성 육안/보조기술 확인(선택) | 비차단 |
