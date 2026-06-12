# Daily refresh runbook — Jupiter Community Vitals

Refreshes the dashboard's data and redeploys to **https://jupvitals.fly.dev**.

As of the ClickHouse migration the **daily refresh is fully headless** — it reads
the live Discord message archive from ClickHouse and needs **no browser, no Chrome,
no Discord login**. Only the slow-changing Insights-only metrics (readers, visitors,
voice, audience) and the jupcallers.fun success rates still come from the browser,
and only occasionally.

- Repo: `/Users/ag/bracket/discord-alpha-dashboard`
- Guild id: `897540204506775583`
- ClickHouse creds: `ops/.ch-auth` (gitignored/dockerignored; `user:pass`, HTTP basic auth)
- Deploy: `"$HOME/.fly/bin/fly" deploy --remote-only --ha=false` (from repo root)

## Data model (hybrid)
| File | Source | Refreshed by |
|---|---|---|
| `server/data/insights-base.json` | Discord Server Insights snapshot — **frozen** history + all Insights-only metrics (readers, visitors, voice, audience, KPIs, top-read/active channels) | §2 browser re-scrape (occasional) |
| `server/data/server-insights.json` | **derived** = base history + **live ClickHouse** for every day after the snapshot | §1a `ch-refresh.mjs` (daily, headless) |
| `server/data/raw/<channel>.json` | alpha channels = frozen browser history + **live ClickHouse** after each file's last day | §1b `ch-alpha-refresh.mjs` (daily, headless) |
| `server/data/prediction-callers.json` | jupcallers.fun success rates | §3 browser (occasional) |
| `server/data/reddit-insights.json` | r/jupiterexchange mod insights | §4 Control_Chrome (manual) |

`ch-refresh.mjs` / `ch-alpha-refresh.mjs` are **idempotent**: they always rebuild
from the frozen base + a fresh ClickHouse query, so re-running never double-counts.
ClickHouse only matches Insights from the snapshot's last day on (earlier days were
undercounted during ingest spin-up), so they splice exactly at that boundary; the
two track within ~1% on overlapping days. **Full UTC days only** — today's partial
day is always dropped (UTC is the oracle), so the latest bar is the last complete
UTC day (≈ "yesterday" in UTC).

---

## 1. Daily headless refresh (ClickHouse) — THE AUTO-RUN
```bash
cd /Users/ag/bracket/discord-alpha-dashboard
node server/ch-refresh.mjs         # 1a: server-wide messages (daily / weekly / monthly / mpc)
node server/ch-alpha-refresh.mjs   # 1b: alpha channels (daily msgs / calls / callers)
npm run ingest                     # optional locally — the container also ingests at startup
"$HOME/.fly/bin/fly" deploy --remote-only --ha=false
```
- `ch-refresh.mjs` prints the appended days; `ch-alpha-refresh.mjs` prints per-channel
  history boundary + live days added. Sanity-check the last day ≈ yesterday (UTC) and
  counts are plausible (server-wide ~800–1500/day).
- Run any time after ~00:15 UTC (so the previous UTC day is fully ingested — message
  ingest lags ~10 min).
- If `ch-*.mjs` fails (ClickHouse unreachable / auth), DO NOT deploy — notify and stop.

## 2. Occasional Insights re-scrape (browser) → `insights-base.json`
Run weekly, or when readers/visitors/voice/audience look stale, OR to extend the
frozen history. Requires Chrome logged into Discord as a Jupiter admin
(`Claude_in_Chrome` MCP). Backgrounded Discord tabs throttle `setTimeout`, so use a
MessageChannel yield for ALL page waits:
```js
const y=()=>new Promise(r=>{const m=new MessageChannel();m.port1.onmessage=()=>r();m.port2.postMessage(0);});
```
On `…/analytics/engagement?interval=1&start=<~5wk ago>&end=<today>`:
- **Daily messages + mpc** — pull the messages chart `rawData` from React fiber (walk
  `__reactFiber$…` up each `<svg>` to `memoizedProps.rawData` where rows have
  `messages` + `messages_per_communicator`). → `dailyEngagement.series` (last ~30 days,
  `{date,messages,mpc}`, `mpc = round(messages_per_communicator,1)`).
