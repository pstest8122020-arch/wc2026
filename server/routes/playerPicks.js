import { Router } from 'express';
import { db } from '../db.js';
import { hasUnsafeText } from '../services/text.js';
import { getSession } from '../services/session.js';
import { ensureParticipantForSession, recordSubmitMeta } from '../services/participants.js';
import { recheckOne } from '../services/eligibilityRefresh.js';
import { discordConfigured } from './auth.js';

const router = Router();

const LOCK_WINDOW_MS = 15 * 60 * 1000;

router.post('/player-picks', (req, res) => {
  const {
    discord: bodyDiscord,
    wallet_address,
    match_id,
    first_scorer,
    assist_player,
    motm,
    pred_home,
    pred_away,
  } = req.body || {};

  if (!Number.isInteger(match_id)) {
    return res.status(400).json({ error: 'match_id is required' });
  }
  if (!motm || typeof motm !== 'string' || !motm.trim()) {
    return res.status(400).json({ error: 'motm is required' });
  }
  for (const [field, val] of [
    ['first_scorer', first_scorer],
    ['assist_player', assist_player],
    ['motm', motm],
  ]) {
    if (typeof val === 'string' && val.length > 80) {
      return res.status(400).json({ error: `${field} is too long (max 80 characters)` });
    }
    if (hasUnsafeText(val)) {
      return res.status(400).json({ error: `${field} contains invalid characters` });
    }
  }

  // Identity: a verified Discord session when login is configured (the username
  // comes from the session, never the body); otherwise the legacy username +
  // wallet flow for environments without Discord.
  let discord;
  if (discordConfigured()) {
    const session = getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Log in with Discord to make match picks.' });
    }
    discord = ensureParticipantForSession(session);
    if (!discord) return res.status(401).json({ error: 'Invalid session.' });
  } else {
    if (!bodyDiscord || typeof bodyDiscord !== 'string' || !bodyDiscord.trim()) {
      return res.status(400).json({ error: 'discord is required' });
    }
    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({ error: 'wallet_address is required to prove ownership' });
    }
    if (hasUnsafeText(bodyDiscord)) {
      return res.status(400).json({ error: 'discord contains invalid characters (< or >)' });
    }
    const participant = db
      .prepare('SELECT wallet_address FROM participants WHERE discord = ?')
      .get(bodyDiscord);
    if (!participant) {
      return res.status(403).json({ error: 'Username not registered. Submit your bracket first.' });
    }
    if (participant.wallet_address !== wallet_address.trim()) {
      return res.status(403).json({ error: 'wallet_address does not match this participant.' });
    }
    discord = bodyDiscord.trim();
  }
  recordSubmitMeta(req, discord); // anti-sybil signal (report-only)

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

  // Entry requirement: every entrant needs a Solana wallet (eligibility + payouts).
  // It's collected ONCE — via the bracket, or for late joiners here on their first
  // match pick — then stored on the account so we never ask again. No wallet on
  // file and none supplied → the pick can't be saved.
  const me = db.prepare('SELECT wallet_address FROM participants WHERE discord = ?').get(discord.trim());
  if (!me || !me.wallet_address) {
    const w = String(wallet_address || '').trim();
    if (!w) {
      return res.status(403).json({
        error: 'Add your Solana wallet to enter — the challenge is open to Jupiter Prediction Markets users, and your wallet is checked for eligibility and payouts.',
      });
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) {
      return res.status(400).json({ error: 'That does not look like a valid Solana wallet address.' });
    }
    // Store it + mark pending, then fire an immediate background re-check so it
    // resolves in seconds (dedicated RPC). No blocking; the cron is the backstop.
    try {
      db.prepare(
        "UPDATE participants SET wallet_address = ?, eligibility_status = 'pending', eligibility_reason = NULL, eligibility_checked_at = NULL WHERE discord = ?",
      ).run(w, discord.trim());
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({
          error: 'That wallet is already linked to another entry — each wallet can only be used once.',
        });
      }
      throw e;
    }
    void recheckOne(discord.trim(), w); // fire-and-forget; never blocks the response
  }

  // Score prediction. New clients send the scoreline with the match picks; older
  // ones omit it (we then fall back to any previously-saved score). Predicting
  // 0–0 means there's no first scorer / assist to pick (UI mirrors this lock).
  let scoreProvided = false;
  let ph;
  let pa;
  if (pred_home !== undefined && pred_home !== null && pred_home !== '') {
    ph = Number(pred_home);
    pa = Number(pred_away);
    if (!Number.isInteger(ph) || !Number.isInteger(pa) || ph < 0 || pa < 0 || ph > 20 || pa > 20) {
      return res.status(400).json({ error: 'Predicted score must be whole numbers between 0 and 20.' });
    }
    scoreProvided = true;
  }

  let goalless;
  if (scoreProvided) {
    goalless = ph === 0 && pa === 0;
  } else {
    const existing = db
      .prepare('SELECT pred_home, pred_away FROM score_predictions WHERE discord = ? AND match_id = ?')
      .get(discord.trim(), match_id);
    goalless = !!existing && existing.pred_home === 0 && existing.pred_away === 0;
  }

  if (!goalless) {
    for (const [k, v] of [
      ['first_scorer', first_scorer],
      ['assist_player', assist_player],
    ]) {
      if (!v || typeof v !== 'string' || !v.trim()) {
        return res.status(400).json({ error: `${k} is required` });
      }
    }
  }

  const fs = goalless ? '' : first_scorer.trim();
  const as = goalless ? '' : assist_player.trim();

  const upsertPicks = db.prepare(`
    INSERT INTO player_picks (discord, match_id, first_scorer, assist_player, motm)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord, match_id) DO UPDATE SET
      first_scorer = excluded.first_scorer,
      assist_player = excluded.assist_player,
      motm = excluded.motm,
      submitted_at = datetime('now')
  `);
  const upsertScore = db.prepare(`
    INSERT INTO score_predictions (discord, match_id, pred_home, pred_away)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(discord, match_id) DO UPDATE SET
      pred_home = excluded.pred_home,
      pred_away = excluded.pred_away,
      points_earned = 0
  `);

  const tx = db.transaction(() => {
    if (scoreProvided) upsertScore.run(discord.trim(), match_id, ph, pa);
    upsertPicks.run(discord.trim(), match_id, fs, as, motm.trim());
  });
  tx();

  res.json({ ok: true, goalless, score_saved: scoreProvided });
});

