package com.apptomo.v4.aireactechartdashboard.main.realstatus.controller;

import com.apptomo.v4.aireactechartdashboard.main.realstatus.dto.RealStatusDto;
import com.apptomo.v4.aireactechartdashboard.main.realstatus.service.RealStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 20260916 추가 - Overview 상태 카드 API
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/main")
public class RealStatusController {

    private final RealStatusService service;

    // 20260916 추가
    @GetMapping("/status-counts")
    public RealStatusDto statusCounts(
        @RequestParam String startTime,
        @RequestParam String endTime,
        @RequestParam(required = false) String hostname
    ) {
        return service.getStatusCounts(startTime, endTime, hostname);
    }
}
