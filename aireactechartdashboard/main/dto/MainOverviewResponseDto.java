package com.apptomo.v4.aireactechartdashboard.main.dto;
import java.util.ArrayList;
import java.util.List;
public class MainOverviewResponseDto {
    public List<MainOverviewStatementDto> statements = new ArrayList<>();
    public List<MainOverviewPerformanceDto> performance = new ArrayList<>();
    public List<MainOverviewServerDto> servers = new ArrayList<>();
    public MainOverviewKpiDto kpi;
}
