package com.apptomo.v4.aireactechartdashboard.main.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class WorkerFilterOption {
    private String name;
    private String hostname;
    private Integer gpuId;
    private Integer giId;
}
