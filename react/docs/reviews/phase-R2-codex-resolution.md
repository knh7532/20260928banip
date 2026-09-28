# Phase R2 codex 리뷰 처리 기록 (Resolution)

전 13건 **Accepted → Fixed**. Rejected/Escalated 없음.

| ID | 처리 | 증거 |
| --- | --- | --- |
| CDX-R2-01 | Fixed | `escapeLabelValue()` — 제어문자 제거(코드<32) → RE2 정규식 이스케이프 → **PromQL 문자열 리터럴 이스케이프**(`\`·`"`). 주입 테스트: 따옴표 시도가 리터럴에 갇힘(셀렉터 `=~` 정확히 3개), 변조 탐침 CAUGHT |
| CDX-R2-02 | Fixed | `PromAbortError` 신규. 진입 시 `signal.aborted`면 즉시 취소 에러, `timedOut` 플래그로 타임아웃과 호출자 취소를 명시 구분 |
| CDX-R2-03 | Fixed | `promQuery(expr, signal, atMs?)` — `atMs` 주면 `&time=` 부착. 구간 상세를 선택 끝 시각에서 평가 가능 |
| CDX-R2-04 | Fixed | `RangeOptions{stepSec, targetPoints, maxStepSec}` + `resolveStep()`. 타임라인은 `maxStepSec:15`로 세그먼트 보존 |
| CDX-R2-05 | Fixed | `parseSeries()`가 봉투·`resultType`(vector/matrix)·result 배열·**샘플 튜플 `[number, string]`** 까지 검증, 어긋나면 `kind:malformed` |
| CDX-R2-06 | Fixed | rows/s 구간 평균을 `avg_over_time((sum(...))[win:])` subquery로 — 시점별 sum 후 평균(라벨셋 교체 과대계상 제거). 라이브 테스트로 현재 합과 같은 스케일 확인 |
| CDX-R2-07 | Fixed | `usePolling(fn, interval, deps)` — `depsKey`(JSON) 변경 시 effect 재실행 + `controller.abort()`로 이전 요청 취소 |
| CDX-R2-08 | Fixed | `inFlight` ref로 이전 세대 tick을 이어받아 정착 후 새 tick — 세대 간 겹침 차단 |
| CDX-R2-09 | Fixed | `parseAllowed()`가 `RANGE_OPTIONS`·`REFRESH_OPTIONS` 허용값만 수용 |
| CDX-R2-10 | Fixed | `queryRegistry()` 단일 목록을 앱·테스트가 공유 + **export 팩토리 전수 검증**(미등록 함수 감지). 변조 탐침 CAUGHT |
| CDX-R2-11 | Fixed | selector 파서를 `metric?{...}`로 바꿔 **무명 selector(metric="")를 위반으로 처리**. 변조 탐침(무명 selector) CAUGHT |
| CDX-R2-12 | Fixed | manifest에 타입 포함, counter 전용 함수는 **중첩·공백 무관하게 인자 메트릭을 찾아** Counter인지 검사. 변조 탐침(increase on gauge) CAUGHT |
| CDX-R2-13 | Fixed | `build = clean && typecheck && test:contract && vite build` — 시작 시 dist 제거 |

## 수정 후 게이트 증거

```
eslint 0 · tsc(app+node) 0 · vitest 70 passed (+9 라이브 skip)
커버리지 97.7% (분기 84.7%) · build 성공(계약 테스트 경유) · 번들 하드코딩 호스트 없음
라이브 9건 통과 (실 Prometheus)
변조 탐침 3종 CAUGHT: 무명 selector / increase on gauge / 미계약 메트릭
```

## 확인 리뷰 (re-review)

- 1차: 9/13 Resolved, 잔여 4건(R2-05 샘플 튜플 미검증, R2-10 수동 등록, R2-11 무명 selector, R2-12 중첩 함수 우회). **Blocking 잔존 없음**
- 추가 수정: parseSeries 샘플 튜플 검증 / 레지스트리 export 전수 검증 / selector 파서 무명 처리 / counter 함수 중첩 인자 탐색 — 변조 탐침으로 각 방어 확인
- 최종: eslint 0 / tsc 0 / vitest 70 passed / 커버리지 98% — **Blocking 잔존 없음**, R2 종료