// Session-based: ALL of the logged-in user's match picks (score + players) joined with
// match info, for the "My picks" page. Distinct path (/my-player-picks) so it isn't
// shadowed by /player-picks/:matchId. Returns [] when none.
router.get('/my-player-picks', (req, res) => {
  if (!discordConfigured()) return res.status(404).json({ error: 'Not available.' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in.' });
  const me = db
    .prepare('SELECT discord FROM participants WHERE discord_id = ?')
    .get(String(session.did || ''));
  if (!me) return res.json([]);
  const rows = db
    .prepare(
      `SELECT m.id AS match_id, m.match_num, m.round, m.home_team, m.away_team,
              m.kickoff_utc, m.status,
              s.pred_home, s.pred_away,
              pp.first_scorer, pp.assist_player, pp.motm,
              pp.fs_points, pp.assist_points, pp.motm_points, s.points_earned AS score_points
         FROM matches m
         LEFT JOIN score_predictions s ON s.match_id = m.id AND s.discord = ?
         LEFT JOIN player_picks pp     ON pp.match_id = m.id AND pp.discord = ?
        WHERE s.discord IS NOT NULL OR pp.discord IS NOT NULL
        ORDER BY m.kickoff_utc, m.match_num`,
    )
    .all(me.discord, me.discord);
  res.json(rows);
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

// Session-based: load the LOGGED-IN user's own saved pick + score for one match, so the
// per-match form can PREFILL on revisit. The wallet-keyed /mine/:discord/:matchId route
// below can't be used by the Discord-session client (it never holds the raw wallet) — which
// is exactly why saved picks looked "erased": they were saved, just never loaded back.
// Read-only; never creates a participant. Returns the merged pick/score or null.
router.get('/player-picks/mine/:matchId', (req, res) => {
  if (!discordConfigured()) return res.status(404).json({ error: 'Not available.' });
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId)) return res.status(400).json({ error: 'Invalid match id' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in.' });
  const me = db
    .prepare('SELECT discord FROM participants WHERE discord_id = ?')
    .get(String(session.did || ''));
  if (!me) return res.json(null);
  const pick = db
    .prepare('SELECT first_scorer, assist_player, motm FROM player_picks WHERE discord = ? AND match_id = ?')
    .get(me.discord, matchId);
  const score = db
    .prepare('SELECT pred_home, pred_away FROM score_predictions WHERE discord = ? AND match_id = ?')
    .get(me.discord, matchId);
  if (!pick && !score) return res.json(null);
  res.json({ ...(score || {}), ...(pick || {}) });
});

router.get('/player-picks/mine/:discord/:matchId', (req, res) => {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId)) return res.status(400).json({ error: 'Invalid match id' });
  // Ownership check: must pass ?wallet=<exact wallet> matching the participant.
  const claimedWallet = (req.query.wallet || '').toString().trim();
  const participant = db
    .prepare('SELECT wallet_address FROM participants WHERE discord = ?')
    .get(req.params.discord);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  if (!claimedWallet || participant.wallet_address !== claimedWallet) {
    return res.status(403).json({ error: 'wallet does not match this participant' });
  }
  const pick = db
    .prepare('SELECT * FROM player_picks WHERE discord = ? AND match_id = ?')
    .get(req.params.discord, matchId);
  if (!pick) return res.status(404).json({ error: 'No pick found' });
  res.json(pick);
});

export default router;
