import { Router } from 'express';
import { computeLeaderboard } from '../services/scoring.js';

const router = Router();

router.get('/leaderboard', (req, res) => {
  res.json(computeLeaderboard());
});

export default router;
