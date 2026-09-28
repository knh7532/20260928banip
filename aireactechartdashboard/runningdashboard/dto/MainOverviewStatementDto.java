package com.apptomo.v4.aireactechartdashboard.runningdashboard.dto;
public class MainOverviewStatementDto {
    public String stmtId, queryId, user, node, gpu, mig, worker, service, qid, qidTags, connectionId;
    public Double memoryBytes, gpuPct, cpuPct, startTimeSec, elapsedSec, progress, spoolBytes, vramBytes, lockHeldSec;
}
