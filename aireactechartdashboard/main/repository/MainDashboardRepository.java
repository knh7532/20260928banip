package com.apptomo.v4.aireactechartdashboard.main.repository;

import com.apptomo.v4.aireactechartdashboard.main.dto.*;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Repository
public class MainDashboardRepository {

    // ===== 20260908 추가 시작 : PostgreSQL NamedParameter 전체 타입 명시($3 타입 추론 오류 수정) =====
    // start/end/failedStart -> timestamp, hostname/hostnames -> varchar, gpu/mig -> integer/varchar 명시 캐스팅
    // ===== 20260908 추가 끝 : PostgreSQL NamedParameter 전체 타입 명시($3 타입 추론 오류 수정) =====

    private final NamedParameterJdbcTemplate jdbc;

    public MainDashboardRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private Timestamp ts(LocalDateTime value) {
        return Timestamp.valueOf(value);
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private Double dbl(Object value) {
        if (value == null) return null;
        return value instanceof Number ? ((Number) value).doubleValue() : Double.valueOf(String.valueOf(value));
    }

    private Long lng(Object value) {
        if (value == null) return null;
        return value instanceof Number ? ((Number) value).longValue() : Long.valueOf(String.valueOf(value));
    }

    private Integer integer(Object value) {
        if (value == null) return null;
        return value instanceof Number ? ((Number) value).intValue() : Integer.valueOf(String.valueOf(value));
    }

    private Double epochSec(Object value) {
        if (!(value instanceof Timestamp)) return null;
        return ((Timestamp) value).toInstant().toEpochMilli() / 1000.0;
    }

    private String timeText(Object value) {
        return value == null ? null : String.valueOf(value).replace(' ', 'T');
    }

    // ===== 20260908 추가 시작 : GPU/SQream 기본 화면 - 실행 중 쿼리/성능 직접 조회 =====
    // PromQL 사용 안 함.
    // ax_metrics_sqream_server_status + ax_metrics_sqream_query_runtime + ax_metrics_sqream_worker_log
    // ===== 20260908 추가 시작 : Overview Dashboard - MQuery + Server Status 5단계 직접 매핑 =====
    private MapSqlParameterSource overviewParams(LocalDateTime startTime, LocalDateTime endTime,
                                                 String hostname, String gpuId, String migInstanceId) {
        return new MapSqlParameterSource()
                .addValue("startTime", ts(startTime))
                .addValue("endTime", ts(endTime))
                .addValue("hostnames", hostname == null ? "" : hostname.trim())
                .addValue("gpuIds", gpuId == null ? "" : gpuId.trim())
                .addValue("migInstanceIds", migInstanceId == null ? "" : migInstanceId.trim());
    }

    /**
     * Overview용 MQuery.
     * - Worker Log: query_start_time/query_end_time가 조회기간 내부인 모든 행
     * - Node: 조회기간 ±5분, hostname별 CPU Usage Peak row
     * - GPU: NVIDIA collect_time 조회기간 ±10분, hostname+GPU+mig_instance_id별
     *        gr_engine_active_percent Peak row
     * - All 필터는 빈 문자열("")이며 해당 WHERE 조건을 건너뛴다.
     */
    // ===== 20260908 추가 시작 : PostgreSQL timestamp/interval 비교 오류 수정 =====
    // NamedParameter 바인딩 시 ? - INTERVAL 타입 추론 문제를 방지하기 위해 시간 파라미터를 timestamp로 명시 캐스팅.
    // ===== 20260908 추가 끝 : PostgreSQL timestamp/interval 비교 오류 수정 =====

    private String overviewMQueryCte() {
        return
                "WITH sqream_log AS (" +
                        " SELECT sl.* FROM public.ax_metrics_sqream_worker_log sl" +
                        " WHERE sl.query_start_time >= CAST(:startTime AS timestamp)" +
                        "   AND sl.query_end_time <= CAST(:endTime AS timestamp)" +
                        "   AND (COALESCE(CAST(:hostnames AS varchar),'')='' OR sl.hostname = ANY(string_to_array(CAST(:hostnames AS varchar), ',')))" +
                        "), node_peak AS (" +
                        " SELECT * FROM (" +
                        "   SELECT nm.hostname,nm.collect_time,nm.cpu_usage_percent," +
                        "          nm.memory_used_bytes,nm.memory_total_bytes,nm.memory_usage_percent," +
                        "          nm.disk_used_bytes,nm.disk_total_bytes,nm.disk_usage_percent," +
                        "          nm.load_avg_1m,nm.load_avg_5m,nm.load_avg_15m," +
                        "          ROW_NUMBER() OVER (PARTITION BY nm.hostname" +
                        "            ORDER BY nm.cpu_usage_percent DESC NULLS LAST,nm.collect_time DESC NULLS LAST) rn" +
                        "   FROM public.ax_metrics_node nm" +
                        "   WHERE nm.collect_time >= CAST(:startTime AS timestamp) - INTERVAL '5 minutes'" +
                        "     AND nm.collect_time <= CAST(:endTime AS timestamp) + INTERVAL '5 minutes'" +
                        "     AND nm.success = true" +
                        "     AND nm.cpu_usage_percent IS NOT NULL" +
                        "     AND (COALESCE(CAST(:hostnames AS varchar),'')='' OR nm.hostname = ANY(string_to_array(CAST(:hostnames AS varchar), ',')))" +
                        " ) x WHERE rn=1" +
                        "), gpu_peak AS (" +
                        " SELECT * FROM (" +
                        "   SELECT dcm.gpu_id,dcm.gi_id,dcm.ci_id,dcm.gpu_uuid,dcm.mig_uuid,dcm.mig_instance_id," +
                        "          dcm.device_name,dcm.driver_version,dcm.gpu_util_percent,dcm.sm_active_percent," +
                        // ===== 20260909 추가 시작 : gr_engine_active_percent 0~1 비율을 화면용 %로 변환 =====
                        "          (dcm.gr_engine_active_percent * 100.0) AS gr_engine_active_percent,dcm.memory_used_mib,dcm.memory_total_mib," +
                        // ===== 20260909 추가 끝 : gr_engine_active_percent 0~1 비율을 화면용 %로 변환 =====
                        "          dcm.snapshot_time,nsi.hostname AS nvidia_hostname,nsi.hostip AS nvidia_hostip," +
                        "          CAST(nsi.global_uuid AS varchar) AS nvidia_global_uuid," +
                        "          ROW_NUMBER() OVER (PARTITION BY nsi.hostname,dcm.gpu_id,dcm.mig_instance_id" +
                        "            ORDER BY dcm.gr_engine_active_percent DESC NULLS LAST,dcm.snapshot_time DESC NULLS LAST) rn" +
                        "   FROM public.ax_metrics_gpu_dcgmi_metric dcm" +
                        "   INNER JOIN public.ax_metrics_gpu_nvidia_smi_info nsi ON dcm.nvidia_smi_id=nsi.id" +
                        "   WHERE nsi.collect_time >= CAST(:startTime AS timestamp) - INTERVAL '10 minutes'" +
                        "     AND nsi.collect_time <= CAST(:endTime AS timestamp) + INTERVAL '10 minutes'" +
                        "     AND dcm.gr_engine_active_percent IS NOT NULL" +
                        "     AND (COALESCE(CAST(:hostnames AS varchar),'')='' OR nsi.hostname = ANY(string_to_array(CAST(:hostnames AS varchar), ',')))" +
                        "     AND (COALESCE(CAST(:gpuIds AS varchar),'')='' OR dcm.gpu_id = ANY(string_to_array(CAST(:gpuIds AS varchar), ',')::integer[]))" +
                        "     AND (COALESCE(CAST(:migInstanceIds AS varchar),'')='' OR dcm.mig_instance_id = ANY(string_to_array(CAST(:migInstanceIds AS varchar), ',')::integer[]))" +
                        " ) x WHERE rn=1" +
                        "), mquery_expanded AS (" +
                        " SELECT CAST(sl.id AS varchar) log_id,sl.server_id,sl.hostname,sl.hostip,CAST(sl.global_uuid AS varchar) global_uuid," +
                        "        sl.collect_time,sl.query_start_time,sl.query_end_time,sl.query_execution_time_ms," +
                        "        sl.query_termination_status,sl.query_termination_message,sl.user_id,sl.connection_id,sl.statement_id," +
                        "        sl.worker_hostname,sl.service_name,sl.database_name,sl.statement,sl.query_plan,sl.sql_type," +
                        "        sl.total_data_read_mb,sl.total_processed_rows,sl.result_row_count,sl.terminated," +
                        "        np.cpu_usage_percent AS peak_cpu_usage_percent,np.memory_used_bytes AS peak_memory_used_bytes," +
                        "        np.memory_total_bytes AS peak_memory_total_bytes,np.memory_usage_percent AS peak_memory_usage_percent," +
                        "        np.disk_used_bytes AS peak_disk_used_bytes,np.disk_total_bytes AS peak_disk_total_bytes," +
                        "        np.disk_usage_percent AS peak_disk_usage_percent,np.load_avg_1m AS peak_load_avg_1m," +
                        "        np.load_avg_5m AS peak_load_avg_5m,np.load_avg_15m AS peak_load_avg_15m,np.collect_time AS node_peak_collect_time," +
                        "        gp.gpu_id,gp.gi_id,gp.ci_id,gp.gpu_uuid,gp.mig_uuid,gp.mig_instance_id,gp.device_name,gp.driver_version," +
                        "        gp.gpu_util_percent,gp.sm_active_percent,gp.gr_engine_active_percent,gp.memory_used_mib,gp.memory_total_mib," +
                        "        gp.snapshot_time AS gpu_peak_snapshot_time,gp.nvidia_hostname,gp.nvidia_hostip,gp.nvidia_global_uuid" +
                        " FROM sqream_log sl" +
                        " LEFT JOIN node_peak np ON sl.hostname=np.hostname" +
                        " LEFT JOIN gpu_peak gp ON sl.hostname=gp.nvidia_hostname" +
                        "), mquery AS (" +
                        " SELECT DISTINCT ON (log_id) * FROM mquery_expanded" +
                        " ORDER BY log_id,gr_engine_active_percent DESC NULLS LAST,gpu_peak_snapshot_time DESC NULLS LAST" +
                        ") ";
    }

    public MainOverviewResponseDto findOverview(LocalDateTime startTime, LocalDateTime endTime,
                                                String hostname, String gpuId, String migInstanceId) {
        MainOverviewResponseDto result = new MainOverviewResponseDto();
        MapSqlParameterSource p = overviewParams(startTime, endTime, hostname, gpuId, migInstanceId);

        // ===== 20260908 추가 시작 : 대기/준비/초기화/실행중/중단 - server_status 최신 상태 기준 =====
        String statusSql =
                "WITH latest_status AS (" +
                        " SELECT DISTINCT ON (server_id,connection_id,statement_id)" +
                        "        server_id,hostname,connection_id,statement_id,statement_status,collect_time" +
                        " FROM public.ax_metrics_sqream_server_status" +
                        " WHERE collect_time BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp)" +
                        "   AND statement_id IS NOT NULL" +
                        "   AND (COALESCE(CAST(:hostnames AS varchar),'')='' OR hostname = ANY(string_to_array(CAST(:hostnames AS varchar), ',')))" +
                        " ORDER BY server_id,connection_id,statement_id,collect_time DESC" +
                        ") SELECT" +
                        " COUNT(*) FILTER (WHERE lower(trim(COALESCE(statement_status,'')))='in queue') in_queue," +
                        " COUNT(*) FILTER (WHERE lower(trim(COALESCE(statement_status,'')))='preparing') preparing," +
                        " COUNT(*) FILTER (WHERE lower(trim(COALESCE(statement_status,'')))='initializing') initializing," +
                        " COUNT(*) FILTER (WHERE lower(trim(COALESCE(statement_status,'')))='executing') executing," +
                        " COUNT(*) FILTER (WHERE lower(trim(COALESCE(statement_status,'')))='stopping') stopping" +
                        " FROM latest_status";
        Map<String,Object> status = jdbc.queryForMap(statusSql,p);
        MainOverviewKpiDto kpi = new MainOverviewKpiDto();
        kpi.queuedStatements = dbl(status.get("in_queue"));
        kpi.inQueue = kpi.queuedStatements;
        kpi.preparingStatements = dbl(status.get("preparing"));
        kpi.initializingStatements = dbl(status.get("initializing"));
        kpi.executingStatements = dbl(status.get("executing"));
        kpi.stoppingStatements = dbl(status.get("stopping"));
        // ===== 20260908 추가 끝 : 대기/준비/초기화/실행중/중단 =====

        // ===== 20260908 추가 시작 : 실행 중인 SQream DB 쿼리 - MQuery 직접 매핑 =====
        String rowsSql = overviewMQueryCte() +
                "SELECT * FROM mquery ORDER BY query_start_time DESC,statement_id DESC";
        for (Map<String,Object> r : jdbc.queryForList(rowsSql,p)) {
            MainOverviewStatementDto d = new MainOverviewStatementDto();
            d.stmtId = str(r.get("statement_id"));
            d.queryId = !str(r.get("global_uuid")).isEmpty() ? str(r.get("global_uuid")) : str(r.get("log_id"));
            d.user = str(r.get("user_id"));
            d.node = str(r.get("hostname"));
            d.gpu = str(r.get("gpu_id"));
            d.mig = str(r.get("mig_instance_id"));
            d.worker = !str(r.get("worker_hostname")).isEmpty() ? str(r.get("worker_hostname")) : str(r.get("mig_instance_id"));
            d.service = str(r.get("service_name"));
            d.qid = d.queryId;
            d.qidTags = "";
            d.connectionId = str(r.get("connection_id"));
            d.memoryBytes = dbl(r.get("peak_memory_used_bytes"));
            d.gpuPct = dbl(r.get("gr_engine_active_percent"));
            d.cpuPct = dbl(r.get("peak_cpu_usage_percent"));
            d.startTimeSec = epochSec(r.get("query_start_time"));
            Long execMs = lng(r.get("query_execution_time_ms"));
            d.elapsedSec = execMs == null ? null : execMs / 1000.0;
            d.progress = 1.0;
            d.spoolBytes = null;
            Double memMib = dbl(r.get("memory_used_mib"));
            d.vramBytes = memMib == null ? null : memMib * 1024.0 * 1024.0;
            d.lockHeldSec = null;
            result.statements.add(d);

            MainOverviewPerformanceDto perf = new MainOverviewPerformanceDto();
            perf.queryName = "Statement " + d.stmtId;
            perf.queryType = str(r.get("sql_type"));
            perf.database = str(r.get("database_name"));
            perf.node = d.node; perf.gpu = d.gpu; perf.mig = d.mig;
            perf.p95Seconds = d.elapsedSec;
            perf.state = 1;
            result.performance.add(perf);
        }
        // ===== 20260908 추가 끝 : 실행 중인 SQream DB 쿼리 - MQuery 직접 매핑 =====

        result.servers = findLatestServers(endTime);
        int migTotal = 0, migActive = 0;
        for (MainOverviewServerDto server : result.servers) {
            migTotal += server.migTotal == null ? 0 : server.migTotal;
            migActive += server.gpuBusy == null ? 0 : server.gpuBusy;
        }
        kpi.migTotal = (double) migTotal;
        kpi.migActive = (double) migActive;
        result.kpi = kpi;
        return result;
    }
    // ===== 20260908 추가 끝 : Overview Dashboard - MQuery + Server Status 5단계 직접 매핑 =====

    // ===== 20260908 추가 시작 : GPU/SQream 기본 화면 - 서버 GPU 카드 직접 조회 =====
    // ax_dcgmi_metric + ax_nvidia_smi_info 최신 슬롯을 서버별 집계.
    public List<MainOverviewServerDto> findLatestServers(LocalDateTime endTime) {
        String sql =
                "WITH latest AS (" +
                        " SELECT DISTINCT ON (n.hostname, d.gpu_id, COALESCE(d.gi_id,-1)) " +
                        "        n.hostname, d.gpu_id, d.gi_id, d.gr_engine_active_percent, d.gpu_util_percent, " +
                        "        d.memory_used_mib, d.memory_total_mib, d.temperature_c, d.power_usage_w " +
                        "   FROM public.ax_metrics_gpu_dcgmi_metric d " +
                        "   JOIN public.ax_metrics_gpu_nvidia_smi_info n ON n.id = d.nvidia_smi_id " +
                        "  WHERE d.snapshot_time <= CAST(:endTime AS timestamp) " +
                        "  ORDER BY n.hostname, d.gpu_id, COALESCE(d.gi_id,-1), d.snapshot_time DESC" +
                        ") " +
                        "SELECT hostname, " +
                        // ===== 20260909 추가 시작 : 서버 카드 gr_engine 비율을 %로 변환 =====
                        "       AVG(COALESCE(gr_engine_active_percent * 100.0, gpu_util_percent)) AS utilization, " +
                        // ===== 20260909 추가 끝 : 서버 카드 gr_engine 비율을 %로 변환 =====
                        "       CASE WHEN SUM(COALESCE(memory_total_mib,0)) > 0 " +
                        "            THEN SUM(COALESCE(memory_used_mib,0)) / SUM(memory_total_mib) * 100.0 END AS memory_pct, " +
                        "       AVG(temperature_c) AS temperature, SUM(COALESCE(power_usage_w,0)) AS power, " +
                        "       COUNT(DISTINCT gpu_id) AS gpu_total, COUNT(*) AS mig_total, " +
                        "       SUM(CASE WHEN COALESCE(gr_engine_active_percent,gpu_util_percent,0) > 0 THEN 1 ELSE 0 END) AS gpu_busy " +
                        "  FROM latest GROUP BY hostname ORDER BY hostname";
        List<Map<String, Object>> rows = jdbc.queryForList(sql, new MapSqlParameterSource("endTime", ts(endTime)));
        List<MainOverviewServerDto> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            MainOverviewServerDto d = new MainOverviewServerDto();
            d.node = str(r.get("hostname"));
            d.utilization = dbl(r.get("utilization"));
            d.memoryPct = dbl(r.get("memory_pct"));
            d.temperature = dbl(r.get("temperature"));
            d.power = dbl(r.get("power"));
            d.gpuTotal = integer(r.get("gpu_total"));
            d.migTotal = integer(r.get("mig_total"));
            d.gpuBusy = integer(r.get("gpu_busy"));
            out.add(d);
        }
        return out;
    }
    // ===== 20260908 추가 끝 : GPU/SQream 기본 화면 - 서버 GPU 카드 직접 조회 =====

