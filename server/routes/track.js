import { Router } from 'express';
import { db } from '../db.js';
import { getSession } from '../services/session.js';

// First-party click tracking for outbound CTAs (currently the "Get eligible"
// link). A fire-and-forget beacon — never fails the caller. Events are
// allowlisted so the table can't be filled with arbitrary strings.
const router = Router();

// Jupiter Prediction Markets CTAs we record, by where they live.
const ALLOWED_EVENTS = new Set([
  'get_eligible', // bracket submit bar
  'odds', // live-odds link on match cards / match page
  'popup_freeroll', // "Try the freeroll" in the post-submit popup
  'rules', // /rules eligibility line
  'back_your_call', // "Back your call" after saving a match pick
  'eligibility_freeroll', // "Try the freeroll" in the ineligible-wallet warning banner
  'eligibility_banner_shown', // IMPRESSION: ineligible-wallet banner shown (deduped 1x/session)
  'jup_prediction', // any other Jupiter Prediction link (catch-all)
]);

router.post('/track', (req, res) => {
  const event = String(req.body?.event || '').slice(0, 40);
  if (!ALLOWED_EVENTS.has(event)) return res.status(204).end();

  const session = getSession(req);
  const path = String(req.body?.path || '').slice(0, 200);
  const targetUrl = String(req.body?.target_url || '').slice(0, 300);
  const ip = String(req.headers['fly-client-ip'] || req.ip || '')
    .replace(/^::ffff:/, '')
    .slice(0, 64);
  const ua = String(req.headers['user-agent'] || '').slice(0, 256);

  try {
    db.prepare(
      'INSERT INTO link_clicks (event, path, target_url, discord, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(event, path || null, targetUrl || null, session?.h || null, ip, ua);
  } catch {
    /* analytics is best-effort — never fail the request */
  }
  res.status(204).end();
});

// Server-side click logging via redirect: Jupiter links point at
// /api/go?e=<event>&to=<url>; we log the click and 302 to Jupiter. Unlike the
// in-page beacon, this counts EVERY navigation through the link — middle-click,
// right-click → open in new tab, keyboard, even with JS disabled.
const GO_FALLBACK = 'https://jup.ag/prediction/world-cup';
router.get('/go', (req, res) => {
  const e = String(req.query.e || '');
  const event = ALLOWED_EVENTS.has(e) ? e : 'jup_prediction';
  // Open-redirect protection: only https://jup.ag (or subdomains) may be a target.
  let target = GO_FALLBACK;
  try {
    const u = new URL(String(req.query.to || ''));
    if (u.protocol === 'https:' && (u.hostname === 'jup.ag' || u.hostname.endsWith('.jup.ag'))) {
      target = u.toString();
    }
  } catch {
    /* keep fallback */
  }
  const session = getSession(req);
  let path = null;
  try {
    path = new URL(String(req.headers.referer || '')).pathname.slice(0, 200);
  } catch {
    /* no referer */
  }
  const ip = String(req.headers['fly-client-ip'] || req.ip || '')
    .replace(/^::ffff:/, '')
    .slice(0, 64);
  const ua = String(req.headers['user-agent'] || '').slice(0, 256);
  try {
    db.prepare(
      'INSERT INTO link_clicks (event, path, target_url, discord, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(event, path, target.slice(0, 300), session?.h || null, ip, ua);
  } catch {
    /* analytics is best-effort — never block the redirect */
  }
  res.redirect(302, target);
});

export default router;
