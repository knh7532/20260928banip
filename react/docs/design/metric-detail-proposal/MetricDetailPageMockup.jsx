import React, { useState, useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Cpu, Server, Activity, Database, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

// ---------------------------------------------------------------------
// Mock 데이터 생성 (실제로는 PostgreSQL 조회 API 응답으로 대체)
// ---------------------------------------------------------------------
function genTimeSeries(points, base, amplitude, noise) {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => {
    const t = now - (points - i) * 5000;
    const wave = Math.sin(i / 6) * amplitude;
    const jitter = (Math.random() - 0.5) * noise;
    return {
      time: new Date(t).toLocaleTimeString('ko-KR', { hour12: false }),
      value: Math.max(0, base + wave + jitter),
    };
  });
}

const DOMAINS = {
  gpu: {
    label: 'GPU',
    icon: Cpu,
    accent: '#F59E0B',
    items: [
      { id: 'gpu0', name: 'icspreamh2gpu01 · GPU 0', status: 'warn' },
      { id: 'gpu1', name: 'icspreamh2gpu02 · GPU 1', status: 'ok' },
      { id: 'gpu2', name: 'icspreamh2gpu03 · GPU 2', status: 'ok' },
    ],
  },
  node: {
    label: 'Node',
    icon: Server,
    accent: '#22D3EE',
    items: [
      { id: 'node0', name: 'sqream-worker-01', status: 'ok' },
      { id: 'node1', name: 'sqream-worker-02', status: 'ok' },
    ],
  },
  process: {
    label: 'Process',
    icon: Activity,
    accent: '#A78BFA',
    items: [
      { id: 'sqreamd', name: 'sqreamd', status: 'ok' },
      { id: 'postgres', name: 'postgres', status: 'warn' },
    ],
  },
  sqream: {
    label: 'SQream',
    icon: Database,
    accent: '#34D399',
    items: [
      { id: 'wafer_sensor_raw', name: 'public.wafer_sensor_raw', status: 'ok' },
      { id: 'staging_temp', name: 'staging.wafer_sensor_staging_temp', status: 'warn' },
    ],
  },
};

const STATUS_CONFIG = {
  ok: { label: '정상', color: '#34D399', Icon: CheckCircle2 },
  warn: { label: '주의', color: '#F59E0B', Icon: AlertTriangle },
};

// ---------------------------------------------------------------------
// 공통: 상태 배지
// ---------------------------------------------------------------------
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ok;
  const Icon = cfg.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: `${cfg.color}1A`, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      <Icon size={13} />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------
