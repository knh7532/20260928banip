package com.apptomo.v4.aireactechartdashboard.main.dto;
public class MainOverviewQueryTimelineDto {
    public String collectTime, hostname, globalUuid, connectionId, statementId, queryIdentifier, userName, queryStart, queryEnd, classifiedState;
    // ===== 20260916 추가 시작 : Worker Log 타임라인 필드 =====
    public Integer gpuId, giId;
    public String serviceName;
    public Long queryExecutionTimeMs;
    // ===== 20260916 추가 끝 : Worker Log 타임라인 필드 =====
    public Double executionTimeSec, totalRuntimeSec, elapsedSecondsSinceStart;
}
