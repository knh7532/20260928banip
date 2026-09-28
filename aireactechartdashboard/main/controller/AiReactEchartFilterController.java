package com.apptomo.v4.aireactechartdashboard.main.controller;

import com.apptomo.v4.aireactechartdashboard.main.dto.MonitoringFilterOptions;
import com.apptomo.v4.aireactechartdashboard.main.service.AiReactEchartFilterService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/main")
public class AiReactEchartFilterController {
    private final AiReactEchartFilterService service;

    @GetMapping("/filter-options")
    public MonitoringFilterOptions filterOptions(
        @RequestParam(required = false) String hostname,
        @RequestParam(required = false) Integer gpuId
    ) {
        return service.getOptions(hostname, gpuId);
    }
}
