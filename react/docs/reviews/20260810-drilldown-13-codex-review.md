# codex 리뷰 — 상세 대시보드 13건 반영 (2026-08-10)

대상: `df595d9~1..3c5f663` 7개 커밋 (67파일 +3674/-388)
도구: `codex exec --sandbox read-only --skip-git-repo-check -c model_reasoning_effort=high`

## 리뷰 자체에서 배운 것

**한 번에 다 던지면 결론이 안 나온다.** 7개 커밋 전체를 주고 "리뷰해 달라"고 했더니
codex가 파일을 훑는 데만 예산을 다 쓰고 판정 없이 끝났다(3회 시도, 전부 동일).
대상을 5개 파일로 좁혀도 마찬가지였다 — 여전히 저장소를 탐색했다.

**파일 전문을 프롬프트에 붙이니** 그제야 판정이 나왔다(15k 토큰, 1회). 탐색을 없애면
그만큼이 분석에 간다. 큰 변경은 쪼개서, 읽을 것을 다 주고 물어야 한다.

부수적으로: `codex exec`를 `nohup ... &`로 띄우면 stdin이 이상해져
`Reading additional input from stdin...` 뒤에 프롬프트만 되뱉고 끝난다.
`< /dev/null`을 붙여야 한다.

## 확정 결함 4건 — 전부 수정 + 테스트 잠금

### 1. `StatDetail.tsx` — `.catch()` 안의 재throw

```ts
.catch((error) => {
  if (ac.signal.aborted) return;
  setFailed(true);
  throw error;        // ← 받아 줄 곳이 없다
});
```

`usePolling`이 실패를 집계해 주는 자리에서는 재throw가 옳지만, 여기는 그런 수집기가
없다. 그대로 unhandled rejection이 되어 콘솔만 더럽힌다. `console.error`로 바꿨다 —
사용자에게는 화면이 이미 "내역 조회 실패"라고 말한다.

### 2. `copyText.ts` — 폴백이 선택 영역을 빼앗는다

`document.execCommand("copy")` 폴백은 임시 `<textarea>`를 만들어 `select()`한다.
그 순간 **사용자가 표에서 드래그해 둔 선택이 사라지고 돌아오지 않는다.** 예외가 나면
임시 요소도 DOM에 남는다.

Range를 기억했다가 복원하고, `finally`로 항상 제거하게 고쳤다.

### 3. `useChatDrag.ts` — 멀티터치에서 창이 튄다

끌고 있는 포인터를 구분하지 않아, 두 번째 손가락의 `pointermove`도 **첫 손가락의
시작 좌표 기준으로** 계산됐다. 두 번째 손가락을 떼면 공통 `pointerup` 핸들러가
첫 손가락의 드래그를 끝냈다.

`origin.id`에 `pointerId`를 저장하고 `move`/`up`에서 다른 포인터를 무시한다.

### 4. `useChatDrag.ts` — 드래그 중 리사이즈 후 옛 기준이 되살아난다

리사이즈 핸들러가 위치는 새로 클램프하지만 `origin.current.base`·시작 좌표·시작
오프셋은 그대로였다. 다음 `pointermove`가 **옛 기준으로 계산해 보정을 덮어썼다.**

마지막 포인터 좌표를 새 시작점으로 삼아 기준 전체를 다시 앵커링한다.

## 리뷰 전에 이미 고쳐 둔 것

`useTableSort`의 stale picker — `pickers`를 의존 배열에서 빼면 추출기가 바깥 상태를
붙잡는 날 낡은 값으로 정렬한다. 리뷰를 돌리기 전에 `pickRef`(ref로 항상 최신)로
바꿔 뒀고, codex의 지적이 같은 것이어서 확인만 했다.

## codex가 "결함이 아니다"라고 판정한 것

기록해 둔다 — 나중에 같은 것을 다시 의심하지 않기 위해서다.

- `useTableSort`의 반환 객체는 **매 렌더 새 참조가 아니다.** `useMemo`의 의존이
  전부 유지되면 같은 참조가 나오므로, 화면의 `useMemo(..., [rows, sort])`가
  무한 렌더를 일으키지 않는다.
- `setPointerCapture`를 명시적으로 해제하지 않는 것은 결함이 아니다. 정상
  `pointerup`/`pointercancel`에서, 그리고 요소가 제거될 때 브라우저가 암묵 해제한다.
- `clampOffset`의 경계 수식은 맞다. (viewport나 패널이 48px보다 작은 비정상 크기에서는
  두 제약을 동시에 만족시킬 수 없지만, 그건 수식 오류가 아니다.)

## 주입 시험

멀티터치 가드 2건은 가드를 지우면 해당 테스트가 실패하는 것을 확인했다.

첫 시도의 이동 테스트는 **헛돌았다**. jsdom의 `getBoundingClientRect`가 전부 0이라
클램프 범위가 `dx∈[48,976]`이 되는데, 시험용 좌표 두 개가 모두 범위 밖이라 같은
경계값(48)으로 접혀 **가드가 없어도 통과**했다. 범위 안의 좌표로 바꿔 실제로 잡히게 했다.

## 게이트

exporter 85 passed · web 551 passed / 10 skipped · lint·typecheck 통과 ·
spa-s3 전항목 정상 · portal-routes 정상 · 매니페스트 158건 0 불일치 · 드리프트 0.
