import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Play, Pause, SkipBack, SkipForward, Cpu, MemoryStick } from 'lucide-react';

// ---------------------------------------------------------------------
// Mock 데이터 (실제로는 GET /api/metrics/process/xview?start=&end= 응답의
// cpuOccupancySeries / memOccupancySeries / timeLabels를 그대로 사용)
// ---------------------------------------------------------------------
const GROUPS = [
  { name: 'sqreamd', color: '#A78BFA' },
  { name: 'java', color: '#22D3EE' },
  { name: 'postgres', color: '#F59E0B' },
];

function useMockOccupancyData() {
  return useMemo(() => {
    const N = 60;
    const now = Date.now();
    const timeLabels = [];
    const frames = []; // frames[i] = { cpu: [{name,value}], mem: [{name,value}] }

    let sqreamdBase = 55;
    for (let i = 0; i < N; i++) {
      const t = now - (N - i) * 5000;
      timeLabels.push(new Date(t).toLocaleTimeString('ko-KR', { hour12: false }));

      const spike = (i >= 15 && i <= 25) || (i >= 45 && i <= 50) ? 1 : 0;
      const restarted = i === 34;
      sqreamdBase = restarted ? 30 : sqreamdBase + (Math.random() - 0.48) * 3;
      sqreamdBase = Math.max(15, Math.min(80, sqreamdBase));

      const cpuRaw = {
        sqreamd: sqreamdBase + spike * 20,
        java: 20 + (Math.random() - 0.5) * 6,
        postgres: 15 + spike * 10 + (Math.random() - 0.5) * 5,
      };
      const memRaw = {
        sqreamd: 45 + spike * 15 + (Math.random() - 0.5) * 5,
        java: 30 + (Math.random() - 0.5) * 4,
        postgres: 18 + spike * 6 + (Math.random() - 0.5) * 3,
      };

      const normalize = (raw) => {
        const total = Object.values(raw).reduce((s, v) => s + Math.max(0, v), 0) || 1;
        return GROUPS.map((g) => ({
          name: g.name,
          value: Number(((Math.max(0, raw[g.name]) / total) * 100).toFixed(1)),
          color: g.color,
        }));
      };

      frames.push({ cpu: normalize(cpuRaw), mem: normalize(memRaw), restarted });
    }

    return { timeLabels, frames };
  }, []);
}

// ---------------------------------------------------------------------
// 공통: 파이 차트 카드
// ---------------------------------------------------------------------
function OccupancyPie({ title, icon: Icon, data, accent }) {
  const top = data.slice().sort((a, b) => b.value - a.value)[0];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-300">
        <Icon size={15} style={{ color: accent }} />
        {title}
      </div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={true}
              animationDuration={300}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} stroke="#0B1220" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 12, borderRadius: 8 }}
              formatter={(value, name) => [`${value}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* 중앙 라벨: 가장 큰 비중을 차지하는 그룹 */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-slate-500">최다 점유</span>
          <span className="text-lg font-semibold" style={{ color: top.color }}>{top.name}</span>
          <span className="text-xs text-slate-400">{top.value}%</span>
        </div>
      </div>

      <div className="mt-2 flex justify-center gap-4">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-slate-400">{d.name}</span>
            <span className="font-medium text-slate-200">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 메인 앱
// ---------------------------------------------------------------------
export default function ProcessOccupancyPieViewer() {
  const { timeLabels, frames } = useMockOccupancyData();
  const N = timeLabels.length;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(400);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!playing) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setIndex((i) => (i + 1 >= N ? 0 : i + 1));
    }, speedMs);
    return () => clearInterval(intervalRef.current);
  }, [playing, speedMs, N]);

  const frame = frames[index];

  return (
    <div className="min-h-screen bg-[#0B1220] p-6 text-slate-200">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-lg font-semibold text-slate-100">Process 점유율 Pie 뷰어</h1>
        <p className="mb-5 text-sm text-slate-500">
          시간을 넘기면서 CPU/메모리를 어느 프로세스 그룹이 얼마나 차지하고 있었는지 파이 차트로 확인합니다.
          (실제 연동 시 <code className="rounded bg-slate-800 px-1 py-0.5 text-[12px] text-sky-300">GET /api/metrics/process/xview</code>의
          cpuOccupancySeries/memOccupancySeries를 이 컴포넌트의 mock 데이터 자리에 넣으시면 됩니다)
        </p>

        {/* 재생 컨트롤 */}
        <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <SkipBack size={16} />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex items-center gap-1.5 rounded-md bg-indigo-500/20 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/30"
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? '일시정지' : '재생'}
              </button>
              <button
                onClick={() => setIndex((i) => Math.min(N - 1, i + 1))}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <SkipForward size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              속도
              <select
                value={speedMs}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
                className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300"
              >
                <option value={800}>느리게</option>
                <option value={400}>보통</option>
                <option value={150}>빠르게</option>
              </select>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={N - 1}
            value={index}
            onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
            className="w-full accent-indigo-400"
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-400">{timeLabels[index]}</span>
            {frame.restarted && (
              <span className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400">
                sqreamd 재시작 시점
              </span>
            )}
            <span className="text-slate-600">{index + 1} / {N}</span>
          </div>
        </div>

        {/* 파이 차트 2개 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OccupancyPie title="CPU 점유율" icon={Cpu} data={frame.cpu} accent="#22D3EE" />
          <OccupancyPie title="메모리 점유율" icon={MemoryStick} data={frame.mem} accent="#A78BFA" />
        </div>
      </div>
    </div>
  );
}
