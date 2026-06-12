import { db } from '../db.js';
import { fetchCompetitionMatches, syncMatchRow } from './footballApi.js';
import {
  fetchEspnScoreboard,
  fetchGroupMap,
  syncEspnMatchRow,
  fetchEspnPlayerResults,
  applyEspnPlayerResults,
} from './espnApi.js';
import {
  recalculateMatchScorePredictions,
  recalculateMatchPlayerPicks,
} from './scoring.js';
import {
  emitLeaderboard,
  emitMatchUpdated,
  emitPlayerPicksUnlocked,
} from '../socket.js';

let timer = null;
let running = false;

// ---- PRIMARY: ESPN (fixtures + scores + goalscorers/assists) ----
async function runOnceEspn() {
  const { events, windows } = await fetchEspnScoreboard();
  const groupMap = await fetchGroupMap();

  let updated = 0;
  const finishedNow = [];

  for (const ev of events) {
    const result = syncEspnMatchRow(ev, windows, groupMap);
    if (result) {
      recalculateMatchScorePredictions(result.current.id);
      emitMatchUpdated(result.current.id);
      updated++;
      if (result.previous.status !== 'FINISHED' && result.current.status === 'FINISHED') {
        finishedNow.push(result.current.id);
      }
    }

    // Decide whether to pull player-level events (goals/assists) for this match.
    const row = db
      .prepare('SELECT id, status, manual_result FROM matches WHERE api_id = ?')
      .get(String(ev.id));
    if (!row || row.manual_result) continue;

    const justFinished =
      result && result.previous.status !== 'FINISHED' && result.current.status === 'FINISHED';
    let shouldFetch = false;
    if (row.status === 'LIVE') {
      shouldFetch = true; // refresh scorers while in play
    } else if (row.status === 'FINISHED') {
      const have = db.prepare('SELECT 1 FROM match_player_results WHERE match_id = ?').get(row.id);
      shouldFetch = justFinished || !have; // grab final scorers once
    }

    if (shouldFetch) {
      try {
        const pr = await fetchEspnPlayerResults(ev.id);
        if (pr.has_events && applyEspnPlayerResults(row.id, pr)) {
          recalculateMatchPlayerPicks(row.id);
          emitMatchUpdated(row.id);
          updated++;
        }
      } catch (e) {
        console.warn('[sync] player results failed for event', ev.id, '-', e.message);
      }
    }
  }

  if (updated > 0) {
    emitLeaderboard();
    for (const id of finishedNow) emitPlayerPicksUnlocked(id);
  }
  return updated;
}

// ---- FALLBACK: football-data.org (scores only; needs FOOTBALL_API_KEY) ----
async function runOnceFootballData() {
  const data = await fetchCompetitionMatches();
  const apiMatches = data.matches || [];

  let updated = 0;
  const finishedNow = [];
  for (const apiM of apiMatches) {
    const result = syncMatchRow(apiM);
    if (!result) continue;
    recalculateMatchScorePredictions(result.current.id);
    emitMatchUpdated(result.current.id);
    updated++;
    if (result.previous.status !== 'FINISHED' && result.current.status === 'FINISHED') {
      finishedNow.push(result.current.id);
    }
  }

  if (updated > 0) {
    emitLeaderboard();
    for (const id of finishedNow) emitPlayerPicksUnlocked(id);
  }
  return updated;
}

export async function runOnce() {
  if (running) return { skipped: true };
  running = true;
  try {
    let updated = 0;
    let source = 'espn';
    let message = '';

    try {
      updated = await runOnceEspn();
      message = `ESPN: updated ${updated}`;
    } catch (espnErr) {
      console.error('[sync] ESPN source failed:', espnErr.message);
      if (process.env.FOOTBALL_API_KEY) {
        source = 'football-data';
        updated = await runOnceFootballData();
        message = `ESPN failed (${espnErr.message}); football-data fallback updated ${updated}`;
      } else {
        message = `ESPN failed: ${espnErr.message}; no FOOTBALL_API_KEY for fallback`;
        db.prepare('INSERT INTO sync_log (ok, message) VALUES (0, ?)').run(message.slice(0, 500));
        return { updated: 0, error: message };
      }
    }

    db.prepare('INSERT INTO sync_log (ok, message) VALUES (1, ?)').run(message.slice(0, 500));
    return { updated, source, message };
  } catch (e) {
    const message = String(e.message || e).slice(0, 500);
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
  console.log(`[sync] starting background sync every ${intervalSec}s (ESPN primary)`);
  timer = setInterval(() => {
    runOnce().catch((e) => console.error('[sync] tick error', e));
  }, intervalSec * 1000);
  runOnce().catch((e) => console.error('[sync] initial run error', e));
}

export function stopSync() {
  if (timer) clearInterval(timer);
  timer = null;
}
