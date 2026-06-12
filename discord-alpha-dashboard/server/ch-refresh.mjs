#!/usr/bin/env node
/*
 * Hybrid Server-Insights refresh.
 *
 *   insights-base.json  = frozen Discord Server Insights snapshot (the history +
 *                         all Insights-only metrics: readers, visitors, voice,
 *                         audience). Updated only when Insights is re-scraped.
 *   ClickHouse          = live Discord message archive (burst.discord_messages),
 *                         authoritative for every full day AFTER the snapshot.
 *
 * This script always derives the served server-insights.json from the FROZEN base
 * + a fresh ClickHouse query, so it is idempotent — running it daily never
 * double-counts. Message charts (daily / weekly / monthly / avg-msgs-per-
 * communicator) become live; everything Insights-only is passed through unchanged.
 *
 * Boundary: ClickHouse only matches Insights from the snapshot's last day on
 * (earlier ClickHouse days were undercounted during ingest spin-up), so we splice
 * exactly at base.dailyEngagement's last date.
 *
 * Run:  node server/ch-refresh.mjs        (reads creds from ../ops/.ch-auth)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(DIR, 'data');
const HOST = 'https://yveklhjdwm.us-east-1.aws.clickhouse.cloud:8443/';
const GUILD = '897540204506775583';
const AUTH = fs.readFileSync(path.join(DIR, '..', 'ops', '.ch-auth'), 'utf8').trim();
const todayUTC = new Date().toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function ch(sql) {
  const res = await fetch(HOST, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64') },
    body: sql,
  });
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.text()).trim();
}

const weekEndingSunday = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); // advance to that week's Sunday
  return d.toISOString().slice(0, 10);
};
const dayLabel = (s) => { const [, m, d] = s.split('-'); return `${MONTHS[+m - 1]} ${+d}`; };
const monthLabel = (s) => { const [, m] = s.split('-'); return MONTHS[+m - 1]; };
const dayWindow = (a, b) => `${dayLabel(a)} – ${dayLabel(b)}, ${b.slice(0, 4)}`;

async function main() {
  const base = JSON.parse(fs.readFileSync(path.join(DATA, 'insights-base.json'), 'utf8'));
  const baseDaily = base.dailyEngagement.series;
  const insLast = baseDaily[baseDaily.length - 1].date; // splice boundary

  // Per-day messages + communicators (members with >=3 msgs, matching Insights'
  // definition) for every full day strictly after the Insights snapshot.
  const raw = await ch(
    `SELECT d, sum(m) AS msgs, countIf(m >= 3) AS comm FROM (` +
      `SELECT toDate(created_at) d, author_id, count() m FROM burst.discord_messages ` +
      `WHERE guild_id = '${GUILD}' AND created_at > '${insLast} 23:59:59' GROUP BY d, author_id` +
    `) GROUP BY d ORDER BY d FORMAT TabSeparated`
  );
  const chDays = raw.split('\n').filter(Boolean)
    .map((l) => { const [d, msgs, comm] = l.split('\t'); return { date: d, messages: +msgs, comm: +comm }; })
    .filter((x) => x.date < todayUTC) // full UTC days only — drop today's partial
    .map((x) => ({ date: x.date, messages: x.messages, mpc: x.comm ? Math.round((x.messages / x.comm) * 10) / 10 : 0 }));

  // ---- dailyEngagement: frozen base + live ClickHouse, rolling 30 full days ----
  const mergedDaily = [...baseDaily, ...chDays].slice(-30);
  const dailyEngagement = { window: dayWindow(mergedDaily[0].date, mergedDaily[mergedDaily.length - 1].date), series: mergedDaily };

  // ---- weekly: base bars (frozen) + new ClickHouse weeks (Mon–Sun, labelled by Sunday) ----
  const wkSum = new Map();
  for (const day of chDays) { const w = weekEndingSunday(day.date); wkSum.set(w, (wkSum.get(w) || 0) + day.messages); }
  const baseWeekly = base.messageSeries.weekly.bars;
  const lastBaseWeek = baseWeekly[baseWeekly.length - 1].date;
  const newWeeks = [...wkSum.entries()].filter(([w]) => w > lastBaseWeek).sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([w, m]) => ({ date: w, messages: m, partial: w >= todayUTC })); // week still open if its Sunday hasn't passed
  const weeklyBars = [...baseWeekly, ...newWeeks].slice(-52);

  // ---- monthly: extend base months with ClickHouse, add any new months ----
  const moSum = new Map();
  for (const day of chDays) { const mo = day.date.slice(0, 7); moSum.set(mo, (moSum.get(mo) || 0) + day.messages); }
  const curMonth = todayUTC.slice(0, 7);
  const monthlyBars = base.messageSeries.monthly.bars.map((b) => ({
    ...b, messages: b.messages + (moSum.get(b.date) || 0), partial: b.partial || b.date === curMonth,
  }));
  for (const [mo, msgs] of moSum) if (!monthlyBars.some((b) => b.date === mo)) monthlyBars.push({ date: mo, messages: msgs, partial: mo === curMonth });
  monthlyBars.sort((a, b) => (a.date < b.date ? -1 : 1));
  const monthlyTrim = monthlyBars.slice(-24);

  const out = {
    ...base,
    captured: todayUTC,
    messagesSource: `ClickHouse live for days after ${insLast}; Discord Server Insights for earlier history`,
    note: `Daily / weekly / monthly message counts are LIVE from ClickHouse (Discord message archive) for ${insLast} onward, and from Discord Server Insights for earlier history; the two track within ~1% on overlapping days. Readers, visitors, voice, new members and audience remain from Server Insights (no live equivalent). Counts member messages (excludes bots/system); partial days, weeks and months are flagged.`,
    dailyEngagement,
    messageSeries: {
      ...base.messageSeries,
      updated: todayUTC,
      weekly: { window: `${dayWindow(weeklyBars[0].date, weeklyBars[weeklyBars.length - 1].date)} · ${weeklyBars.length} wks`, bars: weeklyBars },
      monthly: { window: `${monthLabel(monthlyTrim[0].date)} – ${monthLabel(monthlyTrim[monthlyTrim.length - 1].date)} ${monthlyTrim[monthlyTrim.length - 1].date.slice(0, 4)}`, bars: monthlyTrim },
    },
  };
  fs.writeFileSync(path.join(DATA, 'server-insights.json'), JSON.stringify(out, null, 2));

  console.log(`[ch-refresh] base ends ${insLast}; appended ${chDays.length} live ClickHouse day(s):`);
  for (const d of chDays) console.log(`    ${d.date}  msgs=${d.messages}  mpc=${d.mpc}`);
  console.log(`[ch-refresh] daily  -> ${dailyEngagement.window} (last ${mergedDaily[mergedDaily.length - 1].date} = ${mergedDaily[mergedDaily.length - 1].messages})`);
  const lw = weeklyBars[weeklyBars.length - 1];
  console.log(`[ch-refresh] weekly -> ${weeklyBars.length} bars (last ${lw.date} = ${lw.messages}${lw.partial ? ' · partial' : ''})`);
  const jm = monthlyTrim.find((b) => b.date === curMonth);
  console.log(`[ch-refresh] monthly-> ${curMonth} = ${jm ? jm.messages : 'n/a'}${jm && jm.partial ? ' · partial' : ''}`);
}

main().catch((e) => { console.error('[ch-refresh] FAILED:', e.message); process.exit(1); });
