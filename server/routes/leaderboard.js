import { Router } from 'express';
import { computeLeaderboardCached } from '../services/scoring.js';

const router = Router();

router.get('/leaderboard', (req, res) => {
  // Served from a 15s in-memory cache (invalidated on result changes), plus a
  // short browser/edge hint so rapid refreshes don't recompute.
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json(computeLeaderboardCached());
});

export default router;
