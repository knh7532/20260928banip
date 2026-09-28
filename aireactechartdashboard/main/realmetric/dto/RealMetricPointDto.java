package com.apptomo.v4.aireactechartdashboard.main.realmetric.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

// 20260916 추가: hostname + gpu_id + 시간별 GI 평균 GPU 메트릭
@Getter
@AllArgsConstructor
public class RealMetricPointDto {
    private String collectTime;
    private String hostname;
    private Integer gpuId;
    private String worker;
    private Double gpuUtilPercent;
    private Double memoryUsedGb;
    private Double memoryTotalGb;
    private Double memoryPct;
    private Double temperatureC;
    private Double powerUsageW;
}
