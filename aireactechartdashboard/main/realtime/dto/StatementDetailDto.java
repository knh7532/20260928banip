package com.apptomo.v4.aireactechartdashboard.main.realtime.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

// ===== 20260916 추가 시작 : Statement ID 클릭 상세 팝업 DTO =====
@Getter
@AllArgsConstructor
public class StatementDetailDto {
    private String hostip;
    private Integer serverPort;
    private String instanceId;
    private String service;
    private Long connectionId;
    private Long statementId;
    private String statementStartTime;
    private String statementStatus;
    private Long statementStatusTimeSeconds;
    private String classifiedState;
    private String statement;
    private String clientIp;
    private String userId;
}
// ===== 20260916 추가 끝 : Statement ID 클릭 상세 팝업 DTO =====
