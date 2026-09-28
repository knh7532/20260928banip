package com.apptomo.v4.aireactechartdashboard.main.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import java.util.List;

@Getter
@AllArgsConstructor
public class MonitoringFilterOptions {
    private List<String> nodes;
    private List<Integer> gpus;
    private List<WorkerFilterOption> workers;
}
