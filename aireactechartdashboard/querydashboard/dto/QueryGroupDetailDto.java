package com.apptomo.v4.aireactechartdashboard.querydashboard.dto;
import java.util.*;
// 20260928 추가 : Summary 선택 상세 + 실행시점 리소스
public class QueryGroupDetailDto {
    public String sqlType,databaseName,resourceStart,resourceEnd;
    public List<QueryRowDto> queries=new ArrayList<>();
    public List<QueryResourcePointDto> resources=new ArrayList<>();
}
