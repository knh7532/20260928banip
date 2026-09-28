package com.apptomo.v4.aireactechartdashboard.main.realmetric.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import java.util.List;

// 20260916 추가
@Getter
@AllArgsConstructor
public class RealMetricResponseDto {
    private List<RealMetricPointDto> points;
    private List<RealMetricServerDto> servers;
}
