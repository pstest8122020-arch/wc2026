import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/matches', (req, res) => {
  const matches = db
    .prepare(
      `SELECT id, api_id, round, group_name, match_num, home_team, away_team,
              home_goals, away_goals, status, kickoff_utc, pts_multiplier
         FROM matches
         ORDER BY match_num ASC`,
    )
    .all();
  res.json(matches);
});

router.get('/bracket', (req, res) => {
  const matches = db
    .prepare(
      `SELECT id, api_id, round, group_name, match_num, home_team, away_team,
              home_goals, away_goals, status, kickoff_utc, pts_multiplier
         FROM matches
         ORDER BY match_num ASC`,
    )
    .all();

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
      case 'Round of 32':
        result.roundOf32.push(m);
        break;
      case 'Round of 16':
        result.roundOf16.push(m);
        break;
      case 'Quarterfinal':
        result.quarterfinals.push(m);
        break;
      case 'Semifinal':
        result.semifinals.push(m);
        break;
      case '3rd Place':
        result.thirdPlace.push(m);
        break;
      case 'Final':
        result.final.push(m);
        break;
    }
  }

  res.json(result);
});

router.get('/matches/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

export default router;