    // ===== 20260908 추가 시작 : GPU/SQream 기본 화면 - ECharts 직접 조회 =====
    // PromQL range query 대신 실제 테이블의 조회기간으로 조회.
    // ===== 20260908 추가 시작 : Overview Dashboard - GPU/Memory MQuery + Temperature/Power GPU Device =====
    public MainOverviewChartResponseDto findCharts(LocalDateTime startTime, LocalDateTime endTime,
                                                   String hostname, String gpuId, String migInstanceId) {
        MainOverviewChartResponseDto result = new MainOverviewChartResponseDto();
        MapSqlParameterSource p = overviewParams(startTime,endTime,hostname,gpuId,migInstanceId);

        // ===== 20260909 추가 시작 : Overview GPU/Memory/Temperature/Power를 Worker Log(MQuery)와 분리 =====
        // DCGMI 자체 시계열을 사용한다. gr_engine_active_percent는 DB의 0~1 값을 %로 변환한다.
        // Power Usage도 ax_gpu_device가 아니라 ax_dcgmi_metric.power_usage_w를 사용한다.
        String dcgmiSql =
                "SELECT COALESCE(dcm.snapshot_time,nsi.collect_time) AS snapshot_time,nsi.hostname," +
                        "       dcm.gpu_id,dcm.gi_id,dcm.ci_id,dcm.mig_instance_id," +
                        "       CAST(dcm.gpu_uuid AS varchar) gpu_uuid,CAST(dcm.mig_uuid AS varchar) mig_uuid,dcm.device_name," +
                        "       dcm.gpu_util_percent,(dcm.gr_engine_active_percent * 100.0) AS gr_engine_active_percent," +
                        "       dcm.sm_active_percent,dcm.memory_used_mib,dcm.memory_total_mib," +
                        "       dcm.temperature_c,dcm.power_usage_w" +
                        " FROM public.ax_metrics_gpu_dcgmi_metric dcm" +
                        " JOIN public.ax_metrics_gpu_nvidia_smi_info nsi ON nsi.id=dcm.nvidia_smi_id" +
                        " WHERE COALESCE(dcm.snapshot_time,nsi.collect_time) BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp)" +
                        "   AND (COALESCE(CAST(:hostnames AS varchar),'')='' OR nsi.hostname = ANY(string_to_array(CAST(:hostnames AS varchar), ',')))" +
                        "   AND (COALESCE(CAST(:gpuIds AS varchar),'')='' OR dcm.gpu_id = ANY(string_to_array(CAST(:gpuIds AS varchar), ',')::integer[]))" +
                        "   AND (COALESCE(CAST(:migInstanceIds AS varchar),'')='' OR dcm.mig_instance_id = ANY(string_to_array(CAST(:migInstanceIds AS varchar), ',')::integer[]))" +
                        " ORDER BY COALESCE(dcm.snapshot_time,nsi.collect_time),nsi.hostname,dcm.gpu_id,dcm.mig_instance_id";
        for (Map<String,Object> r : jdbc.queryForList(dcgmiSql,p)) {
            MainOverviewGpuPointDto d = new MainOverviewGpuPointDto();
            d.snapshotTime = timeText(r.get("snapshot_time")); d.hostname = str(r.get("hostname"));
            d.gpuId = integer(r.get("gpu_id")); d.giId = integer(r.get("gi_id")); d.ciId = integer(r.get("ci_id"));
            d.migInstanceId = integer(r.get("mig_instance_id"));
            d.gpuUuid = str(r.get("gpu_uuid")); d.migUuid = str(r.get("mig_uuid")); d.deviceName = str(r.get("device_name"));
            d.gpuUtilPercent = dbl(r.get("gpu_util_percent")); d.grEngineActivePercent = dbl(r.get("gr_engine_active_percent"));
            d.smActivePercent = dbl(r.get("sm_active_percent"));
            d.memoryUsedMib = dbl(r.get("memory_used_mib")); d.memoryTotalMib = dbl(r.get("memory_total_mib"));
            d.temperatureC = dbl(r.get("temperature_c")); d.powerUsageW = dbl(r.get("power_usage_w"));
            result.gpuPoints.add(d);
        }
        // ===== 20260909 추가 끝 : Overview GPU/Memory/Temperature/Power를 Worker Log(MQuery)와 분리 =====

        // 상단 타임라인도 Worker Log(MQuery) 기준으로 맞춘다.
        String timelineSql = overviewMQueryCte() +
                "SELECT collect_time,hostname,global_uuid,connection_id,statement_id,user_id,query_start_time,query_end_time," +
                "       query_execution_time_ms,query_termination_status" +
                " FROM mquery ORDER BY query_start_time";
        for (Map<String,Object> r : jdbc.queryForList(timelineSql,p)) {
            MainOverviewQueryTimelineDto d = new MainOverviewQueryTimelineDto();
            d.collectTime = timeText(r.get("collect_time")); d.hostname = str(r.get("hostname")); d.globalUuid = str(r.get("global_uuid"));
            d.connectionId = str(r.get("connection_id")); d.statementId = str(r.get("statement_id"));
            d.queryIdentifier = "Statement " + d.statementId; d.userName = str(r.get("user_id"));
            d.queryStart = timeText(r.get("query_start_time")); d.queryEnd = timeText(r.get("query_end_time"));
            Long execMs = lng(r.get("query_execution_time_ms"));
            d.executionTimeSec = execMs == null ? null : execMs / 1000.0;
            d.totalRuntimeSec = d.executionTimeSec;
            d.classifiedState = str(r.get("query_termination_status"));
            result.queryTimeline.add(d);
        }
        return result;
    }
    // ===== 20260908 추가 끝 : Overview Dashboard - GPU/Memory MQuery + Temperature/Power GPU Device =====

