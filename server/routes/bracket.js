import { Router } from 'express';
import { db } from '../db.js';
import {
  GROUPS,
  ROUND_OF_32,
  FEEDS,
  ROUNDS,
  THIRD_SLOT_MATCHES,
  THIRD_SLOTS,
} from '../services/bracketStructure.js';
import { THIRD_PLACE_TABLE, THIRD_MATCH_ORDER } from '../services/thirdPlaceTable.js';
import { getSession } from '../services/session.js';
import { ensureParticipantForSession, recordSubmitMeta } from '../services/participants.js';
import { hasUnsafeText } from '../services/text.js';
import { bracketsLocked } from '../services/bracketComplete.js';
import { recheckOne } from '../services/eligibilityRefresh.js';
import { discordConfigured } from './auth.js';

const router = Router();

// Static-ish bracket scaffold for the interactive builder: the real 4 teams per
// group (from the draw) + the WC2026 knockout wiring. The client turns this into
// the playable bracket; predictions are stored separately.
router.get('/bracket-structure', (req, res) => {
  const rows = db
    .prepare(
      "SELECT group_name, home_team, away_team FROM matches WHERE round = 'Group Stage' AND group_name IS NOT NULL",
    )
    .all();

  const groups = {};
  for (const g of GROUPS) groups[g] = [];
  for (const r of rows) {
    const list = groups[r.group_name];
    if (!list) continue;
    for (const t of [r.home_team, r.away_team]) {
      if (t && t !== 'TBD' && !list.includes(t)) list.push(t);
    }
  }

  res.json({
    groups, // { A: [team, team, team, team], ... }
    roundOf32: ROUND_OF_32,
    feeds: FEEDS,
    rounds: ROUNDS,
    thirdSlotMatches: THIRD_SLOT_MATCHES,
    thirdSlots: THIRD_SLOTS,
    thirdAllocation: THIRD_PLACE_TABLE,
    thirdMatchOrder: THIRD_MATCH_ORDER,
  });
});

// Save (create or update) the logged-in user's bracket. Identity comes from the
// verified Discord session; a participant row is created on first submit so the
// bracket + match picks share one account. Editable until the first kickoff.
router.post('/my-bracket', (req, res) => {
  if (!discordConfigured()) return res.status(404).json({ error: 'Bracket submission is not available.' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Log in with Discord to submit your bracket.' });
  if (bracketsLocked()) return res.status(403).json({ error: 'Brackets are locked — the tournament has started.' });

  const { groups, thirds, knockout, champion, wallet_address } = req.body || {};
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    return res.status(400).json({ error: 'groups is required' });
  }
  if (!Array.isArray(thirds)) return res.status(400).json({ error: 'thirds is required' });
  if (!knockout || typeof knockout !== 'object' || Array.isArray(knockout)) {
    return res.status(400).json({ error: 'knockout is required' });
  }

  // Completeness — a full bracket is all 8 third-place teams plus a winner for
  // every scored knockout match (Round of 32 → Final, which includes the
  // champion). Enforced here too, so the "no half-filled entries" rule holds even
  // for direct API calls, not just the UI.
  if (thirds.length !== 8) {
    return res.status(400).json({ error: 'Pick all 8 third-place teams before submitting your bracket.' });
  }
  const openMatches = [...ROUNDS.flatMap((r) => r.matches), 103].filter((mn) => !knockout[mn]);
  if (openMatches.length > 0) {
    return res
      .status(400)
      .json({ error: `Your bracket is incomplete — ${openMatches.length} knockout pick(s) still missing.` });
  }

  // Wallet is mandatory: the contest is open to Jupiter Prediction Markets users,
  // and the wallet is checked for eligibility + used for payouts.
  const wallet = String(wallet_address || '').trim();
  if (!wallet) {
    return res.status(400).json({ error: 'A Solana wallet address is required to enter.' });
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return res.status(400).json({ error: 'That does not look like a valid Solana wallet address.' });
  }

  const discord = ensureParticipantForSession(session);
  if (!discord) return res.status(401).json({ error: 'Invalid session.' });
  recordSubmitMeta(req, discord); // anti-sybil signal (report-only)

  // Store the wallet; reset eligibility to pending if it changed, then fire an
  // immediate background re-check so it resolves in seconds (with a dedicated RPC).
  // No blocking at submit — the entry goes through regardless; the immediate check
  // (and the 30-min cron as backstop) settle the status after the fact.
  const prev = db.prepare('SELECT wallet_address FROM participants WHERE discord = ?').get(discord);
  if (!prev || (prev.wallet_address || '') !== wallet) {
    try {
      db.prepare(
        "UPDATE participants SET wallet_address = ?, eligibility_status = 'pending', eligibility_reason = NULL, eligibility_checked_at = NULL WHERE discord = ?",
      ).run(wallet, discord);
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({
          error: 'That wallet is already linked to another entry — each wallet can only be used once.',
        });
      }
      throw e;
    }
    void recheckOne(discord, wallet); // fire-and-forget; never blocks the response
  }

  // Tournament award picks (optional) — stored on the participant; the existing
  // award scoring turns them into points once the winners are known.
  const awards = (req.body && req.body.awards) || {};
  const gb = String(awards.golden_boot || '').trim().slice(0, 100);
  const by = String(awards.best_young || '').trim().slice(0, 100);
  const pt = String(awards.player_tournament || '').trim().slice(0, 100);
  if (hasUnsafeText(gb) || hasUnsafeText(by) || hasUnsafeText(pt)) {
    return res.status(400).json({ error: 'Award picks contain invalid characters.' });
  }
  db.prepare(
    'UPDATE participants SET pick_golden_boot = ?, pick_best_young = ?, pick_player_tournament = ? WHERE discord = ?',
  ).run(gb || null, by || null, pt || null, discord);

  const groupsJson = JSON.stringify(groups).slice(0, 20000);
  const thirdsJson = JSON.stringify(thirds).slice(0, 5000);
  const knockoutJson = JSON.stringify(knockout).slice(0, 20000);
  const champ = champion ? String(champion).slice(0, 64) : null;

  db.prepare(
    `INSERT INTO bracket_predictions (discord, groups_json, thirds_json, knockout_json, champion, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(discord) DO UPDATE SET
       groups_json = excluded.groups_json,
       thirds_json = excluded.thirds_json,
       knockout_json = excluded.knockout_json,
       champion = excluded.champion,
       updated_at = datetime('now')`,
  ).run(discord, groupsJson, thirdsJson, knockoutJson, champ);

  res.json({ ok: true, handle: session.h, locked: false });
});

