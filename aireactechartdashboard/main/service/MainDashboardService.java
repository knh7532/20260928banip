package com.apptomo.v4.aireactechartdashboard.main.service;

import com.apptomo.v4.aireactechartdashboard.main.dto.*;
import com.apptomo.v4.aireactechartdashboard.main.repository.MainDashboardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

// ===== 20260916 추가 시작 : 기존 Overview API 복구 =====
@Service
@RequiredArgsConstructor
public class MainDashboardService {
    private static final DateTimeFormatter F = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final MainDashboardRepository repository;
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
}
// ===== 20260916 추가 끝 : 기존 Overview API 복구 =====
