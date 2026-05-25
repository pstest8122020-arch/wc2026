import { db } from '../db.js';

const BASE_URL = 'https://api.football-data.org/v4';

function apiKey() {
  return process.env.FOOTBALL_API_KEY;
}

function competitionCode() {
  return process.env.FOOTBALL_COMPETITION_CODE || 'WC';
}

async function fetchWithBackoff(url, attempt = 0) {
  const key = apiKey();
  if (!key) throw new Error('FOOTBALL_API_KEY is not set');

  const res = await fetch(url, {
    headers: { 'X-Auth-Token': key },
  });

  if (res.status === 429) {
    if (attempt >= 4) throw new Error('Rate limited after retries');
    const wait = Math.min(60000, 1000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, wait));
    return fetchWithBackoff(url, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function roundFromApi(stage, group) {
  if (stage === 'GROUP_STAGE') return 'Group Stage';
  if (stage === 'LAST_16' || stage === 'ROUND_OF_16') return 'Round of 16';
  if (stage === 'ROUND_OF_32' || stage === 'LAST_32') return 'Round of 32';
  if (stage === 'QUARTER_FINALS' || stage === 'QUARTERFINALS') return 'Quarterfinal';
  if (stage === 'SEMI_FINALS' || stage === 'SEMIFINALS') return 'Semifinal';
  if (stage === 'THIRD_PLACE' || stage === '3RD_PLACE') return '3rd Place';
  if (stage === 'FINAL') return 'Final';
  return stage || 'Group Stage';
}

function multiplierForRound(round) {
  if (round === 'Round of 16' || round === 'Quarterfinal' || round === 'Semifinal' || round === '3rd Place' || round === 'Final') {
    return 2;
  }
  return 1;
}

function mapApiStatus(s) {
  if (s === 'FINISHED' || s === 'AWARDED') return 'FINISHED';
  if (s === 'IN_PLAY' || s === 'PAUSED' || s === 'LIVE') return 'LIVE';
  return 'SCHEDULED';
}

export async function seedMatchesFromApi() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM matches WHERE api_id IS NOT NULL').get().c;
  if (existing > 0) {
    console.log(`[footballApi] ${existing} matches already linked to API, skipping seed`);
    return;
  }

  const code = competitionCode();
  console.log(`[footballApi] Seeding matches for competition ${code}...`);

  const data = await fetchWithBackoff(`${BASE_URL}/competitions/${code}/matches`);
  const apiMatches = data.matches || [];

  if (apiMatches.length === 0) {
    console.warn('[footballApi] No matches returned from API');
    return;
  }

  apiMatches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  const wipe = db.prepare('DELETE FROM matches');
  const insert = db.prepare(`
    INSERT INTO matches
      (api_id, round, group_name, match_num, home_team, away_team,
       home_goals, away_goals, status, kickoff_utc, pts_multiplier)
    VALUES (@api_id, @round, @group_name, @match_num, @home_team, @away_team,
       @home_goals, @away_goals, @status, @kickoff_utc, @pts_multiplier)
  `);

  const tx = db.transaction(() => {
    wipe.run();
    let n = 1;
    for (const m of apiMatches) {
      const round = roundFromApi(m.stage, m.group);
      const status = mapApiStatus(m.status);
      const groupName = round === 'Group Stage' && m.group
        ? String(m.group).replace(/^GROUP_/i, '')
        : null;
      insert.run({
        api_id: String(m.id),
        round,
        group_name: groupName,
        match_num: n++,
        home_team: m.homeTeam?.name || m.homeTeam?.shortName || 'TBD',
        away_team: m.awayTeam?.name || m.awayTeam?.shortName || 'TBD',
        home_goals: m.score?.fullTime?.home ?? null,
        away_goals: m.score?.fullTime?.away ?? null,
        status,
        kickoff_utc: m.utcDate || null,
        pts_multiplier: multiplierForRound(round),
      });
    }
  });
  tx();

  console.log(`[footballApi] Seeded ${apiMatches.length} matches from API`);
}

export async function fetchCompetitionMatches() {
  const code = competitionCode();
  return fetchWithBackoff(`${BASE_URL}/competitions/${code}/matches`);
}

export async function fetchSingleMatch(apiId) {
  return fetchWithBackoff(`${BASE_URL}/matches/${apiId}`);
}

export function syncMatchRow(apiMatch) {
  const row = db.prepare('SELECT * FROM matches WHERE api_id = ?').get(String(apiMatch.id));
  if (!row) return null;
  // Admin override is sticky — never let the API revert it
  if (row.manual_result) return null;

  const status = mapApiStatus(apiMatch.status);
  const homeGoals = apiMatch.score?.fullTime?.home ?? null;
  const awayGoals = apiMatch.score?.fullTime?.away ?? null;
  const homeTeam = apiMatch.homeTeam?.name || apiMatch.homeTeam?.shortName || row.home_team;
  const awayTeam = apiMatch.awayTeam?.name || apiMatch.awayTeam?.shortName || row.away_team;
  const kickoff = apiMatch.utcDate || row.kickoff_utc;

  const changed =
    row.status !== status ||
    row.home_goals !== homeGoals ||
    row.away_goals !== awayGoals ||
    row.home_team !== homeTeam ||
    row.away_team !== awayTeam ||
    row.kickoff_utc !== kickoff;

  if (!changed) return null;

  db.prepare(
    `UPDATE matches SET status=?, home_goals=?, away_goals=?, home_team=?, away_team=?, kickoff_utc=? WHERE id=?`,
  ).run(status, homeGoals, awayGoals, homeTeam, awayTeam, kickoff, row.id);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(row.id);
  return { previous: row, current: updated };
}
