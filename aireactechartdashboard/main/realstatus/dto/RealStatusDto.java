package com.apptomo.v4.aireactechartdashboard.main.realstatus.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

// 20260916 추가 - Overview statement_status 집계 DTO
@Getter
@AllArgsConstructor
public class RealStatusDto {
    private long queuedStatements;
    private long preparingStatements;
    private long initializingStatements;
    private long executingStatements;
    private long stoppingStatements;
}
