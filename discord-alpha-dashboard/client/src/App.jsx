import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { getOverview, getSeries, getInsights, getPredictionCallers, getReddit } from './api.js';
import { META, ORDER } from './channels.js';
import ServerOverview from './ServerOverview.jsx';

/* ---------- helpers ---------- */
const fmtDay = (iso) =>
  typeof iso === 'string' && iso.includes('-') ? `${+iso.split('-')[1]}/${+iso.split('-')[2]}` : '';
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

function fullDateRange(dates) {
  if (!dates.length) return [];
  const s = [...dates].sort();
  const out = [];
  const cur = new Date(s[0] + 'T00:00:00Z');
  const end = new Date(s[s.length - 1] + 'T00:00:00Z');
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const METRICS = [
  { key: 'calls', label: 'Calls', blurb: 'messages stating an explicit position/bet' },
  { key: 'callers', label: 'Active callers', blurb: 'distinct people who posted ≥1 call that day' },
  { key: 'msgs', label: 'Messages', blurb: 'all posts in the channel' },
  { key: 'posters', label: 'Posters', blurb: 'distinct people who posted anything that day' },
];

/* ---------- small components ---------- */
function Kpi({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-panel border border-edge px-5 py-4">
      <div className="text-muted text-xs uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-extrabold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-muted text-xs mt-1">{sub}</div>}
    </div>
  );
}

