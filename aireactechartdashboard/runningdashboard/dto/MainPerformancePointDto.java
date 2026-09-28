package com.apptomo.v4.aireactechartdashboard.runningdashboard.dto;

// ===== 20260925 추가 시작 : Drilldown Cluster Performance Worker/Query 상세 =====
public class MainPerformancePointDto {
    public String collectTime, node, worker, connectionId, statementId, status;
    public Integer gpuId, giId;
    public Double cpuUsagePercent, ramUsagePercent, diskUsagePercent, gpuUsagePercent,
            gpuMemoryUsagePercent, temperatureC, powerUsageW;
}
// ===== 20260925 추가 끝 : Drilldown Cluster Performance Worker/Query 상세 =====
