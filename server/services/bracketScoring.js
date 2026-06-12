import { db } from '../db.js';
import { GROUPS, FEEDS, ROUNDS } from './bracketStructure.js';

// Bracket points (as proposed):
//   • Group ranks  — +2 for each finishing position (1st–4th) called correctly.
//   • Thirds       — +1 for each correctly-picked best-third qualifier.
//   • Knockouts    — per correct advance, growing by round:
//                    R32→R16 +1 · R16→QF +2 · QF→SF +4 · SF→Final +8 · champion +16.
const GROUP_POS_PTS = 2;
const THIRD_PTS = 1;
// TP = 3rd-place playoff (match 103). It stays OPTIONAL for bracket completeness
// (it's not in ROUNDS, so the submit gate never requires it), but it's scored as a
// bonus when picked — semifinal weight, since it's contested by the two beaten
// semifinalists.
const MATCH_PTS_BY_ROUND = { R32: 1, R16: 2, QF: 4, SF: 8, F: 16, TP: 8 };

// matchNum -> round key. The 3rd-place playoff (103) is absent from ROUNDS (so it
// stays optional), but we map it here so a correct pick scores the TP bonus.
const ROUND_OF_MATCH = (() => {
  const m = {};
  for (const r of ROUNDS) for (const mn of r.matches) m[mn] = r.key;
  m[103] = 'TP';
  return m;
})();
const KO_MATCHES = Object.keys(ROUND_OF_MATCH).map(Number);

// The match each knockout match feeds into (its "parent"), excluding 3rd-place.
const PARENT_OF = (() => {
  const c = {};
  for (const [parent, feed] of Object.entries(FEEDS)) {
    if (Number(parent) === 103) continue;
    for (const child of feed) c[child] = Number(parent);
  }
  return c;
})();

function loadMatches() {
  const rows = db
    .prepare(
      'SELECT id, group_name, home_team, away_team, home_goals, away_goals, status FROM matches',
    )
    .all();
  const byId = {};
  for (const r of rows) byId[r.id] = r;
  return byId;
}

// Final group standings — only for groups whose 6 matches are all FINISHED.
// Returns { order: { A: [1st,2nd,3rd,4th] }, stats: { A: { team: {pts,gd,gf} } } }.
function computeStandings(byId) {
  const order = {};
  const stats = {};
  const groupMatches = {};
  for (const g of GROUPS) groupMatches[g] = [];
  for (const m of Object.values(byId)) {
    if (m.group_name && groupMatches[m.group_name]) groupMatches[m.group_name].push(m);
  }
  for (const g of GROUPS) {
    const ms = groupMatches[g];
    const done = ms.filter(
      (m) => m.status === 'FINISHED' && m.home_goals != null && m.away_goals != null,
    );
    if (ms.length < 6 || done.length < 6) continue; // group not complete → no final order
    const tbl = {};
    const ensure = (t) => (tbl[t] = tbl[t] || { team: t, pts: 0, gd: 0, gf: 0 });
    for (const m of done) {
      const h = ensure(m.home_team);
      const a = ensure(m.away_team);
      h.gf += m.home_goals;
      a.gf += m.away_goals;
      h.gd += m.home_goals - m.away_goals;
      a.gd += m.away_goals - m.home_goals;
      if (m.home_goals > m.away_goals) h.pts += 3;
      else if (m.home_goals < m.away_goals) a.pts += 3;
      else {
        h.pts += 1;
        a.pts += 1;
      }
    }
    const sorted = Object.values(tbl).sort(
      (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || String(x.team).localeCompare(String(y.team)),
    );
    order[g] = sorted.map((t) => t.team);
    stats[g] = {};
    for (const t of sorted) stats[g][t.team] = t;
  }
  return { order, stats };
}

// The 8 best third-placed teams — only once ALL 12 groups are complete.
function computeBestThirds(order, stats) {
  const thirds = [];
  for (const g of GROUPS) {
    if (!order[g]) return null; // a group is incomplete → thirds not determinable
    const team = order[g][2];
    const s = stats[g]?.[team] || { pts: 0, gd: 0, gf: 0 };
    thirds.push({ team, pts: s.pts, gd: s.gd, gf: s.gf });
  }
  thirds.sort(
    (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || String(x.team).localeCompare(String(y.team)),
  );
  return thirds.slice(0, 8).map((t) => t.team);
}

// Actual winner of a knockout match: decisive goals, else the team that appears
// in the next-round match (handles penalty shootouts). null if not yet decided.
function koWinner(mn, byId) {
  const m = byId[mn];
  if (!m) return null;
  if (m.status === 'FINISHED' && m.home_goals != null && m.away_goals != null) {
    if (m.home_goals > m.away_goals) return m.home_team;
    if (m.away_goals > m.home_goals) return m.away_team;
  }
  const parent = PARENT_OF[mn];
  if (parent && byId[parent]) {
    const pteams = [byId[parent].home_team, byId[parent].away_team];
    if (m.home_team && m.home_team !== 'TBD' && pteams.includes(m.home_team)) return m.home_team;
    if (m.away_team && m.away_team !== 'TBD' && pteams.includes(m.away_team)) return m.away_team;
  }
  return null;
}

// Pure scoring: a parsed prediction vs the actual outcome → points.
export function scoreBracketPrediction(pred, actual) {
  let pts = 0;

  for (const g of GROUPS) {
    const actualOrder = actual.standings[g];
    const predOrder = pred.groups?.[g];
    if (!actualOrder || !Array.isArray(predOrder)) continue;
    for (let i = 0; i < 4; i++) {
      if (predOrder[i] && predOrder[i] === actualOrder[i]) pts += GROUP_POS_PTS;
    }
  }

  if (actual.bestThirds && Array.isArray(pred.thirds)) {
    const set = new Set(actual.bestThirds);
    for (const t of pred.thirds) if (set.has(t)) pts += THIRD_PTS;
  }

  for (const num of KO_MATCHES) {
    const actualW = actual.koWinners[num];
    if (!actualW) continue;
    const predW = pred.knockout?.[num] ?? pred.knockout?.[String(num)];
    if (predW && predW === actualW) pts += MATCH_PTS_BY_ROUND[ROUND_OF_MATCH[num]] || 0;
  }

  return pts;
}

export function computeActualOutcome() {
  const byId = loadMatches();
  const { order, stats } = computeStandings(byId);
  const bestThirds = computeBestThirds(order, stats);
  const koWinners = {};
  for (const num of KO_MATCHES) koWinners[num] = koWinner(num, byId);
  return { standings: order, bestThirds, koWinners };
}

// Recompute and store points for every saved bracket. Cheap (few participants),
// and bracket points depend on the global outcome, so we redo all on any result.
export function recalculateAllBracketPoints() {
  const actual = computeActualOutcome();
  const rows = db.prepare('SELECT discord, groups_json, thirds_json, knockout_json FROM bracket_predictions').all();
  const update = db.prepare('UPDATE bracket_predictions SET points = ? WHERE discord = ?');
  const tx = db.transaction(() => {
    for (const r of rows) {
      let pred;
      try {
        pred = {
          groups: JSON.parse(r.groups_json),
          thirds: JSON.parse(r.thirds_json),
          knockout: JSON.parse(r.knockout_json),
        };
      } catch {
        continue;
      }
      update.run(scoreBracketPrediction(pred, actual), r.discord);
    }
  });
  tx();
}
