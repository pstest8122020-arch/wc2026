import { config as loadEnv } from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { startJupiterOddsRefresh } from './services/jupiterPredict.js';
import { startEligibilityRefresh } from './services/eligibilityRefresh.js';
import { startPlayerIndexRefresh } from './services/playerIndex.js';
import { startNewsRefresh } from './services/news.js';

import predictionsRouter from './routes/predictions.js';
import matchesRouter from './routes/matches.js';
import leaderboardRouter from './routes/leaderboard.js';
import playerPicksRouter from './routes/playerPicks.js';
import adminRouter from './routes/admin.js';
import jupiterRouter from './routes/jupiter.js';
import playersRouter from './routes/players.js';
import newsRouter from './routes/news.js';
import authRouter from './routes/auth.js';
import bracketRouter from './routes/bracket.js';
import trackRouter from './routes/track.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind Fly's proxy — trust X-Forwarded-* so rate-limit keys on the real IP.
app.set('trust proxy', 1);

// --- Security middleware ---------------------------------------------------
// helmet: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, etc.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // Vite serves CSS that uses inline styles for fonts; keep 'unsafe-inline'
        // for now or move to nonces in a later pass.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        // 'blob:' lets the share modal preview the generated bracket PNG (object URL).
        imgSrc: ["'self'", 'data:', 'blob:', 'https://flagcdn.com'],
        // html-to-image fetches external images (flags) to inline as data URIs
        // when exporting "Download my bracket". Without flagcdn here the
        // browser blocks the fetch and the PNG export fails.
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://flagcdn.com'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Fly terminates TLS, so HSTS via the app is OK too
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  }),
);

// CORS: production = same-origin only (no cross-origin). Dev = open for vite proxy.
const corsOptions =
  process.env.NODE_ENV === 'production'
    ? { origin: false, credentials: false }
    : { origin: true, credentials: false };
app.use(cors(corsOptions));

app.use(express.json({ limit: '256kb' }));

// Global rate limit on writes (reads are cheap and proxied through cache).
// 30 writes / 5 min per IP — well above any honest user, blocks spam.
const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' },
});
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
    return writeLimiter(req, res, next);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api', matchesRouter);
app.use('/api', leaderboardRouter);
app.use('/api', predictionsRouter);
app.use('/api', playerPicksRouter);
app.use('/api', playersRouter);
app.use('/api', newsRouter);
app.use('/api/jupiter', jupiterRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api', bracketRouter);
app.use('/api', trackRouter);

if (process.env.NODE_ENV === 'production') {
  const clientDist = resolve(__dirname, '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        setHeaders: (res, filePath) => {
          // Share/preview assets (OG image, favicons, touch icon) exist to be
          // embedded by *other* origins — link-preview scrapers, social cards,
          // tools like opengraph.xyz, webview-based unfurlers. Helmet's global
          // CORP 'same-origin' makes a browser refuse those cross-origin embeds
          // (shows a broken image), so relax CORP to 'cross-origin' for these
          // specific public files only. The API + HTML keep 'same-origin'.
          if (/[/\\](og-image\.png|favicon[^/\\]*|apple-touch-icon[^/\\]*)$/i.test(filePath)) {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          }
          // Content-hashed Vite assets never change → cache forever (immutable).
          // Everything else (index.html, icons) must revalidate so new deploys
          // are picked up.
          if (/[/\\]assets[/\\]/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    // Express 5 / path-to-regexp 8 no longer accepts '*' — use a regex catch-all
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  } else {
    console.warn('[server] client/dist not found - run `npm run build` for production');
  }
}

app.use((err, req, res, _next) => {
  // Body-parser errors carry a status/type — surface them cleanly (oversized or
  // malformed JSON) instead of a generic 500.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  if (err && (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400)) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
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
  startJupiterOddsRefresh();
  startEligibilityRefresh();
  startPlayerIndexRefresh();
  startNewsRefresh();

  // Bind to all interfaces (Node default) so the Fly proxy can reach us.
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] listening on 0.0.0.0:${PORT}`);
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