- **Weekly / monthly** — `interval=2` wide range → weekly `messages` rawData; aggregate
  the full `interval=1` daily pull by month → `messageSeries.weekly/monthly` (Discord
  retains ~120 days → ~17 weekly bars; mark partial months).
- **Per-channel readers + messages** — scroll the "text channels" table, sweep ALL
  pages (MessageChannel waits) → `channelReaders.perChannel` (4 alpha channels),
  `topReadChannels` (top 12 by readers), `topActiveChannels` (top 12 by messages).
- **KPIs** — read latest-week Visitors/Communicators/Messages/Voice + Growth page
  New-members/New-communicators/Retention into `kpis[]` (best-effort).
- Write all of the above into **`insights-base.json`** (NOT server-insights.json), set
  its `captured`, validate JSON.
- **Then re-derive:** `node server/ch-refresh.mjs` (rebuilds server-insights.json from
  the new base + ClickHouse), then deploy.

## 3. Prediction-alpha success rates (browser) → `prediction-callers.json`
Success rate is only measurable for prediction-alpha and its source of truth is
**jupcallers.fun** (NOT the ClickHouse scrape). Navigate to `https://jupcallers.fun/`,
wait for `table tbody tr`, extract Ranked + Rising rows into `prediction-callers.json`
(`{source,url,channel:"prediction-alpha",fetched,window:"all-time",minSample:10,note,
callers:[{rank,name,tier,picks,wins,losses,open,graded,successPct,pnlPct,scored}]}`).
Then deploy. (Can run daily if attended; it changes slowly.)

## 4. Verify + notify
```bash
curl -s https://jupvitals.fly.dev/api/insights | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=JSON.parse(d);console.log('captured',i.captured,'| daily last',i.dailyEngagement.series.at(-1).date,'=',i.dailyEngagement.series.at(-1).messages)})"
curl -s https://jupvitals.fly.dev/api/overview | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('generatedAt',o.generatedAt,'| calls',o.totals.calls)})"
```
Send ONE `PushNotification`: e.g. `"jupvitals refreshed (ClickHouse) — messages through <day>, deployed"` or `"jupvitals refresh FAILED at <step>: <reason>"`.

## 5. Reddit tab (MANUAL — Control_Chrome, not part of the auto-run)
`Claude_in_Chrome` hard-blocks reddit.com. Refresh manually with **`Control_Chrome`**
(needs Chrome → View → Developer → "Allow JavaScript from Apple Events" ON). The tab is
on the **Past 7 days** (weekly) window. READ-ONLY — never click mod controls.

1. A freshly `open_url`'d reddit tab often comes back with `id: null` (untargetable).
   Instead navigate an EXISTING targetable tab by id:
   `execute_javascript(tab_id, "location.assign('https://www.reddit.com/mod/jupiterexchange/insights')")`,
   then restore that tab's original URL when done. Wait ~15s (heavy SPA).
2. **Set the window to weekly** — the period control is a native `<select>` with options
   `Past 24 Hours / Past 7 Days / Past 30 Days / Past 12 Months`. Select "Past 7 Days"
   via the native value setter + dispatch `input`+`change` (bubbles), then wait ~6s for refetch:
   ```js
   const sel=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>/Past 7 Days/.test(o.text)));
   const i=[...sel.options].findIndex(o=>/Past 7 Days/.test(o.text));
   Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sel,sel.options[i].value);
   sel.selectedIndex=i; sel.dispatchEvent(new Event('input',{bubbles:true})); sel.dispatchEvent(new Event('change',{bubbles:true}));
   ```
   Confirm via `document.body.innerText` containing "from the previous 7 days" / "In the past 7 days".
3. Parse from `innerText`: Overview (views, avg daily uniques + weekly visitors, members +
   joined/left, posts + removed, comments + removed) and the Most-viewed / Most-engaging
   lists (title, author, age, metric). **Delta signs** are NOT in innerText — read each
   metric's `svg[icon-name="arrow-up"]` (→ "+N") or `arrow-down` (→ "-N"). Sanity-check:
   members Δ = joined − left.
4. Write `server/data/reddit-insights.json` (shape: source, url, subreddit, `window:"Past 7 days"`,
   captured=<today>, created, note, kpis[], topViewed[], topEngaging[]). Labels in the UI
   are data-driven off `window`. Then `fly deploy`.
