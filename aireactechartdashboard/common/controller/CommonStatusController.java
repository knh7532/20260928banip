package com.apptomo.v4.aireactechartdashboard.common.controller;
import com.apptomo.v4.aireactechartdashboard.common.dto.CommonStatusDto;
import com.apptomo.v4.aireactechartdashboard.common.service.CommonStatusService;
import lombok.RequiredArgsConstructor; import org.springframework.web.bind.annotation.*;
// ===== 20260916 추가 시작 : /common/status 404 복구 =====
@RestController @RequiredArgsConstructor
@RequestMapping("/api/aireactechartdashboard/common")
public class CommonStatusController {
 private final CommonStatusService service;
 @GetMapping("/status") public CommonStatusDto status(@RequestParam String endTime) { return service.status(endTime); }
}
// ===== 20260916 추가 끝 : /common/status 404 복구 =====
