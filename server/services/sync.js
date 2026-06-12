import { db } from '../db.js';
import { fetchCompetitionMatches, syncMatchRow } from './footballApi.js';
import { recalculateMatchScorePredictions } from './scoring.js';
import { recalculateAllBracketPoints } from './bracketScoring.js';
import { applyEspnOverlay } from './espnScores.js';
import {
  emitLeaderboard,
  emitMatchUpdated,
  emitPlayerPicksUnlocked,
} from '../socket.js';

let timer = null;
let running = false;

export async function runOnce() {
  if (running) return { skipped: true };
  running = true;
  let updatedCount = 0;
  let message = '';
  let ok = true;
  try {
    if (!process.env.FOOTBALL_API_KEY) {
      message = 'FOOTBALL_API_KEY not set; skipping';
    } else {
      try {
        const data = await fetchCompetitionMatches();
        const apiMatches = data.matches || [];

        const finishedNow = [];
        for (const apiM of apiMatches) {
          const result = syncMatchRow(apiM);
          if (!result) continue;
          const { previous, current } = result;
          recalculateMatchScorePredictions(current.id);
          emitMatchUpdated(current.id);
          updatedCount++;
          if (previous.status !== 'FINISHED' && current.status === 'FINISHED') {
            finishedNow.push(current.id);
          }
        }

        if (updatedCount > 0) {
          recalculateAllBracketPoints(); // bracket points depend on the global outcome
          emitLeaderboard();
          for (const id of finishedNow) emitPlayerPicksUnlocked(id);
        }
        message = `Updated ${updatedCount} matches`;
      } catch (e) {
        ok = false;
        message = String(e.message || e).slice(0, 400);
        console.error('[sync] failed:', message);
      }
    }

    // ESPN overlay runs AFTER football-data (fresher data wins ties) and
    // independently of it — either source failing must not silence the other.
    try {
      message += ` · ${await applyEspnOverlay()}`;
    } catch (e) {
      message += ` · espn failed: ${String(e.message || e).slice(0, 120)}`;
      console.error('[sync] espn overlay failed:', e.message);
    }

    db.prepare('INSERT INTO sync_log (ok, message) VALUES (?, ?)').run(ok ? 1 : 0, message);
    return ok ? { updated: updatedCount, message } : { updated: updatedCount, error: message };
  } finally {
    running = false;
  }
}

export function startSync() {
  const intervalSec = Number(process.env.SYNC_INTERVAL_SECONDS || 60);
  if (timer) clearInterval(timer);
  console.log(`[sync] starting background sync every ${intervalSec}s`);
  timer = setInterval(() => {
    runOnce().catch((e) => console.error('[sync] tick error', e));
  }, intervalSec * 1000);
  runOnce().catch((e) => console.error('[sync] initial run error', e));
}

export function stopSync() {
  if (timer) clearInterval(timer);
  timer = null;
}
