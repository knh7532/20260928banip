package com.apptomo.v4.aireactechartdashboard.main.dto;

// ===== 20260916 추가 시작 : Overview Table Chunk 선택형 시각화/상세 =====
public class MainTableChunkDto {
    public String hostname;
    public Long tableId;
    public String databaseName;
    public String schemaName;
    public String tableName;
    public Long compressedTableSizeByte;
    public Long uncompressedTableSizeByte;
    public Double savingsRate;
    public Double compressionRatio;
    public Long pct90100;
    public Long pct8090;
    public Long pct7080;
    public Long pct6070;
    public Long pct5060;
    public Long pct4050;
    public Long pct3040;
    public Long pct2030;
    public Long pct1020;
    public Long pct010;
    public Long pct090;
    public Long noDeletionCnt;
    public Long someDeletionCnt;
    public Long allDeletionCnt;
    public String deletionCount;
    public String rechunk;
    public String needsRechunk;
    public String collectTime;
}
// ===== 20260916 추가 끝 : Overview Table Chunk 선택형 시각화/상세 =====
