package com.apptomo.v4.aireactechartdashboard.querydashboard.service;

import com.apptomo.v4.aireactechartdashboard.querydashboard.dto.LogMonitoringDto;
import com.apptomo.v4.aireactechartdashboard.querydashboard.dto.QueryAnalyticsDto;
import com.apptomo.v4.aireactechartdashboard.querydashboard.dto.QueryGroupDetailDto;
import com.apptomo.v4.aireactechartdashboard.querydashboard.repository.QueryAnalyticsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

// 20260928 추가
@Service
@RequiredArgsConstructor
public class QueryAnalyticsService {

    private final QueryAnalyticsRepository repo;

    private static final DateTimeFormatter F =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public QueryAnalyticsDto analytics(
            String startTime,
            String endTime,
            String hostname,
            String worker,
            int page,
            int size
    ) {
        return repo.find(
                LocalDateTime.parse(startTime, F),
                LocalDateTime.parse(endTime, F),
                hostname,
                worker,
                Math.max(0, page),
                Math.min(100, Math.max(1, size))
        );
    }

    // 20260928 추가 - Log Monitoring 조회
    public LogMonitoringDto logs(
            String startTime,
            String endTime,
            String hostname,
            String worker,
            String level,
            String search,
            int page,
            int size
    ) {
        return repo.findLogs(
                LocalDateTime.parse(startTime, F),
                LocalDateTime.parse(endTime, F),
                hostname,
                worker,
                level,
                search,
                Math.max(0, page),
                Math.min(100, Math.max(1, size))
        );
    }

    // 20260928 추가 : Summary 선택 상세 조회. 리소스 X축은 상단 조회범위가 아니라 실제 Query 실행시간 기준
    public QueryGroupDetailDto groupDetail(String startTime,String endTime,String sqlType,String databaseName,String hostname,String worker) {
        return repo.findGroupDetail(LocalDateTime.parse(startTime,F),LocalDateTime.parse(endTime,F),sqlType,databaseName,hostname,worker);
    }
}
