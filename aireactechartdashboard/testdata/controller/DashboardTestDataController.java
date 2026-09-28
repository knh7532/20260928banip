package com.apptomo.v4.aireactechartdashboard.testdata.controller;

import com.apptomo.v4.aireactechartdashboard.testdata.service.DashboardTestDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 20260925 추가: 로컬 대시보드 실시간/대량 데이터 테스트 전용 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/testdata")
public class DashboardTestDataController {
    private final DashboardTestDataService service;

    @PostMapping("/realtime/once")
    public ResponseEntity<Map<String, Object>> realtimeOnce() {
        return ResponseEntity.ok(service.createRealtimeSnapshot());
    }

    @PostMapping("/realtime/start")
    public ResponseEntity<Map<String, Object>> realtimeStart(
            @RequestParam(defaultValue = "5") long intervalSeconds) {
        return ResponseEntity.ok(service.startRealtime(intervalSeconds));
    }

    @PostMapping("/realtime/stop")
    public ResponseEntity<Map<String, Object>> realtimeStop() {
        return ResponseEntity.ok(service.stopRealtime());
    }

    @PostMapping("/bulk/server-status")
    public ResponseEntity<Map<String, Object>> bulkServerStatus(
            @RequestParam(defaultValue = "100000") int count) {
        return ResponseEntity.ok(service.generateBulkServerStatus(count));
    }

    @PostMapping("/bulk/node")
    public ResponseEntity<Map<String, Object>> bulkNode(
            @RequestParam(defaultValue = "100000") int count) {
        return ResponseEntity.ok(service.generateBulkNode(count));
    }

    @GetMapping("/counts")
    public ResponseEntity<Map<String, Object>> counts() {
        return ResponseEntity.ok(service.countTestData());
    }

    @DeleteMapping("/cleanup")
    public ResponseEntity<Map<String, Object>> cleanup() {
        return ResponseEntity.ok(service.cleanup());
    }
}
