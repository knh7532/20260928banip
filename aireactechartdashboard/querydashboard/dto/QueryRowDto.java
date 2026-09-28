package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;
// 20260928 추가
public class QueryRowDto { public String hostname,worker,serviceName,databaseName,sqlType,userId,statement,queryStart,queryEnd; public Long connectionId,statementId,durationMs,totalProcessedRows,resultRowCount; public Double totalDataReadMb,cpuUsagePercent,gpuUsagePercent,memoryUsagePercent,diskUsagePercent; }
