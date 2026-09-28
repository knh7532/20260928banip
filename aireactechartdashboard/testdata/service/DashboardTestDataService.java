package com.apptomo.v4.aireactechartdashboard.testdata.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 20260925 추가: 기존 spring.datasource / NamedParameterJdbcTemplate만 사용하는 로컬 테스트 데이터 생성기.
 * application.yml, profile, build.gradle 변경 없음.
 */
@Service
@RequiredArgsConstructor
public class DashboardTestDataService {
    private final NamedParameterJdbcTemplate jdbc;
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private final AtomicLong tick = new AtomicLong(0);
    private volatile ScheduledFuture<?> realtimeTask;

    public synchronized Map<String, Object> startRealtime(long intervalSeconds) {
        if (intervalSeconds < 1) throw new IllegalArgumentException("intervalSeconds는 1 이상이어야 합니다.");
        if (realtimeTask != null && !realtimeTask.isDone()) return result("alreadyRunning", 0);
        realtimeTask = executor.scheduleWithFixedDelay(() -> {
            try { createRealtimeSnapshot(); } catch (Exception ignored) { }
        }, 0, intervalSeconds, TimeUnit.SECONDS);
        Map<String, Object> r = result("started", 0);
        r.put("intervalSeconds", intervalSeconds);
        return r;
    }

    public synchronized Map<String, Object> stopRealtime() {
        if (realtimeTask != null) realtimeTask.cancel(false);
        realtimeTask = null;
        return result("stopped", 0);
    }

