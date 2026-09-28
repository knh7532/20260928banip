package com.apptomo.v4.aireactechartdashboard.main.controller;

import com.apptomo.v4.aireactechartdashboard.main.dto.*;
import com.apptomo.v4.aireactechartdashboard.main.service.MainDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

// ===== 20260916 추가 시작 : React Overview 404 복구 =====
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/main")
public class MainDashboardController {
    private final MainDashboardService service;

    @GetMapping("/overview")
    public MainOverviewResponseDto overview(@RequestParam String startTime, @RequestParam String endTime,
            @RequestParam(required=false) String hostname, @RequestParam(required=false) String gpuId,
            @RequestParam(required=false) String giId) {
        return service.overview(startTime, endTime, hostname, gpuId, giId);
    }

    @GetMapping("/charts")
    public MainOverviewChartResponseDto charts(@RequestParam String startTime, @RequestParam String endTime,
            @RequestParam(required=false) String hostname, @RequestParam(required=false) String gpuId,
            @RequestParam(required=false) String giId) {
        return service.charts(startTime, endTime, hostname, gpuId, giId);
    }

    @GetMapping("/xview")
    public List<MainOverviewXViewEventDto> xview(@RequestParam String startTime, @RequestParam String endTime,
            @RequestParam(required=false) String hostname, @RequestParam(required=false) String gpuId,
            @RequestParam(required=false) String giId) {
        // 20260916 추가: X-View도 상단 Node/GPU/Worker 필터 연동
        return service.xview(startTime, endTime, hostname, gpuId, giId);
    }

    @GetMapping("/live-stats")
    public List<MainOverviewLiveStatDto> liveStats(@RequestParam String startTime, @RequestParam String endTime) {
        return service.liveStats(startTime, endTime);
    }

    // ===== 20260916 추가 시작 : Overview 하단 Table Chunk / Internal Runtime Error =====
    @GetMapping("/table-chunks")
    public List<MainTableChunkDto> tableChunks(@RequestParam String startTime, @RequestParam String endTime,
            @RequestParam(required=false) String hostname) {
        return service.tableChunks(startTime, endTime, hostname);
    }

    @GetMapping("/internal-errors")
    public List<MainInternalErrorPointDto> internalErrors(@RequestParam String startTime, @RequestParam String endTime,
            @RequestParam(required=false) String hostname) {
        return service.internalErrors(startTime, endTime, hostname);
    }
    // ===== 20260916 추가 끝 : Overview 하단 Table Chunk / Internal Runtime Error =====
}
// ===== 20260916 추가 끝 : React Overview 404 복구 =====
