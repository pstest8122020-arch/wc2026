import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());

// --- optional HTTP Basic Auth gate (enabled when DASHBOARD_PASSWORD is set) ---
// /api/health is always open so Fly's health checks pass.
const PW = process.env.DASHBOARD_PASSWORD;
const USER = process.env.DASHBOARD_USER || 'jupiter';
if (PW) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
      if (u === USER && p === PW) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Alpha Dashboard"');
    return res.status(401).send('Authentication required');
  });
}

const getChannels = db.prepare('SELECT * FROM channels ORDER BY total_calls DESC');
const getDaily = db.prepare('SELECT channel_id, date, msgs, calls, posters, callers FROM daily ORDER BY date ASC');
const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
const getCallersForChannel = db.prepare(
  'SELECT name, msgs, calls, is_bot FROM callers WHERE channel_id = ? ORDER BY calls DESC, msgs DESC'
);
const getCallersAll = db.prepare(
  `SELECT name, SUM(msgs) AS msgs, SUM(calls) AS calls, MAX(is_bot) AS is_bot
   FROM callers GROUP BY name ORDER BY calls DESC, msgs DESC`
);

// Per-channel summary + global totals
app.get('/api/overview', (_req, res) => {
  const channels = getChannels.all();
  const totals = {
    channels: channels.length,
    messages: channels.reduce((s, c) => s + c.total_messages, 0),
    calls: channels.reduce((s, c) => s + c.total_calls, 0),
  };
  const union = db
    .prepare('SELECT COUNT(*) AS n FROM (SELECT name FROM callers WHERE calls > 0 GROUP BY name)')
    .get();
  totals.distinctCallers = union.n;
  res.json({ generatedAt: getMeta.get('ingested_at')?.value || null, totals, channels });
});

// Daily time series for every channel (data is small — return it all)
app.get('/api/series', (_req, res) => {
  const rows = getDaily.all();
  const byChannel = {};
  for (const r of rows) {
    (byChannel[r.channel_id] ||= []).push({
      date: r.date,
      msgs: r.msgs,
      calls: r.calls,
      posters: r.posters,
      callers: r.callers,
    });
  }
  res.json(byChannel);
});

// Caller leaderboard, per channel (?channel=ID) or aggregated across all
app.get('/api/callers', (req, res) => {
  const ch = req.query.channel;
  res.json(ch ? getCallersForChannel.all(ch) : getCallersAll.all());
});

// Server-wide Discord metrics snapshot (from Server Insights)
const insightsPath = path.join(__dirname, 'data', 'server-insights.json');
app.get('/api/insights', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(insightsPath, 'utf8')));
  } catch (e) {
    res.status(404).json({ error: 'no insights snapshot' });
  }
});

// Verified prediction-alpha caller standings (snapshot from jupcallers.fun)
const predCallersPath = path.join(__dirname, 'data', 'prediction-callers.json');
app.get('/api/prediction-callers', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(predCallersPath, 'utf8')));
  } catch (e) {
    res.status(404).json({ error: 'no prediction-callers snapshot' });
  }
});

// Reddit subreddit insights snapshot (manual, from r/jupiterexchange mod insights)
const redditPath = path.join(__dirname, 'data', 'reddit-insights.json');
app.get('/api/reddit', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(redditPath, 'utf8')));
  } catch (e) {
    res.status(404).json({ error: 'no reddit snapshot' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- serve the built client (production) ---
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
// SPA fallback: any non-API route returns index.html (Express 5 safe)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => console.log(`[server] alpha dashboard on http://localhost:${PORT}`));
