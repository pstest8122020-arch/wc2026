import { Router } from 'express';
import { db } from '../db.js';
import { computeLeaderboard, prizeFor } from '../services/scoring.js';
import { isValidSolanaPubkey, checkJupiterPredictEligibility } from '../services/wallet.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isInt(v) {
  return Number.isInteger(v);
}

// Matches whose teams are known (not 'TBD') and still SCHEDULED — these are
// the ones a participant can submit a score prediction for right now.
function openMatchIds() {
  return new Set(
    db
      .prepare(
        `SELECT id FROM matches
           WHERE status = 'SCHEDULED'
             AND home_team != 'TBD'
             AND away_team != 'TBD'`,
      )
      .all()
      .map((m) => m.id),
  );
}

router.get('/participants/:discord', (req, res) => {
  const discord = req.params.discord;
  const participant = db.prepare('SELECT * FROM participants WHERE discord = ?').get(discord);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  const scorePreds = db
    .prepare(
      `SELECT sp.*, m.round, m.group_name, m.match_num, m.home_team, m.away_team,
              m.home_goals, m.away_goals, m.status, m.kickoff_utc, m.pts_multiplier
         FROM score_predictions sp
         JOIN matches m ON m.id = sp.match_id
         WHERE sp.discord = ?
         ORDER BY m.match_num`,
    )
    .all(discord);

  const playerPicks = db
    .prepare(
      `SELECT pp.*, m.round, m.match_num, m.home_team, m.away_team, m.status
         FROM player_picks pp
         JOIN matches m ON m.id = pp.match_id
         WHERE pp.discord = ?
         ORDER BY m.match_num`,
    )
    .all(discord);

  const board = computeLeaderboard();
  const me = board.find((r) => r.discord === discord);
  const totals = me || {
    rank: null,
    score_pts: 0,
    player_pts: 0,
    award_pts: 0,
    total: 0,
    prize: 0,
    matches_played: 0,
  };

  res.json({
    discord: participant.discord,
    wallet_address: participant.wallet_address,
    submitted_at: participant.submitted_at,
    awards: {
      golden_boot: participant.pick_golden_boot,
      top_assister: participant.pick_top_assister,
      golden_glove: participant.pick_golden_glove,
      best_young: participant.pick_best_young,
      player_tournament: participant.pick_player_tournament,
    },
    score_predictions: scorePreds,
    player_picks: playerPicks,
    totals,
  });
});

