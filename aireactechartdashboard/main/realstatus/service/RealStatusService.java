package com.apptomo.v4.aireactechartdashboard.main.realstatus.service;

import com.apptomo.v4.aireactechartdashboard.main.realstatus.dto.RealStatusDto;
import com.apptomo.v4.aireactechartdashboard.main.realstatus.repository.RealStatusRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// 20260916 추가 - Overview 실시간 상태 집계 서비스
@Service
@RequiredArgsConstructor
public class RealStatusService {

    private final RealStatusRepository repository;

    // 20260916 추가
    public RealStatusDto getStatusCounts(String startTime, String endTime, String hostname) {
        return repository.countStatementStatuses(startTime, endTime, hostname);
    }
}
