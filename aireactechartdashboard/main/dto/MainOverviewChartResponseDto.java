package com.apptomo.v4.aireactechartdashboard.main.dto;
import java.util.ArrayList;
import java.util.List;
public class MainOverviewChartResponseDto {
    public List<MainOverviewGpuPointDto> gpuPoints = new ArrayList<>();
    public List<MainOverviewQueryTimelineDto> queryTimeline = new ArrayList<>();
}
