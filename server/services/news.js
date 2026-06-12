// WC 2026 news feed. The browser can't fetch theguardian.com directly (our CSP
// is connect-src 'self' and the feed has no CORS), so we fetch + parse the
// Guardian "World Cup 2026" tag RSS here on the server, cache it, and refresh
// on a 20-minute cron. Served as clean JSON by GET /api/news.
//
// Security: the feed is untrusted input. We extract title/link/pubDate/summary,
// strip ALL HTML, decode entities, and only keep https links — the client then
// renders everything as escaped plain text (no dangerouslySetInnerHTML).

const FEED_URL = 'https://www.theguardian.com/football/world-cup-2026/rss';
const SOURCE = 'The Guardian';
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 min
const CACHE_TTL_MS = 20 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_ITEMS = 12;

let cache = { items: [], fetchedAt: 0, error: null };
let pendingFetch = null;

// Decode XML/HTML entities (numeric + common named). &amp; is decoded LAST so a
// double-encoded "&amp;lt;" doesn't collapse into "<".
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Plain text from a feed field. The Guardian entity-encodes its HTML
// (e.g. "&lt;p&gt;"), so we strip BOTH real tags and entity-encoded tags
// (replacing each with a space so words don't run together) BEFORE decoding the
// remaining entities. Requiring a letter after "<" / "&lt;" preserves literal
// prose like "5 < 10".
function clean(s) {
  let t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = t.replace(/<\/?[a-zA-Z][\s\S]*?>/g, ' ');       // real HTML tags
  t = t.replace(/&lt;\/?[a-zA-Z][\s\S]*?&gt;/g, ' '); // entity-encoded HTML tags
  t = decodeEntities(t);                               // remaining entities
  return t.replace(/\s+/g, ' ').trim();
}
function safeCp(n) {
  try {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}

function tagText(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

// Headlines we never surface in the ticker (case-insensitive substring match).
// The Guardian "Bracketology" interactive is a competing bracket predictor; the
// rest are explicit user exclusions.
const EXCLUDE_TITLE = ['bracketology', 'my pick to lift the world cup'];
function isExcludedTitle(title) {
  const t = String(title || '').toLowerCase();
  return EXCLUDE_TITLE.some((p) => t.includes(p));
}

function parseItems(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const items = [];
  for (const block of blocks) {
    const title = clean(tagText(block, 'title'));
    const link = clean(tagText(block, 'link'));
    const pub = clean(tagText(block, 'pubDate'));
    let summary = clean(tagText(block, 'description'));
    // Require a real headline and an https link; drop blocklisted headlines.
    if (!title || !/^https:\/\//i.test(link) || isExcludedTitle(title)) continue;
    if (summary.length > 180) summary = summary.slice(0, 177).trimEnd() + '…';
    const ts = Date.parse(pub);
    items.push({
      title: title.slice(0, 200),
      link,
      summary,
      source: SOURCE,
      published_at: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
      _ts: Number.isFinite(ts) ? ts : 0,
    });
  }
  items.sort((a, b) => b._ts - a._ts);
  return items.slice(0, MAX_ITEMS).map(({ _ts, ...rest }) => rest);
}

async function fetchFeed() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        'User-Agent': 'jup26wc-news/1.0 (+https://jup26wc.com)',
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const xml = await res.text();
    return parseItems(xml);
  } finally {
    clearTimeout(timer);
  }
}

export async function getNews({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.items.length && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (pendingFetch) return pendingFetch;
  pendingFetch = (async () => {
    try {
      const items = await fetchFeed();
      // Keep last-good items on an empty/failed parse so the section never blanks.
      if (items.length) cache = { items, fetchedAt: now, error: null };
      else cache = { items: cache.items, fetchedAt: now, error: 'empty' };
      return cache;
    } catch (e) {
      cache = { items: cache.items, fetchedAt: cache.fetchedAt, error: e.message };
      return cache;
    } finally {
      pendingFetch = null;
    }
  })();
  return pendingFetch;
}

let refreshTimer = null;
export function startNewsRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  getNews({ force: true })
    .then((c) => console.log(`[news] feed ready · ${c.items.length} items${c.error ? ` (err: ${c.error})` : ''}`))
    .catch(() => {});
  refreshTimer = setInterval(() => getNews({ force: true }).catch(() => {}), REFRESH_INTERVAL_MS);
  console.log(`[news] cron scheduled every ${REFRESH_INTERVAL_MS / 60000}m`);
}
export function stopNewsRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
