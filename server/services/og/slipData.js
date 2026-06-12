// Authoritative slip data for the bracket OG card + /u/:handle page.
//
// Privacy model (matches routes/predictions.js): a participant's exact picks
// stay hidden until submissions close (match #1 kicks off) so they can't be
// copied. So the PUBLIC card shows coverage ("N picks locked", groups, award
// calls) pre-kickoff, and the full grid with ✓/✗ + summary stats only after
// close. Nothing here reads from query params.

import { db } from '../../db.js';
import { teamCode } from './teamCode.js';

const AWARD_KEYS = [
  'pick_golden_boot',
  'pick_top_assister',
  'pick_golden_glove',
  'pick_best_young',
  'pick_player_tournament',
];

function formatDate(s) {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function getSlipData(handle) {
  const p = db
    .prepare(
      `SELECT discord, submitted_at, ${AWARD_KEYS.join(', ')} FROM participants WHERE discord = ?`,
    )
    .get(handle);
  if (!p) return null;

  const firstMatch = db.prepare('SELECT status FROM matches WHERE match_num = 1').get();
  const closed = !!firstMatch && firstMatch.status !== 'SCHEDULED';

  const rows = db
    .prepare(
      `SELECT sp.pred_home, sp.pred_away, sp.points_earned,
              m.home_team, m.away_team, m.home_goals, m.away_goals, m.status, m.match_num, m.round, m.group_name
         FROM score_predictions sp
         JOIN matches m ON m.id = sp.match_id
        WHERE sp.discord = ?
        ORDER BY m.match_num`,
    )
    .all(handle);

  const count = rows.length;
  const groups = [...new Set(rows.map((r) => r.group_name).filter(Boolean))].sort();
  const groupMatches = rows.filter((r) => r.round === 'Group Stage').length;
  const koMatches = count - groupMatches;
  const awardsCount = AWARD_KEYS.filter((k) => p[k] && String(p[k]).trim()).length;

  let picks = [];
  let exactCount = 0;
  let correctCount = 0;
  let scoredCount = 0;
  let points = 0;
  if (closed) {
    picks = rows.map((r) => {
      let mark = null;
      if (r.status === 'FINISHED' && r.home_goals != null && r.away_goals != null) {
        if (r.pred_home === r.home_goals && r.pred_away === r.away_goals) mark = 'exact';
        else if (Math.sign(r.pred_home - r.pred_away) === Math.sign(r.home_goals - r.away_goals)) mark = 'correct';
        else mark = 'wrong';
      }
      return { home: teamCode(r.home_team), away: teamCode(r.away_team), ph: r.pred_home, pa: r.pred_away, mark };
    });
    exactCount = picks.filter((x) => x.mark === 'exact').length;
    correctCount = picks.filter((x) => x.mark === 'correct').length;
    scoredCount = picks.filter((x) => x.mark).length;
    points = rows.reduce((s, r) => s + (r.points_earned || 0), 0);
  }

  // Cache/ETag version: changes when this user's pick count changes, when
  // submissions open/close, or when any result is entered/corrected.
  const v = db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN status='FINISHED' THEN 1 ELSE 0 END),0) AS f, " +
        'COALESCE(SUM(COALESCE(home_goals,0)+COALESCE(away_goals,0)),0) AS g FROM matches',
    )
    .get();
  const version = `${count}:${closed ? 1 : 0}:${v.f}:${v.g}:${p.submitted_at || ''}`;

  return {
    handle: p.discord,
    count,
    closed,
    picks,
    groups,
    groupMatches,
    koMatches,
    awardsCount,
    exactCount,
    correctCount,
    scoredCount,
    points,
    stage: 'World Cup 2026 bracket',
    lockedAt: formatDate(p.submitted_at),
    version,
  };
}
