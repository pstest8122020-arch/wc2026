import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// /matches and /bracket are identical for all users and read on every page
// load. Cache the query + the derived bracket briefly so a burst costs one DB
// read per TTL. Live result changes are pushed to clients over Socket.io, so a
// short staleness window on cold loads is harmless.
const CACHE_TTL_MS = 15000;
const MATCH_COLS = `id, api_id, round, group_name, match_num, home_team, away_team,
              home_goals, away_goals, status, kickoff_utc, pts_multiplier`;

let _matches = null;
let _matchesAt = 0;
let _bracket = null;
let _bracketAt = 0;

function getMatches() {
  const now = Date.now();
  if (_matches && now - _matchesAt < CACHE_TTL_MS) return _matches;
  _matches = db.prepare(`SELECT ${MATCH_COLS} FROM matches ORDER BY match_num ASC`).all();
  _matchesAt = now;
  return _matches;
}

function getBracket() {
  const now = Date.now();
  if (_bracket && now - _bracketAt < CACHE_TTL_MS) return _bracket;
  const matches = getMatches();
  const result = {
    groupStage: {},
    roundOf32: [],
    roundOf16: [],
    quarterfinals: [],
    semifinals: [],
    thirdPlace: [],
    final: [],
  };
  for (const m of matches) {
    switch (m.round) {
      case 'Group Stage': {
        const g = m.group_name || '?';
        if (!result.groupStage[g]) result.groupStage[g] = [];
        result.groupStage[g].push(m);
        break;
      }
      case 'Round of 32': result.roundOf32.push(m); break;
      case 'Round of 16': result.roundOf16.push(m); break;
      case 'Quarterfinal': result.quarterfinals.push(m); break;
      case 'Semifinal': result.semifinals.push(m); break;
      case '3rd Place': result.thirdPlace.push(m); break;
      case 'Final': result.final.push(m); break;
    }
  }
  _bracket = result;
  _bracketAt = now;
  return _bracket;
}

router.get('/matches', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json(getMatches());
});

router.get('/bracket', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json(getBracket());
});

router.get('/matches/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

export default router;
