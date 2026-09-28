# API Mapping 20260908

React/ECharts의 데이터 소스를 Prometheus 직접 조회에서 Spring REST API + PostgreSQL로 변경한다.

| 화면 데이터 | Spring/DB 원천 |
|---|---|
| GPU Util | `/api/ainvidiaboard/dcgmi/chart` -> `ax_dcgmi_metric.gr_engine_active_percent` |
| GPU Memory | `/api/ainvidiaboard/dcgmi/chart` -> `memory_used_mib / memory_total_mib` |
| GPU Temperature | `/api/ainvidiaboard/dcgmi/chart` -> `temperature_c` |
| GPU Power | `/api/ainvidiaboard/dcgmi/chart` -> `power_usage_w` |
| Query Timeline | `/api/aisqreamboard/query_runtime` -> `query_start/query_end` |
| Node | `/api/aimetricsboard/node/chart` |
| Process | `/api/aimetricsboard/process/chart` |
| Session | `ax_metrics_sqream_server_status` |
| Worker/Log | `ax_metrics_sqream_worker_log` |
| Table | `ax_metrics_sqream_table` |
| Chunk | `ax_metrics_sqream_chunk` |
| GPU Process | `ax_gpu_process` + `ax_nvidia_smi_info` |

기존 화면 곳곳의 `promQuery/promQueryRange` 호출은 `src/api/prom.ts` 호환 계층에서 Spring의 `/api/aicurrentdashboard/compat/*`로 전환된다. 브라우저가 Prometheus HTTP API를 직접 호출하지 않는다.
