import { db } from '../db.js';
import { fetchCompetitionMatches, syncMatchRow } from './footballApi.js';
import { recalculateMatchScorePredictions } from './scoring.js';
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
  try {
    if (!process.env.FOOTBALL_API_KEY) {
      message = 'FOOTBALL_API_KEY not set; skipping';
      db.prepare("INSERT INTO sync_log (ok, message) VALUES (1, ?)").run(message);
      return { updated: 0, message };
    }

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
      emitLeaderboard();
      for (const id of finishedNow) emitPlayerPicksUnlocked(id);
    }

    message = `Updated ${updatedCount} matches`;
    db.prepare('INSERT INTO sync_log (ok, message) VALUES (1, ?)').run(message);
    return { updated: updatedCount, message };
  } catch (e) {
    message = String(e.message || e).slice(0, 500);
    db.prepare('INSERT INTO sync_log (ok, message) VALUES (0, ?)').run(message);
    console.error('[sync] failed:', message);
    return { updated: 0, error: message };
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