    public Map<String, Object> createRealtimeSnapshot() {
        long n = tick.incrementAndGet();
        MapSqlParameterSource p = new MapSqlParameterSource("tick", n);

        // 최신 실데이터 snapshot을 원형으로 사용. 4 tick마다 일부 Query를 제외해 종료/변동 상황을 재현한다.
        String serverSql =
            "WITH base AS (" +
            " SELECT DISTINCT ON (hostname, connection_id, statement_id) *" +
            " FROM public.ax_metrics_sqream_server_status" +
            " WHERE server_id NOT LIKE 'LOCAL_TEST_%'" +
            " ORDER BY hostname, connection_id, statement_id, collect_time DESC" +
            "), picked AS (" +
            " SELECT b.*, row_number() over(order by hostname, connection_id, statement_id) rn FROM base b" +
            ")" +
            " INSERT INTO public.ax_metrics_sqream_server_status" +
            " (id,server_id,collect_time,hostname,hostip,global_uuid,service,instance_id,connection_id,server_ip,server_port,database_name,user_name,client_ip,statement_id,statement,statement_start_time,statement_status,statement_status_start,select_service,elapsed_seconds,elapsed_millis,classified_state,is_long_running,create_dt,update_dt,user_id,sql_type,sql_params)" +
            " SELECT md5(random()::text || clock_timestamp()::text || rn::text)::uuid," +
            " 'LOCAL_TEST_RT_' || server_id, clock_timestamp(), hostname, hostip, global_uuid, service, instance_id," +
            " connection_id, server_ip, server_port, database_name, user_name, client_ip, statement_id, statement," +
            " clock_timestamp() - make_interval(secs => GREATEST(COALESCE(elapsed_seconds,0) + (:tick * 5),0)::int)," +
            " statement_status, clock_timestamp(), select_service," +
            " COALESCE(elapsed_seconds,0) + (:tick * 5), (COALESCE(elapsed_seconds,0) + (:tick * 5))*1000," +
            " classified_state, is_long_running, clock_timestamp(), clock_timestamp(), user_id, sql_type, sql_params" +
            " FROM picked WHERE (:tick % 4 <> 0 OR rn % 5 <> 0)";
        int serverRows = jdbc.update(serverSql, p);

        String nodeSql =
            "WITH base AS (SELECT DISTINCT ON (hostname) * FROM public.ax_metrics_node WHERE server_id NOT LIKE 'LOCAL_TEST_%' ORDER BY hostname, collect_time DESC)" +
            " INSERT INTO public.ax_metrics_node" +
            " (id,server_id,collect_time,hostname,hostip,global_uuid,cpu_usage_percent,cpu_user_percent,cpu_system_percent,memory_total_bytes,memory_used_bytes,memory_usage_percent,disk_total_bytes,disk_used_bytes,disk_usage_percent,uptime_seconds,load_avg_1m,load_avg_5m,load_avg_15m,success,error_message,create_dt,update_dt)" +
            " SELECT md5(random()::text || clock_timestamp()::text || hostname)::uuid,'LOCAL_TEST_RT_'||server_id,clock_timestamp(),hostname,hostip,global_uuid," +
            " LEAST(100,GREATEST(0,COALESCE(cpu_usage_percent,0) + ((random()-0.5)*12))),cpu_user_percent,cpu_system_percent,memory_total_bytes,memory_used_bytes,memory_usage_percent,disk_total_bytes,disk_used_bytes,disk_usage_percent,uptime_seconds + (:tick*5),load_avg_1m,load_avg_5m,load_avg_15m,success,error_message,clock_timestamp(),clock_timestamp() FROM base";
        int nodeRows = jdbc.update(nodeSql, p);

        // DCGMI는 기존 nvidia_smi_id를 유지하고 metric snapshot만 현재시각으로 복제한다.
        String gpuSql =
            "WITH base AS (SELECT DISTINCT ON (nvidia_smi_id,gpu_id,COALESCE(gi_id,-1)) * FROM public.ax_metrics_gpu_dcgmi_metric ORDER BY nvidia_smi_id,gpu_id,COALESCE(gi_id,-1),snapshot_time DESC)" +
            " INSERT INTO public.ax_metrics_gpu_dcgmi_metric" +
            " (id,nvidia_smi_id,snapshot_time,gpu_id,gi_id,ci_id,entity_type,uuid,gpu_uuid,mig_uuid,mig_instance_id,device_name,driver_version,persistence_mode,sm_clock_mhz,mem_clock_mhz,temperature_c,power_usage_w,clock_throttle_reasons,memory_used_mib,memory_total_mib,bar1_used_mib,bar1_total_mib,gpu_util_percent,mem_copy_util_percent,gr_engine_active_percent,sm_active_percent,sm_occupancy_percent,tensor_core_active_percent,dram_active_percent,enc_util_percent,dec_util_percent,pcie_bytes_transmitted,pcie_bytes_received,nvlink_bytes_transmitted,nvlink_bytes_received,xid_errors,ecc_sbe_volatile_total,ecc_dbe_volatile_total,ecc_sbe_aggregate_total,ecc_dbe_aggregate_total,gpu_util_samples,mem_util_samples,create_dt,update_dt)" +
            " SELECT md5(random()::text || clock_timestamp()::text || id::text)::uuid,nvidia_smi_id,clock_timestamp(),gpu_id,gi_id,ci_id,entity_type,uuid,gpu_uuid,mig_uuid,mig_instance_id,device_name,driver_version,persistence_mode,sm_clock_mhz,mem_clock_mhz," +
            " GREATEST(20,COALESCE(temperature_c,30)+((random()-0.5)*4)),GREATEST(0,COALESCE(power_usage_w,0)+((random()-0.5)*10)),clock_throttle_reasons,memory_used_mib,memory_total_mib,bar1_used_mib,bar1_total_mib,gpu_util_percent,mem_copy_util_percent," +
            " LEAST(1,GREATEST(0,COALESCE(gr_engine_active_percent,0)+((random()-0.5)*0.10))),sm_active_percent,sm_occupancy_percent,tensor_core_active_percent,dram_active_percent,enc_util_percent,dec_util_percent,pcie_bytes_transmitted,pcie_bytes_received,nvlink_bytes_transmitted,nvlink_bytes_received,xid_errors,ecc_sbe_volatile_total,ecc_dbe_volatile_total,ecc_sbe_aggregate_total,ecc_dbe_aggregate_total,gpu_util_samples,mem_util_samples,clock_timestamp(),clock_timestamp() FROM base";
        int gpuRows = jdbc.update(gpuSql, new MapSqlParameterSource());

        Map<String, Object> r = result("snapshotCreated", serverRows + nodeRows + gpuRows);
        r.put("tick", n); r.put("serverStatusRows", serverRows); r.put("nodeRows", nodeRows); r.put("dcgmiRows", gpuRows);
        return r;
    }

    public Map<String, Object> generateBulkServerStatus(int count) {
        validateCount(count);
        String sql =
            "WITH base AS (SELECT * FROM public.ax_metrics_sqream_server_status WHERE server_id NOT LIKE 'LOCAL_TEST_%' ORDER BY collect_time DESC LIMIT 100)," +
            " b AS (SELECT *,row_number() over() rn,count(*) over() cnt FROM base), g AS (SELECT generate_series(1,:count) n)" +
            " INSERT INTO public.ax_metrics_sqream_server_status" +
            " (id,server_id,collect_time,hostname,hostip,global_uuid,service,instance_id,connection_id,server_ip,server_port,database_name,user_name,client_ip,statement_id,statement,statement_start_time,statement_status,statement_status_start,select_service,elapsed_seconds,elapsed_millis,classified_state,is_long_running,create_dt,update_dt,user_id,sql_type,sql_params)" +
            " SELECT md5('bulk-ss-'||g.n::text||clock_timestamp()::text)::uuid,'LOCAL_TEST_BULK_'||b.server_id," +
            " clock_timestamp()-(g.n % 604800)*interval '1 second',b.hostname,b.hostip,b.global_uuid,b.service,b.instance_id," +
            " b.connection_id+(g.n*1000),b.server_ip,b.server_port,b.database_name,b.user_name,b.client_ip,b.statement_id+(g.n*1000),b.statement," +
            " clock_timestamp()-(g.n % 604800)*interval '1 second'-COALESCE(b.elapsed_seconds,0)*interval '1 second',b.statement_status,clock_timestamp()-(g.n % 604800)*interval '1 second',b.select_service,b.elapsed_seconds,b.elapsed_millis,b.classified_state,b.is_long_running,clock_timestamp(),clock_timestamp(),b.user_id,b.sql_type,b.sql_params" +
            " FROM g JOIN b ON b.rn=((g.n-1)%b.cnt)+1";
        int rows = jdbc.update(sql, new MapSqlParameterSource("count", count));
        return result("bulkServerStatusCreated", rows);
    }

