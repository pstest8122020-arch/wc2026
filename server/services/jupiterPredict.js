// Jupiter Prediction Market API wrapper.
// Docs: https://developers.jup.ag/docs/prediction/events-and-markets
//
// Actual response shape (the docs lie a bit):
//   { data: [ Event ] }
//   Event = { eventId, category, subcategory, metadata: { title, ... }, markets: [Market] }
//   Market = { marketId, title, pricing: { buyYesPriceUsd, buyNoPriceUsd, volume }, ... }
//   pricing prices are micro-USD: 176000 = $0.176 = 17.6% implied probability
//
// For WC 2026, the relevant subcategory is `fifwc`. Tournament-winner markets
// live in an event titled "2026 FIFA World Cup Winner" — each market within
// is one country (market.title = "France", etc.). Per-match events are titled
// "<Home> vs. <Away>" with 3 markets (home / draw / away).

const BASE_URL = 'https://api.jup.ag/prediction/v1';
// Odds are refreshed by a background cron every 10 minutes; cache TTL matches so
// no on-demand request ever fires the upstream API mid-cycle.
const CACHE_TTL_MS = 10 * 60 * 1000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const SUBCATEGORY = 'fifwc';
// Jupiter's rate limit is 1 request/second. We sleep between paginated calls
// to stay under it with a safety margin.
const REQUEST_GAP_MS = 1100;
// Jupiter's actual page size is 20, regardless of what we ask for in `end`.
const PAGE = 20;

let cache = {
  events: null,
  fetchedAt: 0,
  error: null,
};
// In-flight fetch promise so concurrent callers share a single API walk.
let pendingFetch = null;

function apiKey() {
  return process.env.JUPITER_PREDICT_API_KEY;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(path, params = {}) {
  const key = apiKey();
  if (!key) throw new Error('JUPITER_PREDICT_API_KEY not set');

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      signal: ac.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Jupiter API ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Convert Jupiter native price (1_000_000 = $1.00) to 0-1 implied probability.
function priceToProb(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw / 1_000_000));
}

function normalizeMarket(m) {
  const pricing = m.pricing || {};
  const rawYes = pricing.buyYesPriceUsd;
  const rawNo = pricing.buyNoPriceUsd;

  // A market with all-zero pricing has no orderbook (no real implied
  // probability). Treat all probs as null so the UI doesn't show a misleading
  // 50/50 midpoint.
  const hasOrderbook = (typeof rawYes === 'number' && rawYes > 0) ||
                       (typeof rawNo  === 'number' && rawNo  > 0);

  const buyYes = hasOrderbook ? priceToProb(rawYes) : null;
  const buyNo  = hasOrderbook ? priceToProb(rawNo)  : null;

  // mid = midpoint between buy-yes and (1 - buy-no), accounting for spread
  let mid = null;
  if (buyYes != null && buyNo != null) {
    mid = (buyYes + (1 - buyNo)) / 2;
  } else if (buyYes != null) {
    mid = buyYes;
  }

  return {
    id: m.marketId || m.id,
    title: m.title || (m.metadata && m.metadata.title) || '',
    status: m.status || 'unknown',
    result: m.result || null,
    buyYesProb: buyYes,
    buyNoProb: buyNo,
    midProb: mid,
    volume: typeof pricing.volume === 'number' ? pricing.volume : null,
    hasOrderbook,
  };
}

function eventTitle(e) {
  return (e.metadata && e.metadata.title) || e.title || e.name || '';
}

function normalizeEvent(e) {
  return {
    id: e.eventId || e.id,
    title: eventTitle(e).trim(),
    category: e.category,
    subcategory: e.subcategory,
    isActive: e.isActive !== false,
    markets: Array.isArray(e.markets) ? e.markets.map(normalizeMarket) : [],
  };
}

function flattenEvents(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.data || payload?.events || [];
  return list.map(normalizeEvent);
}

