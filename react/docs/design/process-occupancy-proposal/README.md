# process-occupancy-proposal — 인간 제공 참고 목업 (2026-08-25)

`ProcessOccupancyPieViewer.jsx`는 인간 개발자가 세션에 첨부한 **참고용 UI 목업**이다
(Process 점유율 Pie 뷰어 — 프로세스 그룹(sqreamd/java/postgres)별 CPU·메모리
점유율 파이 차트 2종, 시간 슬라이더·재생/일시정지·속도 조절로 프레임을 넘기며
시점별 점유 분포를 재생. sqreamd 재시작 시점 배지 포함. 데이터 계약 주석:
`GET /api/metrics/process/xview`의 cpuOccupancySeries/memOccupancySeries).

- **동결 보관** — 이 폴더의 파일은 제안 증거로 커밋 시점 그대로 둔다
  (`docs/design/metric-detail-proposal/`·`xview-proposal/`과 같은 규약).
  빌드·테스트 대상이 아니다.
- 스택 주의: 목업은 Recharts·Tailwind·lucide-react 기반이다 — 이 프로젝트의
  구현 스택과 다르므로 **구현 시 이식**이 전제다(X5 선례).
- 구현 착수는 별도 인간 지시·플랜 확정을 기다린다.
