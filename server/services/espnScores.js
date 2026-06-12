import { db } from '../db.js';
import { recalculateMatchScorePredictions } from './scoring.js';
import { recalculateAllBracketPoints } from './bracketScoring.js';
import { emitLeaderboard, emitMatchUpdated, emitPlayerPicksUnlocked } from '../socket.js';
import { getSquads } from './playerIndex.js';

// ESPN scoreboard overlay — football-data.org's free tier flips matches to
// FINISHED long before it publishes the goals (the opener sat scoreless for an
// hour after full-time). ESPN's public scoreboard JSON has live scores and
// scoring plays in real time, so we OVERLAY it on top of the football-data
// sync: ESPN may only advance a match (set LIVE/FINISHED, fill in goals) and
// never regress one, and any fetch/mapping doubt means "do nothing" —
// football-data remains the fixture source of truth, the admin panel the
// final authority (manual_result rows are never touched).

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const REQUEST_TIMEOUT_MS = 10_000;

// Lowercase, strip diacritics + punctuation — same trick as the player index.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ESPN naming → football-data naming (normalized on both sides). Anything not
// listed must norm-match exactly or the event is skipped.
const TEAM_ALIASES = new Map([
  ['usa', 'united states'],
  ['czech republic', 'czechia'],
  ['cote d ivoire', 'ivory coast'],
  ['cote divoire', 'ivory coast'],
  ['dr congo', 'congo dr'],
  ['democratic republic of the congo', 'congo dr'],
  ['cape verde', 'cape verde islands'],
  ['iran', 'iran'],
  ['ir iran', 'iran'],
  ['korea republic', 'south korea'],
  ['turkiye', 'turkey'],
  ['bosnia and herzegovina', 'bosnia herzegovina'],
]);

function teamKey(name) {
  const n = norm(name);
  return TEAM_ALIASES.get(n) || n;
}

