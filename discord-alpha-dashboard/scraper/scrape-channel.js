/*
 * Discord alpha-channel scraper (UI-scroll, no bot / no API token).
 *
 * HOW TO USE
 *   1. Open the Discord WEB app and navigate to the channel you want.
 *   2. DevTools console (Cmd+Opt+J) → paste this whole file → Enter. It auto-starts.
 *   3. Poll progress:        __SCRAPE.state()        (until done:true / reachedTop:true)
 *   4. Build the export:     __SCRAPE.export('token-trading')   // real channel name
 *      copy it:             copy(__OUT)
 *   5. Save into            server/data/raw/<channel>.json
 *   6. Re-ingest:           npm run ingest
 *
 * IDENTITY: callers are keyed on the Discord user id read from the author's avatar URL
 *   (global  cdn.../avatars/<uid>/...  and per-server  cdn.../guilds/<g>/users/<uid>/avatars/...).
 *   Users with a default avatar have no id in the DOM, so they fall back to "name:<display name>".
 *   ingest.js then collapses each user id to one canonical display name.
 *
 * CALL = a message that references a specific market/asset: a $cashtag, an EVM/Solana contract,
 *   a dex/market link (jup.ag, polymarket, dexscreener, …), OR a message that *starts* with a
 *   trade action (long/short/buy/sell/entry/…). Loose mid-sentence keywords are intentionally
 *   NOT counted (so "what did you buy today?" is chatter, not a call). Tune the regexes below.
 */
