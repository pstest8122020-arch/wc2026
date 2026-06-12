// Result-processing job (spec §8). Runs whenever a match transitions to
// FINISHED (admin result entry or the football-data auto-sync). Scoring recalc
// is done by the caller; this then:
//   1. mints match-result "moments" for notable hits (Feature 4)
//   2. snapshots the leaderboard so rank ▲/▼ deltas update (Feature 2)
//
// OG image caches need no explicit bust: their ETags are keyed on a results
// version (finished-match count + goal sum), so they regenerate automatically.

import { db } from '../db.js';
import { snapshotLeaderboard } from './scoring.js';
import { getCachedEvents, findMarketForMatch } from './jupiterPredict.js';

// Best-effort: was the actual winner the market underdog? Uses only the cached
// Jupiter odds (no network). Returns false if odds are unavailable.
function detectUpset(match) {
  try {
    if (match.home_goals == null || match.away_goals == null) return false;
    if (match.home_goals === match.away_goals) return false;
    const hit = findMarketForMatch(getCachedEvents(), match.home_team, match.away_team);
    if (!hit) return false;
    const homeProb = hit.homeMarket?.midProb ?? hit.homeMarket?.buyYesProb ?? null;
    const awayProb = hit.awayMarket?.midProb ?? hit.awayMarket?.buyYesProb ?? null;
    if (homeProb == null || awayProb == null) return false;
    const homeWon = match.home_goals > match.away_goals;
    const winnerProb = homeWon ? homeProb : awayProb;
    const loserProb = homeWon ? awayProb : homeProb;
    return winnerProb < loserProb;
  } catch {
    return false;
  }
}

// Length of the run of consecutive correct outcomes (by match_num) ending at
// the given match for this participant.
function correctStreakEndingAt(discord, matchNum) {
  const rows = db
    .prepare(
      `SELECT m.match_num AS num, sp.pred_home, sp.pred_away, m.home_goals, m.away_goals
         FROM score_predictions sp JOIN matches m ON m.id = sp.match_id
        WHERE sp.discord = ? AND m.status = 'FINISHED'
          AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
        ORDER BY m.match_num`,
    )
    .all(discord);
  let streak = 0;
  for (const r of rows) {
    const correct = Math.sign(r.pred_home - r.pred_away) === Math.sign(r.home_goals - r.away_goals);
    streak = correct ? streak + 1 : 0;
    if (r.num === matchNum) return streak;
  }
  return streak;
}

function generateMomentsForMatch(matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match || match.status !== 'FINISHED' || match.home_goals == null || match.away_goals == null) {
    return 0;
  }

  const isUpset = !!match.is_upset || detectUpset(match);
  if (isUpset && !match.is_upset) db.prepare('UPDATE matches SET is_upset = 1 WHERE id = ?').run(matchId);

  const preds = db
    .prepare('SELECT discord, pred_home, pred_away FROM score_predictions WHERE match_id = ?')
    .all(matchId);
  const del = db.prepare('DELETE FROM moments WHERE discord = ? AND match_id = ?');
  const ins = db.prepare(
    'INSERT OR REPLACE INTO moments (discord, match_id, kind, detail) VALUES (?, ?, ?, ?)',
  );

  let created = 0;
  const tx = db.transaction(() => {
    for (const p of preds) {
      const exact = p.pred_home === match.home_goals && p.pred_away === match.away_goals;
      const correct =
        Math.sign(p.pred_home - p.pred_away) === Math.sign(match.home_goals - match.away_goals);
      let kind = null;
      let detail = null;
      if (exact) {
        kind = 'exact';
      } else if (correct && isUpset) {
        kind = 'upset';
      } else if (correct) {
        const streak = correctStreakEndingAt(p.discord, match.match_num);
        if (streak >= 3) {
          kind = 'streak';
          detail = `${streak} in a row`;
        }
      }
      if (kind) {
        ins.run(p.discord, matchId, kind, detail);
        created++;
      } else {
        del.run(p.discord, matchId); // self-heal if a prior result was corrected
      }
    }
  });
  tx();
  return created;
}

// Single entry point called on each match → FINISHED transition.
export function processMatchResult(matchId) {
  try {
    generateMomentsForMatch(matchId);
    snapshotLeaderboard();
  } catch (e) {
    console.error('[results] processMatchResult failed:', e.message);
  }
}