    // ===== 20260908 추가 시작 : GPU/SQream 기본 화면 - X-View 완료 이벤트 직접 조회 =====
    public List<MainOverviewXViewEventDto> findXView(LocalDateTime startTime, LocalDateTime endTime,
                                                              String hostname, String gpuId, String giId) {
        // ===== 20260924 추가 시작 : X-View Node/GPU/Worker 필터 매핑 =====
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("startTime", ts(startTime))
                .addValue("endTime", ts(endTime));

        StringBuilder filter = new StringBuilder();
        if (hostname != null && !hostname.isBlank()) {
            filter.append(" AND q.hostname = :hostname ");
            p.addValue("hostname", hostname);
        }
        if (gpuId != null && !gpuId.isBlank()) {
            filter.append(" AND w.gpu_id = CAST(:gpuId AS integer) ");
            p.addValue("gpuId", gpuId);
        }
        if (giId != null && !giId.isBlank()) {
            filter.append(" AND w.gi_id = CAST(:giId AS integer) ");
            p.addValue("giId", giId);
        }

        String sql =
                "SELECT q.hostname, q.statement_id, q.query_identifier, q.user_name, q.query_end, q.total_runtime_sec, " +
                        "       q.execution_time_sec, q.compile_time_sec, q.inqueue_time_sec, q.compile_execution_time_sec, " +
                        "       w.query_termination_status, w.query_termination_message " +
                        "  FROM public.ax_metrics_sqream_query_runtime q " +
                        "  LEFT JOIN LATERAL (" +
                        "       SELECT wl.query_termination_status, wl.query_termination_message, wl.gpu_id, wl.gi_id " +
                        "         FROM public.ax_metrics_sqream_worker_log wl " +
                        "        WHERE wl.connection_id = q.connection_id " +
                        "          AND wl.statement_id = q.statement_id " +
                        "        ORDER BY wl.query_end_time DESC NULLS LAST, wl.collect_time DESC NULLS LAST LIMIT 1" +
                        "  ) w ON TRUE " +
                        " WHERE q.query_end BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp) " +
                        filter +
                        " ORDER BY q.query_end";

        List<MainOverviewXViewEventDto> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(sql, p)) {
            MainOverviewXViewEventDto d = new MainOverviewXViewEventDto();
            d.node = str(r.get("hostname")); d.stmtId = str(r.get("statement_id")); d.queryId = str(r.get("query_identifier"));
            d.user = str(r.get("user_name")); d.queryName = str(r.get("query_identifier"));
            String term = str(r.get("query_termination_status")).toLowerCase();
            d.status = (term.contains("fail") || term.contains("error") || term.contains("kill")) ? "failed" : "success";
            d.reason = str(r.get("query_termination_message"));
            if (r.get("query_end") instanceof Timestamp) d.endMs = ((Timestamp) r.get("query_end")).toInstant().toEpochMilli();
            d.durationSec = dbl(r.get("total_runtime_sec")); if (d.durationSec == null) d.durationSec = dbl(r.get("execution_time_sec"));
            MainOverviewXViewEventDto.Phases ph = new MainOverviewXViewEventDto.Phases();
            ph.compileSec = dbl(r.get("compile_time_sec")); ph.queuedSec = dbl(r.get("inqueue_time_sec"));
            ph.initializingSec = dbl(r.get("compile_execution_time_sec")); ph.executingSec = dbl(r.get("execution_time_sec"));
            d.phases = ph;
            out.add(d);
        }
        return out;
        // ===== 20260924 추가 끝 : X-View Node/GPU/Worker 필터 매핑 =====
    }
    // ===== 20260908 추가 끝 : GPU/SQream 기본 화면 - X-View 완료 이벤트 직접 조회 =====

    // ===== 20260908 추가 시작 : GPU/SQream 기본 화면 - 상세 팝업 라이브 직접 조회 =====
    public List<MainOverviewLiveStatDto> findLiveStats(LocalDateTime startTime, LocalDateTime endTime) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("startTime", ts(startTime))
                .addValue("endTime", ts(endTime));
        String sql =
                "SELECT DISTINCT ON (statement_id) statement_id, query_end, elapsed_seconds_since_start, total_runtime_sec, execution_time_sec " +
                        "  FROM public.ax_metrics_sqream_query_runtime " +
                        " WHERE collect_time BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp) AND statement_id IS NOT NULL " +
                        " ORDER BY statement_id, collect_time DESC";
        List<MainOverviewLiveStatDto> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(sql, p)) {
            MainOverviewLiveStatDto d = new MainOverviewLiveStatDto();
            d.stmtId = str(r.get("statement_id")); d.elapsed = dbl(r.get("elapsed_seconds_since_start"));
            if (d.elapsed == null) d.elapsed = dbl(r.get("total_runtime_sec"));
            if (d.elapsed == null) d.elapsed = dbl(r.get("execution_time_sec"));
            d.prog = r.get("query_end") == null ? 0.0 : 1.0;
            out.add(d);
        }
        return out;
    }
    // ===== 20260908 추가 끝 : GPU/SQream 기본 화면 - 상세 팝업 라이브 직접 조회 =====
    // ===== 20260908 추가 시작 : Main Dashboard - 사용자 정의 MQuery 기반 카드/표/그래프 =====
    /*
     * MQuery 핵심 규칙
     * 1) Worker Log: query_start_time >= startTime AND query_end_time <= endTime
     * 2) Node: 조회구간 ±5분에서 hostname별 CPU usage PEAK ROW
     * 3) GPU: NVIDIA SMI 조회구간 ±10분, hostname + GPU + mig_instance_id별
     *         gr_engine_active_percent PEAK ROW
     *
     * 사용자 제공 원본 MQuery는 gpu_peak를 hostname만으로 PARTITION 했지만,
     * 화면에서 Worker(mig_instance_id) 필터와 Node Health의 MIG별 상태를 사용해야 하므로
     * 이 화면용 MQuery는 hostname,gpu_id,mig_instance_id 단위 PEAK로 확장한다.
     */
    private String mQueryCte() {
        return
                "WITH sqream_log AS (" +
                        " SELECT sl.* FROM public.ax_metrics_sqream_worker_log sl" +
                        " WHERE sl.query_start_time >= CAST(:startTime AS timestamp)" +
                        "   AND sl.query_end_time <= CAST(:endTime AS timestamp)" +
                        "   AND (CAST(:hostname AS varchar) IS NULL OR sl.hostname = CAST(:hostname AS varchar))" +
                        "), node_peak AS (" +
                        " SELECT * FROM (" +
                        "   SELECT nm.hostname,nm.collect_time,nm.cpu_usage_percent," +
                        "          nm.memory_used_bytes,nm.memory_total_bytes,nm.memory_usage_percent," +
                        "          nm.disk_used_bytes,nm.disk_total_bytes,nm.disk_usage_percent," +
                        "          nm.load_avg_1m,nm.load_avg_5m,nm.load_avg_15m," +
                        "          ROW_NUMBER() OVER (PARTITION BY nm.hostname" +
                        "            ORDER BY nm.cpu_usage_percent DESC NULLS LAST,nm.collect_time DESC NULLS LAST) rn" +
                        "   FROM public.ax_metrics_node nm" +
                        "   WHERE nm.collect_time >= CAST(:startTime AS timestamp) - INTERVAL '5 minutes'" +
                        "     AND nm.collect_time <= CAST(:endTime AS timestamp) + INTERVAL '5 minutes'" +
                        "     AND nm.success = true" +
                        "     AND nm.cpu_usage_percent IS NOT NULL" +
                        "     AND (CAST(:hostname AS varchar) IS NULL OR nm.hostname = CAST(:hostname AS varchar))" +
                        " ) x WHERE rn=1" +
                        "), gpu_peak AS (" +
                        " SELECT * FROM (" +
                        "   SELECT dcm.gpu_id,dcm.gi_id,dcm.ci_id,dcm.gpu_uuid,dcm.mig_uuid,dcm.mig_instance_id," +
                        "          dcm.device_name,dcm.driver_version,dcm.gpu_util_percent,dcm.sm_active_percent," +
                        // ===== 20260909 추가 시작 : gr_engine_active_percent 0~1 비율을 화면용 %로 변환 =====
                        "          (dcm.gr_engine_active_percent * 100.0) AS gr_engine_active_percent,dcm.memory_used_mib,dcm.memory_total_mib," +
                        // ===== 20260909 추가 끝 : gr_engine_active_percent 0~1 비율을 화면용 %로 변환 =====
                        "          dcm.temperature_c,dcm.power_usage_w,dcm.snapshot_time," +
                        "          nsi.hostname AS nvidia_hostname,nsi.hostip AS nvidia_hostip," +
                        "          CAST(nsi.global_uuid AS varchar) AS nvidia_global_uuid," +
                        "          ROW_NUMBER() OVER (PARTITION BY nsi.hostname,dcm.gpu_id,dcm.mig_instance_id" +
                        "            ORDER BY dcm.gr_engine_active_percent DESC NULLS LAST,dcm.snapshot_time DESC NULLS LAST) rn" +
                        "   FROM public.ax_metrics_gpu_dcgmi_metric dcm" +
                        "   INNER JOIN public.ax_metrics_gpu_nvidia_smi_info nsi ON dcm.nvidia_smi_id=nsi.id" +
                        "   WHERE nsi.collect_time >= CAST(:startTime AS timestamp) - INTERVAL '10 minutes'" +
                        "     AND nsi.collect_time <= CAST(:endTime AS timestamp) + INTERVAL '10 minutes'" +
                        "     AND dcm.gr_engine_active_percent IS NOT NULL" +
                        "     AND (CAST(:hostname AS varchar) IS NULL OR nsi.hostname = CAST(:hostname AS varchar))" +
                        "     AND (CAST(:gpuId AS integer) IS NULL OR dcm.gpu_id = CAST(:gpuId AS integer))" +
                        "     AND (CAST(:migInstanceId AS integer) IS NULL OR dcm.mig_instance_id = CAST(:migInstanceId AS integer))" +
                        " ) x WHERE rn=1" +
                        "), mquery_expanded AS (" +
                        " SELECT CAST(sl.id AS varchar) log_id,sl.server_id,sl.hostname,sl.hostip,CAST(sl.global_uuid AS varchar) global_uuid," +
                        "        sl.collect_time,sl.query_start_time,sl.query_end_time,sl.query_execution_time_ms," +
                        "        sl.query_termination_status,sl.query_termination_message,sl.user_id,sl.connection_id,sl.statement_id," +
                        "        sl.worker_hostname,sl.service_name,sl.database_name,sl.statement,sl.query_plan,sl.sql_type," +
                        "        sl.total_data_read_mb,sl.total_processed_rows,sl.result_row_count,sl.terminated," +
                        "        np.cpu_usage_percent AS peak_cpu_usage_percent,np.memory_used_bytes AS peak_memory_used_bytes," +
                        "        np.memory_total_bytes AS peak_memory_total_bytes,np.memory_usage_percent AS peak_memory_usage_percent," +
                        "        np.disk_used_bytes AS peak_disk_used_bytes,np.disk_total_bytes AS peak_disk_total_bytes," +
                        "        np.disk_usage_percent AS peak_disk_usage_percent,np.load_avg_1m AS peak_load_avg_1m," +
                        "        np.load_avg_5m AS peak_load_avg_5m,np.load_avg_15m AS peak_load_avg_15m,np.collect_time AS node_peak_collect_time," +
                        "        gp.gpu_id,gp.gi_id,gp.ci_id,gp.gpu_uuid,gp.mig_uuid,gp.mig_instance_id,gp.device_name,gp.driver_version," +
                        "        gp.gpu_util_percent,gp.sm_active_percent,gp.gr_engine_active_percent,gp.memory_used_mib,gp.memory_total_mib," +
                        "        gp.temperature_c,gp.power_usage_w,gp.snapshot_time AS gpu_peak_snapshot_time," +
                        "        gp.nvidia_hostname,gp.nvidia_hostip,gp.nvidia_global_uuid" +
                        " FROM sqream_log sl" +
                        " LEFT JOIN node_peak np ON sl.hostname=np.hostname" +
                        " LEFT JOIN gpu_peak gp ON sl.hostname=gp.nvidia_hostname" +
                        "), mquery AS (" +
                        // GPU/Worker All일 때 로그 1건이 여러 MIG에 중복되지 않도록 가장 높은 GR Engine PEAK 1건만 사용.
                        " SELECT DISTINCT ON (log_id) * FROM mquery_expanded" +
                        " ORDER BY log_id,gr_engine_active_percent DESC NULLS LAST,gpu_peak_snapshot_time DESC NULLS LAST" +
                        ") ";
    }

    private MapSqlParameterSource mainParams(LocalDateTime startTime, LocalDateTime endTime,
                                             String hostname, Integer gpuId, Integer migInstanceId) {
        return new MapSqlParameterSource()
                .addValue("startTime", ts(startTime))
                .addValue("endTime", ts(endTime))
                .addValue("hostname", hostname == null || hostname.trim().isEmpty() ? null : hostname.trim())
                .addValue("gpuId", gpuId)
                .addValue("migInstanceId", migInstanceId);
    }

    public MainDrilldownResponseDto findDrilldown(LocalDateTime startTime, LocalDateTime endTime,
                                                  String hostname, Integer gpuId, Integer migInstanceId) {
        MainDrilldownResponseDto out = new MainDrilldownResponseDto();
        MapSqlParameterSource p = mainParams(startTime,endTime,hostname,gpuId,migInstanceId)
                .addValue("failedStart", ts(endTime.minusHours(1)));

        // ===== 20260908 추가 시작 : Main Dashboard - Active Sessions / Running Queries =====
        /*
         * ax_metrics_sqream_server_status 실제 스키마에는 query_termination_status/success가 없으므로
         * 화면의 "미완료 + 성공 상태" 의미를 statement_status로 판정한다.
         * 완료/성공/실패/에러/kill/stop 계열은 active에서 제외한다.
         */
        String activeSql =
                "WITH latest AS (" +
                        " SELECT DISTINCT ON (server_id,connection_id,statement_id) server_id,hostname,connection_id,statement_id,user_name,statement_status,collect_time" +
                        " FROM public.ax_metrics_sqream_server_status" +
                        " WHERE collect_time BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp)" +
                        "   AND (CAST(:hostname AS varchar) IS NULL OR hostname=CAST(:hostname AS varchar))" +
                        " ORDER BY server_id,connection_id,statement_id,collect_time DESC" +
                        "), active AS (" +
                        " SELECT * FROM latest WHERE statement_id IS NOT NULL" +
                        "   AND lower(COALESCE(statement_status,'')) !~ '(complete|completed|success|succeeded|fail|error|kill|terminated|stop)'" +
                        ") SELECT COUNT(DISTINCT server_id) active_sessions,COUNT(*) running_queries,COUNT(DISTINCT user_name) connected_users FROM active";
        Map<String,Object> active = jdbc.queryForMap(activeSql,p);
        out.activeSessions = integer(active.get("active_sessions"));
        out.runningQueries = integer(active.get("running_queries"));
        out.connectedUsers = integer(active.get("connected_users"));
        // ===== 20260908 추가 끝 : Main Dashboard - Active Sessions / Running Queries =====

        // ===== 20260908 추가 시작 : Main Dashboard - MQuery KPI / Query Overview =====
        String mSql = mQueryCte() +
                "SELECT * FROM mquery ORDER BY query_start_time DESC";
        List<Map<String,Object>> rows = jdbc.queryForList(mSql,p);

        Double cpuPeak = null;
        Double grPeak = null;
        for (Map<String,Object> r : rows) {
            Double cpu = dbl(r.get("peak_cpu_usage_percent"));
            Double gr = dbl(r.get("gr_engine_active_percent"));
            if (cpu != null && (cpuPeak == null || cpu > cpuPeak)) cpuPeak = cpu;
            if (gr != null && (grPeak == null || gr > grPeak)) grPeak = gr;

            MainDrilldownQueryDto d = new MainDrilldownQueryDto();
            d.connectionId = str(r.get("connection_id"));
            d.statementId = str(r.get("statement_id"));
            d.user = str(r.get("user_id"));
            d.node = str(r.get("hostname"));
            d.worker = str(r.get("worker_hostname"));
            d.service = str(r.get("service_name"));
            String term = str(r.get("query_termination_status"));
            d.status = term.isEmpty() ? (Boolean.TRUE.equals(r.get("terminated")) ? "TERMINATED" : "COMPLETED") : term;
            Long execMs = lng(r.get("query_execution_time_ms"));
            d.elapsed = execMs == null ? null : execMs / 1000.0;
            d.progress = r.get("query_end_time") == null ? 0.0 : 1.0;
            d.qid = str(r.get("global_uuid"));
            d.qidTags = "";
            d.startEpoch = epochSec(r.get("query_start_time"));
            d.peakCpuUsagePercent = cpu;
            d.peakMemoryUsagePercent = dbl(r.get("peak_memory_usage_percent"));
            d.peakDiskUsagePercent = dbl(r.get("peak_disk_usage_percent"));
            d.peakGrEngineActivePercent = gr;
            d.peakGpuMemoryUsedMib = dbl(r.get("memory_used_mib"));
            d.peakGpuMemoryTotalMib = dbl(r.get("memory_total_mib"));
            d.gpuUtilization = gr;
            d.memoryBytes = r.get("peak_memory_used_bytes") == null ? null : dbl(r.get("peak_memory_used_bytes"));
            Double readMb = dbl(r.get("total_data_read_mb"));
            d.dataScannedBytes = readMb == null ? null : readMb * 1024.0 * 1024.0;
            out.queries.add(d);
        }
        out.cpuUsagePercent = cpuPeak;
        // 사용자 지정: 상단 GPU MEMORY 카드는 MQuery gr_engine_active_percent 사용.
        out.gpuMemoryUsagePercent = grPeak;

        rows.stream()
                .sorted((a,b) -> Double.compare(
                        dbl(b.get("gr_engine_active_percent")) == null ? -1d : dbl(b.get("gr_engine_active_percent")),
                        dbl(a.get("gr_engine_active_percent")) == null ? -1d : dbl(a.get("gr_engine_active_percent"))))
                .limit(20)
                .forEach(r -> {
                    String stmt = str(r.get("statement_id"));
                    for (MainDrilldownQueryDto q : out.queries) {
                        if (stmt.equals(q.statementId)) { out.topQueries.add(q); break; }
                    }
                });
        // ===== 20260908 추가 끝 : Main Dashboard - MQuery KPI / Query Overview =====

        // ===== 20260908 추가 시작 : Main Dashboard - Session Statistics =====
        String failedSql =
                "SELECT COUNT(*) cnt FROM public.ax_metrics_sqream_worker_log" +
                        " WHERE query_end_time BETWEEN CAST(:failedStart AS timestamp) AND CAST(:endTime AS timestamp)" +
                        "   AND (CAST(:hostname AS varchar) IS NULL OR hostname=CAST(:hostname AS varchar))" +
                        "   AND lower(COALESCE(query_termination_status,'')) ~ '(fail|error|kill|terminated)'";
        out.failedQueries1h = integer(jdbc.queryForMap(failedSql,p).get("cnt"));
        out.diskSpillBytes = null;
        out.orphanLocks = 0;
        // ===== 20260908 추가 끝 : Main Dashboard - Session Statistics =====

        // ===== 20260908 추가 시작 : Main Dashboard - Node Health / MIG 상태 =====
        String healthSql =
                "WITH gpu_peak AS (" +
                        " SELECT * FROM (" +
                        // ===== 20260909 추가 시작 : Node Health gr_engine 비율을 %로 변환 =====
                        "   SELECT nsi.hostname,dcm.gpu_id,dcm.mig_instance_id,(dcm.gr_engine_active_percent * 100.0) AS gr_engine_active_percent," +
                        // ===== 20260909 추가 끝 : Node Health gr_engine 비율을 %로 변환 =====
                        "          ROW_NUMBER() OVER (PARTITION BY nsi.hostname,dcm.gpu_id,dcm.mig_instance_id" +
                        "             ORDER BY dcm.gr_engine_active_percent DESC NULLS LAST,dcm.snapshot_time DESC NULLS LAST) rn" +
                        "   FROM public.ax_metrics_gpu_dcgmi_metric dcm JOIN public.ax_metrics_gpu_nvidia_smi_info nsi ON dcm.nvidia_smi_id=nsi.id" +
                        "   WHERE nsi.collect_time >= CAST(:startTime AS timestamp) - INTERVAL '10 minutes' AND nsi.collect_time <= CAST(:endTime AS timestamp) + INTERVAL '10 minutes'" +
                        "     AND dcm.gr_engine_active_percent IS NOT NULL" +
                        "     AND (CAST(:hostname AS varchar) IS NULL OR nsi.hostname=CAST(:hostname AS varchar))" +
                        "     AND (CAST(:gpuId AS integer) IS NULL OR dcm.gpu_id=CAST(:gpuId AS integer))" +
                        "     AND (CAST(:migInstanceId AS integer) IS NULL OR dcm.mig_instance_id=CAST(:migInstanceId AS integer))" +
                        " ) x WHERE rn=1) SELECT * FROM gpu_peak ORDER BY hostname,gpu_id,mig_instance_id";
        for (Map<String,Object> r : jdbc.queryForList(healthSql,p)) {
            MainDrilldownWorkerDto d = new MainDrilldownWorkerDto();
            d.node = str(r.get("hostname"));
            d.migInstanceId = integer(r.get("mig_instance_id"));
            d.worker = d.migInstanceId == null ? "MIG -" : "MIG " + d.migInstanceId;
            d.grEngineActivePercent = dbl(r.get("gr_engine_active_percent"));
            double v = d.grEngineActivePercent == null ? 0d : d.grEngineActivePercent;
            if (v >= 90d) { d.healthStatus="HEALTHY"; d.healthy=true; }
            else if (v >= 50d) { d.healthStatus="NOT_HEALTHY"; d.healthy=false; }
            else { d.healthStatus="UNHEALTHY"; d.healthy=false; }
            d.alert = null;
            out.workers.add(d);
        }
        // ===== 20260908 추가 끝 : Main Dashboard - Node Health / MIG 상태 =====
        return out;
    }

    // ===== 20260908 추가 시작 : Main Dashboard - MQuery Cluster Performance =====
    public List<MainPerformancePointDto> findPerformance(LocalDateTime startTime, LocalDateTime endTime,
                                                         String hostname, Integer gpuId, Integer migInstanceId) {
        MapSqlParameterSource p = mainParams(startTime,endTime,hostname,gpuId,migInstanceId);
        String sql = mQueryCte() +
                "SELECT query_start_time,hostname,peak_cpu_usage_percent,peak_memory_usage_percent,peak_disk_usage_percent," +
                "       CASE WHEN COALESCE(memory_total_mib,0)>0 THEN memory_used_mib*100.0/memory_total_mib END gpu_memory_pct" +
                " FROM mquery ORDER BY query_start_time,hostname";
        List<MainPerformancePointDto> out = new ArrayList<>();
        for (Map<String,Object> r : jdbc.queryForList(sql,p)) {
            MainPerformancePointDto d = new MainPerformancePointDto();
            d.collectTime = timeText(r.get("query_start_time"));
            d.node = str(r.get("hostname"));
            d.cpuUsagePercent = dbl(r.get("peak_cpu_usage_percent"));
            d.ramUsagePercent = dbl(r.get("peak_memory_usage_percent"));
            d.diskUsagePercent = dbl(r.get("peak_disk_usage_percent"));
            d.gpuUsagePercent = dbl(r.get("gpu_memory_pct"));
            out.add(d);
        }
        return out;
    }
    // ===== 20260908 추가 끝 : Main Dashboard - MQuery Cluster Performance =====


    // ===== 20260924 추가 시작 : Overview 하단 Table Chunk =====
    public List<MainTableChunkDto> findTableChunks(LocalDateTime startTime, LocalDateTime endTime, String hostname) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("startTime", ts(startTime))
                .addValue("endTime", ts(endTime));

        // ===== 20260925 추가 시작 : Table Chunk 동일 테이블 snapshot 중복 제거 =====
        // 조회기간 안에서 hostname + table_id 별 가장 최신 collect_time 1건만 화면에 내려준다.
        StringBuilder sql = new StringBuilder(
                "SELECT * FROM ( " +
                " SELECT DISTINCT ON (hostname, table_id) hostname, table_id, database_name, schema_name, table_name, " +
                "       compressed_table_size_byte, uncompressed_table_size_byte, savings_rate, compression_ratio, " +
                "       pct_90_100, pct_80_90, pct_70_80, pct_60_70, pct_50_60, pct_40_50, " +
                "       pct_30_40, pct_20_30, pct_10_20, pct_0_10, " +
                "       no_deletion_cnt, some_deletion_cnt, all_deletion_cnt, collect_time " +
                "  FROM public.ax_metrics_sqream_chunk " +
                " WHERE collect_time BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp) ");

        if (hostname != null && !hostname.isBlank()) {
            sql.append(" AND hostname = :hostname ");
            p.addValue("hostname", hostname);
        }
        sql.append(" ORDER BY hostname, table_id, collect_time DESC ");
        sql.append(") latest_chunk ORDER BY uncompressed_table_size_byte DESC NULLS LAST, collect_time DESC ");
        // ===== 20260925 추가 끝 : Table Chunk 동일 테이블 snapshot 중복 제거 =====

        List<MainTableChunkDto> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(sql.toString(), p)) {
            MainTableChunkDto d = new MainTableChunkDto();
            d.hostname = str(r.get("hostname"));
            d.tableId = lng(r.get("table_id"));
            d.databaseName = str(r.get("database_name"));
            d.schemaName = str(r.get("schema_name"));
            d.tableName = str(r.get("table_name"));
            d.compressedTableSizeByte = lng(r.get("compressed_table_size_byte"));
            d.uncompressedTableSizeByte = lng(r.get("uncompressed_table_size_byte"));
            d.savingsRate = dbl(r.get("savings_rate"));
            d.compressionRatio = dbl(r.get("compression_ratio"));
            d.pct90100 = lng(r.get("pct_90_100"));
            d.pct8090 = lng(r.get("pct_80_90"));
            d.pct7080 = lng(r.get("pct_70_80"));
            d.pct6070 = lng(r.get("pct_60_70"));
            d.pct5060 = lng(r.get("pct_50_60"));
            d.pct4050 = lng(r.get("pct_40_50"));
            d.pct3040 = lng(r.get("pct_30_40"));
            d.pct2030 = lng(r.get("pct_20_30"));
            d.pct1020 = lng(r.get("pct_10_20"));
            d.pct010 = lng(r.get("pct_0_10"));
            d.pct090 = nz(d.pct010) + nz(d.pct1020) + nz(d.pct2030) + nz(d.pct3040)
                    + nz(d.pct4050) + nz(d.pct5060) + nz(d.pct6070) + nz(d.pct7080) + nz(d.pct8090);
            d.noDeletionCnt = lng(r.get("no_deletion_cnt"));
            d.someDeletionCnt = lng(r.get("some_deletion_cnt"));
            d.allDeletionCnt = lng(r.get("all_deletion_cnt"));
            boolean deletion = nz(d.noDeletionCnt) + nz(d.someDeletionCnt) + nz(d.allDeletionCnt) > 0L;
            d.deletionCount = deletion ? "YES" : "NO";
            d.rechunk = d.deletionCount;
            d.needsRechunk = d.deletionCount;
            d.collectTime = timeText(r.get("collect_time"));
            out.add(d);
        }
        return out;
    }

    private long nz(Long value) {
        return value == null ? 0L : value;
    }
    // ===== 20260924 추가 끝 : Overview 하단 Table Chunk =====

    // ===== 20260924 추가 시작 : Overview 하단 Internal Runtime Error =====
    public List<MainInternalErrorPointDto> findInternalErrors(LocalDateTime startTime, LocalDateTime endTime, String hostname) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("startTime", ts(startTime))
                .addValue("endTime", ts(endTime));

        StringBuilder sql = new StringBuilder(
                "SELECT hostname, instance_id, statement_id, connection_id, query_end_time, statement, " +
                "       message_type_id, message " +
                "  FROM public.ax_metrics_sqream_worker_log " +
                " WHERE query_end_time IS NOT NULL " +
                "   AND query_end_time BETWEEN CAST(:startTime AS timestamp) AND CAST(:endTime AS timestamp) ");

        if (hostname != null && !hostname.isBlank()) {
            sql.append(" AND hostname = :hostname ");
            p.addValue("hostname", hostname);
        }
        sql.append(" ORDER BY CASE WHEN CAST(message_type_id AS varchar) IN ('20','21','500','1010') THEN 0 ELSE 1 END, " +
                "query_end_time ASC ");

        List<MainInternalErrorPointDto> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(sql.toString(), p)) {
            MainInternalErrorPointDto d = new MainInternalErrorPointDto();
            d.hostname = str(r.get("hostname"));
            d.instanceId = str(r.get("instance_id"));
            d.statementId = lng(r.get("statement_id"));
            d.connectionId = lng(r.get("connection_id"));
            d.queryEndTime = timeText(r.get("query_end_time"));
            d.statement = str(r.get("statement"));
            d.messageTypeId = str(r.get("message_type_id"));
            d.message = str(r.get("message"));
            d.errorType = "20".equals(d.messageTypeId) || "21".equals(d.messageTypeId)
                    || "500".equals(d.messageTypeId) || "1010".equals(d.messageTypeId);
            out.add(d);
        }
        return out;
    }
    // ===== 20260924 추가 끝 : Overview 하단 Internal Runtime Error =====

}