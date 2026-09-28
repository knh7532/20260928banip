# ADR-0003: 순수 Grafana 단일 대시보드 (커스텀 UI 셸 없음)

- 상태: Accepted
- 날짜: 2026-07-14

## 컨텍스트

상위 `../mockup/` 프로젝트는 ADR-0005(dual visualization)에 따라 정적 HTML 커스텀 UI 셸이 Grafana d-solo 패널을 iframe으로 임베드하는 병행 구조를 채택했다. PPTX 화면에는 좌측 AX Portal 사이드바(메뉴·서버 목록)가 있어 같은 방식이면 외관을 거의 그대로 재현할 수 있다.

## 결정

이 목업은 **순수 Grafana 단일 대시보드**(uid `tv-gpu-sqream`)로만 구현한다. 인간 결정 사항(2026-07-14 계획 승인). 상단 필터바는 템플릿 변수(env/instance/gpu) + time picker + refresh로 매핑하고, 좌측 사이드바는 재현하지 않는다.

## 대안

- **커스텀 셸 + Grafana 임베드 (mockup ADR-0005 방식)**: PPTX와 픽셀 수준으로 유사하지만 정적 HTML/JS 자산·nginx 서비스가 추가된다. 인간이 순수 Grafana 방식을 선택하여 기각.
- **둘 다 (Grafana 먼저, 셸은 2차)**: 작업량 최대. 기각.

## 결과

- 서비스가 exporter/Prometheus/Grafana 3개로 최소화되고, 네이티브 모드도 같은 구성이다.
- 사이드바의 정보(서버 목록·상태)는 대시보드 우측 서버 요약 게이지 3종이 대신 전달한다.
- 추후 셸이 필요해지면 상위 mockup의 custom-ui 패턴을 재사용할 수 있다(범위 외).
