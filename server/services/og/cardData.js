// Authoritative data for the rank / moment OG cards. Everything comes
// from the DB + the live leaderboard — never from query params.

import { db } from '../../db.js';
import { computeLeaderboard } from '../scoring.js';
import { teamCode } from './teamCode.js';

function resultsVersion() {
  const v = db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN status='FINISHED' THEN 1 ELSE 0 END),0) AS f, " +
        'COALESCE(SUM(COALESCE(home_goals,0)+COALESCE(away_goals,0)),0) AS g FROM matches',
    )
    .get();
  return `${v.f}:${v.g}`;
}

export function getRankData(handle) {
  const board = computeLeaderboard();
  const row = board.find((r) => r.discord === handle);
  if (!row) return null;
  const ofN = board.length;
  const pct = ofN > 0 ? Math.max(1, Math.round((row.rank / ofN) * 100)) : 100;
  return {
    handle: row.discord,
    rank: row.rank,
    ofN,
    total: row.total,
    exactHits: row.exact_hits || 0,
    percentLabel: `Top ${pct}%`,
    delta: row.rank_delta || 0,
    version: `${handle}:${row.rank}:${ofN}:${row.total}:${resultsVersion()}`,
  };
}

export function getMomentData(id) {
  const mo = db.prepare('SELECT * FROM moments WHERE id = ?').get(id);
  if (!mo) return null;
  const m = db
    .prepare('SELECT home_team, away_team, home_goals, away_goals FROM matches WHERE id = ?')
    .get(mo.match_id);
  if (!m) return null;
  const sp = db
    .prepare('SELECT pred_home, pred_away FROM score_predictions WHERE discord = ? AND match_id = ?')
    .get(mo.discord, mo.match_id);
  return {
    handle: mo.discord,
    kind: mo.kind,
    detail: mo.detail || null,
    home: teamCode(m.home_team),
    away: teamCode(m.away_team),
    resH: m.home_goals,
    resA: m.away_goals,
    predH: sp ? sp.pred_home : null,
    predA: sp ? sp.pred_away : null,
    version: `${id}:${mo.kind}:${m.home_goals}:${m.away_goals}`,
  };
}