export async function getWc2026Events({ force = false } = {}) {
  if (!apiKey()) {
    return { events: [], skipped: true, reason: 'JUPITER_PREDICT_API_KEY not set' };
  }
  const now = Date.now();
  if (!force && cache.events && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { events: cache.events, cached: true, fetchedAt: cache.fetchedAt };
  }
  // Coalesce concurrent calls onto the same in-flight fetch.
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
  try {
    // Walk paginated /events endpoint until we get an empty page. Sleep
    // REQUEST_GAP_MS between calls to respect Jupiter's 1 req/s limit.
    const all = [];
    const MAX_PAGES = 25; // safety: at most 500 events
    for (let page = 0; page < MAX_PAGES; page++) {
      const start = page * PAGE;
      if (page > 0) await sleep(REQUEST_GAP_MS);
      const payload = await fetchJson('/events', {
        category: 'sports',
        subcategory: SUBCATEGORY,
        includeMarkets: 'true',
        start,
        end: start + PAGE,
      });
      const events = flattenEvents(payload);
      all.push(...events);
      if (events.length === 0) break;
    }
    cache = {
      events: all,
      fetchedAt: now,
      error: null,
    };
    return { events: all, cached: false, fetchedAt: now };
  } catch (e) {
    cache.error = e.message;
    return {
      events: cache.events || [],
      error: e.message,
      stale: !!cache.events,
      fetchedAt: cache.fetchedAt || null,
    };
  } finally {
    pendingFetch = null;
  }
  })();
  return pendingFetch;
}

// --- Background cron ---------------------------------------------------------
//
// Refresh the odds cache every 10 minutes. The very first call also runs once
// on startup so the cache is warm before any user hits /api/jupiter/odds.
// One full refresh = ~5 paginated calls × 1.1s gap = ~5.5s of upstream work,
// well within the 1 req/s budget.

let refreshTimer = null;

export function startJupiterOddsRefresh() {
  if (!apiKey()) {
    console.log('[jupiter] JUPITER_PREDICT_API_KEY not set; cron disabled');
    return;
  }
  if (refreshTimer) clearInterval(refreshTimer);

  const refresh = async (label) => {
    const t0 = Date.now();
    try {
      const r = await getWc2026Events({ force: true });
      const ms = Date.now() - t0;
      if (r.error) {
        console.warn(`[jupiter] ${label} failed in ${ms}ms: ${r.error}`);
      } else {
        console.log(`[jupiter] ${label} ok in ${ms}ms · ${r.events.length} events`);
      }
    } catch (e) {
      console.warn(`[jupiter] ${label} threw:`, e.message);
    }
  };

  // Kick off an initial warm-up (don't block startup)
  refresh('initial refresh').catch(() => {});

  refreshTimer = setInterval(() => refresh('scheduled refresh'), REFRESH_INTERVAL_MS);
  console.log(`[jupiter] cron scheduled every ${REFRESH_INTERVAL_MS / 60000}m`);
}

export function stopJupiterOddsRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

// Manual refresh: forces an immediate upstream fetch AND restarts the cron
// so the next 12h cycle is timed from this moment.
export async function refreshJupiterOddsNow() {
  const t0 = Date.now();
  const r = await getWc2026Events({ force: true });
  const ms = Date.now() - t0;
  // Restart the 12h interval so it ticks from now, not from boot.
  if (apiKey()) startJupiterOddsRefresh();
  return {
    ok: !r.error,
    ms,
    event_count: (r.events || []).length,
    error: r.error || null,
    fetched_at: r.fetchedAt || null,
  };
}

