/**
 * QID 유형코드 → 계열 롤업 (QID 규칙 v2.10 §2.1) — QidPill(배지 색)과
 * RestartGuideDialog(X11 — 정지 시 유형별 경고)가 같은 매핑을 쓴다.
 * 컴포넌트 파일에서 분리한 이유: 비컴포넌트 export는 fast refresh를 깬다(lint).
 */

export type QidSeriesKind = "read" | "ingest" | "modify" | "ddl" | "util";

/** 유형코드 → 계열. 문서 §2.1의 롤업 표와 같다(exporter qid.py:SERIES와 동일). */
export const QID_SERIES: Record<string, QidSeriesKind> = {
  SEL: "read", AGG: "read", JOI: "read", SOR: "read", SCA: "read",
  INS: "ingest", LOA: "ingest", EXP: "ingest",
  DEL: "modify", UPD: "modify", TRU: "modify",
  DDL: "ddl", CLE: "ddl",
  UTI: "util",
};

/** QID → 계열. 결측·미지 코드는 util — 배지의 폴백과 같다. */
export function qidSeries(qid: string): QidSeriesKind {
  return QID_SERIES[qid.slice(0, 3)] ?? "util";
}

/**
 * X17: 계열 → 표시용 서비스 3종. Query Overview의 Service 열이 쓴다 — **표시 축**이다.
 * exporter의 service 라벨(sqm_worker_up·statement — 워커 구독 큐 축, sqream/etl)과
 * 별개이며 그 축은 무변경이다. 근거(SQream Workload Manager): 서비스는 접속 시
 * 지정하는 큐이고 기본값이 `sqream`이다 — ETL/변경 작업은 etl 큐, 조회는 조회 전용
 * 큐로 분리하는 통상 구성을 표시로 재현한다. DDL·유지보수·유틸리티는 미지정
 * 기본 큐(sqream)로 간주한다.
 */
export type QidServiceKind = "select_service" | "etl_service" | "sqream";

export const QID_SERVICE: Record<QidSeriesKind, QidServiceKind> = {
  read: "select_service",
  ingest: "etl_service",
  modify: "etl_service",
  ddl: "sqream",
  util: "sqream",
};

/** QID → 표시용 서비스. 결측 qid는 null — 지어내지 않는다(화면은 "--"). */
export function qidService(qid: string): QidServiceKind | null {
  if (!qid) return null;
  return QID_SERVICE[qidSeries(qid)];
}

/** 락을 잡는 유형(X11 — exporter `LOCK_CODES`와 동일 목록). 계열 롤업과 다르다:
    EXP(EXPORT)는 ingest 계열이지만 테이블을 읽어 파일로 쓰므로 락이 없다 —
    계열로 판정하면 재시작 가이드가 EXP에 거짓 롤백 경고를 낸다(codex X11-02). */
export const QID_LOCK_CODES = new Set(["INS", "LOA", "DEL", "UPD", "TRU", "DDL", "CLE"]);

/** 이 QID의 문장이 테이블 락을 잡는가 — 정지 경고 수위의 근거. */
export function qidHoldsLock(qid: string): boolean {
  return QID_LOCK_CODES.has(qid.slice(0, 3));
}
