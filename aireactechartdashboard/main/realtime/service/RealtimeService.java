package com.apptomo.v4.aireactechartdashboard.main.realtime.service;
import com.apptomo.v4.aireactechartdashboard.main.realtime.dto.RealtimeQueryDto;
import com.apptomo.v4.aireactechartdashboard.main.realtime.dto.StatementDetailDto;
import com.apptomo.v4.aireactechartdashboard.main.realtime.repository.RealtimeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.List;
// ===== 20260925 추가 시작 : 실행 중 SQL 전용 실시간 조회 서비스 =====
@Service @RequiredArgsConstructor
public class RealtimeService {
 private final RealtimeRepository repository;
 public List<RealtimeQueryDto> findRealtime(String h,Integer g,Integer gi){return repository.findRealtime(h,g,gi);}
 public StatementDetailDto findDetail(Long c,Long s){return repository.findStatementDetail(c,s);}
}
// ===== 20260925 추가 끝 =====
