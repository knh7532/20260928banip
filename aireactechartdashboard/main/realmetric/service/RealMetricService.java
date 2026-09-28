package com.apptomo.v4.aireactechartdashboard.main.realmetric.service;

import com.apptomo.v4.aireactechartdashboard.main.realmetric.dto.RealMetricResponseDto;
import com.apptomo.v4.aireactechartdashboard.main.realmetric.repository.RealMetricRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;

// 20260916 추가
@Service
@RequiredArgsConstructor
public class RealMetricService {
    private final RealMetricRepository repository;
    public RealMetricResponseDto getMetrics(LocalDateTime startTime, LocalDateTime endTime,
                                            String hostname, Integer gpuId, Integer giId) {
        return new RealMetricResponseDto(
            repository.findPoints(startTime, endTime, hostname, gpuId, giId),
            repository.findServers(startTime, endTime, hostname, gpuId, giId)
        );
    }
}
