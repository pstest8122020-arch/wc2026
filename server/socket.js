import { Server } from 'socket.io';
import { computeLeaderboardCached, invalidateLeaderboard } from './services/scoring.js';
import { db } from './db.js';

let io = null;

export function attachSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : true,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true });
  });

  return io;
}

export function emitMatchUpdated(matchId) {
  if (!io) return;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (match) io.emit('match:updated', match);
}

let _lbBroadcastTimer = null;
export function emitLeaderboard() {
  if (!io) return;
  // Debounce: coalesce a burst of result changes (e.g. a sync updating many
  // matches) into a single recompute + broadcast, at most once per second.
  if (_lbBroadcastTimer) return;
  _lbBroadcastTimer = setTimeout(() => {
    _lbBroadcastTimer = null;
    invalidateLeaderboard();
    if (io) io.emit('leaderboard:update', computeLeaderboardCached());
  }, 1000);
}

export function emitPlayerPicksUnlocked(matchId) {
  if (!io) return;
  io.emit('player-picks:unlocked', { match_id: matchId });
}

export function getIo() {
  return io;
}
