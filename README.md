# WC 2026 Score Predictor

A full-stack web app for a World Cup 2026 community prediction contest. 50 participants, $2,000 prize pool, real-time bracket + leaderboard.

## Stack
- **Frontend**: React 18 (Vite), React Router v6, TailwindCSS
- **Backend**: Node.js 20, Express 5, better-sqlite3
- **Real-time**: Socket.io
- **Football data**: [football-data.org](https://www.football-data.org/) (free tier)
- **DB**: SQLite (single file)

## Setup

```bash
# 1. Install deps for both workspaces
npm install

# 2. Configure environment
cp .env.example .env
# edit .env and set FOOTBALL_API_KEY and a long random ADMIN_TOKEN

# 3. Dev mode (server + client in parallel)
npm run dev
# server:  http://localhost:3001
# client:  http://localhost:5173  (proxies /api and /socket.io)

# 4. Production
npm run build         # builds client/dist
npm start             # serves API + client from PORT (default 3001)
```

## Environment variables

| Var | Description |
|---|---|
| `FOOTBALL_API_KEY` | football-data.org API key (free tier) |
| `ADMIN_TOKEN` | long random string for admin routes |
| `PORT` | server port (default 3001) |
| `FOOTBALL_COMPETITION_CODE` | default `WC` (FIFA World Cup) |
| `DB_PATH` | optional override (default `server/data/wc2026.db`) |
| `SYNC_INTERVAL_SECONDS` | default 60 |

If `FOOTBALL_API_KEY` is missing, the server seeds 80 placeholder matches so you can develop the UI without API access.

## Pages

| Route | Page |
|---|---|
| `/` | Landing |
| `/submit` | Upfront bracket submission (9-step wizard) |
| `/bracket` | Live visual bracket |
| `/leaderboard` | Live leaderboard with prize column |
| `/my-picks` | Personal score & picks lookup by Discord username |
| `/picks` / `/picks/:matchId` | Per-match player picks (first scorer / assist / MOTM) |
| `/admin` | Admin dashboard (token-gated) |

## Scoring (all server-side in `server/services/scoring.js`)

- **Score predictions**: 3 pts exact · 1 pt correct result · doubled from R16 onward
- **First scorer**: 6 pts exact · 2 pts any scorer
- **Assist**: 4 pts · **MOTM**: 4 pts
- **Awards**: Golden Boot (25), Top Assister (20), Golden Glove (15), Best Young (15), Player of Tournament (20)
- **Prizes**: 1st $500 · 2nd $250 · 3rd $150 · 4–10 $50 · 11–25 $25 · 26–50 $15

## Admin
1. Visit `/admin`, enter `ADMIN_TOKEN`.
2. Run sync, override match results, post player-level results, set award winners.
3. All overrides trigger immediate score recalculation + Socket.io broadcast.

## Notes
- One submission per Discord username (enforced at DB + app level)
- Submissions auto-close once Match 1 leaves `SCHEDULED`
- Per-match player picks lock 15 minutes before kickoff
- Other people's player picks are hidden until the match `FINISHED`
- The football-data.org `WC` competition returns **104 matches** for WC 2026 (12 groups × 6 + 32 knockouts), not the 80 mentioned in the original spec — the UI is fully dynamic and handles whatever the API returns.
- Admin match overrides set `manual_result=1` so the background sync won't revert them. `POST /api/admin/matches/:id/unlock` clears the flag if you want the API to take over again.
