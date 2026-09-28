package com.apptomo.v4.aireactechartdashboard.main.dto;
public class MainDrilldownQueryDto {
 public String connectionId, statementId, user, node, worker, service, status, qid, qidTags;
 public Double elapsed, progress, startEpoch, peakCpuUsagePercent, peakMemoryUsagePercent, peakDiskUsagePercent,
 peakGrEngineActivePercent, peakGpuMemoryUsedMib, peakGpuMemoryTotalMib, gpuUtilization, memoryBytes, dataScannedBytes;
}
