package com.apptomo.v4.aireactechartdashboard.main.repository;

import com.apptomo.v4.aireactechartdashboard.main.dto.WorkerFilterOption;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class AiReactEchartFilterRepository {

    private final NamedParameterJdbcTemplate jdbc;

    // ===== 20260916 추가 시작 : 상단 Node/GPU/Worker 필터를 Worker Log 기준으로 통일 =====
    public List<String> findNodes() {
        String sql = "SELECT DISTINCT hostname FROM public.ax_metrics_sqream_worker_log " +
                     "WHERE hostname IS NOT NULL AND btrim(hostname) <> '' ORDER BY hostname ASC";
        return jdbc.queryForList(sql, new MapSqlParameterSource(), String.class);
    }

    public List<Integer> findGpus(String hostname) {
        String sql = "SELECT DISTINCT gpu_id FROM public.ax_metrics_sqream_worker_log " +
                     "WHERE gpu_id IS NOT NULL " +
                     (hasText(hostname) ? " AND hostname = :hostname " : "") +
                     " ORDER BY gpu_id ASC";
        MapSqlParameterSource p = new MapSqlParameterSource();
        if (hasText(hostname)) p.addValue("hostname", hostname);
        return jdbc.queryForList(sql, p, Integer.class);
    }

    public List<WorkerFilterOption> findWorkers(String hostname, Integer gpuId) {
        // Worker = sqream + hostname 마지막 숫자 + gpu_id + gi_id
        String workerExpr =
            "('sqream' || CASE WHEN hostname ~ '[0-9]+$' " +
            "THEN substring(hostname from '([0-9])$') ELSE '4' END " +
            "|| gpu_id::text || gi_id::text)";

        String sql = "SELECT DISTINCT " + workerExpr + " AS worker_name, hostname, gpu_id, gi_id " +
                     "FROM public.ax_metrics_sqream_worker_log " +
                     "WHERE hostname IS NOT NULL AND gpu_id IS NOT NULL AND gi_id IS NOT NULL " +
                     (hasText(hostname) ? " AND hostname = :hostname " : "") +
                     (gpuId != null ? " AND gpu_id = :gpuId " : "") +
                     " ORDER BY worker_name ASC, hostname ASC, gpu_id ASC, gi_id ASC";

        MapSqlParameterSource p = new MapSqlParameterSource();
        if (hasText(hostname)) p.addValue("hostname", hostname);
        if (gpuId != null) p.addValue("gpuId", gpuId);

        return jdbc.query(sql, p, (rs, rowNum) -> new WorkerFilterOption(
            rs.getString("worker_name"), rs.getString("hostname"), rs.getInt("gpu_id"), rs.getInt("gi_id")
        ));
    }
    // ===== 20260916 추가 끝 : 상단 Node/GPU/Worker 필터를 Worker Log 기준으로 통일 =====

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
