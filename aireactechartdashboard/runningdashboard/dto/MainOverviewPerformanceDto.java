package com.apptomo.v4.aireactechartdashboard.runningdashboard.dto;
public class MainOverviewPerformanceDto {
    public String queryName, queryType, database, node, gpu, mig;
    public Double rowsPerSecond, p95Seconds;
    public Integer state;
}
