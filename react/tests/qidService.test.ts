/**
 * X17: 상태 표시용 서비스 파생(qidService) — 표시 축의 단일 원천을 잠근다.
 *
 * - 14코드 전건이 3종(select_service/etl_service/sqream)에 귀속된다.
 * - QID_SERIES·QID_LOCK_CODES가 exporter(qid.py SERIES / drilldown_sim.py LOCK_CODES)와
 *   표류하지 않는다 — 문서가 아니라 **원본 파이썬 소스**를 파싱해 대사한다
 *   (queries.contract.test.ts가 db-schema.md를 읽는 것과 같은 선례).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  QID_LOCK_CODES, QID_SERIES, QID_SERVICE, qidService,
} from "../src/components/drilldown/qidSeries";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("qidService — 표시용 서비스 3종 파생 (X17)", () => {
  it("14코드 전건이 3종에 귀속된다 — 조회는 select_service, 적재·변경은 etl_service, 나머지는 sqream(기본 큐)", () => {
    const expected: Record<string, string> = {
      SEL: "select_service", AGG: "select_service", JOI: "select_service",
      SOR: "select_service", SCA: "select_service",
      INS: "etl_service", LOA: "etl_service", EXP: "etl_service",
      DEL: "etl_service", UPD: "etl_service", TRU: "etl_service",
      DDL: "sqream", CLE: "sqream", UTI: "sqream",
    };
    for (const [code, svc] of Object.entries(expected)) {
      expect(qidService(`${code}-01L`), code).toBe(svc);
    }
    // 계열 5종 전부가 QID_SERVICE에 정의돼 있다(빠지면 파생이 undefined로 샌다)
    expect(new Set(Object.values(QID_SERIES)).size).toBe(Object.keys(QID_SERVICE).length);
  });

  it("결측·미지 qid — 결측은 null(지어내지 않는다), 미지 코드는 util 폴백 = sqream", () => {
    expect(qidService("")).toBeNull();
    expect(qidService("ZZZ-99C")).toBe("sqream");
  });
});

describe("exporter 대사 — 표류 가드 (X17)", () => {
  it("QID_SERIES가 exporter qid.py의 SERIES와 **코드→계열 쌍 전체**로 일치한다 (codex X17-01)", () => {
    const py = readFileSync(resolve(HERE, "../../python/exporter/qid.py"), "utf-8");
    const block = /SERIES[^=]*=\s*\{([^}]+)\}/.exec(py);
    expect(block, "qid.py에서 SERIES 블록을 찾지 못했다").not.toBeNull();
    // 키 집합만 대사하면 코드별 계열 이동(예: DEL을 적재·추출로)을 못 잡는다 —
    // 한글 계열을 정규화해 매핑 전체를 대사한다.
    const KIND_BY_KO: Record<string, string> = {
      "조회": "read", "적재·추출": "ingest", "변경": "modify",
      "DDL·유지보수": "ddl", "유틸리티": "util",
    };
    const pairs = [...block![1].matchAll(/"([A-Z]{3})"\s*:\s*"([^"]+)"/g)];
    expect(pairs).toHaveLength(14);
    const fromPy: Record<string, string> = {};
    for (const [, code, ko] of pairs) {
      expect(KIND_BY_KO[ko], `미지의 계열 표기: ${ko}`).toBeDefined();
      fromPy[code] = KIND_BY_KO[ko];
    }
    expect(fromPy).toEqual(QID_SERIES);
  });

  it("QID_LOCK_CODES가 exporter drilldown_sim.py의 LOCK_CODES와 일치한다", () => {
    const py = readFileSync(resolve(HERE, "../../python/exporter/drilldown_sim.py"), "utf-8");
    const block = /LOCK_CODES\s*=\s*(?:frozenset\(|set\(|\{)\s*[({[]?([^})\]]+)/.exec(py);
    expect(block, "drilldown_sim.py에서 LOCK_CODES 블록을 찾지 못했다").not.toBeNull();
    const codes = [...block![1].matchAll(/"([A-Z]{3})"/g)].map((m) => m[1]);
    expect(new Set(codes)).toEqual(QID_LOCK_CODES);
  });
});
