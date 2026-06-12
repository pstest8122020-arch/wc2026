// Loads scraped channel JSON (data/raw/*.json) into SQLite.
// Idempotent: clears + reloads every run, so re-scraping then re-ingesting just works.
//
// Caller identity is keyed on the Discord user id captured during the scrape; each user is
// collapsed to ONE canonical display name (the name they used in the most messages) so the
// same person under different display names isn't double-counted across channels.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, 'data', 'raw');

function load() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`[ingest] no raw dir at ${RAW_DIR}`);
    return [];
  }
  return fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8')));
}

// Normalize a channel's callers to [name, msgs, calls, bot, uid].
// New format: array of [name, msgs, calls, bot, uid]. Legacy: { name: [msgs, calls, bot] }.
function normCallers(c) {
  const raw = Array.isArray(c.callers)
    ? c.callers
    : Object.entries(c.callers || {}).map(([n, v]) => [n, v[0], v[1], v[2], 'name:' + n]);
  return raw.map(([name, msgs, calls, bot, uid]) => [
    name,
    msgs || 0,
    calls || 0,
    bot ? 1 : 0,
    uid || 'name:' + name,
  ]);
}

const wipe = db.transaction(() => {
  db.exec('DELETE FROM channels; DELETE FROM daily; DELETE FROM callers;');
});

const insertChannel = db.prepare(`INSERT INTO channels
  (id, name, total_messages, total_calls, distinct_callers, distinct_posters, active_days, start_ts, end_ts)
  VALUES (@id, @name, @total_messages, @total_calls, @distinct_callers, @distinct_posters, @active_days, @start_ts, @end_ts)`);
const insertDaily = db.prepare(`INSERT INTO daily (channel_id, date, msgs, calls, posters, callers)
  VALUES (?, ?, ?, ?, ?, ?)`);
const insertCaller = db.prepare(`INSERT INTO callers (channel_id, name, msgs, calls, is_bot)
  VALUES (?, ?, ?, ?, ?)`);
const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');

const run = db.transaction((channels) => {
  wipe();

  // Pass 1: canonical display name per user id = the name they used in the most messages.
  const uidNames = new Map(); // uid -> Map(name -> msgCount)
  for (const c of channels)
    for (const [name, msgs, , , uid] of normCallers(c)) {
      const m = uidNames.get(uid) || new Map();
      m.set(name, (m.get(name) || 0) + msgs);
      uidNames.set(uid, m);
    }
  const canonical = new Map();
  for (const [uid, names] of uidNames) {
    let best = null;
    let bestN = -1;
    for (const [n, cnt] of names) if (cnt > bestN) { best = n; bestN = cnt; }
    canonical.set(uid, best);
  }

  // Pass 2: per channel, merge callers by canonical name and insert.
  for (const c of channels) {
    const byName = new Map();
    for (const [name, msgs, calls, bot, uid] of normCallers(c)) {
      const cn = canonical.get(uid) || name;
      const e = byName.get(cn) || { msgs: 0, calls: 0, bot: 0 };
      e.msgs += msgs;
      e.calls += calls;
      e.bot = e.bot || bot;
      byName.set(cn, e);
    }
    const distinctPosters = byName.size;
    const distinctCallers = [...byName.values()].filter((v) => v.calls > 0).length;
    const dailyEntries = Object.entries(c.daily || {});
    const totalCalls = dailyEntries.reduce((s, [, v]) => s + (v[1] || 0), 0);

    insertChannel.run({
      id: c.channelId,
      name: c.channel,
      total_messages: c.total || 0,
      total_calls: totalCalls,
      distinct_callers: distinctCallers,
      distinct_posters: distinctPosters,
      active_days: dailyEntries.length,
      start_ts: c.range?.start || null,
      end_ts: c.range?.end || null,
    });
    for (const [date, v] of dailyEntries) {
      insertDaily.run(c.channelId, date, v[0] || 0, v[1] || 0, v[2] || 0, v[3] || 0);
    }
    for (const [name, v] of byName) {
      insertCaller.run(c.channelId, name, v.msgs, v.calls, v.bot);
    }
  }

  setMeta.run('ingested_at', new Date().toISOString());
  setMeta.run('channel_count', String(channels.length));
});

const channels = load();
run(channels);
console.log(`[ingest] loaded ${channels.length} channels: ${channels.map((c) => c.channel).join(', ')}`);