window.__SCRAPE = (function () {
  const channelId = location.pathname.split('/').pop();
  const byId = new Map();
  let state = { running: false, done: false, iters: 0, sameCount: 0, reachedTop: false, error: null, oldestTs: null };

  const LINK = /(jup\.ag|polymarket\.com|kalshi\.com|dexscreener\.com|birdeye\.so|pump\.fun|photon|axiom\.trade|geckoterminal|tradingview\.com|raydium|meteora|drift\.trade)/i;
  const CASH = /\$[A-Za-z]{2,15}\b/, EVM = /\b0x[a-fA-F0-9]{40}\b/, SOL = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
  const ACTION = /^\s*(longs?|shorts?|buy(ing|s)?|sell(ing|s)?|ap(e|ed|ing)|entr(y|ies)|scalp\w*|swing\w*|bid\w*|accumulat\w*)\b/i;
  const classify = (t) => !!t && (LINK.test(t) || CASH.test(t) || EVM.test(t) || SOL.test(t) || ACTION.test(t));

  function scroller() {
    const ol = document.querySelector('ol[data-list-id="chat-messages"]');
    let el = ol;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return ol ? ol.parentElement : null;
  }
  function uidFromLi(li) {
    const av = li.querySelector('img[class^="avatar_"]'); // author avatar only (not reply avatars)
    if (!av) return null;
    const s = av.getAttribute('src') || '';
    const m = s.match(/\/users\/(\d+)\//) || s.match(/\/avatars\/(\d+)\//);
    return m ? m[1] : null;
  }
  function grab() {
    const lis = [...document.querySelectorAll('li[id^="chat-messages-"]')];
    let lastAuthor = null, lastUid = null, lastBot = false;
    for (const li of lis) {
      const mm = li.id.match(/(\d+)$/); if (!mm) continue;
      const mid = mm[1];
      const uEl = li.querySelector('[id^="message-username-"]');
      let author, uid, bot;
      if (uEl) {
        author = uEl.textContent.replace(/,?\s*Server Tag:.*$/i, '').replace(/\s+/g, ' ').trim();
        uid = uidFromLi(li) || ('name:' + author);
        bot = !!li.querySelector('[class*="botTag"],[class*="botText"]');
        lastAuthor = author; lastUid = uid; lastBot = bot;
      } else { author = lastAuthor; uid = lastUid; bot = lastBot; }
      const t = li.querySelector('time[datetime]');
      const ts = t ? t.getAttribute('datetime') : null;
      const content = li.querySelector('[id^="message-content-"]')?.textContent || '';
      if (!byId.has(mid)) byId.set(mid, { uid: uid || ('name:' + (author || '?')), author: author || '(unknown)', ts, bot, call: classify(content) });
      else { const e = byId.get(mid); if (uid && !uid.startsWith('name:') && (!e.uid || e.uid.startsWith('name:'))) { e.uid = uid; e.author = author; } }
    }
  }
  const oldestId = () => { const l = document.querySelectorAll('li[id^="chat-messages-"]'); if (!l.length) return null; const m = l[0].id.match(/(\d+)$/); return m ? m[1] : null; };
  const oldestTs = () => document.querySelector('li[id^="chat-messages-"]')?.querySelector('time[datetime]')?.getAttribute('datetime') || null;
  const atStart = () => { const ol = document.querySelector('ol[data-list-id="chat-messages"]'); return ol ? /this is the (start|beginning) of|welcome to #/i.test(ol.textContent.slice(0, 600)) : false; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run(maxIters = 340) {
    if (state.running) return;
    state.running = true; state.done = false; state.reachedTop = false; state.sameCount = 0; state.iters = 0;
    try {
      let sc = scroller(); let tries = 0;
      while (!sc && tries < 25) { await sleep(400); sc = scroller(); tries++; }
      if (!sc) { state.error = 'no scroller'; return; }
      sc.scrollTop = sc.scrollHeight; await sleep(1200); grab();                 // newest first
      for (let i = 0; i < maxIters; i++) {
        const before = oldestId();
        sc = scroller(); sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(1200); grab(); state.iters = i + 1; state.oldestTs = oldestTs();
        if (i >= 2 && atStart()) { state.reachedTop = true; break; }
        let after = oldestId();
        if (after === before) {
          await sleep(1600); grab(); after = oldestId();
          if (after === before) state.sameCount++; else state.sameCount = 0;
          if (state.sameCount >= 4) { state.reachedTop = true; break; }
        } else state.sameCount = 0;
      }
      sc = scroller(); sc.scrollTop = sc.scrollHeight; await sleep(1400); grab(); // re-capture newest avatars
    } catch (e) { state.error = String(e); } finally { state.running = false; state.done = true; }
  }

  function aggregate() {
    const daily = {}, callers = {};
    for (const m of byId.values()) {
      if (!m.ts) continue;
      const day = m.ts.slice(0, 10), id = m.uid;
      const d = daily[day] || (daily[day] = { msgs: 0, calls: 0, cs: {}, ps: {} });
      d.msgs++; if (m.call) d.calls++; d.ps[id] = 1; if (m.call) d.cs[id] = 1;
      const c = callers[id] || (callers[id] = { name: m.author, msgs: 0, calls: 0, bot: m.bot });
      c.msgs++; if (m.call) c.calls++; if (m.author && m.author !== '(unknown)') c.name = m.author;
    }
    const dailyOut = {};
    for (const [day, d] of Object.entries(daily)) dailyOut[day] = [d.msgs, d.calls, Object.keys(d.ps).length, Object.keys(d.cs).length];
    const callerArr = Object.entries(callers).map(([uid, c]) => [c.name, c.msgs, c.calls, c.bot ? 1 : 0, uid]).sort((a, b) => b[2] - a[2] || b[1] - a[1]);
    const all = [...byId.values()].map((m) => m.ts).filter(Boolean).sort();
    return { channelId, total: byId.size, daily: dailyOut, callers: callerArr, range: { start: all[0] || null, end: all[all.length - 1] || null } };
  }
  function exportTo(name) { const a = aggregate(); window.__OUT = JSON.stringify({ channel: name, ...a }); return window.__OUT.length; }

  return { run, grab, aggregate, export: exportTo, state: () => state, size: () => byId.size };
})();
window.__SCRAPE.run();
console.log('[scrape] started on', location.pathname.split('/').pop(), '— poll __SCRAPE.state()');
