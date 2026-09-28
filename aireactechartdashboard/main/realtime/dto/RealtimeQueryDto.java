package com.apptomo.v4.aireactechartdashboard.main.realtime.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

// ===== 20260916 추가 시작 : 실시간 Query + Node/GPU 리소스 DTO =====
@Getter
@AllArgsConstructor
public class RealtimeQueryDto {
    private String hostname;
    private String hostip;
    private Integer serverPort;
    private String instanceId;
    private String service;
    private Long connectionId;
    private Long statementId;
    private String statementStartTime;
    private String statementStatus;
    private Long statementStatusTimeSeconds;
    private String classifiedState;
    private Boolean longRunning;
    private Integer gpuId;
    private Integer giId;
    private Double cpuUsagePercent;
    private Long memoryUsedBytes;
    private Long memoryTotalBytes;
    private Double memoryUsagePercent;
    private Long diskUsedBytes;
    private Long diskTotalBytes;
    private Double diskUsagePercent;
    private Double gpuMemoryUsedMib;
    private Double gpuMemoryTotalMib;
    private Double gpuMemoryUsagePercent;
    private Double grEngineActivePercent;
}
// ===== 20260916 추가 끝 : 실시간 Query + Node/GPU 리소스 DTO =====
