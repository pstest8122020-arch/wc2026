import { db } from '../db.js';

export const AWARD_PTS = {
  // Golden Ball (player_tournament = best player / MVP) is the more prestigious
  // individual honor than the Golden Boot (top scorer), so it's worth more.
  player_tournament: 25,
  golden_boot: 20,
  best_young: 15,
};

export function scorePoints(predHome, predAway, actualHome, actualAway, multiplier) {
  if (actualHome === null || actualHome === undefined) return 0;
  if (actualAway === null || actualAway === undefined) return 0;
  const m = multiplier || 1;
  if (predHome === actualHome && predAway === actualAway) return 3 * m;
  const predResult = Math.sign(predHome - predAway);
  const actualResult = Math.sign(actualHome - actualAway);
  if (predResult === actualResult) return 1 * m;
  return 0;
}

export function firstScorerPoints(pick, firstScorer, allScorers) {
  if (!pick || !firstScorer) return 0;
  if (pick === firstScorer) return 6;
  if (Array.isArray(allScorers) && allScorers.includes(pick)) return 2;
  return 0;
}

export function assistPoints(pick, assistPlayers) {
  if (!pick) return 0;
  if (!Array.isArray(assistPlayers)) return 0;
  return assistPlayers.includes(pick) ? 4 : 0;
}

export function motmPoints(pick, motm) {
  if (!pick || !motm) return 0;
  return pick === motm ? 4 : 0;
}

export function awardPoints(pick, actual, awardKey) {
  if (!actual || !pick) return 0;
  return pick === actual ? AWARD_PTS[awardKey] : 0;
}

export function prizeFor(rank) {
  if (rank === 1) return 500;
  if (rank === 2) return 250;
  if (rank === 3) return 150;
  if (rank >= 4 && rank <= 10) return 50;
  if (rank >= 11 && rank <= 25) return 25;
  if (rank >= 26 && rank <= 50) return 15;
  return 0;
}

export function recalculateMatchScorePredictions(matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return;
  if (match.home_goals === null || match.away_goals === null) return;

  const preds = db.prepare('SELECT * FROM score_predictions WHERE match_id = ?').all(matchId);
  const update = db.prepare('UPDATE score_predictions SET points_earned = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const p of preds) {
      const pts = scorePoints(
        p.pred_home,
        p.pred_away,
        match.home_goals,
        match.away_goals,
        match.pts_multiplier,
      );
      update.run(pts, p.id);
    }
  });
  tx();
}

export function recalculateMatchPlayerPicks(matchId) {
  const result = db
    .prepare('SELECT * FROM match_player_results WHERE match_id = ?')
    .get(matchId);
  if (!result) return;

  let allScorers = [];
  let assistPlayers = [];
  try {
    if (result.all_scorers) allScorers = JSON.parse(result.all_scorers);
  } catch {}
  try {
    if (result.assist_players) assistPlayers = JSON.parse(result.assist_players);
  } catch {}

  const picks = db.prepare('SELECT * FROM player_picks WHERE match_id = ?').all(matchId);
  const update = db.prepare(
    'UPDATE player_picks SET fs_points = ?, assist_points = ?, motm_points = ? WHERE id = ?',
  );

  const tx = db.transaction(() => {
    for (const p of picks) {
      const fs = firstScorerPoints(p.first_scorer, result.first_scorer, allScorers);
      const as = assistPoints(p.assist_player, assistPlayers);
      const mo = motmPoints(p.motm, result.motm);
      update.run(fs, as, mo, p.id);
    }
  });
  tx();
}

export function computeAwardPointsFor(discord) {
  const p = db.prepare('SELECT * FROM participants WHERE discord = ?').get(discord);
  if (!p) return 0;
  const awards = db.prepare('SELECT * FROM tournament_awards WHERE id = 1').get();
  if (!awards) return 0;

  return (
    awardPoints(p.pick_golden_boot, awards.golden_boot, 'golden_boot') +
    awardPoints(p.pick_best_young, awards.best_young, 'best_young') +
    awardPoints(p.pick_player_tournament, awards.player_tournament, 'player_tournament')
  );
}

export function computeLeaderboard() {
  // Disqualified entries stay in the DB (for audit) but never appear on the
  // public leaderboard. Pending/eligible/ineligible all show up until admin acts.
  const participants = db
    .prepare("SELECT * FROM participants WHERE eligibility_status != 'disqualified'")
    .all();
  const awards = db.prepare('SELECT * FROM tournament_awards WHERE id = 1').get();

  const scoreSum = db.prepare(
    'SELECT discord, COALESCE(SUM(points_earned),0) AS pts, COUNT(*) AS matches_played FROM score_predictions WHERE match_id IN (SELECT id FROM matches WHERE status = \'FINISHED\') GROUP BY discord',
  );
  const playerSum = db.prepare(
    'SELECT discord, COALESCE(SUM(fs_points + assist_points + motm_points),0) AS pts FROM player_picks GROUP BY discord',
  );

  const scoreByDiscord = new Map();
  for (const row of scoreSum.all()) {
    scoreByDiscord.set(row.discord, { pts: row.pts, matches_played: row.matches_played });
  }
  const playerByDiscord = new Map();
  for (const row of playerSum.all()) {
    playerByDiscord.set(row.discord, row.pts);
  }

  const bracketByDiscord = new Map();
  for (const row of db.prepare('SELECT discord, COALESCE(points,0) AS pts FROM bracket_predictions').all()) {
    bracketByDiscord.set(row.discord, row.pts);
  }

  const rows = participants.map((p) => {
    const score = scoreByDiscord.get(p.discord) || { pts: 0, matches_played: 0 };
    const player_pts = playerByDiscord.get(p.discord) || 0;
    const award_pts = awards
      ? awardPoints(p.pick_golden_boot, awards.golden_boot, 'golden_boot') +
        awardPoints(p.pick_best_young, awards.best_young, 'best_young') +
        awardPoints(p.pick_player_tournament, awards.player_tournament, 'player_tournament')
      : 0;
    const bracket_pts = bracketByDiscord.get(p.discord) || 0;
    const total = bracket_pts + score.pts + player_pts + award_pts;
    return {
      discord: p.discord,
      bracket_pts,
      score_pts: score.pts,
      player_pts,
      award_pts,
      total,
      matches_played: score.matches_played,
    };
  });

  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.score_pts !== a.score_pts) return b.score_pts - a.score_pts;
    return a.discord.localeCompare(b.discord);
  });

  return rows.map((r, i) => ({
    rank: i + 1,
    ...r,
    prize: prizeFor(i + 1),
  }));
}

// --- Leaderboard cache -------------------------------------------------------
// The leaderboard is identical for every user yet walks participants × matches.
// Cache it briefly so a burst (everyone refreshing at kickoff) costs one compute
// per TTL instead of one per request. invalidateLeaderboard() is called from the
// socket broadcast on every result change so updates still appear promptly.
let _lbCache = null;
let _lbAt = 0;
const LB_TTL_MS = 15000;

export function computeLeaderboardCached() {
  const now = Date.now();
  if (_lbCache && now - _lbAt < LB_TTL_MS) return _lbCache;
  _lbCache = computeLeaderboard();
  _lbAt = now;
  return _lbCache;
}

export function invalidateLeaderboard() {
  _lbCache = null;
  _lbAt = 0;
}
