package com.apptomo.v4.aireactechartdashboard.common.dto;
import java.util.ArrayList; import java.util.List;
public class CommonStatusDto { public boolean healthy; public int nodes; public int alerts; public List<CommonServerStatusDto> servers = new ArrayList<>(); }
