import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';

const router = Router();

function slug() {
  return randomBytes(5).toString('hex'); // 10 hex chars
}

function participant(discord) {
  return db.prepare('SELECT discord, wallet_address FROM participants WHERE discord = ?').get(discord);
}

function hasPrediction(discord, matchId) {
  return !!db
    .prepare('SELECT 1 AS x FROM score_predictions WHERE discord = ? AND match_id = ?')
    .get(discord, matchId);
}

// POST /api/duels { discord, wallet_address, match_id }
// Create a duel. Challenger must own the account (wallet match) AND have a
// locked prediction for the (still-upcoming) match — effort precedes artifact.
router.post('/duels', (req, res) => {
  const { discord, wallet_address, match_id } = req.body || {};
  if (!discord || typeof discord !== 'string') return res.status(400).json({ error: 'discord is required' });
  if (!wallet_address || typeof wallet_address !== 'string') {
    return res.status(400).json({ error: 'wallet_address is required to prove ownership' });
  }
  if (!Number.isInteger(match_id)) return res.status(400).json({ error: 'match_id is required' });

  const p = participant(discord.trim());
  if (!p) return res.status(404).json({ error: 'Submit your bracket first.' });
  if (p.wallet_address !== wallet_address.trim()) {
    return res.status(403).json({ error: 'wallet_address does not match this participant.' });
  }

  const match = db.prepare('SELECT id, status FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'SCHEDULED') {
    return res.status(400).json({ error: 'That match has already started — pick an upcoming match.' });
  }
  if (!hasPrediction(discord.trim(), match_id)) {
    return res.status(400).json({ error: 'Lock your prediction for this match before challenging.' });
  }

  const s = slug();
  db.prepare("INSERT INTO duels (invite_slug, challenger, match_id, status) VALUES (?, ?, ?, 'OPEN')").run(
    s,
    discord.trim(),
    match_id,
  );
  res.status(201).json({ ok: true, invite_slug: s });
});

// POST /api/duels/:slug/accept { discord, wallet_address }
// Accept must happen before kickoff and requires the opponent to have their own
// locked prediction — duels can't be farmed after results are known.
router.post('/duels/:slug/accept', (req, res) => {
  const { discord, wallet_address } = req.body || {};
  if (!discord || typeof discord !== 'string') return res.status(400).json({ error: 'discord is required' });
  if (!wallet_address || typeof wallet_address !== 'string') {
    return res.status(400).json({ error: 'wallet_address is required' });
  }

  const d = db.prepare('SELECT * FROM duels WHERE invite_slug = ?').get(req.params.slug);
  if (!d) return res.status(404).json({ error: 'Duel not found' });
  if (d.status !== 'OPEN') return res.status(409).json({ error: 'This duel is no longer open.' });

  const p = participant(discord.trim());
  if (!p) return res.status(404).json({ error: 'Submit your bracket first.' });
  if (p.wallet_address !== wallet_address.trim()) {
    return res.status(403).json({ error: 'wallet_address does not match this participant.' });
  }
  if (discord.trim() === d.challenger) {
    return res.status(400).json({ error: "You can't accept your own challenge." });
  }
  // Anti-sybil: a self-funded pair (same wallet) can't duel itself.
  const challengerWallet = participant(d.challenger)?.wallet_address;
  if (challengerWallet && challengerWallet === wallet_address.trim()) {
    return res.status(400).json({ error: "You can't duel yourself." });
  }

  const match = db.prepare('SELECT status FROM matches WHERE id = ?').get(d.match_id);
  if (!match || match.status !== 'SCHEDULED') {
    return res.status(400).json({ error: 'Too late — that match has already kicked off.' });
  }
  if (!hasPrediction(discord.trim(), d.match_id)) {
    return res.status(400).json({ error: 'Lock your prediction for this match before accepting.' });
  }

  const r = db
    .prepare("UPDATE duels SET opponent = ?, status = 'ACCEPTED' WHERE id = ? AND status = 'OPEN'")
    .run(discord.trim(), d.id);
  if (r.changes === 0) return res.status(409).json({ error: 'This duel was just accepted by someone else.' });
  res.json({ ok: true });
});

// GET /api/duels/:slug — public duel state. Predictions stay hidden until the
// match kicks off (anti-copy), then are revealed alongside the result.
router.get('/duels/:slug', (req, res) => {
  const d = db.prepare('SELECT * FROM duels WHERE invite_slug = ?').get(req.params.slug);
  if (!d) return res.status(404).json({ error: 'Duel not found' });
  const m = db
    .prepare(
      'SELECT id, home_team, away_team, status, home_goals, away_goals, kickoff_utc, match_num FROM matches WHERE id = ?',
    )
    .get(d.match_id);
  const started = m && m.status !== 'SCHEDULED';

  const pickFor = (who) => {
    if (!who || !started) return null;
    const sp = db
      .prepare('SELECT pred_home, pred_away FROM score_predictions WHERE discord = ? AND match_id = ?')
      .get(who, d.match_id);
    return sp ? { pred_home: sp.pred_home, pred_away: sp.pred_away } : null;
  };

  res.json({
    invite_slug: d.invite_slug,
    challenger: d.challenger,
    opponent: d.opponent || null,
    status: d.status,
    winner: d.winner || null,
    challenger_pts: d.challenger_pts,
    opponent_pts: d.opponent_pts,
    match: m || null,
    challenger_pick: pickFor(d.challenger),
    opponent_pick: pickFor(d.opponent),
    can_accept: d.status === 'OPEN' && !!m && m.status === 'SCHEDULED',
  });
});

export default router;
