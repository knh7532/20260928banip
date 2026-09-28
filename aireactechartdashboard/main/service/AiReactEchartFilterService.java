package com.apptomo.v4.aireactechartdashboard.main.service;

import com.apptomo.v4.aireactechartdashboard.main.dto.MonitoringFilterOptions;
import com.apptomo.v4.aireactechartdashboard.main.repository.AiReactEchartFilterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AiReactEchartFilterService {
    private final AiReactEchartFilterRepository repository;

    public MonitoringFilterOptions getOptions(String hostname, Integer gpuId) {
        return new MonitoringFilterOptions(
            repository.findNodes(),
            repository.findGpus(hostname),
            repository.findWorkers(hostname, gpuId)
        );
    }
}
