import { config as loadEnv } from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename_env = fileURLToPath(import.meta.url);
// Load .env from the project root (one level above server/)
loadEnv({ path: resolve(dirname(__filename_env), '..', '.env') });

import { db, seedPlaceholderMatches } from './db.js';
import { attachSocket } from './socket.js';
import { startSync } from './services/sync.js';
import { seedMatchesFromApi } from './services/footballApi.js';

import predictionsRouter from './routes/predictions.js';
import matchesRouter from './routes/matches.js';
import leaderboardRouter from './routes/leaderboard.js';
import playerPicksRouter from './routes/playerPicks.js';
import adminRouter from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api', matchesRouter);
app.use('/api', leaderboardRouter);
app.use('/api', predictionsRouter);
app.use('/api', playerPicksRouter);
app.use('/api/admin', adminRouter);

if (process.env.NODE_ENV === 'production') {
  const clientDist = resolve(__dirname, '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Express 5 / path-to-regexp 8 no longer accepts '*' — use a regex catch-all
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  } else {
    console.warn('[server] client/dist not found - run `npm run build` for production');
  }
}

app.use((err, req, res, _next) => {
  console.error('[express] error:', err);
  res.status(500).json({ error: 'Internal error' });
});

const PORT = Number(process.env.PORT || 3001);
const httpServer = createServer(app);
attachSocket(httpServer);

async function bootstrap() {
  if (process.env.FOOTBALL_API_KEY) {
    try {
      await seedMatchesFromApi();
    } catch (e) {
      console.warn('[bootstrap] API seed failed, falling back to placeholders:', e.message);
      seedPlaceholderMatches();
    }
  } else {
    console.warn('[bootstrap] FOOTBALL_API_KEY not set; seeding 80 placeholder matches');
    seedPlaceholderMatches();
  }

  startSync();

  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((e) => {
  console.error('[server] bootstrap failed', e);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[server] shutting down');
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
});
