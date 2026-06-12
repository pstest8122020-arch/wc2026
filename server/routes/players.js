import { Router } from 'express';
import { searchPlayers, getSquads } from '../services/playerIndex.js';

const router = Router();

// GET /api/players?q=mba&team=Brazil,Serbia&limit=8
// Autocomplete for award + match player picks. Read-only, public, cached.
router.get('/players', async (req, res) => {
  const q = (req.query.q || '').toString().slice(0, 40);
  const team = (req.query.team || '').toString().slice(0, 160);
  const limit = Math.min(15, Math.max(1, parseInt(req.query.limit, 10) || 8));
  try {
    const players = await searchPlayers({ q, team, limit });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ players });
  } catch {
    res.json({ players: [] });
  }
});

// GET /api/squads?teams=Mexico,South Africa
// Full rosters for the match-pick player modal. Read-only, public, cached.
router.get('/squads', async (req, res) => {
  const teams = (req.query.teams || '').toString().slice(0, 160);
  try {
    const result = await getSquads(teams);
    // Only let browsers cache REAL rosters — an empty payload (cold index,
    // upstream hiccup) cached for 15 min would pin the degraded fallback.
    const hasPlayers = result.some((t) => t.players.length > 0);
    res.setHeader('Cache-Control', hasPlayers ? 'public, max-age=900' : 'no-store');
    res.json({ teams: result });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ teams: [] });
  }
});

export default router;
