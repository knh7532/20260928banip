package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;

// 20260928 추가 - Log Monitoring 시간대별 ERROR/WARNING/INFO 꺾은선 데이터
public class LogDistributionPointDto {
    public String time;
    public long errors;
    public long warnings;
    public long info;
}
