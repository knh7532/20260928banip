# Phase R2 codex 리뷰 기록

- 리뷰 도구: OpenAI Codex `gpt-5.6-sol` (reasoning xhigh, codex-cli 0.144.1, `codex exec` read-only)
- 검토 시각: 2026-07-15
- 대상: `src/api/prom.ts`, `src/api/queries.ts`, `src/hooks/usePolling.ts`, `src/hooks/useFilters.ts`, 테스트 4종
- 기준: ① prom.ts 결함(타임아웃·취소·에러·race) ② queries.ts PromQL 정확성·주입 안전성 ③ 훅의 React 규칙·경쟁 ④ 계약 대사 허점 ⑤ 무-Node 배포 제약

## 결과 요약: 13건 — Blocking 1 / Major 9 / Minor 3

| ID | Severity | 위치 | 원문 요약 |
| --- | --- | --- | --- |
| CDX-R2-01 | **Blocking** | queries.ts | `reEscape`가 따옴표·백슬래시를 이스케이프하지 않아 URL 필터값으로 PromQL 문자열을 종료하고 임의 식 주입 가능 |
| CDX-R2-02 | Major | prom.ts | 타임아웃과 호출자 취소가 경합하면 `signal.aborted` 추정으로 오분류 |
| CDX-R2-03 | Major | prom.ts | instant 쿼리에 평가 시각을 지정할 수 없어 브러시 구간 끝 시점의 상태를 조회 불가 |
| CDX-R2-04 | Major | prom.ts | 모든 range 쿼리를 ~60포인트로 축약 — 1·6시간 타임라인에서 30~180초 세그먼트가 샘플 사이 누락 |
| CDX-R2-05 | Minor | prom.ts | `status="success"`만 확인 — data/결과 타입이 잘못된 응답을 정상 처리 |
| CDX-R2-06 | Major | queries.ts | `sum(avg_over_time(...))`이 GPU 이동으로 라벨셋 교체 시 과거·현재 평균을 모두 더해 rows/s 과대계상 |
| CDX-R2-07 | Major | usePolling.ts | `fn`을 effect 의존성에서 제외 — 필터 변경 시 이전 요청이 취소되지 않아 옛 결과가 새 화면을 덮음 |
| CDX-R2-08 | Minor | usePolling.ts | interval 변경·StrictMode 재설정 시 이전 tick 정착을 안 기다려 세대 간 겹침 |
| CDX-R2-09 | Major | useFilters.ts | URL의 range·refresh를 임의 정수로 허용 — 비표준 구간·과도한 갱신으로 요청 폭주 |
| CDX-R2-10 | Major | queries.contract.test.ts | 계약 검사가 수동 `allQueries()` 목록 — 새 쿼리 추가 시 목록 갱신 누락하면 게이트 우회 |
| CDX-R2-11 | Major | queries.contract.test.ts | 접두사 정규식·전역 화이트리스트가 무명 selector·미계약 메트릭을 통과 |
| CDX-R2-12 | Major | queries.contract.test.ts | manifest가 타입을 버려 Counter→Gauge 드리프트 시 `increase()` 의미가 깨진 채 통과 |
| CDX-R2-13 | Minor | package.json | 계약 테스트가 실패해도 기존 `dist/`가 남아 오래된 산출물을 성공으로 오인 |
