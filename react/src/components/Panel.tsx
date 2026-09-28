import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/**
 * 패널 프레임 — 제목(heading) + 본문. 제목은 region에 연결한다(스크린리더 탐색).
 *
 * 도움말(ⓘ)은 **클릭·포커스로 실제로 열리는 팝오버**다 (CDX-R3-10). `title` 속성만으로는
 * 키보드·터치 사용자가 내용을 볼 수 없어, 버튼 활성화 시 `role="tooltip"`을 띄우고
 * `aria-expanded`/`aria-describedby`로 연결하며 Escape·바깥 클릭으로 닫는다.
 */
export function Panel({
  title,
  hint,
  className,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  /** 헤더 우측 액션 슬롯 (R6 — 예: 선택 구간 × 닫기 버튼). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <section className={`panel ${className ?? ""}`} aria-labelledby={titleId}>
      <div className="panel__head">
        <h2 className="panel__title" id={titleId}>
          {title}
        </h2>
        {hint && (
          <span className="panel__hintwrap" ref={wrapRef}>
            <button
              type="button"
              className="panel__hint"
              aria-label="도움말"
              aria-expanded={open}
              aria-describedby={open ? tipId : undefined}
              onClick={() => setOpen((v) => !v)}
            >
              ⓘ
            </button>
            {open && (
              <span role="tooltip" id={tipId} className="panel__tip">
                {hint}
              </span>
            )}
          </span>
        )}
        {actions && <span className="panel__actions">{actions}</span>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
