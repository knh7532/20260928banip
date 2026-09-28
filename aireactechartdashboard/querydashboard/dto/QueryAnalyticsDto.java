package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;
import java.util.*;
// 20260928 추가
public class QueryAnalyticsDto { public long totalQueries; public Double gpuUsageMax,cpuUsageMax,avgDurationSec; public long heavyQueries,totalElements; public int page,size,totalPages; public List<QueryRowDto> queries=new ArrayList<>(); public List<QueryGroupDto> groups=new ArrayList<>(); }
