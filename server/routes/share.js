import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';

const router = Router();

// ⚠️ ANALYTICS ONLY. ShareEvents measure which artifacts drive visits. They
// MUST NOT feed eligibility, points, prizes, or any reward. There is
// deliberately no referredBy→reward path here (see spec §0, §11). If referral
// payouts are ever wanted, they belong in a separate, sybil-gated rewards
// service — not in this module.

const ARTIFACTS = new Set(['rank', 'moment']);

function slug() {
  return randomBytes(6).toString('hex'); // 12 hex chars
}

// POST /api/share { artifact, handle? } -> { slug }
router.post('/share', (req, res) => {
  const { artifact, handle } = req.body || {};
  if (!ARTIFACTS.has(artifact)) {
    return res.status(400).json({ error: 'invalid artifact' });
  }
  const s = slug();
  db.prepare(
    'INSERT INTO share_events (discord, artifact, ref_slug, kind) VALUES (?, ?, ?, ?)',
  ).run(typeof handle === 'string' && handle ? handle.slice(0, 50) : null, artifact, s, 'share');
  res.json({ ok: true, slug: s });
});

// POST /api/share/visit { slug } -> records a landing from a shared link.
router.post('/share/visit', (req, res) => {
  const s = (req.body && req.body.slug) || '';
  if (!s || typeof s !== 'string' || s.length > 32) {
    return res.status(400).json({ error: 'invalid slug' });
  }
  db.prepare(
    'INSERT INTO share_events (discord, artifact, ref_slug, kind) VALUES (?, ?, ?, ?)',
  ).run(null, 'visit', s, 'visit');
  res.json({ ok: true });
});

export default router;
