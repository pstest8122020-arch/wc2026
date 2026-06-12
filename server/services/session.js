import crypto from 'node:crypto';

// Stateless, signed-cookie sessions. We don't store anything server-side: the
// session is an HMAC-signed JSON token in an httpOnly cookie. Used for the
// "Log in with Discord" identity layer. No external deps — just node:crypto.

const SESSION_SECRET = process.env.SESSION_SECRET || '';

export const sessionConfigured = () => SESSION_SECRET.length >= 16;

const SESSION_COOKIE = 'wc_sess';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const baseCookieOpts = {
  httpOnly: true,
  secure: true, // Fly terminates TLS; staging + prod are always HTTPS
  sameSite: 'lax', // sent on top-level GET navigations (the OAuth callback)
  path: '/',
};

// token = base64url(json) + "." + base64url(HMAC-SHA256(body))
export function signToken(payload) {
  if (!SESSION_SECRET) throw new Error('SESSION_SECRET not set');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!SESSION_SECRET || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Read a cookie from the request without a cookie-parser dependency.
export function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// --- Login session (the verified Discord identity) -------------------------

export function getSession(req) {
  const tok = readCookie(req, SESSION_COOKIE);
  if (!tok) return null;
  const p = verifyToken(tok);
  if (!p) return null;
  if (p.exp && Date.now() > p.exp) return null;
  return p; // { did, h, n, iat, exp }
}

export function setSession(res, { did, h, n }) {
  const now = Date.now();
  const tok = signToken({ did, h, n, iat: now, exp: now + SESSION_TTL_MS });
  res.cookie(SESSION_COOKIE, tok, { ...baseCookieOpts, maxAge: SESSION_TTL_MS });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Short-lived cookie that carries the OAuth `state` + PKCE verifier across the
// redirect to Discord and back. Separate from the login session.
const OAUTH_COOKIE = 'wc_oauth';
const OAUTH_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function setOauthState(res, data) {
  const tok = signToken({ ...data, exp: Date.now() + OAUTH_TTL_MS });
  res.cookie(OAUTH_COOKIE, tok, { ...baseCookieOpts, maxAge: OAUTH_TTL_MS });
}

export function takeOauthState(req, res) {
  const tok = readCookie(req, OAUTH_COOKIE);
  res.clearCookie(OAUTH_COOKIE, { path: '/' });
  if (!tok) return null;
  const p = verifyToken(tok);
  if (!p || (p.exp && Date.now() > p.exp)) return null;
  return p; // { state, cv, rt, exp }
}
