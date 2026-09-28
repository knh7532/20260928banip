package com.apptomo.v4.aireactechartdashboard.common.service;
import com.apptomo.v4.aireactechartdashboard.common.dto.*;
import com.apptomo.v4.aireactechartdashboard.common.repository.CommonStatusRepository;
import lombok.RequiredArgsConstructor; import org.springframework.stereotype.Service;
import java.time.LocalDateTime; import java.time.format.DateTimeFormatter;
@Service @RequiredArgsConstructor
public class CommonStatusService {
 private final CommonStatusRepository repository;
 public CommonStatusDto status(String endTime) {
   LocalDateTime end=LocalDateTime.parse(endTime, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
   CommonStatusDto out=new CommonStatusDto(); out.servers=repository.find(end); out.nodes=out.servers.size();
   out.alerts=(int)out.servers.stream().filter(x->!Boolean.TRUE.equals(x.online)).count(); out.healthy=out.alerts==0; return out;
 }
}
