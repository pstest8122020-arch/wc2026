import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /api/moments/:handle — a participant's match-result moments, newest first.
// Surfaced on the public profile; each can be shared (never auto-posted).
router.get('/moments/:handle', (req, res) => {
  const rows = db
    .prepare(
      `SELECT mo.id, mo.kind, mo.detail, mo.created_at,
              m.home_team, m.away_team, m.home_goals, m.away_goals, m.match_num,
              sp.pred_home, sp.pred_away
         FROM moments mo
         JOIN matches m ON m.id = mo.match_id
         LEFT JOIN score_predictions sp ON sp.discord = mo.discord AND sp.match_id = mo.match_id
        WHERE mo.discord = ?
        ORDER BY mo.id DESC
        LIMIT 20`,
    )
    .all(req.params.handle);
  res.json(rows);
});

export default router;