// 공통: 개요 카드
// ---------------------------------------------------------------------
function OverviewCard({ label, value, unit, accent }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold" style={{ color: accent }}>{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 상세 탭 콘텐츠 (도메인별 분기)
// ---------------------------------------------------------------------
function DetailTab({ domainKey, accent }) {
  if (domainKey === 'gpu') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OverviewCard label="사용률" value="74" unit="%" accent={accent} />
          <OverviewCard label="메모리" value="61.2 / 80" unit="GB" accent={accent} />
          <OverviewCard label="온도" value="61" unit="°C" accent={accent} />
          <OverviewCard label="전력" value="1.02" unit="kW / 1.4kW" accent={accent} />
        </div>

        <Section title="MIG 인스턴스">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <Th>인스턴스 UUID</Th><Th>프로필</Th><Th>할당 Worker</Th><Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {['MIG-a1f2...', 'MIG-b3c4...', 'MIG-d5e6...'].map((uuid, i) => (
                <tr key={uuid} className="border-t border-slate-800/60">
                  <Td className="font-mono text-xs text-slate-400">{uuid}</Td>
                  <Td>3g.40gb</Td>
                  <Td>{i < 2 ? `Worker-${i}` : '-'}</Td>
                  <Td>{i < 2 ? <StatusBadge status="ok" /> : <span className="text-slate-600">유휴</span>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="이 GPU에서 최근 실행된 쿼리">
          <RelatedQueryList accent={accent} />
        </Section>
      </div>
    );
  }

  if (domainKey === 'node') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OverviewCard label="Load Average (1m)" value="2.34" accent={accent} />
          <OverviewCard label="CPU 코어" value="32" unit="core" accent={accent} />
          <OverviewCard label="메모리 가용" value="98.7" unit="GB / 167GB" accent={accent} />
          <OverviewCard label="Uptime" value="14" unit="일" accent={accent} />
        </div>

        <Section title="디스크 마운트">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <Th>마운트포인트</Th><Th>파일시스템</Th><Th>사용량</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {[
                { mp: '/sqream/data', fs: 'xfs', used: 76 },
                { mp: '/data', fs: 'xfs', used: 61 },
                { mp: '/', fs: 'ext4', used: 23 },
              ].map((row) => (
                <tr key={row.mp} className="border-t border-slate-800/60">
                  <Td className="font-mono text-xs">{row.mp}</Td>
                  <Td>{row.fs}</Td>
                  <Td>{row.used}%</Td>
                  <Td className="w-32">
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${row.used}%`, backgroundColor: row.used > 70 ? '#F59E0B' : accent }}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="네트워크 인터페이스">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <Th>디바이스</Th><Th>수신</Th><Th>송신</Th><Th>에러</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800/60">
                <Td>eth0</Td><Td>51.6 GB/s 누적</Td><Td>31.4 GB/s 누적</Td><Td className="text-emerald-400">0</Td>
              </tr>
            </tbody>
          </table>
        </Section>
      </div>
    );
  }

  if (domainKey === 'process') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OverviewCard label="프로세스 수" value="3" accent={accent} />
          <OverviewCard label="CPU (user/sys)" value="18923 / 4521" unit="초" accent={accent} />
          <OverviewCard label="메모리 (RSS)" value="32.0" unit="GB" accent={accent} />
          <OverviewCard label="FD 사용률" value="12.5" unit="%" accent={accent} />
        </div>

        <Section title="프로세스 상태 분포">
          <div className="flex gap-2">
            {[{ s: 'Running', n: 1, c: '#34D399' }, { s: 'Sleeping', n: 2, c: '#64748B' }].map((x) => (
              <div key={x.s} className="flex items-center gap-2 rounded-md bg-slate-900/60 px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: x.c }} />
                {x.s} <span className="font-semibold text-slate-300">{x.n}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="컨텍스트 스위치">
          <div className="grid grid-cols-2 gap-3">
            <OverviewCard label="Voluntary" value="8.91M" accent="#64748B" />
            <OverviewCard label="Nonvoluntary" value="2.35M" accent="#F59E0B" />
          </div>
        </Section>
      </div>
    );
  }

  // sqream (table)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OverviewCard label="Row Count" value="9.82B" accent={accent} />
        <OverviewCard label="청크 개수" value="28,430" accent={accent} />
        <OverviewCard label="평균 청크 크기" value="4.6" unit="MB" accent={accent} />
        <OverviewCard label="Rechunker" value="활성" accent={accent} />
      </div>

      <Section title="파편화 경고">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          평균 청크 크기가 최근 7일간 6.1MB → 4.6MB로 감소 추세입니다. 소량 INSERT가 잦다면 수동 RECHUNK를 검토하세요.
        </div>
      </Section>

      <Section title="이 테이블 대상 최근 쿼리">
        <RelatedQueryList accent={accent} />
      </Section>
    </div>
  );
}

function RelatedQueryList({ accent }) {
  const rows = [
    { name: 'ETL_Load_Daily', type: 'ETL 적재', rows: '1.15M rows/s', p95: '0.93s' },
    { name: 'Fraud_Detection_Scan', type: '풀스캔', rows: '709K rows/s', p95: '0.95s' },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <Th>쿼리명</Th><Th>유형</Th><Th>처리행수/초</Th><Th>P95</Th><Th></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-slate-800/60 hover:bg-slate-900/40">
            <Td className="text-slate-200">{r.name}</Td>
            <Td><TypeTag type={r.type} /></Td>
            <Td>{r.rows}</Td>
            <Td>{r.p95}</Td>
            <Td><ChevronRight size={14} className="text-slate-600" /></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TYPE_COLORS = {
  '집계': '#A78BFA', 'ETL 적재': '#F59E0B', 'JOIN 쿼리': '#22D3EE', '풀스캔': '#F87171', 'SELECT 조회': '#34D399',
};
function TypeTag({ type }) {
  const c = TYPE_COLORS[type] ?? '#64748B';
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${c}1A`, color: c }}>
      {type}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">{children}</div>
    </div>
  );
}
function Th({ children }) { return <th className="pb-2 text-xs font-medium">{children}</th>; }
function Td({ children, className = '' }) { return <td className={`py-2 pr-4 ${className}`}>{children}</td>; }

// ---------------------------------------------------------------------
// 차트 탭 콘텐츠
// ---------------------------------------------------------------------
const CHART_SETS = {
  gpu: [
    { key: 'util', label: '사용률(%)', base: 70, amp: 15, noise: 8 },
    { key: 'mem', label: '메모리 사용률(%)', base: 65, amp: 10, noise: 6 },
    { key: 'temp', label: '온도(°C)', base: 60, amp: 3, noise: 1.5 },
    { key: 'power', label: '전력(W)', base: 1000, amp: 80, noise: 40 },
  ],
  node: [
    { key: 'cpu', label: 'CPU 사용률(%)', base: 55, amp: 12, noise: 8 },
    { key: 'mem', label: '메모리 사용률(%)', base: 60, amp: 8, noise: 5 },
    { key: 'diskio', label: '디스크 I/O(MB/s)', base: 120, amp: 40, noise: 25 },
    { key: 'net', label: '네트워크(MB/s)', base: 80, amp: 30, noise: 15 },
  ],
  process: [
    { key: 'cpu', label: 'CPU 사용률(%)', base: 40, amp: 15, noise: 10 },
    { key: 'mem', label: '메모리(GB)', base: 32, amp: 3, noise: 1.5 },
    { key: 'fd', label: 'FD 사용률(%)', base: 12, amp: 3, noise: 1 },
    { key: 'ctx', label: '컨텍스트 스위치/초', base: 500, amp: 150, noise: 80 },
  ],
  sqream: [
    { key: 'rows', label: 'Row Count (누적, 억 건)', base: 98, amp: 0.5, noise: 0.1 },
    { key: 'chunk', label: '평균 청크 크기(MB)', base: 4.8, amp: 0.6, noise: 0.2 },
  ],
};

function ChartTab({ domainKey, accent }) {
  const specs = CHART_SETS[domainKey];
  const series = useMemo(
    () => specs.map((s) => ({ ...s, data: genTimeSeries(36, s.base, s.amp, s.noise) })),
    [domainKey]
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {series.map((s) => (
        <div key={s.key} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-300">{s.label}</span>
            <span className="text-lg font-semibold" style={{ color: accent }}>
              {s.data[s.data.length - 1].value.toFixed(1)}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={s.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} interval={7} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fill={`url(#grad-${s.key})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------
export default function MetricDetailPageMockup() {
  const [domainKey, setDomainKey] = useState('gpu');
  const [itemId, setItemId] = useState(DOMAINS.gpu.items[0].id);
  const [tab, setTab] = useState('detail');

  const domain = DOMAINS[domainKey];
  const item = domain.items.find((i) => i.id === itemId) ?? domain.items[0];

  function selectDomain(key) {
    setDomainKey(key);
    setItemId(DOMAINS[key].items[0].id);
  }

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* 도메인 탭 (실제로는 조회 목록 페이지에서 넘어옴 — 여기선 데모용으로 노출) */}
        <div className="mb-5 flex gap-1.5">
          {Object.entries(DOMAINS).map(([key, d]) => {
            const Icon = d.icon;
            const active = key === domainKey;
            return (
              <button
                key={key}
                onClick={() => selectDomain(key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={13} />
                {d.label}
              </button>
            );
          })}
        </div>

        {/* 항목 선택 (조회 목록에서 클릭해 들어온 상태를 시뮬레이션) */}
        <div className="mb-4 flex flex-wrap gap-2">
          {domain.items.map((i) => (
            <button
              key={i.id}
              onClick={() => setItemId(i.id)}
              className={`rounded-md border px-3 py-1 text-xs ${
                i.id === item.id
                  ? 'border-slate-600 bg-slate-800 text-slate-100'
                  : 'border-slate-800 text-slate-500 hover:border-slate-700'
              }`}
            >
              {i.name}
            </button>
          ))}
        </div>

        {/* 헤더: breadcrumb + 제목 + 상태배지 */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
              <span>{domain.label} 모니터링</span>
              <ChevronRight size={12} />
              <span>조회 목록</span>
              <ChevronRight size={12} />
              <span className="text-slate-300">{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-slate-100">{item.name}</h1>
              <StatusBadge status={item.status} />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={13} />
            최근 갱신 5초 전
            <select className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300">
              <option>최근 30분</option>
              <option>최근 6시간</option>
              <option>최근 24시간</option>
            </select>
          </div>
        </div>

        {/* 상세 / 차트뷰 탭 */}
        <div className="mb-5 flex gap-1 border-b border-slate-800">
          {[
            { key: 'detail', label: '상세' },
            { key: 'chart', label: '차트뷰' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
              {tab === t.key && (
                <span
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                  style={{ backgroundColor: domain.accent }}
                />
              )}
            </button>
          ))}
        </div>

        {tab === 'detail' ? (
          <DetailTab domainKey={domainKey} accent={domain.accent} />
        ) : (
          <ChartTab domainKey={domainKey} accent={domain.accent} />
        )}
      </div>
    </div>
  );
}
