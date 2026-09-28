# metric-detail-proposal — 인간 제공 참고 목업 (2026-08-20)

`MetricDetailPageMockup.jsx`는 인간 개발자가 세션에 첨부한 **참고용 UI 목업**이다
(도메인 4종 GPU/Node/Process/SQream의 항목별 상세 페이지 — 개요 카드·상세 표·
차트뷰 탭, breadcrumb·상태 배지·시간 범위 선택).

- **동결 보관** — 이 폴더의 파일은 제안 증거로 커밋 시점 그대로 둔다
  (`docs/design/xview-proposal/`과 같은 규약). 빌드·테스트 대상이 아니다.
- 스택 주의: 목업은 Recharts·Tailwind·lucide-react 기반이다 — 이 프로젝트의
  구현 스택은 React+D3/C3(ADR R-0002, Recharts 미도입)이므로 **구현 시 이식**이
  전제다. X5(참고 jsx → D3 구현) 선례를 따른다.
- 구현 착수는 별도 인간 지시·플랜 확정을 기다린다.
