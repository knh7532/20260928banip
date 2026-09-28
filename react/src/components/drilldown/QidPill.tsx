/**
 * QID 배지 — `JOI-14H` (QID 규칙 v2.10).
 *
 * **값은 exporter가 채번한다.** 화면은 표시만 하고 점수·등급을 다시 계산하지 않는다 —
 * 두 곳에서 계산하면 어느 쪽이 맞는지 알 수 없게 된다.
 *
 * 계열 색은 문서 §2.1의 롤업 계열 5종을 따른다. 코드에는 계열이 들어 있지 않고
 * 매핑으로 관리하라는 문서 방침 그대로, 여기서도 접두 3글자로 매핑한다.
 *
 * 호버하면 `qid_tags`(가점 근거)를 보여 준다. 문서 §2.3이 말하듯 같은 `JOI-14H`라도
 * 원인이 조인 수인지 WHERE 없음인지에 따라 조치가 전혀 다르다.
 */

import { QID_SERIES } from "./qidSeries";

/** 계열별 한국어 이름 — 툴팁에서 "무슨 계열인지"를 말해 준다. */
const SERIES_NAME: Record<string, string> = {
  read: "조회", ingest: "적재·추출", modify: "변경", ddl: "DDL·유지보수", util: "유틸리티",
};

export function QidPill({ qid, tags }: { qid: string; tags?: string }) {
  // exporter가 라벨을 안 실었거나 옛 버전이면 조용히 비운다 — 지어내지 않는다.
  if (!qid) return <span className="sqm-dim">--</span>;

  const code = qid.slice(0, 3);
  const series = QID_SERIES[code] ?? "util";
  const grade = qid.slice(-1);          // L/M/H/C — 등급이 높을수록 눈에 띄어야 한다
  const tagList = tags ? tags.split(",").filter(Boolean) : [];

  const title = [
    `${code} · ${SERIES_NAME[series]}`,
    tagList.length ? `근거: ${tagList.join(", ")}` : "가점 없음",
  ].join("\n");

  // 등급 문자(L/M/H/C)는 화면에 쓰지 않는다 — 보고서에서 백분위로 쓰는 값이라
  // Q-Type 에 노출하면 유형 코드처럼 읽힌다(인간 지시 2026-08-10 "MHLC 빼라").
  // 등급별 강조색(클래스)과 툴팁의 전체 QID 는 유지한다.
  const shown = /[LMHC]$/.test(qid) ? qid.slice(0, -1) : qid;

  return (
    <span
      className={`sqm-qid sqm-qid--${series} sqm-qid--g${grade}`}
      title={`${qid}\n${title}`}
    >
      {shown}
    </span>
  );
}
