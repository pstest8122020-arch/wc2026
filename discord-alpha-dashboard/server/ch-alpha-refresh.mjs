#!/usr/bin/env node
/*
 * Hybrid alpha-channel refresh (replaces the browser scrape for recent days).
 *
 *   server/data/raw/<channel>.json  = frozen browser-scraped history (the base).
 *   ClickHouse                      = live message archive, authoritative from
 *                                     Jun 5 on (ingest spin-up before that).
 *
 * For each alpha channel we keep the browser history up to (range.end − 1 day) —
 * dropping the browser's last, possibly-partial day — and let ClickHouse own every
 * full day after that. Calls are classified in Node with the EXACT regex from
 * scraper/scrape-channel.js, so a ClickHouse-derived day counts calls identically
 * to a scraped one. Idempotent: always rebuilds from the frozen base + ClickHouse.
 *
 * Run:  node server/ch-alpha-refresh.mjs   then  npm run ingest
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(DIR, 'data', 'raw');
const HOST = 'https://yveklhjdwm.us-east-1.aws.clickhouse.cloud:8443/';
const AUTH = fs.readFileSync(path.join(DIR, '..', 'ops', '.ch-auth'), 'utf8').trim();
const todayUTC = new Date().toISOString().slice(0, 10);
const CH_FROM = '2026-06-05 00:00:00'; // ClickHouse is reliable from here on for this guild

const CHANNELS = [
  { id: '1498789386890776688', name: 'prediction-alpha' },
  { id: '1498789159010177024', name: 'token-trading' },
  { id: '1498789082870845580', name: 'stock-trading' },
  { id: '1498789219144044678', name: 'yield-hunting' },
];

// --- call classifier: identical to scraper/scrape-channel.js ---
const LINK = /(jup\.ag|polymarket\.com|kalshi\.com|dexscreener\.com|birdeye\.so|pump\.fun|photon|axiom\.trade|geckoterminal|tradingview\.com|raydium|meteora|drift\.trade)/i;
const CASH = /\$[A-Za-z]{2,15}\b/, EVM = /\b0x[a-fA-F0-9]{40}\b/, SOL = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const ACTION = /^\s*(longs?|shorts?|buy(ing|s)?|sell(ing|s)?|ap(e|ed|ing)|entr(y|ies)|scalp\w*|swing\w*|bid\w*|accumulat\w*)\b/i;
const classify = (t) => !!t && (LINK.test(t) || CASH.test(t) || EVM.test(t) || SOL.test(t) || ACTION.test(t));

async function ch(sql) {
  const res = await fetch(HOST, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64') },
    body: sql,
  });
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.text()).trim();
}
const minusDay = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

async function main() {
  const ids = CHANNELS.map((c) => `'${c.id}'`).join(',');
  const raw = await ch(
    `SELECT channel_id, author, author_id, toString(created_at) AS ts, content ` +
    `FROM burst.discord_messages WHERE channel_id IN (${ids}) AND created_at >= '${CH_FROM}' ` +
    `ORDER BY created_at FORMAT JSONEachRow`
  );
  const allMsgs = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));

  for (const c of CHANNELS) {
    const file = path.join(RAW, `${c.name}.json`);
    if (!fs.existsSync(file)) { console.log(`[ch-alpha] ${c.name}: no base file, skipped`); continue; }
    const base = JSON.parse(fs.readFileSync(file, 'utf8'));
    const browserEnd = (base.range && base.range.end) ? base.range.end.slice(0, 10) : null;
    const B = browserEnd ? minusDay(browserEnd) : '2026-06-04'; // splice point; drop browser's last partial day

    // 1) frozen browser history up to and including B
    const daily = {};
    for (const [date, v] of Object.entries(base.daily || {})) if (date <= B) daily[date] = v;

    // 2) ClickHouse for every full day after B
    const dayAgg = {};      // date -> {msgs, calls, posters:Set, callers:Set}
    const callerAgg = {};   // author_id -> {name, msgs, calls}
    for (const m of allMsgs) {
      if (m.channel_id !== c.id) continue;
      const date = m.ts.slice(0, 10);
      if (!(date > B && date < todayUTC)) continue; // only full days strictly after the splice
      const isCall = classify(m.content);
      const d = dayAgg[date] || (dayAgg[date] = { msgs: 0, calls: 0, posters: new Set(), callers: new Set() });
      d.msgs++; d.posters.add(m.author_id); if (isCall) { d.calls++; d.callers.add(m.author_id); }
      const ca = callerAgg[m.author_id] || (callerAgg[m.author_id] = { name: m.author, msgs: 0, calls: 0 });
      ca.msgs++; if (isCall) ca.calls++; if (m.author) ca.name = m.author;
    }
    for (const [date, d] of Object.entries(dayAgg)) daily[date] = [d.msgs, d.calls, d.posters.size, d.callers.size];

    // 3) callers = frozen browser leaderboard + ClickHouse (post-B) merged by user id
    const callerMap = new Map();
    for (const a of (base.callers || [])) { const uid = a[4] || ('name:' + a[0]); callerMap.set(uid, [a[0], a[1] || 0, a[2] || 0, a[3] ? 1 : 0, uid]); }
    for (const [uid, ca] of Object.entries(callerAgg)) {
      const ex = callerMap.get(uid);
      if (ex) { ex[1] += ca.msgs; ex[2] += ca.calls; if (ca.name) ex[0] = ca.name; }
      else callerMap.set(uid, [ca.name, ca.msgs, ca.calls, 0, uid]);
    }
    const callers = [...callerMap.values()].sort((a, b) => b[2] - a[2] || b[1] - a[1]);

    const dates = Object.keys(daily).sort();
    const total = Object.values(daily).reduce((s, v) => s + (v[0] || 0), 0);
    const out = {
      channel: c.name, channelId: c.id, total, daily, callers,
      range: { start: (base.range && base.range.start) || dates[0] || null, end: dates[dates.length - 1] || null },
    };
    fs.writeFileSync(file, JSON.stringify(out));
    const newDays = Object.keys(dayAgg).sort();
    console.log(`[ch-alpha] ${c.name}: history ≤${B} + ${newDays.length} live day(s) [${newDays.join(', ') || '—'}] → end ${out.range.end}, total ${total}, ${callers.length} callers`);
  }
}

main().catch((e) => { console.error('[ch-alpha] FAILED:', e.message); process.exit(1); });
