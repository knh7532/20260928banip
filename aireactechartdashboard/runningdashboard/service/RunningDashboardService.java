package com.apptomo.v4.aireactechartdashboard.runningdashboard.service;

import com.apptomo.v4.aireactechartdashboard.runningdashboard.dto.*;
import com.apptomo.v4.aireactechartdashboard.runningdashboard.repository.RunningDashboardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

// ===== 20260916 추가 시작 : 기존 Overview API 복구 =====
@Service
@RequiredArgsConstructor
public class RunningDashboardService {
    private static final DateTimeFormatter F = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final RunningDashboardRepository repository;
    private LocalDateTime t(String v) { return LocalDateTime.parse(v, F); }

    public MainOverviewResponseDto overview(String start, String end, String hostname, String gpuId, String giId) {
        return repository.findOverview(t(start), t(end), hostname, gpuId, giId);
    }
    public MainOverviewChartResponseDto charts(String start, String end, String hostname, String gpuId, String giId) {
        return repository.findCharts(t(start), t(end), hostname, gpuId, giId);
    }
    public List<MainOverviewXViewEventDto> xview(String start, String end, String hostname, String gpuId, String giId) {
        // 20260916 추가: X-View 상단 필터 전달
        return repository.findXView(t(start), t(end), hostname, gpuId, giId);
    }
    public List<MainOverviewLiveStatDto> liveStats(String start, String end) { return repository.findLiveStats(t(start), t(end)); }
    // ===== 20260916 추가 시작 : Overview 하단 Table Chunk / Internal Runtime Error =====
    public List<MainTableChunkDto> tableChunks(String start, String end, String hostname) {
        return repository.findTableChunks(t(start), t(end), hostname);
    }
    public List<MainInternalErrorPointDto> internalErrors(String start, String end, String hostname) {
        return repository.findInternalErrors(t(start), t(end), hostname);
    }
    // ===== 20260916 추가 끝 : Overview 하단 Table Chunk / Internal Runtime Error =====

    // ===== 20260925 추가 시작 : Drilldown Main Dashboard =====
    // ===== 20260925 추가 시작 : Main Dashboard 실시간 API - 조회기간 제거 =====
    public MainDrilldownResponseDto drilldown(String hostname, Integer gpuId, String instanceId) {
        return repository.findDrilldown(hostname, gpuId, instanceId);
    }
    public List<MainPerformancePointDto> performance(String hostname, Integer gpuId, String instanceId) {
        return repository.findPerformance(hostname, gpuId, instanceId);
    }
    // ===== 20260925 추가 끝 : Main Dashboard 실시간 API - 조회기간 제거 =====
    // ===== 20260925 추가 끝 : Drilldown Main Dashboard =====
    // 20260928 추가 : /main Node Resource 최근 collect_time 시계열
    public List<MainPerformancePointDto> resourceHistory(String hostname, int minutes) {
        return repository.findResourceHistory(hostname, minutes);
    }
}
// ===== 20260916 추가 끝 : 기존 Overview API 복구 =====
