package com.apptomo.v4.aireactechartdashboard.main.realmetric.repository;

import com.apptomo.v4.aireactechartdashboard.main.realmetric.dto.RealMetricPointDto;
import com.apptomo.v4.aireactechartdashboard.main.realmetric.dto.RealMetricServerDto;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

// 20260916 추가: nvidia_smi.id = dcgmi.nvidia_smi_id JOIN 기반 실시간 GPU 메트릭
@Repository
@RequiredArgsConstructor
public class RealMetricRepository {
    private final NamedParameterJdbcTemplate jdbc;

    private static final String JOIN =
        " FROM public.ax_metrics_gpu_nvidia_smi_info n " +
        " JOIN public.ax_metrics_gpu_dcgmi_metric d ON d.nvidia_smi_id = n.id ";

    public List<RealMetricPointDto> findPoints(LocalDateTime startTime, LocalDateTime endTime,
                                                String hostname, Integer gpuId, Integer giId) {
        // 20260916 추가: GPU DDL의 수집시각 컬럼은 snapshot_time이므로 API에서는 collectTime으로 alias한다.
        // 같은 hostname/gpu_id/snapshot_time에 존재하는 GI 2건은 AVG로 한 점으로 합친다.
        String sql =
            "SELECT d.snapshot_time AS collect_time, n.hostname, d.gpu_id, " +
            " string_agg(DISTINCT ('sqream' || CASE WHEN n.hostname ~ 'gpu[0-9]+$' THEN substring(n.hostname from '([0-9])$') ELSE '4' END || d.gpu_id::text || d.gi_id::text), '/' ORDER BY ('sqream' || CASE WHEN n.hostname ~ 'gpu[0-9]+$' THEN substring(n.hostname from '([0-9])$') ELSE '4' END || d.gpu_id::text || d.gi_id::text)) AS worker, " +
            " AVG(d.gr_engine_active_percent) * 100.0 AS gpu_util, " +
            " AVG(d.memory_used_mib) / 1024.0 AS memory_used_gb, " +
            " AVG(d.memory_total_mib) / 1024.0 AS memory_total_gb, " +
            " CASE WHEN AVG(d.memory_total_mib) > 0 " +
            "      THEN AVG(d.memory_used_mib) * 100.0 / AVG(d.memory_total_mib) END AS memory_pct, " +
            " AVG(d.temperature_c) AS temperature_c, AVG(d.power_usage_w) AS power_usage_w " + JOIN +
            " WHERE d.snapshot_time >= :startTime AND d.snapshot_time <= :endTime " +
            " AND n.hostname IS NOT NULL AND d.gpu_id IS NOT NULL " +
            (hasText(hostname) ? " AND n.hostname = :hostname " : "") +
            (gpuId != null ? " AND d.gpu_id = :gpuId " : "") +
            /* 20260916 추가: GPU 4개 그래프는 Worker/GI 선택과 무관하게 Node+GPU 단위 GI 평균 */
            " GROUP BY d.snapshot_time, n.hostname, d.gpu_id " +
            " ORDER BY d.snapshot_time ASC, n.hostname ASC, d.gpu_id ASC";

        MapSqlParameterSource p = params(startTime, endTime, hostname, gpuId, giId);
        return jdbc.query(sql, p, (rs, rowNum) -> new RealMetricPointDto(
            rs.getTimestamp("collect_time").toLocalDateTime().toString(), rs.getString("hostname"),
            rs.getInt("gpu_id"), rs.getString("worker"), nullableDouble(rs, "gpu_util"), nullableDouble(rs, "memory_used_gb"),
            nullableDouble(rs, "memory_total_gb"), nullableDouble(rs, "memory_pct"),
            nullableDouble(rs, "temperature_c"), nullableDouble(rs, "power_usage_w")
        ));
    }

    public List<RealMetricServerDto> findServers(LocalDateTime startTime, LocalDateTime endTime,
                                                  String hostname, Integer gpuId, Integer giId) {
        // 20260916 추가: 우측 카드의 값은 hostname 기준 조회구간 전체 평균.
        // gpuCount=distinct gpu_id, workerCount=distinct(gpu_id,gi_id) 조합.
        String sql =
            "SELECT n.hostname, COUNT(DISTINCT d.gpu_id)::int AS gpu_count, " +
            " COUNT(DISTINCT (d.gpu_id::text || ':' || d.gi_id::text))::int AS worker_count, " +
            " string_agg(DISTINCT ('sqream' || CASE WHEN n.hostname ~ 'gpu[0-9]+$' THEN substring(n.hostname from '([0-9])$') ELSE '4' END || d.gpu_id::text || d.gi_id::text), '/' ORDER BY ('sqream' || CASE WHEN n.hostname ~ 'gpu[0-9]+$' THEN substring(n.hostname from '([0-9])$') ELSE '4' END || d.gpu_id::text || d.gi_id::text)) AS worker, " +
            " AVG(d.gr_engine_active_percent) * 100.0 AS gpu_util, " +
            " AVG(d.memory_used_mib) / 1024.0 AS memory_used_gb, " +
            " AVG(d.memory_total_mib) / 1024.0 AS memory_total_gb, " +
            " CASE WHEN AVG(d.memory_total_mib) > 0 " +
            "      THEN AVG(d.memory_used_mib) * 100.0 / AVG(d.memory_total_mib) END AS memory_pct, " +
            " AVG(d.temperature_c) AS temperature_c, AVG(d.power_usage_w) AS power_usage_w " + JOIN +
            " WHERE d.snapshot_time >= :startTime AND d.snapshot_time <= :endTime " +
            " AND n.hostname IS NOT NULL " +
            (hasText(hostname) ? " AND n.hostname = :hostname " : "") +
            (gpuId != null ? " AND d.gpu_id = :gpuId " : "") +
            /* 20260916 추가: 우측 GPU 요약도 Worker/GI 필터 미적용 */
            " GROUP BY n.hostname ORDER BY n.hostname ASC";

        MapSqlParameterSource p = params(startTime, endTime, hostname, gpuId, giId);
        return jdbc.query(sql, p, (rs, rowNum) -> new RealMetricServerDto(
            rs.getString("hostname"), rs.getInt("gpu_count"), rs.getInt("worker_count"),
            nullableDouble(rs, "gpu_util"), nullableDouble(rs, "memory_used_gb"), nullableDouble(rs, "memory_total_gb"),
            nullableDouble(rs, "memory_pct"), nullableDouble(rs, "temperature_c"), nullableDouble(rs, "power_usage_w")
        ));
    }

    private MapSqlParameterSource params(LocalDateTime startTime, LocalDateTime endTime, String hostname, Integer gpuId, Integer giId) {
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("startTime", Timestamp.valueOf(startTime)).addValue("endTime", Timestamp.valueOf(endTime));
        if (hasText(hostname)) p.addValue("hostname", hostname);
        if (gpuId != null) p.addValue("gpuId", gpuId);
        if (giId != null) p.addValue("giId", giId);
        return p;
    }

    private Double nullableDouble(java.sql.ResultSet rs, String name) throws java.sql.SQLException {
        double v = rs.getDouble(name); return rs.wasNull() ? null : v;
    }
    private boolean hasText(String s) { return s != null && !s.trim().isEmpty(); }
}