function ChartTip({ active, payload, label, single }) {
  if (!active || !payload?.length) return null;
  const rows = single ? payload : payload.filter((p) => p.value > 0);
  return (
    <div className="rounded-lg bg-ink border border-edge px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold mb-1">{fmtDay(label)}</div>
      {rows.length === 0 && <div className="text-muted">—</div>}
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: p.color || p.stroke }} />
          {!single && <span className="text-muted">{META(p.dataKey).label}</span>}
          <span className="ml-auto font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function MetricChart({ metric, channel, byChannel }) {
  const dates = useMemo(() => {
    if (channel === 'all') {
      const s = new Set();
      Object.values(byChannel).forEach((m) => Object.keys(m).forEach((d) => s.add(d)));
      return fullDateRange([...s]);
    }
    return fullDateRange(Object.keys(byChannel[channel] || {}));
  }, [channel, byChannel]);

  const data = useMemo(
    () =>
      dates.map((date) => {
        if (channel === 'all') {
          const row = { date };
          ORDER.forEach((n) => (row[n] = byChannel[n]?.[date]?.[metric.key] || 0));
          return row;
        }
        return { date, value: byChannel[channel]?.[date]?.[metric.key] || 0 };
      }),
    [dates, channel, byChannel, metric.key]
  );

  const total = data.reduce(
    (s, r) => s + (channel === 'all' ? ORDER.reduce((a, n) => a + (r[n] || 0), 0) : r.value),
    0
  );

  return (
    <div className="rounded-2xl bg-panel border border-edge p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">{metric.label}</h3>
        <span className="text-2xl font-extrabold tabular-nums">{total.toLocaleString()}</span>
      </div>
      <p className="text-muted text-xs mb-3">{metric.blurb}</p>
      <ResponsiveContainer width="100%" height={200}>
        {channel === 'all' ? (
          <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} minTickGap={22} />
            <YAxis stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} allowDecimals={false} width={28} />
            <Tooltip content={<ChartTip />} />
            {ORDER.map((n) => (
              <Line key={n} type="monotone" dataKey={n} stroke={META(n).color} dot={false} strokeWidth={2} isAnimationActive={false} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} minTickGap={22} />
            <YAxis stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} allowDecimals={false} width={28} />
            <Tooltip content={<ChartTip single />} cursor={{ fill: '#ffffff08' }} />
            <Bar dataKey="value" fill={META(channel).color} isAnimationActive={false} radius={[2, 2, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ReadersTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-lg bg-ink border border-edge px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold mb-1">{p.label}</div>
      <div className="flex items-center gap-2"><span className="text-muted">Readers</span><span className="ml-auto font-semibold tabular-nums">{(p.readers || 0).toLocaleString()}</span></div>
      <div className="flex items-center gap-2"><span className="text-muted">Chatters</span><span className="ml-auto font-semibold tabular-nums">{(p.chatters || 0).toLocaleString()}</span></div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-ink/40 border border-edge px-3 py-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-muted text-[11px] uppercase tracking-wide mt-1">{label}</div>
      {sub && <div className="text-muted text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}

function ReadersCard({ channel }) {
  const [cr, setCr] = useState(null);
  useEffect(() => {
    getInsights().then((i) => setCr(i.channelReaders || null)).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const pc = cr?.perChannel || {};
    return ORDER.map((n) => ({
      name: n,
      label: META(n).label,
      color: META(n).color,
      readers: pc[n]?.readers || 0,
      chatters: pc[n]?.chatters || 0,
    }));
  }, [cr]);

  if (!cr) {
    return (
      <div className="rounded-2xl bg-panel border border-edge p-5 flex flex-col min-h-[260px]">
        <h3 className="font-bold">Readers / views</h3>
        <div className="flex-1 flex items-center justify-center text-muted text-sm">loading…</div>
      </div>
    );
  }

  // single-channel view
  if (channel !== 'all') {
    const r = rows.find((x) => x.name === channel) || { readers: 0, chatters: 0 };
    const ranked = [...rows].sort((a, b) => b.readers - a.readers);
    const rank = ranked.findIndex((x) => x.name === channel) + 1;
    const conv = r.readers ? Math.round((r.chatters / r.readers) * 100) : 0;
    return (
      <div className="rounded-2xl bg-panel border border-edge p-5 flex flex-col">
        <div className="flex items-baseline justify-between">
          <h3 className="font-bold">Readers / views</h3>
          <span className="text-2xl font-extrabold tabular-nums">{r.readers.toLocaleString()}</span>
        </div>
        <p className="text-muted text-xs mb-4">unique viewers · {META(channel).label} · {cr.window}</p>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Readers" value={r.readers.toLocaleString()} sub="opened channel" />
          <Stat label="Chatters" value={r.chatters.toLocaleString()} sub="posted ≥1 msg" />
          <Stat label="Reader→chatter" value={conv + '%'} sub="conversion" />
        </div>
        <p className="text-muted text-[11px] mt-auto pt-3">
          #{rank} of {rows.length} alpha channels by readers · {cr.note}
        </p>
      </div>
    );
  }

  // all-channels comparison
  const total = rows.reduce((s, r) => s + r.readers, 0);
  const data = [...rows].sort((a, b) => b.readers - a.readers);
  return (
    <div className="rounded-2xl bg-panel border border-edge p-5 flex flex-col">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">Readers / views</h3>
        <span className="text-2xl font-extrabold tabular-nums">{total.toLocaleString()}</span>
      </div>
      <p className="text-muted text-xs mb-3">unique viewers per channel · {cr.window}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 16, left: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" horizontal={false} />
          <XAxis type="number" stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} width={92} />
          <Tooltip content={<ReadersTip />} cursor={{ fill: '#ffffff08' }} />
          <Bar dataKey="readers" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {data.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-muted text-[11px] mt-2">{cr.note}</p>
    </div>
  );
}

function CallerLeaderboard({ channel }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    getPredictionCallers().then(setData).catch(() => {});
  }, []);

  // Success rate is only measurable where markets resolve win/loss → prediction-alpha only.
  if (channel !== 'prediction-alpha') {
    const who = channel === 'all' ? 'Token, stock, and yield' : META(channel).label;
    return (
      <section className="rounded-2xl bg-panel/60 border border-dashed border-edge p-5 mb-10">
        <h2 className="font-bold text-lg mb-1">Caller success rate</h2>
        <p className="text-muted text-sm max-w-3xl">
          Only measurable for <span className="text-white/90">prediction-alpha</span>, where markets resolve
          win/loss. {who} calls have no objective resolution, so a success rate can’t be scored. Switch to the
          prediction-alpha tab for the verified leaderboard (from{' '}
          <a className="text-[#4f9dff] hover:underline" href="https://jupcallers.fun/" target="_blank" rel="noreferrer">
            jupcallers.fun
          </a>
          ).
        </p>
      </section>
    );
  }

  if (!data) return null;
  const fmtPnl = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v}%`);
  return (
    <section className="rounded-2xl bg-panel border border-edge p-5 mb-10">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h2 className="font-bold text-lg">🔮 Verified caller leaderboard · prediction-alpha</h2>
        <a className="text-muted text-xs hover:text-white" href="https://jupcallers.fun/" target="_blank" rel="noreferrer">
          source: jupcallers.fun ↗
        </a>
      </div>
      <p className="text-muted text-xs mb-4 max-w-3xl">
        Success = wins ÷ resolved calls · PnL = return if entered at the call price and held to resolution ·{' '}
        {data.window}. Ranked = ≥{data.minSample} resolved calls; rising = fewer (provisional).
      </p>
      <div className="overflow-hidden rounded-lg border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-8">#</th>
              <th className="text-left font-medium px-4 py-2">Caller</th>
              <th className="text-right font-medium px-4 py-2">W–L</th>
              <th className="text-right font-medium px-4 py-2">Success</th>
              <th className="text-right font-medium px-4 py-2">Total PnL</th>
            </tr>
          </thead>
          <tbody>
            {data.callers.map((c) => (
              <tr key={c.rank} className="border-t border-edge hover:bg-panel2/50">
                <td className="px-4 py-2 text-muted tabular-nums">{c.rank}</td>
                <td className="px-4 py-2 font-medium">
                  <span className="truncate">{c.name}</span>
                  {c.tier === 'rising' && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">rising</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted">
                  {c.wins}–{c.losses}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="font-semibold tabular-nums">
                    {c.successPct == null ? '—' : `${c.successPct}%`}
                  </span>
                  <span className="block text-[10px] text-muted">
                    {c.graded ? `${c.graded} graded` : 'no graded'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">
                  <span className={c.pnlPct == null ? 'text-muted' : c.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {fmtPnl(c.pnlPct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RedditPostList({ title, posts, period }) {
  return (
    <div className="rounded-xl bg-panel border border-edge p-4">
      <div className="text-sm font-semibold mb-2">
        {title} <span className="text-muted font-normal">· {period}</span>
      </div>
      <div className="divide-y divide-edge">
        {posts.map((p, i) => (
          <div key={i} className="flex items-start gap-3 py-2">
            <span className="text-muted tabular-nums text-xs w-4 shrink-0 mt-0.5">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug line-clamp-2">{p.title}</div>
              <div className="text-muted text-[11px] mt-0.5">
                {p.author} · {p.age}
              </div>
            </div>
            <span className="font-semibold tabular-nums text-sm shrink-0">{p.metric}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RedditView() {
  const [r, setR] = useState(null);
  useEffect(() => {
    getReddit().then(setR).catch(() => {});
  }, []);
  if (!r) return <div className="py-16 text-center text-muted">Loading Reddit…</div>;
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h2 className="font-bold text-lg">👽 {r.subreddit} · Reddit insights</h2>
        <a className="text-muted text-xs hover:text-white" href={r.url} target="_blank" rel="noreferrer">
          {r.window} · snapshot {r.captured} ↗
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {r.kpis.map((k) => (
          <div key={k.key} className="rounded-xl bg-panel border border-edge px-4 py-4">
            <div className="text-muted text-[10px] uppercase tracking-wide">{k.label}</div>
            <div className="text-2xl font-extrabold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[11px] mt-0.5 leading-tight">
              {k.delta && (
                <span className={k.delta.startsWith('-') ? 'text-red-400' : 'text-emerald-400'}>{k.delta} </span>
              )}
              <span className="text-muted">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <RedditPostList title="Most viewed posts" posts={r.topViewed} period={(r.window || '').toLowerCase()} />
        <RedditPostList title="Most engaging posts" posts={r.topEngaging} period={(r.window || '').toLowerCase()} />
      </div>

      <p className="text-muted text-[11px]">{r.note}</p>
    </section>
  );
}

/* ---------- main ---------- */
export default function App() {
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState(null);
  const [channel, setChannel] = useState('all'); // 'all' | channel name
  const [view, setView] = useState('discord'); // 'discord' | 'reddit'
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getOverview(), getSeries()])
      .then(([o, s]) => {
        setOverview(o);
        setSeries(s);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const idToName = useMemo(() => {
    const m = {};
    overview?.channels.forEach((c) => (m[c.id] = c.name));
    return m;
  }, [overview]);
  // daily rows keyed by channel NAME -> date -> {msgs,calls,posters,callers}
  const byChannel = useMemo(() => {
    const out = {};
    if (!series) return out;
    for (const [cid, rows] of Object.entries(series)) {
      const name = idToName[cid] || cid;
      out[name] = {};
      for (const r of rows) out[name][r.date] = r;
    }
    return out;
  }, [series, idToName]);

  // total messages per day (stacked by channel), respects the selected channel
  const msgDaily = useMemo(() => {
    const names = channel === 'all' ? ORDER : [channel];
    const dateSet = new Set();
    names.forEach((n) => Object.keys(byChannel[n] || {}).forEach((d) => dateSet.add(d)));
    return fullDateRange([...dateSet]).map((date) => {
      const row = { date, total: 0 };
      names.forEach((n) => {
        const m = byChannel[n]?.[date]?.msgs || 0;
        row[n] = m;
        row.total += m;
      });
      return row;
    });
  }, [channel, byChannel]);

  const channelsOrdered = useMemo(
    () =>
      (overview?.channels || []).slice().sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name)),
    [overview]
  );

  if (error)
    return <div className="p-8 text-red-400">Failed to load: {error}. Is the API on :8787 and ingested?</div>;

  const ready = !!(overview && series);
  // KPIs reflect the current selection (only when Discord data is loaded)
  const sel = ready && channel !== 'all' ? channelsOrdered.find((c) => c.name === channel) : null;
  const kpis = !ready
    ? null
    : sel
    ? { calls: sel.total_calls, messages: sel.total_messages, callers: sel.distinct_callers, posters: sel.distinct_posters, days: sel.active_days, start: sel.start_ts, end: sel.end_ts }
    : {
        calls: overview.totals.calls,
        messages: overview.totals.messages,
        callers: overview.totals.distinctCallers,
        posters: null,
        days: null,
        start: null,
        end: null,
      };

  const TABS = [{ name: 'all', label: 'All channels', emoji: '🛰' }, ...ORDER.map((n) => ({ name: n, label: META(n).label, emoji: META(n).emoji }))];

  return (
    <div className="min-h-full max-w-6xl mx-auto px-5 py-8">
      <header className="mb-4">
        <div className="flex items-center gap-2 text-muted text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          Jupiter · {view === 'reddit' ? 'Reddit' : 'Discord'}
        </div>
        <h1 className="text-3xl font-extrabold mt-1">Jupiter Community Vitals</h1>
      </header>

      {/* platform tabs */}
      <div className="flex gap-2 mb-6">
        {[
          ['discord', '🛰', 'Discord'],
          ['reddit', '👽', 'Reddit'],
        ].map(([v, emoji, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-lg text-sm border transition ${
              view === v
                ? 'bg-panel2 border-edge text-white'
                : 'bg-ink/40 border-transparent text-muted hover:text-white hover:border-edge'
            }`}
          >
            <span className="mr-1">{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      {view === 'reddit' ? (
        <RedditView />
      ) : !ready ? (
        <div className="py-16 text-center text-muted">Loading…</div>
      ) : (
        <>
          <ServerOverview />

      <h2 className="font-bold text-lg mb-3">🪙 Alpha channels · call metrics</h2>

      {/* channel selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => {
          const activeTab = channel === t.name;
          return (
            <button
              key={t.name}
              onClick={() => setChannel(t.name)}
              className={`px-3.5 py-1.5 rounded-lg text-sm border transition ${
                activeTab ? 'bg-panel2 border-edge text-white' : 'bg-ink/40 border-transparent text-muted hover:text-white hover:border-edge'
              }`}
              style={activeTab && t.name !== 'all' ? { boxShadow: `inset 0 -2px 0 ${META(t.name).color}` } : undefined}
            >
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="Calls" value={kpis.calls.toLocaleString()} sub={sel ? 'in this channel' : 'all channels'} />
        <Kpi label="Messages" value={kpis.messages.toLocaleString()} sub={sel ? 'in this channel' : 'all channels'} />
        <Kpi label="Distinct callers" value={kpis.callers} sub="posted ≥1 call" />
        <Kpi
          label={sel ? 'Active days' : 'Channels'}
          value={sel ? kpis.days : overview.totals.channels}
          sub={sel ? `${fmtDate(kpis.start)} – ${fmtDate(kpis.end)}` : 'alpha channels'}
        />
      </section>

      {/* total messages per day */}
      <section className="rounded-2xl bg-panel border border-edge p-5 mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="font-bold">Total messages / day</h3>
          <span className="text-2xl font-extrabold tabular-nums">
            {msgDaily.reduce((s, r) => s + r.total, 0).toLocaleString()}
          </span>
        </div>
        <p className="text-muted text-xs mb-3">
          {channel === 'all' ? 'all alpha channels, stacked by channel' : META(channel).label} · posts per day
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={msgDaily} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2735" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} minTickGap={20} />
            <YAxis stroke="#3a4658" tick={{ fill: '#8a97a8', fontSize: 10 }} width={40} allowDecimals={false} />
            <Tooltip content={<ChartTip />} cursor={{ fill: '#ffffff08' }} />
            {(channel === 'all' ? ORDER : [channel]).map((n) => (
              <Bar key={n} dataKey={n} stackId="m" fill={META(n).color} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* separate graph per metric */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg">
          {channel === 'all' ? 'All channels' : `${META(channel).emoji} ${META(channel).label}`} — daily trends
        </h2>
        <span className="text-muted text-xs">{channel === 'all' ? 'one line per channel' : 'bars = this channel'}</span>
      </div>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {METRICS.map((m) => (
          <MetricChart key={m.key} metric={m} channel={channel} byChannel={byChannel} />
        ))}
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <ReadersCard channel={channel} />
      </section>

      {/* caller success — only measurable for prediction-alpha (jupcallers.fun) */}
      <CallerLeaderboard channel={channel} />

          <footer className="text-center text-muted text-xs pb-8">
            UI-scroll scrape · counts reflect messages visible to your account · re-run the scraper and
            <code className="mx-1 text-edge">npm run ingest</code> to refresh.
          </footer>
        </>
      )}
    </div>
  );
}