    public Map<String, Object> generateBulkNode(int count) {
        validateCount(count);
        String sql =
            "WITH base AS (SELECT * FROM public.ax_metrics_node WHERE server_id NOT LIKE 'LOCAL_TEST_%' ORDER BY collect_time DESC LIMIT 50)," +
            " b AS (SELECT *,row_number() over() rn,count(*) over() cnt FROM base), g AS (SELECT generate_series(1,:count) n)" +
            " INSERT INTO public.ax_metrics_node" +
            " (id,server_id,collect_time,hostname,hostip,global_uuid,cpu_usage_percent,cpu_user_percent,cpu_system_percent,memory_total_bytes,memory_used_bytes,memory_usage_percent,disk_total_bytes,disk_used_bytes,disk_usage_percent,uptime_seconds,load_avg_1m,load_avg_5m,load_avg_15m,success,error_message,create_dt,update_dt)" +
            " SELECT md5('bulk-node-'||g.n::text||clock_timestamp()::text)::uuid,'LOCAL_TEST_BULK_'||b.server_id,clock_timestamp()-(g.n%604800)*interval '1 second',b.hostname,b.hostip,b.global_uuid," +
            " LEAST(100,GREATEST(0,COALESCE(b.cpu_usage_percent,0)+((random()-0.5)*20))),b.cpu_user_percent,b.cpu_system_percent,b.memory_total_bytes,b.memory_used_bytes,b.memory_usage_percent,b.disk_total_bytes,b.disk_used_bytes,b.disk_usage_percent,b.uptime_seconds,b.load_avg_1m,b.load_avg_5m,b.load_avg_15m,b.success,b.error_message,clock_timestamp(),clock_timestamp()" +
            " FROM g JOIN b ON b.rn=((g.n-1)%b.cnt)+1";
        int rows = jdbc.update(sql, new MapSqlParameterSource("count", count));
        return result("bulkNodeCreated", rows);
    }

    public Map<String, Object> countTestData() {
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("serverStatusRealtime", count("public.ax_metrics_sqream_server_status", "server_id LIKE 'LOCAL_TEST_RT_%'"));
        r.put("serverStatusBulk", count("public.ax_metrics_sqream_server_status", "server_id LIKE 'LOCAL_TEST_BULK_%'"));
        r.put("nodeRealtime", count("public.ax_metrics_node", "server_id LIKE 'LOCAL_TEST_RT_%'"));
        r.put("nodeBulk", count("public.ax_metrics_node", "server_id LIKE 'LOCAL_TEST_BULK_%'"));
        return r;
    }

    public Map<String, Object> cleanup() {
        stopRealtime();
        int ss = jdbc.getJdbcTemplate().update("DELETE FROM public.ax_metrics_sqream_server_status WHERE server_id LIKE 'LOCAL_TEST_%'");
        int nd = jdbc.getJdbcTemplate().update("DELETE FROM public.ax_metrics_node WHERE server_id LIKE 'LOCAL_TEST_%'");
        // DCGMI는 server_id가 없으므로 자동 삭제하지 않는다. docs의 시간범위 cleanup SQL 사용.
        Map<String,Object> r = result("cleaned", ss + nd); r.put("serverStatusRows", ss); r.put("nodeRows", nd); return r;
    }

    private long count(String table, String where) { return jdbc.getJdbcTemplate().queryForObject("SELECT count(*) FROM "+table+" WHERE "+where, Long.class); }
    private void validateCount(int count) { if (count < 1 || count > 5_000_000) throw new IllegalArgumentException("count는 1~5,000,000 범위만 허용합니다."); }
    private Map<String,Object> result(String status, int rows) { Map<String,Object> r=new LinkedHashMap<>(); r.put("status",status); r.put("rows",rows); return r; }

    @PreDestroy public void shutdown() { stopRealtime(); executor.shutdownNow(); }
}
