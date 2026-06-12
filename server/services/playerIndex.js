// Player autocomplete index. One call to football-data.org's
// /competitions/WC/teams returns all 48 squads inline (~1,200 players), so we
// fetch once, cache, and refresh on a slow cron (squads change rarely). Used by
// GET /api/players for award-pick + match-pick autocomplete.

const BASE_URL = 'https://api.football-data.org/v4';
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

let cache = { players: [], fetchedAt: 0, error: null };
let pendingFetch = null;

function apiKey() {
  return process.env.FOOTBALL_API_KEY;
}
function competitionCode() {
  return process.env.FOOTBALL_COMPETITION_CODE || 'WC';
}

// Lowercase, strip diacritics + punctuation so "Mbappe" matches "Mbappé".
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchSquads() {
  const key = apiKey();
  if (!key) return [];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/competitions/${competitionCode()}/teams`, {
      headers: { 'X-Auth-Token': key },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`teams ${res.status}`);
    const data = await res.json();
    const teams = data.teams || [];
    const players = [];
    const seen = new Set();
    for (const t of teams) {
      const teamName = t.name || '';
      for (const p of t.squad || []) {
        if (!p || !p.name) continue;
        const dedupe = `${norm(p.name)}|${norm(teamName)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        players.push({ name: p.name, position: p.position || '', team: teamName, n: norm(p.name), tn: norm(teamName) });
      }
    }
    players.sort((a, b) => a.name.localeCompare(b.name));
    return players;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPlayerIndex({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.players.length && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (pendingFetch) return pendingFetch;
  pendingFetch = (async () => {
    try {
      const players = await fetchSquads();
      if (players.length) cache = { players, fetchedAt: now, error: null };
      else cache = { players: cache.players, fetchedAt: now, error: 'empty' };
      return cache;
    } catch (e) {
      cache.error = e.message;
      return cache;
    } finally {
      pendingFetch = null;
    }
  })();
  return pendingFetch;
}

function strip(p) {
  return { name: p.name, position: p.position, team: p.team };
}

// Full rosters for the tap-to-pick player modal: GET /api/squads?teams=A,B.
// Players come back grouped per requested team, ordered scorer-first (FW, MF,
// DF, GK) since the picker is mostly used for goalscorer/assist/MOTM.
const GROUP_ORDER = { FW: 0, MF: 1, DF: 2, GK: 3 };

export function positionGroup(position) {
  const p = norm(position);
  if (!p) return 'MF';
  if (p.includes('keeper') || p === 'gk') return 'GK';
  if (p.includes('back') || p.includes('defen')) return 'DF';
  if (p.includes('midfield')) return 'MF';
  if (p.includes('winger') || p.includes('forward') || p.includes('offence') || p.includes('attack') || p.includes('striker')) return 'FW';
  return 'MF';
}

export async function getSquads(teamCsv = '') {
  const wanted = String(teamCsv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!wanted.length) return [];
  const { players } = await getPlayerIndex();
  return wanted.map((teamName) => {
    const tn = norm(teamName);
    const squad = players
      .filter((p) => p.tn === tn)
      .map((p) => ({ name: p.name, position: p.position, group: positionGroup(p.position) }))
      .sort(
        (a, b) =>
          GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.name.localeCompare(b.name),
      );
    return { team: teamName, players: squad };
  });
}

export async function searchPlayers({ q = '', team = '', limit = 8 } = {}) {
  const { players } = await getPlayerIndex();
  let pool = players;
  if (team) {
    const teamSet = new Set(team.split(',').map((s) => norm(s)).filter(Boolean));
    if (teamSet.size) {
      const filtered = players.filter((p) => teamSet.has(p.tn));
      if (filtered.length) pool = filtered; // fall back to global if team match empty
    }
  }
  const nq = norm(q);
  if (!nq) return pool.slice(0, limit).map(strip);

  const starts = [];
  const contains = [];
  for (const p of pool) {
    if (p.n.startsWith(nq) || p.n.split(' ').some((tok) => tok.startsWith(nq))) starts.push(p);
    else if (p.n.includes(nq)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, limit).map(strip);
}

let timer = null;
export function startPlayerIndexRefresh() {
  if (!apiKey()) {
    console.log('[players] FOOTBALL_API_KEY not set; player index disabled');
    return;
  }
  if (timer) clearInterval(timer);
  getPlayerIndex({ force: true })
    .then((c) => console.log(`[players] index ready · ${c.players.length} players`))
    .catch(() => {});
  timer = setInterval(() => getPlayerIndex({ force: true }).catch(() => {}), REFRESH_INTERVAL_MS);
}

export function stopPlayerIndexRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
}
