import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  sessionConfigured,
  getSession,
  setSession,
  clearSession,
  setOauthState,
  takeOauthState,
} from '../services/session.js';
import { bracketsLocked, missingBracketParts } from '../services/bracketComplete.js';

// "Log in with Discord" — OAuth 2.0 Authorization Code + PKCE. Discord's API is
// free (no billing). We only request the `identify` scope, use the access token
// once to read the user's id + handle, then drop it and keep our own signed
// session cookie. The verified Discord account becomes the entrant's identity,
// so nobody can submit/edit a bracket they can't actually log into.

const router = Router();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const SCOPE = 'identify';

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USERINFO_URL = 'https://discord.com/api/users/@me';

// Only the Client ID is required (plus a session secret). A Client Secret is
// optional: with Discord's "Public Client" flag enabled, the PKCE code_verifier
// authenticates the token exchange, so no secret is needed — which lets us skip
// Discord's 2FA-gated secret entirely. If a secret IS set, we use it too.
export const discordConfigured = () => !!(CLIENT_ID && sessionConfigured());

// Build the redirect_uri from the incoming request so the same code works on
// staging and prod (both origins must be registered in the Discord app). The
// EXACT same string is used for /authorize and the token exchange.
// Hosts permitted to build the OAuth redirect_uri (must match Discord's
// registered URIs). Pinning them stops Host-header tampering from steering the
// redirect_uri; an unrecognised host falls back to the canonical prod origin.
const ALLOWED_OAUTH_HOSTS = new Set(['jup26wc.com', 'wc2026-staging.fly.dev']);

function callbackUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim();
  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim();
  const isLocal = rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1');
  const host = ALLOWED_OAUTH_HOSTS.has(rawHost) || isLocal ? rawHost : 'jup26wc.com';
  return `${proto}://${host}/api/auth/discord/callback`;
}

// Only allow same-site absolute paths as a post-login redirect target. Rejects
// protocol-relative (//host) AND the backslash bypass (/\host — browsers
// normalise "\" to "/", giving //host) plus any control characters.
function safeReturnTo(v) {
  if (typeof v === 'string' && /^\/(?![/\\])[^\\\x00-\x1f]*$/.test(v)) return v;
  return '/submit';
}

router.get('/discord/login', (req, res) => {
  if (!discordConfigured()) {
    return res.status(503).json({ error: 'Discord login is not configured yet.' });
  }
  const state = crypto.randomBytes(16).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  setOauthState(res, { state, cv: codeVerifier, rt: safeReturnTo(req.query.returnTo) });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPE,
    state,
    redirect_uri: callbackUrl(req),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });
  res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

router.get('/discord/callback', async (req, res) => {
  // Failures redirect silently, which made "logged in on Discord but the site
  // says I'm not" reports undebuggable — log the branch + status (never tokens
  // or codes) so ops can see WHY a callback bounced.
  const fail = (reason, extra = '') => {
    console.warn(
      `[oauth] callback failed: ${reason}${extra ? ` (${extra})` : ''} ua="${String(req.headers['user-agent'] || '').slice(0, 80)}"`,
    );
    return res.redirect(`/submit?login_error=${encodeURIComponent(reason)}`);
  };
  if (!discordConfigured()) return fail('not_configured');

  const { code, state } = req.query;
  const stash = takeOauthState(req, res);
  if (!stash) return fail('expired');
  if (!code || !state || state !== stash.state) return fail('bad_state');

  try {
    // PKCE public-client exchange: the code_verifier proves we started the flow,
    // so no client_secret is needed. Include the secret only if one is set
    // (confidential client).
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: callbackUrl(req),
      code_verifier: stash.cv,
    });
    if (CLIENT_SECRET) tokenParams.set('client_secret', CLIENT_SECRET);
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => '');
      // 429 here is almost never about our app: Discord blocks shared cloud
      // egress IPs when ANY tenant on the host floods their API. Distinct
      // reason so the client can say "try again shortly" instead of "broken".
      const reason = tokenRes.status === 429 ? 'rate_limited' : 'token_exchange';
      return fail(reason, `status=${tokenRes.status} body=${body.slice(0, 200)}`);
    }
    const { access_token: accessToken } = await tokenRes.json();
    if (!accessToken) return fail('no_token');

    const meRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return fail('userinfo', `status=${meRes.status}`);
    const me = await meRes.json();
    if (!me?.id) return fail('userinfo', 'no id in response');

    // Persist only the stable id + handle in our own session cookie; discard
    // the Discord access token (we don't need ongoing API access).
    setSession(res, { did: String(me.id), h: me.username || me.global_name || 'discord_user', n: me.global_name || me.username || '' });
    res.redirect(safeReturnTo(stash.rt));
  } catch (e) {
    return fail('exception', String(e?.message || e).slice(0, 120));
  }
});

