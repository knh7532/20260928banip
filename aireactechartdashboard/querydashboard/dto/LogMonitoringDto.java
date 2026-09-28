package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;

import java.util.ArrayList;
import java.util.List;

// 20260928 추가 : Worker Log 기반 Log Monitoring 응답
public class LogMonitoringDto {
    public long totalEntries;
    public long errors;
    public long warnings;
    public long info;
    public long totalElements;
    public int page;
    public int size;
    public int totalPages;
    // 20260928 추가 - 시간대별 로그 발생 건수
    public List<LogDistributionPointDto> distribution = new ArrayList<>();
    public List<LogRowDto> logs = new ArrayList<>();
}
