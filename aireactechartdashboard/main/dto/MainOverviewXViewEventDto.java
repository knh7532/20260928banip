package com.apptomo.v4.aireactechartdashboard.main.dto;
public class MainOverviewXViewEventDto {
    public String node, gpu = "", mig = "", stmtId, queryId, user, queryName, status, reason;
    public Long endMs;
    public Double durationSec;
    public Phases phases;
    public static class Phases { public Double compileSec, queuedSec, initializingSec, executingSec; }
}
