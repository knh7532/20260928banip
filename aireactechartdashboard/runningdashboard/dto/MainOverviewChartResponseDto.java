package com.apptomo.v4.aireactechartdashboard.runningdashboard.dto;
import java.util.ArrayList;
import java.util.List;
public class MainOverviewChartResponseDto {
    public List<MainOverviewGpuPointDto> gpuPoints = new ArrayList<>();
    public List<MainOverviewQueryTimelineDto> queryTimeline = new ArrayList<>();
}