// Lightweight wallet change for an existing entrant — used by the "not eligible"
// banner so someone who entered the freeroll on a *different* wallet can point us
// at the right one without re-submitting their whole bracket. Resets eligibility
// to pending + fires the same immediate background re-check as the bracket submit.
router.post('/my-wallet', (req, res) => {
  if (!discordConfigured()) return res.status(404).json({ error: 'Not available.' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Log in to update your wallet.' });

  const wallet = String(req.body?.wallet_address || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return res.status(400).json({ error: 'That does not look like a valid Solana wallet address.' });
  }

  const discord = ensureParticipantForSession(session);
  if (!discord) return res.status(401).json({ error: 'Invalid session.' });
  recordSubmitMeta(req, discord); // anti-sybil signal (report-only)

  // Only an existing entrant can swap their wallet here; first-timers go through
  // the normal bracket submit (which is where a bracket actually gets created).
  const prev = db
    .prepare('SELECT wallet_address, eligibility_status FROM participants WHERE discord = ?')
    .get(discord);
  // Post-lock exception: an INELIGIBLE entrant may still swap wallets so the
  // not-eligible banner's fix-it flow keeps working after the tournament starts.
  // Each swap re-checks on-chain: land on an eligible wallet and the status flips
  // to eligible — from then on the wallet is locked like everyone else's.
  // Eligible/pending/new wallets stay locked at the first kickoff.
  if (bracketsLocked() && prev?.eligibility_status !== 'ineligible') {
    return res.status(403).json({ error: 'Entries are locked — the tournament has started.' });
  }
  if (!prev || !prev.wallet_address) {
    return res.status(400).json({ error: 'Submit your bracket first, then you can update your wallet.' });
  }
  if ((prev.wallet_address || '') === wallet) {
    return res.json({ ok: true, unchanged: true, eligibility_status: 'pending' });
  }

  try {
    db.prepare(
      "UPDATE participants SET wallet_address = ?, eligibility_status = 'pending', eligibility_reason = NULL, eligibility_checked_at = NULL WHERE discord = ?",
    ).run(wallet, discord);
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: 'That wallet is already linked to another entry — each wallet can only be used once.',
      });
    }
    throw e;
  }
  void recheckOne(discord, wallet); // fire-and-forget; settles in the background

  res.json({ ok: true, eligibility_status: 'pending' });
});

// Load the logged-in user's saved bracket.
router.get('/my-bracket', (req, res) => {
  if (!discordConfigured()) return res.status(404).json({ error: 'Not available' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  const participant = db
    .prepare(
      'SELECT discord, wallet_address, pick_golden_boot, pick_best_young, pick_player_tournament FROM participants WHERE discord_id = ?',
    )
    .get(String(session.did || ''));
  if (!participant) return res.status(404).json({ error: 'no_bracket', handle: session.h });
  const row = db
    .prepare(
      'SELECT groups_json, thirds_json, knockout_json, champion, submitted_at, updated_at FROM bracket_predictions WHERE discord = ?',
    )
    .get(participant.discord);
  if (!row) return res.status(404).json({ error: 'no_bracket', handle: session.h });

  let groups;
  let thirds;
  let knockout;
  try {
    groups = JSON.parse(row.groups_json);
    thirds = JSON.parse(row.thirds_json);
    knockout = JSON.parse(row.knockout_json);
  } catch {
    return res.status(500).json({ error: 'corrupt_bracket' });
  }
  res.json({
    handle: session.h,
    groups,
    thirds,
    knockout,
    champion: row.champion || null,
    wallet_address: participant.wallet_address || null,
    awards: {
      golden_boot: participant.pick_golden_boot || '',
      best_young: participant.pick_best_young || '',
      player_tournament: participant.pick_player_tournament || '',
    },
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    locked: bracketsLocked(),
  });
});

export default router;
