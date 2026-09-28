package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;
// 20260928 추가 : SQL Type/DB 그룹 선택 시 실제 실행구간 리소스 시계열
public class QueryResourcePointDto {
    public String collectTime;
    public Double gpuUsagePercent,cpuUsagePercent,memoryUsagePercent,diskUsagePercent;
}
