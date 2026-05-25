import { Router } from 'express';
import { db } from '../db.js';
import {
  recalculateMatchScorePredictions,
  recalculateMatchPlayerPicks,
} from '../services/scoring.js';
import {
  emitLeaderboard,
  emitMatchUpdated,
  emitPlayerPicksUnlocked,
} from '../socket.js';

const router = Router();

router.use((req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Admin token not configured on server' });
  }
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m || m[1] !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/stats', (req, res) => {
  const participants = db.prepare('SELECT COUNT(*) AS c FROM participants').get().c;
  const score_subs = db.prepare('SELECT COUNT(*) AS c FROM score_predictions').get().c;
  const player_subs = db.prepare('SELECT COUNT(*) AS c FROM player_picks').get().c;
  const live = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='LIVE'").get().c;
  const finished = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='FINISHED'").get().c;
  const scheduled = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='SCHEDULED'").get().c;
  const last_sync = db.prepare('SELECT ran_at, ok, message FROM sync_log ORDER BY id DESC LIMIT 1').get() || null;
  res.json({
    participants,
    score_predictions: score_subs,
    player_picks: player_subs,
    matches: { live, finished, scheduled },
    last_sync,
  });
});

router.post('/matches/:id/result', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { home_goals, away_goals, status } = req.body || {};
  if (
    !Number.isInteger(home_goals) ||
    !Number.isInteger(away_goals) ||
    home_goals < 0 ||
    away_goals < 0
  ) {
    return res.status(400).json({ error: 'home_goals and away_goals must be non-negative integers' });
  }
  const newStatus = status === 'LIVE' || status === 'SCHEDULED' ? status : 'FINISHED';

  db.prepare(
    'UPDATE matches SET home_goals = ?, away_goals = ?, status = ?, manual_result = 1 WHERE id = ?',
  ).run(home_goals, away_goals, newStatus, id);

  recalculateMatchScorePredictions(id);
  emitMatchUpdated(id);
  emitLeaderboard();
  if (newStatus === 'FINISHED') emitPlayerPicksUnlocked(id);

  res.json({ ok: true });
});

router.post('/matches/:id/unlock', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const r = db.prepare('UPDATE matches SET manual_result = 0 WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Match not found' });
  res.json({ ok: true });
});

router.post('/matches/:id/player-result', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { first_scorer, all_scorers, assist_players, motm } = req.body || {};
  const allScorersArr = Array.isArray(all_scorers)
    ? all_scorers
    : typeof all_scorers === 'string'
      ? all_scorers.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const assistArr = Array.isArray(assist_players)
    ? assist_players
    : typeof assist_players === 'string'
      ? assist_players.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  db.prepare(`
    INSERT INTO match_player_results (match_id, first_scorer, all_scorers, assist_players, motm, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(match_id) DO UPDATE SET
      first_scorer = excluded.first_scorer,
      all_scorers  = excluded.all_scorers,
      assist_players = excluded.assist_players,
      motm = excluded.motm,
      updated_at = datetime('now')
  `).run(
    id,
    first_scorer || null,
    JSON.stringify(allScorersArr),
    JSON.stringify(assistArr),
    motm || null,
  );

  recalculateMatchPlayerPicks(id);
  emitMatchUpdated(id);
  emitLeaderboard();
  emitPlayerPicksUnlocked(id);

  res.json({ ok: true });
});

router.get('/matches/:id/player-result', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('SELECT * FROM match_player_results WHERE match_id = ?').get(id);
  if (!result) return res.json(null);
  let all_scorers = [];
  let assist_players = [];
  try { all_scorers = JSON.parse(result.all_scorers || '[]'); } catch {}
  try { assist_players = JSON.parse(result.assist_players || '[]'); } catch {}
  res.json({ ...result, all_scorers, assist_players });
});

router.post('/awards', (req, res) => {
  const { golden_boot, top_assister, golden_glove, best_young, player_tournament } = req.body || {};
  db.prepare(`
    INSERT INTO tournament_awards (id, golden_boot, top_assister, golden_glove, best_young, player_tournament)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      golden_boot = excluded.golden_boot,
      top_assister = excluded.top_assister,
      golden_glove = excluded.golden_glove,
      best_young = excluded.best_young,
      player_tournament = excluded.player_tournament
  `).run(
    golden_boot || null,
    top_assister || null,
    golden_glove || null,
    best_young || null,
    player_tournament || null,
  );
  emitLeaderboard();
  res.json({ ok: true });
});

router.get('/awards', (req, res) => {
  const row = db.prepare('SELECT * FROM tournament_awards WHERE id = 1').get();
  res.json(row || null);
});

router.post('/sync', async (req, res) => {
  const { runOnce } = await import('../services/sync.js');
  try {
    const result = await runOnce();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.get('/participants', (req, res) => {
  const rows = db
    .prepare(
      `SELECT discord, email, referred_by, submitted_at FROM participants ORDER BY submitted_at DESC`,
    )
    .all();
  res.json(rows);
});

export default router;
