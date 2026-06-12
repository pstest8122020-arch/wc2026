import { db } from '../db.js';

// ESPN's public (unofficial, key-free) soccer API.
//   site/v2 .../<league>/scoreboard      -> fixtures + scores + status (date-scoped)
//   site/v2 .../<league>/summary?event=  -> keyEvents (goals/scorers/assists)
//   v2     .../<league>/standings        -> group (A-L) membership
// The men's World Cup league slug is `fifa.world`.
//
// ESPN is the PRIMARY source. It is the only free feed that also exposes
// goalscorers + assists, so player picks (first scorer / assist) auto-score.
// NOTE: ESPN's free feed has no Man-of-the-Match, so `motm` is left for the
// admin to set manually; we never overwrite an admin-entered motm.

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const V2 = 'https://site.api.espn.com/apis/v2/sports/soccer';

function leagueSlug() {
  return process.env.ESPN_LEAGUE_SLUG || 'fifa.world';
}

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': 'wc2026-predictor' } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`ESPN ${res.status} after retries`);
    const wait = Math.min(30000, 1000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, wait));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ESPN ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Calendar labels (from leagues[0].calendar[].entries) -> our round names.
const ROUND_BY_CAL_LABEL = {
  Group: 'Group Stage',
  'Round of 32': 'Round of 32',
  'Rd of 16': 'Round of 16',
  Quarterfinals: 'Quarterfinal',
  Semifinals: 'Semifinal',
  '3rd-Place Match': '3rd Place',
  Final: 'Final',
};

function multiplierForRound(round) {
  return round === 'Round of 16' ||
    round === 'Quarterfinal' ||
    round === 'Semifinal' ||
    round === '3rd Place' ||
    round === 'Final'
    ? 2
    : 1;
}

function mapState(state) {
  if (state === 'post') return 'FINISHED';
  if (state === 'in') return 'LIVE';
  return 'SCHEDULED';
}

