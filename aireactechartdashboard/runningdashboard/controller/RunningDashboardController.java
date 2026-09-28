package com.apptomo.v4.aireactechartdashboard.runningdashboard.controller;

import com.apptomo.v4.aireactechartdashboard.runningdashboard.dto.MainDrilldownResponseDto;
import com.apptomo.v4.aireactechartdashboard.runningdashboard.dto.MainPerformancePointDto;
import com.apptomo.v4.aireactechartdashboard.runningdashboard.service.RunningDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// ===== 20260925 추가 시작 : Running Dashboard 전용 Controller =====
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/main")
public class RunningDashboardController {

    private final RunningDashboardService service;

    @GetMapping("/drilldown")
    public MainDrilldownResponseDto drilldown(
            @RequestParam(required = false) String hostname,
            @RequestParam(required = false) Integer gpuId,
            @RequestParam(required = false) String instanceId) {
        return service.drilldown(hostname, gpuId, instanceId);
    }

    @GetMapping("/performance")
    public List<MainPerformancePointDto> performance(
            @RequestParam(required = false) String hostname,
            @RequestParam(required = false) Integer gpuId,
            @RequestParam(required = false) String instanceId) {
        return service.performance(hostname, gpuId, instanceId);
    }
    // 20260928 추가 : /main Query와 무관한 Node Resource 꺾은선
    @GetMapping("/resource-history")
    public List<MainPerformancePointDto> resourceHistory(
            @RequestParam(required = false) String hostname,
            @RequestParam(defaultValue = "30") int minutes) {
        return service.resourceHistory(hostname, minutes);
    }
}
// ===== 20260925 추가 끝 : Running Dashboard 전용 Controller =====
