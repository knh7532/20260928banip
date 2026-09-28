/**
 * 화면 머리 — 이름 + 부제 + 오른쪽 액션 (2026-08-10).
 *
 * 예전에는 같은 이름이 **두 번** 나왔다: 툴바의 `.sqm-toolbar__title`과 본문의 `h2`.
 * 인간 지적대로 툴바에서 빼고 본문 하나로 모았다.
 *
 * 이름의 진원지는 `DrilldownDashboard`의 `VIEWS[view].title` **하나**다. 화면이 각자
 * 하드코딩하면 사이드바·본문이 어긋난다 — `title` prop으로 내려받아 그대로 쓴다.
 *
 * 부제는 제목 문자열에 `—`로 이어 붙이지 않고 `<span>`으로 분리한다. 이어 붙이면
 * 화면마다 제목 길이가 제각각이 되어 오른쪽 액션 위치가 흔들린다
 * (Alarms·System Info가 실제로 그랬다).
 */
import type { ReactNode } from "react";

export function PageHead({ title, sub, children }: {
  title: string;
  /** 이름만으로 부족할 때만. 없으면 렌더하지 않는다 — 빈 span을 남기지 않는다. */
  sub?: string;
  /** 오른쪽에 붙는 액션(Grafana 링크·필터 등). */
  children?: ReactNode;
}) {
  return (
    <div className="sqm-pagehead">
      <h2 className="sqm-page__title">
        {title}
        {sub ? <span className="sqm-page__sub">{sub}</span> : null}
      </h2>
      {children}
    </div>
  );
}
