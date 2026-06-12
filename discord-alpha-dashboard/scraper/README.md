# Scraper

`scrape-channel.js` is a browser-console scraper for one Discord channel (UI-scroll, no
bot/token). It scrolls the channel to the start, dedupes messages by ID, classifies each as a
call, and aggregates per day + per caller.

## Steps

1. Open the Discord **web** app, navigate to the alpha channel.
2. DevTools console → paste `scrape-channel.js` → Enter. It auto-starts.
3. Poll `__SCRAPE.state()` until `done: true` (`reachedTop: true` = hit channel start).
4. `__SCRAPE.export('<channel-name>')` then `copy(__OUT)`.
5. Save into `../server/data/raw/<channel-name>.json`.
6. `npm run ingest` from the project root.

## Notes

- Coverage = what your logged-in account can see; high-volume channels take longer to page back.
- "Call" classification is a heuristic (tickers, contracts, trade keywords, dex/market links).
  Adjust the regexes at the top of the script for your channel's conventions.
- The four channels currently in `server/data/raw/` (token-trading, stock-trading, yield-hunting,
  prediction-alpha) were captured this way, full history back to each channel's creation (28 Apr 2026).
