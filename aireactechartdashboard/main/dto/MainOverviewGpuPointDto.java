package com.apptomo.v4.aireactechartdashboard.main.dto;
public class MainOverviewGpuPointDto {
    public String id, nvidiaSmiId, snapshotTime, hostname, gpuUuid, migUuid, deviceName;
    public Integer gpuId, giId, ciId, migInstanceId;
    public Double temperatureC, powerUsageW, memoryUsedMib, memoryTotalMib, gpuUtilPercent, grEngineActivePercent, smActivePercent;
}
