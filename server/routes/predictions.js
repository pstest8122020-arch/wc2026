import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { computeLeaderboardCached, prizeFor } from '../services/scoring.js';
import { isValidSolanaPubkey, checkJupiterPredictEligibility } from '../services/wallet.js';
import { hasUnsafeText } from '../services/text.js';
import { getSession } from '../services/session.js';
import { discordConfigured } from './auth.js';

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

// Public participant lookup. Two access levels:
//
// - Anonymous: returns metadata, score predictions, FINISHED-match player picks,
//   totals. Does NOT include wallet_address. Does NOT include picks for matches
//   that haven't finished (otherwise others could copy your scorer/MOTM picks).
//
// - Owner (proves identity by passing ?wallet=<exact pubkey>): also receives the
//   full player_picks list and the masked wallet, so MyPicks can show
//   pre-match picks to the actual user.
// Shared bracket-view builder used by both the public lookup and the logged-in
// "my bracket" endpoint. isOwner unlocks the full (pre-kickoff) view.
function buildParticipantView(participant, isOwner) {
  const discord = participant.discord;

  // Submissions are "closed" once match #1 has started. Until then, exposing
  // a participant's predictions or award picks would let late submitters copy
  // them. After close, the picks are locked anyway — safe to show publicly.
  const firstMatch = db.prepare("SELECT status FROM matches WHERE match_num = 1").get();
  const submissionsClosed = !!firstMatch && firstMatch.status !== 'SCHEDULED';
  const canSeePredictions = isOwner || submissionsClosed;

  const scorePreds = canSeePredictions
    ? db
        .prepare(
          `SELECT sp.*, m.round, m.group_name, m.match_num, m.home_team, m.away_team,
                  m.home_goals, m.away_goals, m.status, m.kickoff_utc, m.pts_multiplier
             FROM score_predictions sp
             JOIN matches m ON m.id = sp.match_id
             WHERE sp.discord = ?
             ORDER BY m.match_num`,
        )
        .all(discord)
    : [];

  const playerPicksSql = isOwner
    ? `SELECT pp.*, m.round, m.match_num, m.home_team, m.away_team, m.status
         FROM player_picks pp
         JOIN matches m ON m.id = pp.match_id
         WHERE pp.discord = ?
         ORDER BY m.match_num`
    : `SELECT pp.*, m.round, m.match_num, m.home_team, m.away_team, m.status
         FROM player_picks pp
         JOIN matches m ON m.id = pp.match_id
         WHERE pp.discord = ? AND m.status = 'FINISHED'
         ORDER BY m.match_num`;
  const playerPicks = db.prepare(playerPicksSql).all(discord);

  const board = computeLeaderboardCached();
  const meRow = board.find((r) => r.discord === discord);
  const totals = meRow || {
    rank: null,
    score_pts: 0,
    player_pts: 0,
    award_pts: 0,
    total: 0,
    prize: 0,
    matches_played: 0,
  };

  // Awards: same gating as predictions — hide from non-owners until close.
  const awards = canSeePredictions
    ? {
        golden_boot: participant.pick_golden_boot,
        best_young: participant.pick_best_young,
        player_tournament: participant.pick_player_tournament,
      }
    : null;

  return {
    discord: participant.discord,
    submitted_at: participant.submitted_at,
    forked_from: participant.forked_from || null,
    is_owner: isOwner,
    submissions_closed: submissionsClosed,
    // Wallet only shown to owner, and masked for display.
    wallet_masked:
      isOwner && participant.wallet_address
        ? `${participant.wallet_address.slice(0, 4)}…${participant.wallet_address.slice(-4)}`
        : null,
    awards,
    score_predictions: scorePreds,
    player_picks: playerPicks,
    totals,
  };
}