// Normalize a name for fuzzy matching: lowercase + strip spaces/punct/diacritics.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Football-data.org and Jupiter Prediction spell the same country differently
// (e.g. "South Korea" vs "Korea Republic", "Türkiye" vs "Turkey"). This map
// lists every alias we want to try when matching.
const COUNTRY_ALIASES = {
  southkorea: ['southkorea', 'koreareplublic', 'korearepublic', 'republicofkorea'],
  koreareplublic: ['southkorea', 'korearepublic'],
  korearepublic: ['southkorea', 'korearepublic'],
  northkorea: ['northkorea', 'koreadpr', 'koreademocratic'],
  bosniaherzegovina: ['bosniaherzegovina', 'bosniaandherzegovina'],
  bosniaandherzegovina: ['bosniaherzegovina', 'bosniaandherzegovina'],
  turkey: ['turkey', 'turkiye'],
  turkiye: ['turkey', 'turkiye'],
  ivorycoast: ['ivorycoast', 'cotedivoire'],
  cotedivoire: ['ivorycoast', 'cotedivoire'],
  capeverdeislands: ['capeverdeislands', 'capeverde', 'caboverde'],
  capeverde: ['capeverdeislands', 'capeverde', 'caboverde'],
  caboverde: ['capeverdeislands', 'capeverde', 'caboverde'],
  congodr: ['congodr', 'drcongo', 'democraticrepublicofcongo'],
  drcongo: ['congodr', 'drcongo'],
  iran: ['iran', 'iriran', 'islamicrepublicofiran'],
  iriran: ['iran', 'iriran'],
  usa: ['usa', 'unitedstates', 'unitedstatesofamerica'],
  unitedstates: ['usa', 'unitedstates', 'unitedstatesofamerica'],
  northmacedonia: ['northmacedonia', 'macedonia'],
  czechia: ['czechia', 'czechrepublic'],
  czechrepublic: ['czechia', 'czechrepublic'],
  saotomeandprincipe: ['saotomeandprincipe', 'saotomeprincipe'],
};

function aliasesFor(name) {
  const n = norm(name);
  return COUNTRY_ALIASES[n] || [n];
}

// True if `haystack` (already normalized) contains any of `needles`.
function containsAny(haystack, needles) {
  return needles.some((n) => haystack.includes(n));
}

// Per-match: find an event titled "<Home> vs. <Away>" (or variants) and return
// the home / draw / away market probabilities.
export function findMarketForMatch(events, homeTeam, awayTeam) {
  if (!homeTeam || !awayTeam || homeTeam === 'TBD' || awayTeam === 'TBD') return null;
  const homeAliases = aliasesFor(homeTeam);
  const awayAliases = aliasesFor(awayTeam);

  for (const ev of events) {
    const t = norm(ev.title);
    if (!containsAny(t, homeAliases) || !containsAny(t, awayAliases)) continue;

    let homeMarket = null;
    let awayMarket = null;
    let drawMarket = null;
    for (const m of ev.markets) {
      const mt = norm(m.title);
      if (homeAliases.includes(mt)) homeMarket = m;
      else if (awayAliases.includes(mt)) awayMarket = m;
      else if (mt === 'draw' || mt === 'tie') drawMarket = m;
    }
    if (homeMarket || awayMarket) {
      return { event: ev, homeMarket, awayMarket, drawMarket };
    }
  }
  return null;
}

// Tournament winner: the event titled like "2026 FIFA World Cup Winner".
// Each market within = one country's outright winner odds.
export function tournamentWinnerMarkets(events) {
  let winnerEvent = null;
  for (const ev of events) {
    const t = norm(ev.title);
    if (
      (t.includes('worldcup') && t.includes('winner')) ||
      t.includes('worldcupwinner') ||
      t.includes('fifaworldcupwinner')
    ) {
      // Prefer the one with most markets (some prop-bet events also match)
      if (!winnerEvent || ev.markets.length > winnerEvent.markets.length) {
        winnerEvent = ev;
      }
    }
  }
  if (!winnerEvent) return [];

  // Drop markets with no orderbook (where normalizeMarket set buyYesProb=null).
  const liquid = winnerEvent.markets.filter((m) => m.buyYesProb != null);

  return liquid
    .map((m) => ({ event: winnerEvent, market: m }))
    .sort((x, y) => (y.market.midProb || 0) - (x.market.midProb || 0));
}
