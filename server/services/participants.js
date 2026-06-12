import { db } from '../db.js';

// Resolve the participant key (participants.discord) for a verified Discord
// session, creating a minimal participant row on first contact. This makes a
// Discord login a single account that holds the bracket + all match picks.
export function ensureParticipantForSession(session) {
  const discordId = String(session?.did || '');
  if (!discordId) return null;
  const existing = db.prepare('SELECT discord FROM participants WHERE discord_id = ?').get(discordId);
  if (existing) return existing.discord;
  let handle = String(session.h || '').trim().slice(0, 50) || `user_${discordId.slice(-6)}`;
  // participants.discord is UNIQUE — disambiguate a clashing handle.
  if (db.prepare('SELECT 1 FROM participants WHERE discord = ?').get(handle)) {
    handle = `${handle}_${discordId.slice(-4)}`;
  }
  db.prepare('INSERT INTO participants (discord, discord_id) VALUES (?, ?)').run(handle, discordId);
  return handle;
}

// Anti-sybil submission metadata for the admin sybil report (report-only — nothing
// is blocked by IP). Captures the real client IP (Fly's edge rewrites req.ip, so
// prefer the fly-client-ip header) + user-agent on the live Discord-flow write
// paths. Fill-if-empty: the FIRST captured value is kept as the stable signal, and
// participants who submitted before capture existed get backfilled on their next
// edit. Best-effort — must never fail the caller.
export function recordSubmitMeta(req, discord) {
  if (!discord) return;
  try {
    const ip = String(req.headers['fly-client-ip'] || req.ip || '')
      .replace(/^::ffff:/, '')
      .slice(0, 64);
    const ua = String(req.headers['user-agent'] || '').slice(0, 256);
    if (!ip && !ua) return;
    db.prepare(
      `UPDATE participants
          SET submit_ip = COALESCE(NULLIF(submit_ip, ''), ?),
              submit_user_agent = COALESCE(NULLIF(submit_user_agent, ''), ?)
        WHERE discord = ?`,
    ).run(ip || null, ua || null, discord);
  } catch {
    /* metadata is best-effort */
  }
}