// Initial submission: registers a participant, locks award picks, and inserts
// score predictions for all *currently known* matches (group stage at launch).
router.post('/predictions', async (req, res) => {
  const body = req.body || {};
  const { discord, wallet_address, awards, scores } = body;

  if (!discord || typeof discord !== 'string' || !discord.trim()) {
    return res.status(400).json({ error: 'discord is required' });
  }
  if (discord.length > 50) {
    return res.status(400).json({ error: 'discord must be 50 characters or fewer' });
  }
  if (!wallet_address || typeof wallet_address !== 'string') {
    return res.status(400).json({ error: 'wallet_address is required' });
  }
  if (!isValidSolanaPubkey(wallet_address.trim())) {
    return res.status(400).json({
      error: 'wallet_address must be a valid Solana wallet address (base58, 32 bytes)',
    });
  }
  if (!awards || typeof awards !== 'object') {
    return res.status(400).json({ error: 'awards are required' });
  }
  const requiredAwards = [
    'golden_boot',
    'top_assister',
    'golden_glove',
    'best_young',
    'player_tournament',
  ];
  for (const k of requiredAwards) {
    if (!awards[k] || typeof awards[k] !== 'string' || !awards[k].trim()) {
      return res.status(400).json({ error: `awards.${k} is required` });
    }
  }
  if (!Array.isArray(scores)) {
    return res.status(400).json({ error: 'scores must be an array' });
  }

  const existingDiscord = db.prepare('SELECT id FROM participants WHERE discord = ?').get(discord);
  if (existingDiscord) {
    return res
      .status(409)
      .json({ error: 'A submission already exists for this Discord username.' });
  }
  const existingWallet = db
    .prepare('SELECT discord FROM participants WHERE wallet_address = ?')
    .get(wallet_address.trim());
  if (existingWallet) {
    return res
      .status(409)
      .json({ error: 'This wallet address has already been used for a submission.' });
  }

  const firstMatch = db.prepare('SELECT status FROM matches WHERE match_num = 1').get();
  if (firstMatch && firstMatch.status !== 'SCHEDULED') {
    return res
      .status(403)
      .json({ error: 'Submissions are closed: the tournament has already started.' });
  }

  const openIds = openMatchIds();

  if (scores.length !== openIds.size) {
    return res.status(400).json({
      error: `Expected ${openIds.size} predictions (one per match with confirmed teams), got ${scores.length}`,
    });
  }

  const seen = new Set();
  for (const s of scores) {
    if (!s || !isInt(s.match_id) || !isInt(s.pred_home) || !isInt(s.pred_away)) {
      return res.status(400).json({ error: 'Each score requires integer match_id, pred_home, pred_away' });
    }
    if (s.pred_home < 0 || s.pred_home > 20 || s.pred_away < 0 || s.pred_away > 20) {
      return res.status(400).json({ error: 'Goals must be integers 0-20' });
    }
    if (!openIds.has(s.match_id)) {
      return res.status(400).json({ error: `Match ${s.match_id} is not open for predictions` });
    }
    if (seen.has(s.match_id)) {
      return res.status(400).json({ error: `Duplicate prediction for match ${s.match_id}` });
    }
    seen.add(s.match_id);
  }

  // Jupiter Predict eligibility — skipped (returns eligible:true) if the env
  // var isn't set, so devs can run locally without configuring a program ID.
  const eligibility = await checkJupiterPredictEligibility(wallet_address.trim());
  if (!eligibility.eligible) {
    return res.status(403).json({
      error: `Wallet not eligible: ${eligibility.reason}. Interact with Jupiter Predict, then re-submit.`,
    });
  }

  const insertParticipant = db.prepare(`
    INSERT INTO participants
      (discord, wallet_address, pick_golden_boot, pick_top_assister,
       pick_golden_glove, pick_best_young, pick_player_tournament)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertScore = db.prepare(`
    INSERT INTO score_predictions (discord, match_id, pred_home, pred_away)
    VALUES (?, ?, ?, ?)
  `);

  try {
    const tx = db.transaction(() => {
      insertParticipant.run(
        discord.trim(),
        wallet_address.trim(),
        awards.golden_boot.trim(),
        awards.top_assister.trim(),
        awards.golden_glove.trim(),
        awards.best_young.trim(),
        awards.player_tournament.trim(),
      );
      for (const s of scores) {
        insertScore.run(discord.trim(), s.match_id, s.pred_home, s.pred_away);
      }
    });
    tx();
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({
        error: 'A submission already exists for this Discord username or wallet.',
      });
    }
    console.error('[predictions] insert failed', e);
    return res.status(500).json({ error: 'Internal error' });
  }

  res.status(201).json({
    ok: true,
    discord: discord.trim(),
    eligibility,
  });
});

// Extend: an existing participant adds score predictions for matches that
// became known after their initial submission (e.g. knockout rounds once the
// draw is set). Awards stay locked; predictions are insert-only.
router.post('/predictions/extend', (req, res) => {
  const { discord, scores } = req.body || {};

  if (!discord || typeof discord !== 'string') {
    return res.status(400).json({ error: 'discord is required' });
  }
  const participant = db.prepare('SELECT id FROM participants WHERE discord = ?').get(discord.trim());
  if (!participant) return res.status(404).json({ error: 'Participant not found — submit your bracket first.' });

  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({ error: 'scores must be a non-empty array' });
  }

  const openIds = openMatchIds();
  const already = new Set(
    db
      .prepare('SELECT match_id FROM score_predictions WHERE discord = ?')
      .all(discord.trim())
      .map((r) => r.match_id),
  );

  for (const s of scores) {
    if (!s || !isInt(s.match_id) || !isInt(s.pred_home) || !isInt(s.pred_away)) {
      return res.status(400).json({ error: 'Each score requires integer match_id, pred_home, pred_away' });
    }
    if (s.pred_home < 0 || s.pred_home > 20 || s.pred_away < 0 || s.pred_away > 20) {
      return res.status(400).json({ error: 'Goals must be integers 0-20' });
    }
    if (!openIds.has(s.match_id)) {
      return res.status(400).json({ error: `Match ${s.match_id} is not open for predictions` });
    }
    if (already.has(s.match_id)) {
      return res.status(409).json({ error: `Prediction already exists for match ${s.match_id}` });
    }
  }

  const insertScore = db.prepare(`
    INSERT INTO score_predictions (discord, match_id, pred_home, pred_away)
    VALUES (?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const s of scores) {
      insertScore.run(discord.trim(), s.match_id, s.pred_home, s.pred_away);
    }
  });
  tx();
  res.json({ ok: true, added: scores.length });
});

router.get('/participants/:discord/rank', (req, res) => {
  const board = computeLeaderboard();
  const me = board.find((r) => r.discord === req.params.discord);
  if (!me) return res.status(404).json({ error: 'Not found' });
  res.json(me);
});

export { prizeFor, EMAIL_RE };
export default router;
