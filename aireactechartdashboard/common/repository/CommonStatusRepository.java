package com.apptomo.v4.aireactechartdashboard.common.repository;

import com.apptomo.v4.aireactechartdashboard.common.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

// ===== 20260916 추가 시작 : 공통 서버 상태 PostgreSQL 조회 =====
@Repository
@RequiredArgsConstructor
public class CommonStatusRepository {
 private final NamedParameterJdbcTemplate jdbc;
 public List<CommonServerStatusDto> find(LocalDateTime endTime) {
   String sql = "WITH latest AS (" +
     " SELECT DISTINCT ON (hostname) hostname, collect_time FROM public.ax_metrics_gpu_nvidia_smi_info" +
     " WHERE collect_time <= :endTime ORDER BY hostname, collect_time DESC" +
     "), gpu AS (" +
     " SELECT n.hostname, COUNT(DISTINCT d.gpu_id) gpu_total," +
     " COUNT(DISTINCT (d.gpu_id::text || ':' || COALESCE(d.gi_id::text,''))) mig_total," +
     " COUNT(DISTINCT CASE WHEN COALESCE(d.gr_engine_active_percent,0)>0 THEN (d.gpu_id::text || ':' || COALESCE(d.gi_id::text,'')) END) gpu_busy" +
     " FROM public.ax_metrics_gpu_dcgmi_metric d JOIN public.ax_metrics_gpu_nvidia_smi_info n ON n.id=d.nvidia_smi_id" +
     " WHERE COALESCE(d.snapshot_time,n.collect_time) BETWEEN :fromTime AND :endTime GROUP BY n.hostname" +
     ") SELECT l.hostname,l.collect_time,COALESCE(g.gpu_total,0) gpu_total,COALESCE(g.mig_total,0) mig_total,COALESCE(g.gpu_busy,0) gpu_busy" +
     " FROM latest l LEFT JOIN gpu g ON g.hostname=l.hostname ORDER BY l.hostname";
   MapSqlParameterSource p = new MapSqlParameterSource().addValue("endTime", Timestamp.valueOf(endTime))
       .addValue("fromTime", Timestamp.valueOf(endTime.minusMinutes(30)));
   List<CommonServerStatusDto> out = new ArrayList<>();
   for (Map<String,Object> r: jdbc.queryForList(sql,p)) {
     CommonServerStatusDto d = new CommonServerStatusDto();
     d.hostname = String.valueOf(r.get("hostname"));
     d.gpu_total = ((Number)r.get("gpu_total")).intValue(); d.mig_total=((Number)r.get("mig_total")).intValue(); d.gpu_busy=((Number)r.get("gpu_busy")).intValue();
     Timestamp ct=(Timestamp)r.get("collect_time"); d.last_collect_time=ct==null?null:ct.toLocalDateTime().toString();
     d.online=ct!=null && !ct.toLocalDateTime().isBefore(endTime.minusMinutes(5));
     out.add(d);
   }
   return out;
 }
}
// ===== 20260916 추가 끝 : 공통 서버 상태 PostgreSQL 조회 =====
