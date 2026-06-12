import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { getInsights } from './api.js';

const PIE = ['#a78bfa', '#f5a623', '#4f9dff', '#34d399', '#f472b6', '#22d3ee', '#fb923c', '#c084fc', '#94a3b8', '#475569'];
const fmt = (n) => (n >= 1000 ? n.toLocaleString() : String(n));
const fmtMD = (iso) => (typeof iso === 'string' && iso.includes('-') ? `${+iso.split('-')[1]}/${+iso.split('-')[2]}` : iso);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Delta({ p }) {
  if (p == null) return null;
  const up = p >= 0;
  return (
    <span className={up ? 'text-emerald-400' : 'text-red-400'}>
      {up ? '▲' : '▼'} {Math.abs(p)}%
    </span>
  );
}

function Donut({ title, data }) {
  const rows = data.map(([name, value]) => ({ name, value }));
  return (
    <div className="rounded-xl bg-panel border border-edge p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="flex items-center gap-3">
        <div className="w-[140px] h-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={PIE[i % PIE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0a0e14', border: '1px solid #243042', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: '#e6ebf2' }}
              labelStyle={{ color: '#8a97a8' }}
              formatter={(v, n) => [v + '%', n]}
            />
          </PieChart>
        </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1 text-xs min-w-0">
          {rows.slice(0, 5).map((r, i) => (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: PIE[i % PIE.length] }} />
              <span className="text-muted truncate">{r.name}</span>
              <span className="ml-auto tabular-nums">{r.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ServerOverview() {
  const [ins, setIns] = useState(null);
  const [msgPeriod, setMsgPeriod] = useState('daily');
  useEffect(() => {
    getInsights().then(setIns).catch(() => {});
  }, []);
  if (!ins) return null;
  const todayUTC = new Date().toISOString().slice(0, 10); // UTC is the oracle
  // Count full UTC days only — never show the current, in-progress UTC day.
  const daily = (ins.dailyEngagement?.series || []).filter((d) => d.date < todayUTC);
  const ms = ins.messageSeries || {};
  const msgData =
    msgPeriod === 'weekly' ? ms.weekly?.bars || [] : msgPeriod === 'monthly' ? ms.monthly?.bars || [] : daily;
  const msgWindow =
    msgPeriod === 'weekly'
      ? ms.weekly?.window || ''
      : msgPeriod === 'monthly'
        ? ms.monthly?.window || ''
        : ins.dailyEngagement?.window || '';
  const fmtMsgTick = (v) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? MONTHS[+v.split('-')[1] - 1] : fmtMD(v));
  const fmtMsgLabel = (v) => {
    if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return `${MONTHS[+v.split('-')[1] - 1]} ${v.split('-')[0]}`;
    return (msgPeriod === 'weekly' ? 'Week of ' : '') + fmtMD(v);
  };

  return (
    <section className="mb-10 rounded-2xl border border-edge bg-panel/40 p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h2 className="font-bold text-lg">🛰 Jupiter server · Discord Insights</h2>
        <span className="text-muted text-xs">{ins.window} · snapshot {ins.captured}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        {ins.kpis.map((k) => (
          <div key={k.key} className="rounded-xl bg-panel border border-edge px-3 py-3">
            <div className="text-muted text-[10px] uppercase tracking-wide leading-tight h-7">{k.label}</div>
            <div className="text-2xl font-extrabold mt-1 tabular-nums">
              {fmt(k.value)}
              {k.unit || ''}
            </div>
            <div className="text-[11px] mt-0.5">
              <Delta p={k.deltaPct} /> <span className="text-muted">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* total messages · server-wide · daily / weekly / monthly */}
      {daily.length > 0 && (
        <div className="rounded-xl bg-panel border border-edge p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div className="text-sm font-semibold">
              Total messages <span className="text-muted font-normal">· members only · {msgWindow}</span>
            </div>
            <div className="inline-flex rounded-lg border border-edge bg-ink/40 p-0.5 text-xs">
              {['daily', 'weekly', 'monthly'].map((p) => (
                <button
                  key={p}
                  onClick={() => setMsgPeriod(p)}
                  className={`px-2.5 py-1 rounded-md capitalize transition ${
                    msgPeriod === p ? 'bg-panel2 text-white' : 'text-muted hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <p className="text-muted text-[11px] mb-2">
            Discord Insights “Messages Sent” — member messages only (excludes bots/apps &amp; system); ~2-day lag.
            {msgPeriod !== 'daily' && ms.retentionNote ? ` ${ms.retentionNote}` : ''}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={msgData} margin={{ top: 6, right: 8, left: 6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtMsgTick}
                stroke="#3a4658"
                tick={{ fill: '#8a97a8', fontSize: 10 }}
                minTickGap={msgPeriod === 'daily' ? 18 : 8}
                interval={msgPeriod === 'monthly' ? 0 : 'preserveStartEnd'}
              />
              <YAxis
                stroke="#3a4658"
                tick={{ fill: '#8a97a8', fontSize: 10 }}
                width={44}
                allowDecimals={false}
                tickFormatter={(v) => (msgPeriod === 'daily' ? v : v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <Tooltip
                contentStyle={{ background: '#0a0e14', border: '1px solid #243042', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#e6ebf2' }}
                labelStyle={{ color: '#8a97a8' }}
                labelFormatter={fmtMsgLabel}
                formatter={(v, _n, p) => [Number(v).toLocaleString() + (p?.payload?.partial ? ' (partial)' : ''), 'messages']}
                cursor={{ fill: '#ffffff08' }}
              />
              <Bar dataKey="messages" fill="#4f9dff" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {msgData.map((d, i) => (
                  <Cell key={i} fill="#4f9dff" fillOpacity={d.partial ? 0.4 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* avg msgs / communicator (past 7 days) + countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl bg-panel border border-edge p-4">
          <div className="text-sm font-semibold mb-1">
            Avg messages / communicator <span className="text-muted font-normal">· past 7 days</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={daily.slice(-7)} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtMD} stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} minTickGap={10} />
              <YAxis stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} width={28} domain={[0, 'dataMax + 4']} />
              <Tooltip
                contentStyle={{ background: '#0a0e14', border: '1px solid #243042', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#e6ebf2' }}
                labelStyle={{ color: '#8a97a8' }}
                labelFormatter={fmtMD}
                formatter={(v) => [v, 'avg msgs']}
              />
              <Line type="monotone" dataKey="mpc" name="avg msgs" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Donut title="Where members are from" data={ins.audience.countries} />
      </div>

      {ins.topActiveChannels && (
        <div className="rounded-xl bg-panel border border-edge p-4 mb-4">
          <div className="text-sm font-semibold mb-2">
            Most active channels{' '}
            <span className="text-muted font-normal">· messages sent · {ins.channelReaders?.window || ins.window}</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={ins.topActiveChannels.map(([label, messages]) => ({ label, messages }))}
              layout="vertical"
              margin={{ top: 2, right: 28, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" horizontal={false} />
              <XAxis type="number" stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} />
              <YAxis type="category" dataKey="label" stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 11 }} width={118} />
              <Tooltip
                contentStyle={{ background: '#0a0e14', border: '1px solid #243042', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#e6ebf2' }}
                labelStyle={{ color: '#8a97a8' }}
                formatter={(v) => [Number(v).toLocaleString(), 'messages']}
                cursor={{ fill: '#ffffff08' }}
              />
              <Bar dataKey="messages" fill="#a78bfa" isAnimationActive={false} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {ins.topReadChannels && (
        <div className="rounded-xl bg-panel border border-edge p-4">
          <div className="text-sm font-semibold mb-2">
            Most-read channels{' '}
            <span className="text-muted font-normal">· unique readers · {ins.channelReaders?.window || ins.window}</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={ins.topReadChannels.map(([label, readers]) => ({ label, readers }))}
              layout="vertical"
              margin={{ top: 2, right: 28, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" horizontal={false} />
              <XAxis type="number" stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} />
              <YAxis type="category" dataKey="label" stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 11 }} width={118} />
              <Tooltip
                contentStyle={{ background: '#0a0e14', border: '1px solid #243042', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#e6ebf2' }}
                labelStyle={{ color: '#8a97a8' }}
                formatter={(v) => [Number(v).toLocaleString(), 'readers']}
                cursor={{ fill: '#ffffff08' }}
              />
              <Bar dataKey="readers" fill="#4f9dff" isAnimationActive={false} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-muted text-[11px] mt-3">{ins.note}</p>
    </section>
  );
}
