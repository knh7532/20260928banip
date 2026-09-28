package com.apptomo.v4.aireactechartdashboard.main.realmetric.controller;

import com.apptomo.v4.aireactechartdashboard.main.realmetric.dto.RealMetricResponseDto;
import com.apptomo.v4.aireactechartdashboard.main.realmetric.service.RealMetricService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;

// 20260916 추가
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/main/realmetric")
public class RealMetricController {
    private final RealMetricService service;

    @GetMapping
    public RealMetricResponseDto metrics(
        @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
        @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
        @RequestParam(required = false) String hostname,
        @RequestParam(required = false) Integer gpuId,
        @RequestParam(required = false) Integer giId
    ) {
        return service.getMetrics(startTime, endTime, hostname, gpuId, giId);
    }
}