// Client polls this to learn whether login is available + who's logged in.
router.get('/discord/me', (req, res) => {
  const configured = discordConfigured();
  const sess = configured ? getSession(req) : null;

  // First-party DAU: every page load calls /me, so record one row per visitor per
  // UTC day — discord_id for logged-in users, a salted ip+ua hash for anonymous
  // (no raw PII). INSERT OR IGNORE keeps repeat loads free; never fails the request.
  try {
    const day = new Date().toISOString().slice(0, 10);
    let visitor;
    if (sess?.did) {
      visitor = `d:${sess.did}`;
    } else {
      const ip = String(req.headers['fly-client-ip'] || req.ip || '');
      const ua = String(req.headers['user-agent'] || '');
      visitor =
        'a:' +
        crypto
          .createHash('sha256')
          .update(`${process.env.SESSION_SECRET || 'dau-salt'}|${ip}|${ua}`)
          .digest('base64url')
          .slice(0, 20);
    }
    db.prepare('INSERT OR IGNORE INTO daily_visits (day, visitor, logged_in) VALUES (?, ?, ?)').run(
      day,
      visitor,
      sess?.did ? 1 : 0,
    );
  } catch {
    /* analytics is best-effort */
  }

  if (sess) {
    // wallet_on_file: the wallet is collected once (bracket or first match pick)
    // and stored on the account — this tells the client whether to ask again.
    const p = db
      .prepare('SELECT discord, wallet_address, eligibility_status FROM participants WHERE discord_id = ?')
      .get(String(sess.did || ''));

    // Whether this user's *submitted* bracket is still incomplete (and editable),
    // so the client can nudge them to finish it. No bracket / locked => not flagged.
    let bracketIncomplete = false;
    let bracketMissing = [];
    if (p && !bracketsLocked()) {
      const b = db
        .prepare('SELECT thirds_json, knockout_json, champion FROM bracket_predictions WHERE discord = ?')
        .get(p.discord);
      if (b) {
        let thirds = [];
        let knockout = {};
        try { thirds = JSON.parse(b.thirds_json || '[]'); } catch { /* ignore */ }
        try { knockout = JSON.parse(b.knockout_json || '{}'); } catch { /* ignore */ }
        bracketMissing = missingBracketParts(thirds, knockout, b.champion);
        bracketIncomplete = bracketMissing.length > 0;
      }
    }

    return res.json({
      configured: true,
      loggedIn: true,
      discord_id: sess.did,
      handle: sess.h,
      name: sess.n,
      wallet_on_file: !!(p && p.wallet_address),
      // Own-account status only (keyed on this session's Discord id). Drives the
      // "get eligible" warning banner; null when the user hasn't submitted a wallet.
      eligibility_status: p?.eligibility_status || null,
      // Drives the "finish your bracket" prompt for users who submitted an
      // incomplete bracket (only while still editable).
      bracket_incomplete: bracketIncomplete,
      bracket_missing: bracketMissing,
    });
  }
  res.json({ configured, loggedIn: false });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

export default router;