async function fetchJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ac.signal });
    if (!res.ok) throw new Error(`espn ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Scoreboard events for a UTC ±1 day window around `now` (ESPN's ?dates= filter
// runs on US time, so we cast a wide net and dedupe by event id).
async function fetchEventsAround(now = new Date()) {
  const days = [-1, 0, 1].map((off) => {
    const d = new Date(now.getTime() + off * 86400000);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  });
  const seen = new Map();
  for (const day of days) {
    try {
      const j = await fetchJson(`${SCOREBOARD}?dates=${day}`);
      for (const ev of j?.events || []) if (ev?.id && !seen.has(ev.id)) seen.set(ev.id, ev);
    } catch {
      /* one bad day fetch is fine — overlay is best-effort */
    }
  }
  return [...seen.values()];
}

// Normalize one ESPN event into { key fields } or null when malformed.
function parseEvent(ev) {
  const comp = ev?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  if (!home?.team || !away?.team) return null;
  const state = ev?.status?.type?.state; // 'pre' | 'in' | 'post'
  const completed = !!ev?.status?.type?.completed;
  const toGoals = (c) => {
    const n = Number(c?.score);
    return Number.isFinite(n) && c?.score !== '' && c?.score !== null ? n : null;
  };
  return {
    id: ev.id,
    date: ev?.date ? Date.parse(ev.date) : null,
    homeName: home.team.displayName || home.team.name || '',
    awayName: away.team.displayName || away.team.name || '',
    homeGoals: toGoals(home),
    awayGoals: toGoals(away),
    state,
    completed,
    details: comp?.details || [],
  };
}

// Find OUR match row for an ESPN event: both teams must map, kickoff within 12h.
// Returns { row, flipped } — flipped when ESPN's home is our away (defensive;
// hasn't been observed, but a silent swap would corrupt every score).
function matchOurs(parsed, ourMatches) {
  const h = teamKey(parsed.homeName);
  const a = teamKey(parsed.awayName);
  for (const m of ourMatches) {
    const mh = teamKey(m.home_team);
    const ma = teamKey(m.away_team);
    const kickoff = m.kickoff_utc ? Date.parse(m.kickoff_utc) : null;
    const closeEnough =
      parsed.date == null || kickoff == null || Math.abs(parsed.date - kickoff) < 12 * 3600 * 1000;
    if (!closeEnough) continue;
    if (mh === h && ma === a) return { row: m, flipped: false };
    if (mh === a && ma === h) return { row: m, flipped: true };
  }
  return null;
}

// Apply the overlay once. Returns a short status string for the sync log.
export async function applyEspnOverlay() {
  // Only matches near "now" can plausibly change — keeps the mapping cheap.
  const ourMatches = db
    .prepare(
      `SELECT id, home_team, away_team, kickoff_utc, status, home_goals, away_goals, manual_result
       FROM matches
       WHERE home_team != 'TBD' AND away_team != 'TBD'
         AND ABS(strftime('%s', kickoff_utc) - strftime('%s','now')) < 36 * 3600`,
    )
    .all();
  if (!ourMatches.length) return 'espn: no matches in window';

  const events = await fetchEventsAround();
  if (!events.length) return 'espn: no events';

  let updated = 0;
  const finishedNow = [];
  for (const ev of events) {
    const parsed = parseEvent(ev);
    if (!parsed) continue;
    const hit = matchOurs(parsed, ourMatches);
    if (!hit || hit.row.manual_result) continue;
    const m = hit.row;

    const newStatus = parsed.state === 'in' ? 'LIVE' : parsed.state === 'post' && parsed.completed ? 'FINISHED' : null;
    if (!newStatus) continue; // pre-match: nothing to advance
    // Never regress: FINISHED is terminal, LIVE can only become FINISHED.
    if (m.status === 'FINISHED' && newStatus !== 'FINISHED') continue;
    const statusChange = m.status !== newStatus && !(m.status === 'LIVE' && newStatus === 'LIVE');

    const hg = hit.flipped ? parsed.awayGoals : parsed.homeGoals;
    const ag = hit.flipped ? parsed.homeGoals : parsed.awayGoals;
    // Goals only ever go from null/different → concrete numbers, never to null.
    const goalsChange = hg != null && ag != null && (m.home_goals !== hg || m.away_goals !== ag);

    if (!statusChange && !goalsChange) continue;
    db.prepare('UPDATE matches SET status = ?, home_goals = ?, away_goals = ? WHERE id = ?').run(
      newStatus,
      goalsChange ? hg : m.home_goals,
      goalsChange ? ag : m.away_goals,
      m.id,
    );
    recalculateMatchScorePredictions(m.id);
    emitMatchUpdated(m.id);
    updated++;
    if (m.status !== 'FINISHED' && newStatus === 'FINISHED') finishedNow.push(m.id);
    console.log(
      `[espn] match ${m.id} ${m.home_team}–${m.away_team}: ${m.status}→${newStatus}` +
        (goalsChange ? ` ${hg}-${ag}` : ''),
    );
  }

  if (updated > 0) {
    recalculateAllBracketPoints();
    emitLeaderboard();
    for (const id of finishedNow) emitPlayerPicksUnlocked(id);
  }
  return `espn: updated ${updated}`;
}

// --- Admin pre-fill: scoring plays → suggested player result -----------------

// Best-effort canonicalization of an ESPN player name against the two squads'
// roster names (so graded names match what the pick form stores). Falls back
// to ESPN's spelling when there's no confident, unique match.
function canonicalize(name, roster) {
  const nv = norm(name);
  if (!nv) return name;
  let hit = roster.filter((r) => norm(r) === nv);
  if (hit.length === 1) return hit[0];
  const vt = nv.split(' ');
  hit = roster.filter((r) => {
    const rt = norm(r).split(' ');
    return vt.every((v) => rt.some((t) => t === v || (v.length >= 3 && t.startsWith(v))));
  });
  if (hit.length === 1) return hit[0];
  return name;
}

// Suggested {first_scorer, all_scorers, assist_players} for one of our matches,
// from ESPN's scoring plays. Own goals are EXCLUDED from scorer credit (the
// sportsbook convention for first-goalscorer markets); they're listed in
// `notes` so the admin can decide. MOTM is FIFA's announcement — always manual.
export async function suggestPlayerResult(matchId) {
  const m = db
    .prepare('SELECT id, home_team, away_team, kickoff_utc FROM matches WHERE id = ?')
    .get(matchId);
  if (!m) return { error: 'Match not found' };

  const events = await fetchEventsAround(new Date(m.kickoff_utc || Date.now()));
  let found = null;
  for (const ev of events) {
    const parsed = parseEvent(ev);
    if (parsed && matchOurs(parsed, [m])) {
      found = parsed;
      break;
    }
  }
  if (!found) return { error: 'No ESPN event matched this fixture' };

  const squads = await getSquads(`${m.home_team},${m.away_team}`).catch(() => []);
  const roster = (squads || []).flatMap((s) => (s.players || []).map((p) => p.name));

  const goals = [];
  const notes = [];
  // Primary: the per-match summary's keyEvents — unlike the scoreboard's
  // details, these carry the assister (participants[0]=scorer, [1]=assist,
  // and the commentary text spells it out: "… Assisted by Érik Lira.").
  let plays = [];
  try {
    const sum = await fetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${found.id}`,
    );
    plays = (sum?.keyEvents || [])
      .filter((k) => k?.scoringPlay || /goal/i.test(k?.type?.text || ''))
      .map((k) => ({
        typeText: k?.type?.text || '',
        clock: k?.clock?.displayValue || '',
        scorer: k?.participants?.[0]?.athlete?.displayName || '',
        assist: k?.participants?.[1]?.athlete?.displayName || '',
        // Trust the text: only call participants[1] the assister when the
        // commentary says so (it can also be the fouled player on a penalty).
        assistConfirmed: /assisted by/i.test(k?.text || ''),
      }));
  } catch {
    /* summary down → scoreboard details below */
  }
  // Fallback: scoreboard details (scorer only, no assists).
  if (!plays.length) {
    plays = (found.details || [])
      .filter((d) => d?.scoringPlay)
      .map((d) => ({
        typeText: d?.type?.text || '',
        clock: d?.clock?.displayValue || '',
        scorer: d?.athletesInvolved?.[0]?.displayName || '',
        assist: d?.athletesInvolved?.[1]?.displayName || '',
        assistConfirmed: false,
      }));
  }
  for (const p of plays) {
    if (/own goal/i.test(p.typeText)) {
      notes.push(`Own goal ${p.clock} (${p.scorer}) — excluded from scorer credit`);
      continue;
    }
    if (!p.scorer) continue;
    const assist = p.assist && (p.assistConfirmed || !/penalty/i.test(p.typeText)) ? p.assist : '';
    goals.push({
      scorer: canonicalize(p.scorer, roster),
      assist: assist ? canonicalize(assist, roster) : null,
      clock: p.clock,
    });
  }

  const allScorers = [...new Set(goals.map((g) => g.scorer))];
  const assists = [...new Set(goals.map((g) => g.assist).filter(Boolean))];
  return {
    first_scorer: goals[0]?.scorer || '',
    all_scorers: allScorers,
    assist_players: assists,
    goals: goals.map((g) => `${g.clock} ${g.scorer}${g.assist ? ` (assist: ${g.assist})` : ''}`),
    notes,
    source: 'espn',
  };
}
