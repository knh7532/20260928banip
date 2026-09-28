package com.apptomo.v4.aireactechartdashboard.querydashboard.controller;
import com.apptomo.v4.aireactechartdashboard.querydashboard.dto.QueryAnalyticsDto;
import com.apptomo.v4.aireactechartdashboard.querydashboard.dto.LogMonitoringDto;
import com.apptomo.v4.aireactechartdashboard.querydashboard.dto.QueryGroupDetailDto;
import com.apptomo.v4.aireactechartdashboard.querydashboard.service.QueryAnalyticsService;
import org.springframework.web.bind.annotation.*;
import lombok.RequiredArgsConstructor;
// 20260928 추가
@RestController @RequiredArgsConstructor @RequestMapping("/api/aireactechartdashboard/query")
public class QueryAnalyticsController { private final QueryAnalyticsService service;
 @GetMapping("/analytics") public QueryAnalyticsDto analytics(@RequestParam String startTime,@RequestParam String endTime,@RequestParam(defaultValue="") String hostname,@RequestParam(defaultValue="") String worker,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){ return service.analytics(startTime,endTime,hostname,worker,page,size); }
 // 20260928 추가 : /logs Worker Log 실데이터 + 전체 페이징
 @GetMapping("/logs") public LogMonitoringDto logs(@RequestParam String startTime,@RequestParam String endTime,@RequestParam(defaultValue="") String hostname,@RequestParam(defaultValue="") String worker,@RequestParam(defaultValue="") String level,@RequestParam(defaultValue="") String search,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){ return service.logs(startTime,endTime,hostname,worker,level,search,page,size); }
 // 20260928 추가 : Summary 행 선택 - 해당 그룹 Query 상세/실행시점 리소스
 @GetMapping("/group-detail") public QueryGroupDetailDto groupDetail(@RequestParam String startTime,@RequestParam String endTime,@RequestParam String sqlType,@RequestParam String databaseName,@RequestParam(defaultValue="") String hostname,@RequestParam(defaultValue="") String worker){ return service.groupDetail(startTime,endTime,sqlType,databaseName,hostname,worker); }
}