// Logged-in user's own bracket, identified by the Discord session — always the
// owner view. MUST be declared before /participants/:discord so "me" isn't
// captured as a :discord param.
router.get('/participants/me', (req, res) => {
  if (!discordConfigured()) return res.status(404).json({ error: 'Not available' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Log in with Discord to see your picks.' });
  const participant = db
    .prepare('SELECT * FROM participants WHERE discord_id = ?')
    .get(String(session.did || ''));
  if (!participant) return res.status(404).json({ error: 'no_bracket', handle: session.h });
  res.json(buildParticipantView(participant, true));
});

router.get('/participants/:discord', (req, res) => {
  const participant = db
    .prepare('SELECT * FROM participants WHERE discord = ?')
    .get(req.params.discord);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  // Public view only. The owner view (wallet, pre-close picks) is exclusively via
  // the authenticated /participants/me (Discord session) — knowing a wallet no
  // longer elevates access.
  res.json(buildParticipantView(participant, false));
});

// Initial submission: registers a participant, locks award picks, and inserts
// score predictions for all *currently known* matches (group stage at launch).
router.post('/predictions', async (req, res) => {
  // DISABLED. The legacy multi-step submission is superseded by the bracket builder
  // (POST /my-bracket) + match picks (POST /player-picks), which enforce the real
  // locks: the bracket at the first kickoff, each match pick 15 minutes before its
  // own kickoff. This path gated on match-#1 *status* (looser than the kickoff time)
  // and wrote score predictions with no 15-minute check, so its write is closed to
  // prevent a lock bypass. The GET views further below stay live.
  return res.status(410).json({
    error: 'This submission flow has been replaced — build your bracket on the home page.',
  });
  const body = req.body || {};
  const { wallet_address, awards, scores } = body;

  // Identity. With "Log in with Discord" enabled, the entrant must be logged in
  // and the username comes from the verified session — never the request body —
  // so nobody can submit under a handle they don't control. Without it, fall
  // back to the legacy free-text username.
  const session = getSession(req);
  let discord;
  let discordId = null;
  if (discordConfigured()) {
    if (!session) {
      return res.status(401).json({ error: 'Log in with Discord to submit your bracket.' });
    }
    discord = String(session.h || '').trim().slice(0, 50);
    discordId = String(session.did || '');
    if (!discord || !discordId) {
      return res.status(401).json({ error: 'Your login expired — please log in with Discord again.' });
    }
  } else {
    discord = body.discord;
    if (!discord || typeof discord !== 'string' || !discord.trim()) {
      return res.status(400).json({ error: 'discord is required' });
    }
    if (discord.length > 50) {
      return res.status(400).json({ error: 'discord must be 50 characters or fewer' });
    }
    if (hasUnsafeText(discord)) {
      return res.status(400).json({ error: 'discord contains invalid characters (< or >)' });
    }
    discord = discord.trim();
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
    'best_young',
    'player_tournament',
  ];
  for (const k of requiredAwards) {
    if (!awards[k] || typeof awards[k] !== 'string' || !awards[k].trim()) {
      return res.status(400).json({ error: `awards.${k} is required` });
    }
    if (awards[k].length > 80) {
      return res.status(400).json({ error: `awards.${k} is too long` });
    }
    if (hasUnsafeText(awards[k])) {
      return res.status(400).json({ error: `awards.${k} contains invalid characters (< or >)` });
    }
  }
  if (!Array.isArray(scores)) {
    return res.status(400).json({ error: 'scores must be an array' });
  }

  if (discordId) {
    const existingById = db
      .prepare('SELECT id FROM participants WHERE discord_id = ?')
      .get(discordId);
    if (existingById) {
      return res
        .status(409)
        .json({ error: 'You have already submitted a bracket with this Discord account.' });
    }
  }
  const existingDiscord = db
    .prepare('SELECT id FROM participants WHERE discord = ? COLLATE NOCASE')
    .get(discord.trim());
  if (existingDiscord) {
    return res
      .status(409)
      .json({ error: 'A submission already exists for this username.' });
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

  // Jupiter Prediction eligibility — verified post-hoc. We run the check here
  // and store the result, but never block the submission. Admin can disqualify
  // ineligible entries later via the admin dashboard. This is friendlier to
  // users who're about to make their first Predict trade but want to lock in
  // a bracket first.
  const eligibility = await checkJupiterPredictEligibility(wallet_address.trim());
  const eligibility_status = eligibility.skipped
    ? 'pending'
    : eligibility.eligible
      ? 'eligible'
      : 'ineligible';
  const eligibility_reason = eligibility.reason || null;

  // Provenance: if this submission was forked from someone's shared bracket.
  const rawFork = typeof body.forked_from === 'string' ? body.forked_from.trim() : '';
  const forkedFrom =
    rawFork && rawFork !== discord.trim() && db.prepare('SELECT 1 AS x FROM participants WHERE discord = ?').get(rawFork)
      ? rawFork
      : null;

  // Anti-sybil: record the real client IP + user-agent at submit time. Behind Fly's
  // proxy, req.ip / X-Forwarded-For resolve to Fly's own edge address, so prefer Fly's
  // authoritative `Fly-Client-IP` header (set by the proxy, not client-spoofable).
  // Admin-only signal; never returned on public endpoints.
  const submitIp = (
    req.headers['fly-client-ip'] ||
    req.ip ||
    req.socket?.remoteAddress ||
    ''
  )
    .toString()
    .replace(/^::ffff:/, '')
    .slice(0, 64);
  const submitUa = (req.headers['user-agent'] || '').toString().slice(0, 256);

  const insertParticipant = db.prepare(`
    INSERT INTO participants
      (discord, discord_id, wallet_address, pick_golden_boot, pick_best_young,
       pick_player_tournament, forked_from,
       eligibility_status, eligibility_reason, eligibility_checked_at,
       submit_ip, submit_user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `);
  const insertScore = db.prepare(`
    INSERT INTO score_predictions (discord, match_id, pred_home, pred_away)
    VALUES (?, ?, ?, ?)
  `);

  try {
    const tx = db.transaction(() => {
      insertParticipant.run(
        discord.trim(),
        discordId || null,
        wallet_address.trim(),
        awards.golden_boot.trim(),
        awards.best_young.trim(),
        awards.player_tournament.trim(),
        forkedFrom,
        eligibility_status,
        eligibility_reason,
        submitIp,
        submitUa,
      );
      for (const s of scores) {
        insertScore.run(discord.trim(), s.match_id, s.pred_home, s.pred_away);
      }
    });
    tx();
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({
        error: 'A submission already exists for this username or wallet.',
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
// Brackets are final once submitted. There is intentionally NO public endpoint
// to add or change picks: the only identity we have is username + wallet, both
// of which are effectively public, so any open mutation endpoint would let a
// stranger rewrite someone else's entry. Corrections go through an admin.
router.post('/predictions/extend', (req, res) => {
  return res.status(403).json({
    error: 'Brackets are locked after submission — picks can no longer be added or changed. Contact an admin if you need a correction.',
  });
});

// Edit a submitted bracket — allowed only for the logged-in OWNER (the Discord
// session whose discord_id matches the bracket), and only before kickoff. With
// the verified session as the gate, knowing a username + wallet is no longer
// enough to rewrite someone's picks. Without Discord login there is no public
// edit path (admin-only corrections).
router.post('/predictions/update', (req, res) => {
  // DISABLED (see POST /predictions). Edits go through the bracket builder
  // (POST /my-bracket — locked at the first kickoff) and match picks
  // (POST /player-picks — locked 15 min before each kickoff). This legacy path
  // gated on match-#1 status and skipped the 15-minute score lock, so it's closed.
  return res.status(410).json({
    error: 'Editing here has been replaced — edit your bracket on the home page before kickoff.',
  });
  if (!discordConfigured()) {
    return res
      .status(403)
      .json({ error: 'Editing is disabled. Contact an admin for a correction.' });
  }
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Log in with Discord to edit your bracket.' });
  }
  const participant = db
    .prepare('SELECT id, discord FROM participants WHERE discord_id = ?')
    .get(String(session.did || ''));
  if (!participant) {
    return res.status(404).json({ error: 'No bracket found for your account.' });
  }
  const discord = participant.discord;

  const firstMatch = db.prepare("SELECT status FROM matches WHERE match_num = 1").get();
  if (firstMatch && firstMatch.status !== 'SCHEDULED') {
    return res.status(403).json({ error: 'Picks are locked: the tournament has started.' });
  }

  const { scores, awards } = req.body || {};
  const hasScores = Array.isArray(scores) && scores.length > 0;
  const hasAwards = awards && typeof awards === 'object';
  if (!hasScores && !hasAwards) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  if (hasScores) {
    const openIds = openMatchIds();
    const owned = new Set(
      db
        .prepare('SELECT match_id FROM score_predictions WHERE discord = ?')
        .all(discord)
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
        return res.status(400).json({ error: `Match ${s.match_id} is locked or not open` });
      }
      if (!owned.has(s.match_id)) {
        return res.status(400).json({ error: `No existing prediction for match ${s.match_id}` });
      }
    }
  }

  const awardKeys = ['golden_boot', 'best_young', 'player_tournament'];
  if (hasAwards) {
    for (const k of awardKeys) {
      if (!awards[k] || typeof awards[k] !== 'string' || !awards[k].trim()) {
        return res.status(400).json({ error: `awards.${k} is required` });
      }
      if (awards[k].length > 80) {
        return res.status(400).json({ error: `awards.${k} is too long` });
      }
      if (hasUnsafeText(awards[k])) {
        return res.status(400).json({ error: `awards.${k} contains invalid characters (< or >)` });
      }
    }
  }

  const tx = db.transaction(() => {
    if (hasScores) {
      const upd = db.prepare(
        'UPDATE score_predictions SET pred_home = ?, pred_away = ? WHERE discord = ? AND match_id = ?',
      );
      for (const s of scores) upd.run(s.pred_home, s.pred_away, discord, s.match_id);
    }
    if (hasAwards) {
      db.prepare(
        `UPDATE participants SET
           pick_golden_boot = ?, pick_best_young = ?, pick_player_tournament = ?
         WHERE discord = ?`,
      ).run(
        awards.golden_boot.trim(),
        awards.best_young.trim(),
        awards.player_tournament.trim(),
        discord,
      );
    }
  });
  tx();
  res.json({ ok: true, updated: hasScores ? scores.length : 0, awardsUpdated: !!hasAwards });
});

// --- Copy-a-bracket (fork-to-edit) -----------------------------------------

// POST /api/participants/:discord/share-token  { wallet_address }
// Owner mints (or re-returns) an unguessable copy link token.
router.post('/participants/:discord/share-token', (req, res) => {
  const discord = req.params.discord;
  const { wallet_address } = req.body || {};
  const p = db.prepare('SELECT wallet_address FROM participants WHERE discord = ?').get(discord);
  if (!p) return res.status(404).json({ error: 'Participant not found' });
  if (!wallet_address || typeof wallet_address !== 'string' || p.wallet_address !== wallet_address.trim()) {
    return res.status(403).json({ error: 'wallet_address does not match this participant.' });
  }
  let row = db
    .prepare('SELECT token FROM copy_tokens WHERE discord = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(discord);
  if (!row) {
    const token = randomBytes(12).toString('hex');
    db.prepare('INSERT INTO copy_tokens (discord, token) VALUES (?, ?)').run(discord, token);
    row = { token };
  }
  res.json({ ok: true, token: row.token });
});

// DELETE /api/participants/:discord/share-token  { wallet_address }
// Owner revokes all active copy links.
router.delete('/participants/:discord/share-token', (req, res) => {
  const discord = req.params.discord;
  const { wallet_address } = req.body || {};
  const p = db.prepare('SELECT wallet_address FROM participants WHERE discord = ?').get(discord);
  if (!p) return res.status(404).json({ error: 'Participant not found' });
  if (!wallet_address || typeof wallet_address !== 'string' || p.wallet_address !== wallet_address.trim()) {
    return res.status(403).json({ error: 'wallet_address does not match this participant.' });
  }
  db.prepare("UPDATE copy_tokens SET revoked_at = datetime('now') WHERE discord = ? AND revoked_at IS NULL").run(discord);
  res.json({ ok: true });
});

// GET /api/participants/:discord/copy?token=...
// Returns copyable picks (currently-open matches only) + awards, but ONLY if
// authorized: (a) a valid, un-revoked token, OR (b) submissions are closed so
// picks are already public. Never leaks picks pre-deadline without a token.
router.get('/participants/:discord/copy', (req, res) => {
  const discord = req.params.discord;
  const token = (req.query.token || '').toString().trim();
  const participant = db.prepare('SELECT * FROM participants WHERE discord = ?').get(discord);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  const firstMatch = db.prepare('SELECT status FROM matches WHERE match_num = 1').get();
  const submissionsClosed = !!firstMatch && firstMatch.status !== 'SCHEDULED';

  let authorized = submissionsClosed;
  if (!authorized && token) {
    const t = db
      .prepare('SELECT id FROM copy_tokens WHERE discord = ? AND token = ? AND revoked_at IS NULL')
      .get(discord, token);
    authorized = !!t;
  }
  if (!authorized) {
    return res.status(403).json({ error: 'This bracket is private. Ask the owner for a copy link.' });
  }

  // Only copy picks the requester could still make themselves (open matches).
  const openIds = openMatchIds();
  const preds = db
    .prepare(
      `SELECT sp.match_id, sp.pred_home, sp.pred_away, m.home_team, m.away_team, m.match_num
         FROM score_predictions sp JOIN matches m ON m.id = sp.match_id
        WHERE sp.discord = ? ORDER BY m.match_num`,
    )
    .all(discord);
  const scores = [];
  let skipped = 0;
  for (const p of preds) {
    if (openIds.has(p.match_id)) {
      scores.push({
        match_id: p.match_id,
        pred_home: p.pred_home,
        pred_away: p.pred_away,
        home_team: p.home_team,
        away_team: p.away_team,
        match_num: p.match_num,
      });
    } else {
      skipped += 1;
    }
  }

  res.json({
    source_handle: participant.discord,
    awards: {
      golden_boot: participant.pick_golden_boot,
      best_young: participant.pick_best_young,
      player_tournament: participant.pick_player_tournament,
    },
    scores,
    skipped,
    deadline_passed: submissionsClosed,
  });
});

router.get('/participants/:discord/rank', (req, res) => {
  const board = computeLeaderboardCached();
  const me = board.find((r) => r.discord === req.params.discord);
  if (!me) return res.status(404).json({ error: 'Not found' });
  res.json(me);
});

export { prizeFor, EMAIL_RE };
export default router;
