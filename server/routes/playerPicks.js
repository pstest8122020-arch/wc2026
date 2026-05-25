import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const LOCK_WINDOW_MS = 15 * 60 * 1000;

router.post('/player-picks', (req, res) => {
  const { discord, match_id, first_scorer, assist_player, motm } = req.body || {};

  if (!discord || typeof discord !== 'string' || !discord.trim()) {
    return res.status(400).json({ error: 'discord is required' });
  }
  if (!Number.isInteger(match_id)) {
    return res.status(400).json({ error: 'match_id is required' });
  }
  for (const [k, v] of [
    ['first_scorer', first_scorer],
    ['assist_player', assist_player],
    ['motm', motm],
  ]) {
    if (!v || typeof v !== 'string' || !v.trim()) {
      return res.status(400).json({ error: `${k} is required` });
    }
  }

  const participant = db.prepare('SELECT id FROM participants WHERE discord = ?').get(discord);
  if (!participant) {
    return res.status(403).json({
      error: 'Discord username not registered. Submit your bracket first.',
    });
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  if (match.status !== 'SCHEDULED') {
    return res.status(403).json({ error: 'Picks for this match are closed.' });
  }
  if (match.kickoff_utc) {
    const kickoff = new Date(match.kickoff_utc).getTime();
    if (Number.isFinite(kickoff) && kickoff - Date.now() <= LOCK_WINDOW_MS) {
      return res.status(403).json({ error: 'Picks for this match are closed (within 15 minutes of kickoff).' });
    }
  }

  const stmt = db.prepare(`
    INSERT INTO player_picks (discord, match_id, first_scorer, assist_player, motm)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord, match_id) DO UPDATE SET
      first_scorer = excluded.first_scorer,
      assist_player = excluded.assist_player,
      motm = excluded.motm,
      submitted_at = datetime('now')
  `);
  stmt.run(discord.trim(), match_id, first_scorer.trim(), assist_player.trim(), motm.trim());

  res.json({ ok: true });
});

router.get('/player-picks/:matchId', (req, res) => {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId)) return res.status(400).json({ error: 'Invalid match id' });

  const match = db.prepare('SELECT status FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  if (match.status !== 'FINISHED') {
    return res
      .status(403)
      .json({ error: 'Picks for this match are not visible until the match has finished.' });
  }

  const picks = db
    .prepare(
      `SELECT discord, first_scorer, assist_player, motm,
              fs_points, assist_points, motm_points
         FROM player_picks WHERE match_id = ?
         ORDER BY (fs_points + assist_points + motm_points) DESC, discord ASC`,
    )
    .all(matchId);
  res.json(picks);
});

router.get('/player-picks/mine/:discord/:matchId', (req, res) => {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId)) return res.status(400).json({ error: 'Invalid match id' });
  const pick = db
    .prepare('SELECT * FROM player_picks WHERE discord = ? AND match_id = ?')
    .get(req.params.discord, matchId);
  if (!pick) return res.status(404).json({ error: 'No pick found' });
  res.json(pick);
});

export default router;
