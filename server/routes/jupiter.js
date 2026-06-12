import { Router } from 'express';
import { db } from '../db.js';
import {
  getWc2026Events,
  findMarketForMatch,
  tournamentWinnerMarkets,
} from '../services/jupiterPredict.js';

const router = Router();

// Deep link to a Jupiter Prediction event: https://jup.ag/prediction/<eventId>
// e.g. https://jup.ag/prediction/POLY-351715 = Mexico vs. South Africa
function predictUrl(eventId) {
  if (!eventId) return 'https://jup.ag/prediction';
  return `https://jup.ag/prediction/${encodeURIComponent(eventId)}`;
}

// GET /api/jupiter/odds
// Returns:
//   - tournament_winner: top countries with outright-winner implied probabilities
//   - matches: map of our match_id → { home_prob, draw_prob, away_prob, event_title, ... }
router.get('/odds', async (req, res) => {
  const result = await getWc2026Events();
  const events = result.events || [];

  const matches = db
    .prepare(
      `SELECT id, home_team, away_team FROM matches
         WHERE status IN ('SCHEDULED','LIVE')
           AND home_team != 'TBD' AND away_team != 'TBD'`,
    )
    .all();

  const matchOdds = {};
  for (const m of matches) {
    const hit = findMarketForMatch(events, m.home_team, m.away_team);
    if (!hit) continue;
    matchOdds[m.id] = {
      home_team: m.home_team,
      away_team: m.away_team,
      event_id: hit.event.id,
      event_title: hit.event.title,
      event_url: predictUrl(hit.event.id),
      home_prob: hit.homeMarket?.midProb ?? hit.homeMarket?.buyYesProb ?? null,
      draw_prob: hit.drawMarket?.midProb ?? hit.drawMarket?.buyYesProb ?? null,
      away_prob: hit.awayMarket?.midProb ?? hit.awayMarket?.buyYesProb ?? null,
      home_market_id: hit.homeMarket?.id || null,
      away_market_id: hit.awayMarket?.id || null,
      volume:
        (hit.homeMarket?.volume || 0) +
        (hit.drawMarket?.volume || 0) +
        (hit.awayMarket?.volume || 0),
    };
  }

  const tournament = tournamentWinnerMarkets(events).map(({ event, market }) => ({
    team: market.title,
    market_id: market.id,
    event_id: event.id,
    event_url: predictUrl(event.id),
    title: market.title,
    prob: market.midProb,
    yes_prob: market.buyYesProb,
    volume: market.volume,
    event_title: event.title,
  }));

  res.json({
    ok: true,
    skipped: result.skipped || false,
    cached: !!result.cached,
    stale: !!result.stale,
    error: result.error || null,
    fetched_at: result.fetchedAt || null,
    event_count: events.length,
    tournament_winner: tournament,
    matches: matchOdds,
  });
});

export default router;
