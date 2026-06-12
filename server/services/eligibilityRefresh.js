// Background cron that re-runs the Jupiter Prediction eligibility check for
// every participant currently marked `ineligible` or `pending`. Users who
// submit before they've made a Predict trade (or whose check was a transient
// API blip) get auto-promoted to `eligible` without admin intervention.

import { db } from '../db.js';
import { checkJupiterPredictEligibility } from './wallet.js';

const INTERVAL_MS = 30 * 60 * 1000; // 30 min
// Each wallet check is now a single Jupiter call, funnelled through the shared
// rate-limited queue in wallet.js (which paces + retries on 429). The extra
// wallet-to-wallet gap here is a gentle cushion for this background job.
const PER_WALLET_GAP_MS = Number(process.env.ELIGIBILITY_WALLET_GAP_MS) || 1200;
const INITIAL_DELAY_MS = 60_000; // wait 1 min after boot before first run
// Hard wall-clock cap on a single run. An on-chain scan on public RPC can be
// slow; without this cap one run could exceed the 30-min interval and overlap
// the next tick. We process as many as we can (pending first) and roll the rest
// to the next tick.
const RUN_BUDGET_MS = Number(process.env.ELIGIBILITY_RUN_BUDGET_MS) || 8 * 60 * 1000;

let timer = null;
let initialTimer = null;
let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Single-wallet re-check, fired (fire-and-forget) right after a wallet is
// submitted/changed, so eligibility resolves in seconds — with a dedicated RPC —
// rather than waiting up to 30 min for the next cron tick. Non-blocking and never
// throws; the periodic cron remains the backstop.
export async function recheckOne(discord, walletAddress) {
  if (!process.env.JUPITER_PREDICT_API_KEY || !discord || !walletAddress) return;
  try {
    const result = await checkJupiterPredictEligibility(walletAddress);
    const status = result.skipped ? 'pending' : result.eligible ? 'eligible' : 'ineligible';
    db.prepare(
      `UPDATE participants
         SET eligibility_status = ?, eligibility_reason = ?, eligibility_checked_at = datetime('now')
         WHERE discord = ?`,
    ).run(status, result.reason || null, discord);
    console.log(`[eligibility] immediate re-check ${discord} -> ${status}`);
  } catch (e) {
    console.warn(`[eligibility] immediate re-check failed for ${discord}:`, e.message);
  }
}

function pendingParticipants() {
  return db
    .prepare(
      `SELECT discord, wallet_address
         FROM participants
         WHERE eligibility_status IN ('ineligible', 'pending')
           AND wallet_address IS NOT NULL
         ORDER BY CASE eligibility_status WHEN 'pending' THEN 0 ELSE 1 END,
                  submitted_at ASC`,
    )
    .all();
}

export async function refreshOnce() {
  if (running) {
    console.log('[eligibility-cron] previous run still in progress, skipping');
    return { skipped: true };
  }
  running = true;
  const t0 = Date.now();
  const rows = pendingParticipants();
  if (rows.length === 0) {
    running = false;
    return { checked: 0, promoted: 0 };
  }

  let promoted = 0;
  let stillIneligible = 0;
  let errored = 0;
  const update = db.prepare(
    `UPDATE participants
       SET eligibility_status = ?, eligibility_reason = ?, eligibility_checked_at = datetime('now')
       WHERE discord = ?`,
  );

  let processed = 0;
  let deferred = 0;
  for (const [i, r] of rows.entries()) {
    if (Date.now() - t0 > RUN_BUDGET_MS) {
      deferred = rows.length - i;
      console.log(
        `[eligibility-cron] run budget reached (${RUN_BUDGET_MS}ms); deferring ${deferred} wallet(s) to next tick`,
      );
      break;
    }
    try {
      const result = await checkJupiterPredictEligibility(r.wallet_address);
      const newStatus = result.skipped
        ? 'pending'
        : result.eligible
          ? 'eligible'
          : 'ineligible';
      update.run(newStatus, result.reason || null, r.discord);
      processed++;
      if (newStatus === 'eligible') promoted++;
      else if (newStatus === 'ineligible') stillIneligible++;
    } catch (e) {
      errored++;
      console.warn(`[eligibility-cron] check failed for ${r.discord}:`, e.message);
    }
    // Don't sleep after the last one
    if (i < rows.length - 1) await sleep(PER_WALLET_GAP_MS);
  }

  const ms = Date.now() - t0;
  console.log(
    `[eligibility-cron] checked=${processed}/${rows.length} promoted=${promoted} stillIneligible=${stillIneligible} errored=${errored} deferred=${deferred} in ${ms}ms`,
  );
  running = false;
  return { checked: rows.length, promoted, stillIneligible, errored, ms };
}

export function startEligibilityRefresh() {
  if (!process.env.JUPITER_PREDICT_API_KEY) {
    console.log('[eligibility-cron] JUPITER_PREDICT_API_KEY not set; cron disabled');
    return;
  }
  stopEligibilityRefresh();
  initialTimer = setTimeout(() => {
    refreshOnce().catch((e) => console.warn('[eligibility-cron] initial run threw:', e.message));
  }, INITIAL_DELAY_MS);
  timer = setInterval(() => {
    refreshOnce().catch((e) => console.warn('[eligibility-cron] tick threw:', e.message));
  }, INTERVAL_MS);
  console.log(
    `[eligibility-cron] scheduled every ${INTERVAL_MS / 60000}min (first run in ${INITIAL_DELAY_MS / 1000}s)`,
  );
}

export function stopEligibilityRefresh() {
  if (timer) clearInterval(timer);
  if (initialTimer) clearTimeout(initialTimer);
  timer = null;
  initialTimer = null;
}
