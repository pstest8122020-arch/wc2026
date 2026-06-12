import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  recalculateMatchScorePredictions,
  recalculateMatchPlayerPicks,
} from '../services/scoring.js';
import { recalculateAllBracketPoints } from '../services/bracketScoring.js';
import { suggestPlayerResult } from '../services/espnScores.js';
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
  // Constant-time compare so the token can't be recovered via response timing.
  const provided = Buffer.from(m ? m[1] : '');
  const expected = Buffer.from(token);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Anti-sybil signals report. Two cheap, defensible clusterings:
//  • ip_clusters: 2+ participants that submitted from the same IP.
//  • duplicate_clusters: 2+ participants whose entire score-prediction set is
//    identical. fork_linked counts members who declared a forked_from inside
//    the cluster (an expected, legitimate copy — not necessarily sybil).
router.get('/sybil-report', (req, res) => {
  const ip_clusters = db
    .prepare(
      `SELECT submit_ip AS ip, COUNT(*) AS count, GROUP_CONCAT(discord, '|') AS discords
         FROM participants
        WHERE submit_ip IS NOT NULL AND submit_ip != ''
        GROUP BY submit_ip
       HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC`,
    )
    .all()
    .map((r) => ({ ip: r.ip, count: r.count, participants: String(r.discords || '').split('|').filter(Boolean) }));

  // Build a per-participant signature from their score predictions (sorted for
  // order-independence), then group identical signatures.
  const preds = db.prepare('SELECT discord, match_id, pred_home, pred_away FROM score_predictions').all();
  const parts = new Map();
  for (const p of preds) {
    if (!parts.has(p.discord)) parts.set(p.discord, []);
    parts.get(p.discord).push(`${p.match_id}:${p.pred_home}:${p.pred_away}`);
  }
  const bySig = new Map();
  for (const [discord, arr] of parts) {
    if (!arr.length) continue;
    const sig = arr.sort().join(',');
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(discord);
  }
  const forkOf = new Map(
    db.prepare("SELECT discord, forked_from FROM participants WHERE forked_from IS NOT NULL AND forked_from != ''").all()
      .map((f) => [f.discord, f.forked_from]),
  );
  const duplicate_clusters = [];
  for (const [, discords] of bySig) {
    if (discords.length < 2) continue;
    const set = new Set(discords);
    const fork_linked = discords.filter((d) => set.has(forkOf.get(d))).length;
    duplicate_clusters.push({ size: discords.length, participants: discords, fork_linked });
  }
  duplicate_clusters.sort((a, b) => b.size - a.size);

  res.json({ ip_clusters, duplicate_clusters });
});

router.get('/stats', (req, res) => {
  const participants = db.prepare('SELECT COUNT(*) AS c FROM participants').get().c;
  const score_subs = db.prepare('SELECT COUNT(*) AS c FROM score_predictions').get().c;
  const player_subs = db.prepare('SELECT COUNT(*) AS c FROM player_picks').get().c;
  const live = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='LIVE'").get().c;
  const finished = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='FINISHED'").get().c;
  const scheduled = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status='SCHEDULED'").get().c;
  const last_sync = db.prepare('SELECT ran_at, ok, message FROM sync_log ORDER BY id DESC LIMIT 1').get() || null;
  const jupiter_clicks = db
    .prepare(
      "SELECT event, COUNT(*) AS total, COUNT(DISTINCT COALESCE(discord, ip)) AS unique_users FROM link_clicks GROUP BY event ORDER BY total DESC",
    )
    .all();
  res.json({
    participants,
    score_predictions: score_subs,
    player_picks: player_subs,
    matches: { live, finished, scheduled },
    jupiter_clicks,
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
  recalculateAllBracketPoints();
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

// Suggested player result from ESPN's scoring plays (scorers canonicalized to
// roster spellings). Pre-fill only — nothing is saved until the admin submits.
router.get('/matches/:id/espn-suggest', async (req, res) => {
  try {
    res.json(await suggestPlayerResult(Number(req.params.id)));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
});

router.post('/awards', (req, res) => {
  const { golden_boot, best_young, player_tournament } = req.body || {};
  db.prepare(`
    INSERT INTO tournament_awards (id, golden_boot, best_young, player_tournament)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      golden_boot = excluded.golden_boot,
      best_young = excluded.best_young,
      player_tournament = excluded.player_tournament
  `).run(
    golden_boot || null,
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

router.post('/jupiter/refresh', async (req, res) => {
  const { refreshJupiterOddsNow } = await import('../services/jupiterPredict.js');
  try {
    const result = await refreshJupiterOddsNow();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Manually trigger the eligibility-refresh cron immediately. Runs the same
// logic that fires automatically every 30 min for all ineligible+pending
// participants. Useful right before payout to make sure no one was missed.
router.post('/eligibility/refresh-all', async (req, res) => {
  const { refreshOnce } = await import('../services/eligibilityRefresh.js');
  try {
    const result = await refreshOnce();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.get('/participants', (req, res) => {
  const rows = db
    .prepare(
      `SELECT discord, wallet_address, submitted_at,
              eligibility_status, eligibility_reason, eligibility_checked_at
         FROM participants ORDER BY submitted_at DESC`,
    )
    .all();
  res.json(rows);
});

// Manually re-run the eligibility check for one participant. Result is stored.
router.post('/participants/:discord/recheck', async (req, res) => {
  const { checkJupiterPredictEligibility } = await import('../services/wallet.js');
  const p = db
    .prepare('SELECT discord, wallet_address FROM participants WHERE discord = ?')
    .get(req.params.discord);
  if (!p) return res.status(404).json({ error: 'Participant not found' });
  if (!p.wallet_address) return res.status(400).json({ error: 'Participant has no wallet on file' });

  const result = await checkJupiterPredictEligibility(p.wallet_address);
  const status = result.skipped ? 'pending' : result.eligible ? 'eligible' : 'ineligible';
  db.prepare(
    `UPDATE participants
       SET eligibility_status = ?, eligibility_reason = ?, eligibility_checked_at = datetime('now')
       WHERE discord = ?`,
  ).run(status, result.reason || null, p.discord);
  res.json({ ok: true, eligibility_status: status, ...result });
});

// Mark a participant as disqualified (e.g. admin determined cheating).
// Disqualified entries stay in the DB but are excluded from the leaderboard.
router.post('/participants/:discord/disqualify', (req, res) => {
  const { reason } = req.body || {};
  const r = db
    .prepare(
      `UPDATE participants
         SET eligibility_status = 'disqualified', eligibility_reason = ?, eligibility_checked_at = datetime('now')
         WHERE discord = ?`,
    )
    .run(reason || 'Disqualified by admin', req.params.discord);
  if (r.changes === 0) return res.status(404).json({ error: 'Participant not found' });
  res.json({ ok: true });
});

router.post('/participants/:discord/reinstate', (req, res) => {
  const r = db
    .prepare(
      `UPDATE participants
         SET eligibility_status = 'pending', eligibility_reason = NULL
         WHERE discord = ?`,
    )
    .run(req.params.discord);
  if (r.changes === 0) return res.status(404).json({ error: 'Participant not found' });
  res.json({ ok: true });
});

export default router;
