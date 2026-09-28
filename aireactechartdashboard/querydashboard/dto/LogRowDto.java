package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;

// 20260928 추가 : Log Monitoring 목록 행
public class LogRowDto {
    public String timestamp;
    public String hostname;
    public String worker;
    public String level;
    public Integer messageTypeId;
    public String message;
    public Long statementId;
    public Long connectionId;
}
