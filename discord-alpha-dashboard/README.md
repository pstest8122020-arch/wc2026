# Jupiter · Alpha Channel Analytics

A standalone dashboard of **historic call volume** for the alpha channels in the Jupiter Discord
(`token-trading`, `stock-trading`, `yield-hunting`, `prediction-alpha`). Decoupled from the
WC2026 app — its own Node + SQLite + React stack.

## Dashboard

A channel selector (**All channels** + each alpha channel) drives **separate graphs per metric**:

- **Calls**, **Active callers**, **Messages**, **Posters** — each its own chart.
  - *All channels* view = one line per channel (compare them).
  - A single channel = bars for that channel.
- **Readers / views** — shown as `n/a`: per-channel viewer counts exist only in Discord Server
  Insights, which has no API and can't be scraped.

Plus a **Top callers** leaderboard (calls, messages, call rate), filtered to the selected channel.

## Metrics

Per channel, per day:

- **Calls** — a message that references a tradable thing or states a position: a `$cashtag`, an
  EVM/Solana contract, a dex/market link (jup.ag, polymarket, dexscreener, …), a message that
  *starts* with a trade action (long/short/buy/sell/entry/…), a stance ("I'm long X", "longed at
  658"), or a price level ("TP at 700"). Loose mid-sentence keywords are deliberately **not**
  counted, so "what did you buy today?" is chatter, not a call.
- **Active callers** — distinct people who posted ≥1 call that day.
- **Messages / posters** — all posts and all distinct authors (the denominator).

**Caller identity** is keyed on the Discord **user id** (read from the author's avatar URL), then
each user is collapsed to one canonical display name — so the same person under different display
names (e.g. "Buddy [DUDU]" / "巴迪 [DUDU]", ".ArjayRay [CATS]" / ".ArjayRay | Jupiter [CATS]") is
counted once, not split. Users with a default avatar (no id in the DOM) fall back to display name.

## How the data was collected

The numbers come from a **UI-scroll scrape** of the logged-in Discord web client (no bot, no API
token): a script scrolls each channel to the top, dedupes messages by ID, classifies each as a
call or not, and aggregates per day. So counts reflect **only what your account can see**, and the
classifier is a heuristic — treat call counts as a strong proxy, not an audited ledger.

Raw per-channel aggregates live in [`server/data/raw/*.json`](server/data/raw).

## Run

```bash
npm install
npm run dev          # ingest -> SQLite, then API (:8787) + Vite client (:5174)
```

Open http://localhost:5174.

- `npm run ingest` — reload `server/data/raw/*.json` into SQLite (idempotent).
- API: `/api/overview`, `/api/series`, `/api/callers?channel=<id>`.

## Refresh the data

Re-run the scraper in your browser on each channel, drop the new JSON into `server/data/raw/`,
then `npm run ingest`. The scraper script is documented in the project notes.
