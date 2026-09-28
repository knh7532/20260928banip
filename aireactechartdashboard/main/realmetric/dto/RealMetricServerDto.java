package com.apptomo.v4.aireactechartdashboard.main.realmetric.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

// 20260916 추가: 우측 서버 카드 + 좌측 hostname 평균 점선용 DTO
@Getter
@AllArgsConstructor
public class RealMetricServerDto {
    private String hostname;
    private Integer gpuCount;
    private Integer workerCount;
    private Double gpuUtilPercent;
    private Double memoryUsedGb;
    private Double memoryTotalGb;
    private Double memoryPct;
    private Double temperatureC;
    private Double powerUsageW;
}