function ymd(d) {
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Pull the tournament calendar (stage date-windows) so we can map each match
// to its round purely by kickoff date — robust for knockout matches that
// don't yet carry a stage slug.
async function fetchMeta() {
  const sb = await getJson(`${SITE}/${leagueSlug()}/scoreboard`);
  const lg = sb.leagues?.[0] || {};
  const cal = (lg.calendar || [])[0];
  const windows = (cal?.entries || []).map((e) => ({
    round: ROUND_BY_CAL_LABEL[e.label] || e.label,
    start: new Date(e.startDate).getTime(),
    end: new Date(e.endDate).getTime(),
  }));
  const seasonStart = lg.season?.startDate || cal?.startDate || '2026-06-11';
  return { windows, seasonStart };
}

function roundFromDate(kickoffMs, windows, fallbackSlug) {
  // ESPN's stage windows overlap (e.g. the 3rd-place match on the final weekend
  // sits inside the Semifinals window too). Iterate most-advanced stage first so
  // the narrower, later round wins the overlap.
  for (let i = windows.length - 1; i >= 0; i--) {
    const w = windows[i];
    if (kickoffMs >= w.start && kickoffMs <= w.end) return w.round;
  }
  if (fallbackSlug && fallbackSlug !== 'group-stage') {
    // best-effort slug map for knockout matches outside a known window
    const s = fallbackSlug.toLowerCase();
    if (s.includes('round-of-32')) return 'Round of 32';
    if (s.includes('round-of-16')) return 'Round of 16';
    if (s.includes('quarter')) return 'Quarterfinal';
    if (s.includes('semi')) return 'Semifinal';
    if (s.includes('third') || s.includes('3rd')) return '3rd Place';
    if (s.includes('final')) return 'Final';
  }
  return 'Group Stage';
}

// Build a { teamAbbreviation|displayName -> 'A' } map from standings.
export async function fetchGroupMap() {
  try {
    const s = await getJson(`${V2}/${leagueSlug()}/standings`);
    const children = s.children || [];
    const map = new Map();
    for (const g of children) {
      const letter = String(g.name || g.abbreviation || '').replace(/^Group\s+/i, '').trim();
      for (const e of g.standings?.entries || []) {
        if (e.team?.abbreviation) map.set(e.team.abbreviation, letter);
        if (e.team?.displayName) map.set(e.team.displayName, letter);
      }
    }
    return map;
  } catch (e) {
    console.warn('[espnApi] group map failed:', e.message);
    return new Map();
  }
}

function teamName(c) {
  return c?.team?.displayName || c?.team?.name || c?.team?.shortDisplayName || 'TBD';
}

function competitorsOf(event) {
  const comp = event.competitions?.[0];
  const cs = comp?.competitors || [];
  const home = cs.find((c) => c.homeAway === 'home') || cs[0];
  const away = cs.find((c) => c.homeAway === 'away') || cs[1];
  return { comp, home, away };
}

function eventToRow(event, windows, groupMap) {
  const { comp, home, away } = competitorsOf(event);
  const kickoff = event.date || comp?.date || null;
  const kickoffMs = kickoff ? new Date(kickoff).getTime() : 0;
  const round = roundFromDate(kickoffMs, windows, event.season?.slug);
  const state = event.status?.type?.state || comp?.status?.type?.state;
  const status = mapState(state);
  const homeName = teamName(home);
  const awayName = teamName(away);

  let group_name = null;
  if (round === 'Group Stage') {
    group_name =
      groupMap.get(home?.team?.abbreviation) ||
      groupMap.get(homeName) ||
      groupMap.get(away?.team?.abbreviation) ||
      groupMap.get(awayName) ||
      null;
  }

  // Scores only matter once the match has kicked off.
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const hg = state === 'pre' ? null : num(home?.score);
  const ag = state === 'pre' ? null : num(away?.score);

  return {
    api_id: String(event.id),
    espn_id: String(event.id),
    round,
    group_name,
    home_team: homeName,
    away_team: awayName,
    home_goals: hg,
    away_goals: ag,
    status,
    kickoff_utc: kickoff,
    pts_multiplier: multiplierForRound(round),
  };
}

// All fixtures in one shot via a date-range scoreboard query.
export async function fetchEspnScoreboard() {
  const meta = await fetchMeta();
  const start = ymd(meta.seasonStart);
  const finalEnd = meta.windows.length
    ? Math.max(...meta.windows.map((w) => w.end))
    : new Date(meta.seasonStart).getTime() + 50 * 864e5;
  const end = ymd(finalEnd);
  const sb = await getJson(`${SITE}/${leagueSlug()}/scoreboard?dates=${start}-${end}&limit=1000`);
  return { events: sb.events || [], windows: meta.windows };
}

export async function seedMatchesFromEspn() {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE api_id IS NOT NULL").get().c;
  if (existing > 0) {
    console.log(`[espnApi] ${existing} matches already linked to API, skipping seed`);
    return existing;
  }

  const [{ events, windows }, groupMap] = await Promise.all([fetchEspnScoreboard(), fetchGroupMap()]);
  if (!events.length) {
    console.warn('[espnApi] no events returned; not seeding');
    return 0;
  }

  const rows = events
    .map((e) => eventToRow(e, windows, groupMap))
    .sort((a, b) => new Date(a.kickoff_utc || 0) - new Date(b.kickoff_utc || 0));

  const wipe = db.prepare('DELETE FROM matches');
  const insert = db.prepare(`
    INSERT INTO matches
      (api_id, espn_id, round, group_name, match_num, home_team, away_team,
       home_goals, away_goals, status, kickoff_utc, pts_multiplier)
    VALUES (@api_id, @espn_id, @round, @group_name, @match_num, @home_team, @away_team,
       @home_goals, @away_goals, @status, @kickoff_utc, @pts_multiplier)
  `);

  const tx = db.transaction(() => {
    wipe.run();
    let n = 1;
    for (const r of rows) insert.run({ ...r, match_num: n++ });
  });
  tx();

  console.log(`[espnApi] Seeded ${rows.length} matches from ESPN`);
  return rows.length;
}

// Backfill espn_id on rows seeded from another source (football-data.org or
// placeholders) WITHOUT touching id/match_num/api_id — predictions reference
// match ids, so rows must never be renumbered or reseeded. Matching strategy
// (verified 104/104 unique against live prod + ESPN data on 2026-06-12):
//   1. kickoff timestamp, unique for 92 of 104 matches
//   2. simultaneous kickoffs (group-stage round 3) disambiguated by
//      alias-normalized team names
// Conservative: only writes when exactly one candidate remains; anything
// ambiguous is left NULL and reported so it can never mislink a match.
const TEAM_ALIASES = {
  turkey: 'türkiye',
  'cape verde islands': 'cape verde',
  'czech republic': 'czechia',
  'korea republic': 'south korea',
  'usa': 'united states',
  'ir iran': 'iran',
};
function normTeam(name) {
  const n = String(name || '').toLowerCase().trim();
  return TEAM_ALIASES[n] || n;
}

export async function ensureEspnIds() {
  const missing = db
    .prepare('SELECT id, home_team, away_team, kickoff_utc FROM matches WHERE espn_id IS NULL')
    .all();
  if (missing.length === 0) return { filled: 0, unmatched: 0 };

  const { events } = await fetchEspnScoreboard();
  const taken = new Set(
    db.prepare('SELECT espn_id FROM matches WHERE espn_id IS NOT NULL').all().map((r) => r.espn_id),
  );

  const byTime = new Map();
  for (const e of events) {
    if (taken.has(String(e.id))) continue;
    const t = new Date(e.date).getTime();
    if (!byTime.has(t)) byTime.set(t, []);
    byTime.get(t).push(e);
  }

  const setId = db.prepare('UPDATE matches SET espn_id = ? WHERE id = ?');
  let filled = 0;
  const unmatched = [];

  for (const m of missing) {
    const t = m.kickoff_utc ? new Date(m.kickoff_utc).getTime() : NaN;
    const cands = byTime.get(t) || [];
    let pick = null;
    if (cands.length === 1) {
      pick = cands[0];
    } else if (cands.length > 1) {
      const h = normTeam(m.home_team);
      const a = normTeam(m.away_team);
      const byName = cands.filter((e) => {
        const ts = (e.competitions?.[0]?.competitors || []).map((c) => normTeam(c.team?.displayName));
        return ts.includes(h) && ts.includes(a);
      });
      if (byName.length === 1) pick = byName[0];
    }
    if (pick) {
      setId.run(String(pick.id), m.id);
      byTime.set(t, cands.filter((e) => e.id !== pick.id));
      filled++;
    } else {
      unmatched.push(`#${m.id} ${m.home_team} v ${m.away_team} @ ${m.kickoff_utc}`);
    }
  }

  if (unmatched.length) {
    console.warn(`[espnApi] ensureEspnIds: ${unmatched.length} rows left unlinked:`, unmatched.slice(0, 5).join('; '));
  }
  console.log(`[espnApi] ensureEspnIds: linked ${filled}/${missing.length} rows to ESPN events`);
  return { filled, unmatched: unmatched.length };
}

// Update one match row from a scoreboard event. Mirrors footballApi.syncMatchRow:
// admin overrides (manual_result=1) are sticky and never reverted.
export function syncEspnMatchRow(event, windows, groupMap) {
  const row = db.prepare('SELECT * FROM matches WHERE espn_id = ?').get(String(event.id));
  if (!row) return null;
  if (row.manual_result) return null;

  const r = eventToRow(event, windows, groupMap);
  const changed =
    row.status !== r.status ||
    row.home_goals !== r.home_goals ||
    row.away_goals !== r.away_goals ||
    row.home_team !== r.home_team ||
    row.away_team !== r.away_team ||
    row.kickoff_utc !== r.kickoff_utc ||
    (r.group_name && row.group_name !== r.group_name);

  if (!changed) return null;

  db.prepare(
    `UPDATE matches
        SET status=?, home_goals=?, away_goals=?, home_team=?, away_team=?,
            kickoff_utc=?, group_name=COALESCE(?, group_name)
      WHERE id=?`,
  ).run(r.status, r.home_goals, r.away_goals, r.home_team, r.away_team, r.kickoff_utc, r.group_name, row.id);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(row.id);
  return { previous: row, current: updated };
}

const OWN_GOAL_RE = /own[\s-]?goal/i;
const ASSIST_RE = /assist/i;

// Parse goalscorers + assists from a match summary's keyEvents.
//   athletes[0] = scorer, athletes[1] = assister (when text says "Assisted by").
//   Own goals are excluded from the scorer lists.
export async function fetchEspnPlayerResults(eventId) {
  const sum = await getJson(`${SITE}/${leagueSlug()}/summary?event=${eventId}`);
  const keyEvents = sum.keyEvents || [];

  const allScorers = [];
  const assists = [];
  let firstScorer = null;

  for (const ke of keyEvents) {
    if (!ke.scoringPlay) continue;
    const typeText = ke.type?.text || '';
    const text = ke.text || '';
    const players = (ke.participants || ke.athletesInvolved || [])
      .map((a) => a.athlete?.displayName || a.displayName)
      .filter(Boolean);
    const isOwnGoal = OWN_GOAL_RE.test(typeText) || OWN_GOAL_RE.test(text);

    const scorer = players[0] || null;
    if (scorer && !isOwnGoal) {
      allScorers.push(scorer);
      if (!firstScorer) firstScorer = scorer;
    }
    if (players[1] && ASSIST_RE.test(text)) assists.push(players[1]);
  }

  return {
    first_scorer: firstScorer,
    all_scorers: allScorers,
    assist_players: assists,
    has_events: keyEvents.length > 0,
  };
}

// Write parsed scorer/assist data into match_player_results. We deliberately
// leave motm untouched (ESPN can't provide it; admin owns it) and we skip
// matches under an admin override (manual_result=1).
export function applyEspnPlayerResults(matchId, results) {
  const match = db.prepare('SELECT manual_result FROM matches WHERE id = ?').get(matchId);
  if (!match || match.manual_result) return false;

  db.prepare(`
    INSERT INTO match_player_results (match_id, first_scorer, all_scorers, assist_players, motm, updated_at)
    VALUES (?, ?, ?, ?, NULL, datetime('now'))
    ON CONFLICT(match_id) DO UPDATE SET
      first_scorer = excluded.first_scorer,
      all_scorers = excluded.all_scorers,
      assist_players = excluded.assist_players,
      updated_at = datetime('now')
  `).run(
    matchId,
    results.first_scorer || null,
    JSON.stringify(results.all_scorers || []),
    JSON.stringify(results.assist_players || []),
  );
  return true;
}
