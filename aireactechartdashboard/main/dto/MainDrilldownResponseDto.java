package com.apptomo.v4.aireactechartdashboard.main.dto;
import java.util.ArrayList; import java.util.List;
public class MainDrilldownResponseDto {
 public Integer activeSessions, runningQueries, connectedUsers, failedQueries1h, orphanLocks;
 public Double cpuUsagePercent, gpuMemoryUsagePercent, diskSpillBytes;
 public List<MainDrilldownQueryDto> queries = new ArrayList<>();
 public List<MainDrilldownQueryDto> topQueries = new ArrayList<>();
 public List<MainDrilldownWorkerDto> workers = new ArrayList<>();
}
