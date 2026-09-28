/**
 * 클립보드 복사 — 비보안 컨텍스트(HTTP) 폴백 포함.
 *
 * **포털은 http다.** `navigator.clipboard`는 보안 컨텍스트(https·localhost)에서만
 * 존재하므로, 그것만 쓰면 현장에서 복사 버튼이 조용히 아무 일도 안 한다.
 * 사라진 API(`document.execCommand("copy")`)를 폴백으로 둔다 — deprecated지만
 * 모든 브라우저가 아직 지원하고, 비보안 컨텍스트에서 유일한 수단이다.
 *
 * 성공/실패를 **반드시 호출부에 알린다.** 조용히 실패하면 사용자가 붙여넣기 할 때까지
 * 모른다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 권한 거부 등 — 아래 폴백을 시도한다.
    }
  }

  /* 폴백은 임시 textarea를 만들어 **선택 영역을 빼앗는다.** 사용자가 표에서 드래그해
     둔 선택이 조용히 사라지므로, 원래 것을 기억했다가 되돌린다. */
  const saved = document.getSelection();
  const ranges: Range[] = [];
  for (let i = 0; i < (saved?.rangeCount ?? 0); i += 1) ranges.push(saved!.getRangeAt(i));

  const ta = document.createElement("textarea");
  try {
    ta.value = text;
    // 화면 밖으로 밀되 `display:none`은 안 된다 — 숨겨진 요소는 선택이 안 잡힌다.
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);   // iOS는 select()만으로는 부족하다
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    // 예외가 나도 임시 요소를 남기지 않는다.
    ta.remove();
    if (saved && ranges.length > 0) {
      saved.removeAllRanges();
      for (const r of ranges) saved.addRange(r);
    }
  }
}
