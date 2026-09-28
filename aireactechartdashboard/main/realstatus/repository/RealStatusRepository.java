package com.apptomo.v4.aireactechartdashboard.main.realstatus.repository;

import com.apptomo.v4.aireactechartdashboard.main.realstatus.dto.RealStatusDto;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

// 20260928 추가 - Overview 상태카드는 server_status의 현재(latest) 상태 기준
@Repository
@RequiredArgsConstructor
public class RealStatusRepository {
    private final NamedParameterJdbcTemplate jdbc;

    // 20260928 추가 - 화면 조회기간과 무관하게 statement별 최신 상태를 집계
    public RealStatusDto countStatementStatuses(String startTime, String endTime, String hostname) {
        String sql =
            "WITH latest_status AS (" +
            " SELECT DISTINCT ON (server_id, connection_id, statement_id)" +
            "        server_id, hostname, connection_id, statement_id, statement_status, collect_time" +
            " FROM public.ax_metrics_sqream_server_status" +
            " WHERE statement_id IS NOT NULL" +
            (hasText(hostname) ? " AND hostname = ANY(string_to_array(:hostname, ','))" : "") +
            " ORDER BY server_id, connection_id, statement_id, collect_time DESC" +
            ") SELECT " +
            "count(*) FILTER (WHERE lower(btrim(COALESCE(statement_status,''))) = 'in queue') AS in_queue, " +
            "count(*) FILTER (WHERE lower(btrim(COALESCE(statement_status,''))) = 'preparing') AS preparing, " +
            "count(*) FILTER (WHERE lower(btrim(COALESCE(statement_status,''))) = 'initializing') AS initializing, " +
            "count(*) FILTER (WHERE lower(btrim(COALESCE(statement_status,''))) = 'executing') AS executing, " +
            "count(*) FILTER (WHERE lower(btrim(COALESCE(statement_status,''))) IN ('stopped','stopping')) AS stopped " +
            "FROM latest_status";
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (hasText(hostname)) params.addValue("hostname", hostname);
        return jdbc.queryForObject(sql, params, (rs, rowNum) -> new RealStatusDto(
            rs.getLong("in_queue"), rs.getLong("preparing"), rs.getLong("initializing"),
            rs.getLong("executing"), rs.getLong("stopped")
        ));
    }
    private boolean hasText(String value) { return value != null && !value.trim().isEmpty(); }
}
