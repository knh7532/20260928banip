import { useEffect, useState } from "react";

import { formatClock, formatDateKST } from "../lib/format";

/** 상단 제목 + 현재 시각 (KST 고정 — 브라우저 로컬 타임존과 무관). */
export function Header({
  /** 마지막 폴링 성공 시각(epoch ms) — 없으면(첫 성공 전) "—" (R9 F7.1). */
  lastUpdatedMs,
  /** 화면 제목 (L3 — LLM 화면은 "GPU/LLM Monitoring Dashboard"). */
  title = "GPU/SQream Monitoring Dashboard",
}: {
  lastUpdatedMs?: number | null;
  title?: string;
}) {
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="header">
      <h1 className="header__title">{title}</h1>
      <div className="header__clock">
        {/* 자동갱신이 살아 있는지 한눈에 — 끊기면 이 시각이 멈춰 정체를 알 수 있다 */}
        <span className="header__updated">
          갱신 {lastUpdatedMs != null ? formatClock(lastUpdatedMs / 1000) : "—"}
        </span>
        {formatDateKST(nowSec)} {formatClock(nowSec)} KST
      </div>
    </header>
  );
}
