// Solana wallet validation + Jupiter Prediction eligibility check.
//
// We don't pull in @solana/web3.js (heavy), so we implement a minimal base58
// decoder and check that the decoded length is exactly 32 bytes.

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58].map((c, i) => [c, i]));

export function decodeBase58(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  let bytes = [0];
  for (const ch of s) {
    const v = BASE58_INDEX.get(ch);
    if (v === undefined) return null;
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch === '1') bytes.push(0);
    else break;
  }
  return Uint8Array.from(bytes.reverse());
}

export function isValidSolanaPubkey(addr) {
  if (typeof addr !== 'string') return false;
  if (addr.length < 32 || addr.length > 44) return false;
  const bytes = decodeBase58(addr);
  return bytes !== null && bytes.length === 32;
}

// --- Eligibility -------------------------------------------------------------
//
// We ask Jupiter's own Prediction API for the wallet's full activity history
// (one call). If it has any history, the wallet has used Jupiter Prediction and
// is eligible — this catches traders who have since closed everything out (no
// current positions/orders), which a positions/orders-only check would wrongly
// flag as ineligible. All calls go through a shared rate-limited queue (below).
//
// Configure via JUPITER_PREDICT_API_KEY. When the key is missing, the check is
// skipped (dev mode) and { eligible: true } is returned with skipped=true.

const BASE_URL = 'https://api.jup.ag/prediction/v1';
const REQ_TIMEOUT_MS = 8_000;

// --- Rate-limited request queue ----------------------------------------------
// Jupiter's key is rate-limited (it returns 429 + Retry-After). EVERY Jupiter
// call from this process — the eligibility gate on submit AND the recheck cron —
// funnels through one serialized, paced queue, so a launch spike can never blow
// the budget. On 429 we honour Retry-After and retry a few times. A call that
// can't get through within a deadline rejects, and the caller treats that as
// "allow through as pending" (the cron reconciles later) rather than make a user
// wait forever. One call per eligibility check keeps throughput as high as the
// budget allows.
const MIN_GAP_MS = 1100; // ~0.9 req/s, just under budget
const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 10_000;
const QUEUE_DEADLINE_MS = 12_000; // stop waiting (queue + retries) after this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let queueTail = Promise.resolve();
let lastCallAt = 0;

async function rawFetchJup(path, key) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      signal: ac.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Jupiter API ${res.status}: ${body.slice(0, 160)}`);
      err.status = res.status;
      err.retryAfter = Number(res.headers.get('retry-after')) || 0;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Serialized + paced + 429-aware. Resolves with parsed JSON or throws.
function fetchJup(path, key) {
  const enqueuedAt = Date.now();
  const overDeadline = () => Date.now() - enqueuedAt > QUEUE_DEADLINE_MS;
  const run = queueTail.then(async () => {
    if (overDeadline()) throw new Error('eligibility queue timeout');
    for (let attempt = 0; ; attempt++) {
      const gap = MIN_GAP_MS - (Date.now() - lastCallAt);
      if (gap > 0) await sleep(gap);
      lastCallAt = Date.now();
      try {
        return await rawFetchJup(path, key);
      } catch (e) {
        if (e.status === 429 && attempt < MAX_RETRIES && !overDeadline()) {
          await sleep(Math.min((e.retryAfter || 2) * 1000, MAX_RETRY_WAIT_MS));
          continue;
        }
        throw e;
      }
    }
  });
  // Keep the chain alive whatever this call does.
  queueTail = run.then(
    () => {},
    () => {},
  );
  return run;
}

// --- On-chain fallback: Jupiter Prediction program interaction ---------------
//
// Jupiter's REST /history only returns orders the API attributes to the wallet as
// `ownerPubkey`. Predictions placed through the freeroll / ALPHAQ market-maker
// router (often relayer co-signed) are REAL on-chain activity but are NOT returned
// by /history — so a freeroll-only player looks ineligible to the REST check. As a
// fallback, when REST shows nothing we scan the wallet's recent transactions for
// any interaction with Jupiter Prediction's on-chain programs, catching the
// freeroll funnel the REST API is blind to. Verified June 2026 against live
// wallets: eligible direct-traders and freeroll players both invoke 3ZZuTbwC…;
// freeroll orders additionally route through ALPHAQ… .
//
// RPC: defaults to public endpoints (rate-limited — mitigated by pacing + retry +
// rotation, and the cron re-runs every 30 min so transient blips self-heal). Set
// SOLANA_RPC_URL to a dedicated endpoint (Helius/Triton/QuickNode) for reliability.

const JUP_PREDICT_PROGRAMS = new Set([
  '3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp', // Jupiter Predict orders (CreateOrder/CloseOrder)
  'ALPHAQmeA7bjrVuccPsYPiCvsi428SNwte66Srvs4pHA', // Jupiter Predict market-maker router (Route/CreateOrder)
]);

const CUSTOM_RPC = (process.env.SOLANA_RPC_URL || '').trim();
const HAS_CUSTOM_RPC = !!CUSTOM_RPC;

function rpcEndpoints() {
  // A dedicated endpoint (e.g. Helius) is reliable + rate-limit-friendly, so use
  // it EXCLUSIVELY — mixing in the flaky public nodes would only reintroduce 429s.
  // Public endpoints are the fallback only when no dedicated URL is configured.
  if (HAS_CUSTOM_RPC) return [CUSTOM_RPC];
  return ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
}

// Auto-tuned by RPC tier: with a dedicated endpoint (Helius) we scan fast + deep;
// on public RPC we stay gentle to dodge 429 storms (a failed call just leaves the
// wallet `pending` for the next cron tick). Every value stays env-overridable
// (SOLANA_RPC_GAP_MS / _RETRIES / _SCAN_MAX_TX / _TIMEOUT_MS).
const RPC_GAP_MS = Number(process.env.SOLANA_RPC_GAP_MS) || (HAS_CUSTOM_RPC ? 120 : 1000);
const RPC_TIMEOUT_MS = Number(process.env.SOLANA_RPC_TIMEOUT_MS) || 10_000;
const RPC_MAX_RETRIES = Number(process.env.SOLANA_RPC_RETRIES) || (HAS_CUSTOM_RPC ? 3 : 2);
const ONCHAIN_SCAN_MAX_TX = Number(process.env.SOLANA_SCAN_MAX_TX) || (HAS_CUSTOM_RPC ? 100 : 40);
// Pages of 1000 signatures to scan for the freeroll `free_parlay` memo (cheap — the
// memo rides in the signature list, no getTransaction). 3 pages = up to 3000 deep.
const FREEROLL_MEMO_PAGES = Number(process.env.SOLANA_MEMO_PAGES) || 3;
// How many RPC calls may be in flight at once. NOTE: measured against the live
// Helius FREE tier, concurrency is COUNTERPRODUCTIVE — it soft-throttles parallel
// requests (each call slows under load), so an 8-wide pool ran the cron SLOWER than
// the old serial chain (~7.2min vs ~4.8min for the ineligible tail). So default low
// (2). The pool's pacing + 429-cooldown are still wins over the old serial chain even
// at low concurrency; bump SOLANA_RPC_CONCURRENCY on a paid tier that rewards
// parallelism (sustained throughput is still capped by RPC_GAP_MS regardless).
const RPC_CONCURRENCY = Math.max(1, Number(process.env.SOLANA_RPC_CONCURRENCY) || 2);
// On a 429 we shove the shared pacing clock forward so EVERY in-flight + queued call
// backs off together — not just the one that happened to get limited.
const RPC_429_COOLDOWN_MS = Number(process.env.SOLANA_RPC_429_COOLDOWN_MS) || 2000;

let rpcRotation = 0;

// --- Rate-aware concurrency pool ---------------------------------------------
// Up to RPC_CONCURRENCY calls run at once, but every call reserves a paced START
// slot (rpcNextSlot advances by RPC_GAP_MS per reservation), so concurrent callers
// are staggered and sustained throughput stays under the provider budget. Permits
// are handed straight from a finishing call to the next waiter (FIFO), so the count
// of in-flight calls never exceeds the cap.
let rpcActive = 0;
const rpcWaiters = [];
let rpcNextSlot = 0;

function acquireRpcSlot() {
  if (rpcActive < RPC_CONCURRENCY) {
    rpcActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => rpcWaiters.push(resolve));
}
function releaseRpcSlot() {
  const next = rpcWaiters.shift();
  if (next) next(); // hand the permit straight on; in-flight count unchanged
  else rpcActive--;
}
// Reserve the next paced start slot (token-bucket style). Atomic read-modify-write
// (no await between), so concurrent callers each get a distinct slot RPC_GAP_MS apart.
async function pacedStart() {
  const now = Date.now();
  const slot = Math.max(now, rpcNextSlot);
  rpcNextSlot = slot + RPC_GAP_MS;
  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}

async function rawRpc(endpoint, method, params) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const e = new Error(`RPC ${method} HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }
    const j = await res.json();
    if (j.error) {
      const e = new Error(`RPC ${method} ${j.error.code}: ${String(j.error.message).slice(0, 80)}`);
      e.status = j.error.code === 429 ? 429 : 0;
      throw e;
    }
    return j.result;
  } finally {
    clearTimeout(timer);
  }
}

// Bounded concurrency + paced starts + endpoint rotation + retry with a 429-aware
// global cooldown. All on-chain calls process-wide funnel through this pool so a
// burst (the cron) shares one paced budget instead of hammering an endpoint.
async function rpc(method, params) {
  await acquireRpcSlot();
  try {
    const endpoints = rpcEndpoints();
    let lastErr;
    for (let attempt = 0; attempt <= RPC_MAX_RETRIES; attempt++) {
      await pacedStart();
      const endpoint = endpoints[rpcRotation++ % endpoints.length];
      try {
        return await rawRpc(endpoint, method, params);
      } catch (e) {
        lastErr = e;
        if (e.status === 429) {
          // Slow the whole pool, not just this call.
          rpcNextSlot = Math.max(rpcNextSlot, Date.now() + RPC_429_COOLDOWN_MS);
        }
        // Short, bounded back-off (longer on 429) — never sleep after the last attempt.
        if (attempt < RPC_MAX_RETRIES) {
          const base = e.status === 429 ? 800 : 400;
          await sleep(base * (attempt + 1) + Math.floor(Math.random() * 250));
        }
      }
    }
    throw lastErr || new Error(`RPC ${method} failed`);
  } finally {
    releaseRpcSlot();
  }
}

function txTouchesPredict(tx) {
  if (!tx) return false;
  const msg = tx.transaction?.message;
  for (const ins of msg?.instructions || []) {
    if (ins.programId && JUP_PREDICT_PROGRAMS.has(ins.programId)) return true;
  }
  for (const inner of tx.meta?.innerInstructions || []) {
    for (const ins of inner.instructions || []) {
      if (ins.programId && JUP_PREDICT_PROGRAMS.has(ins.programId)) return true;
    }
  }
  return false;
}

// Detect Jupiter Prediction participation on-chain, two ways:
//   (a) FREEROLL — entry is a Memo-program tx tagged `free_parlay:v1:<hash>`. That
//       memo rides along in getSignaturesForAddress results, so we detect it
//       straight off the signature list — NO getTransaction — and can page deep
//       cheaply so a wallet that kept trading after entering still counts. (This is
//       what most freeroll-only players have; the old order-only scan missed them.)
//   (b) PAID Predict orders — invoke the 3ZZuTbwC / ALPHAQ programs; caught by
//       scanning recent transactions.
// Returns { found:true, via } | { found:false, scanned } | { error }. RPC failures
// surface as { error } so the caller treats them as "unknown / pending", never a
// false "ineligible".
async function checkOnChainPredictionInteraction(wallet) {
  const sigs = [];
  let before = null;
  try {
    for (let page = 0; page < FREEROLL_MEMO_PAGES; page++) {
      const params = before ? [wallet, { limit: 1000, before }] : [wallet, { limit: 1000 }];
      const res = await rpc('getSignaturesForAddress', params);
      const batch = Array.isArray(res) ? res : [];
      for (const s of batch) {
        if (s && typeof s.memo === 'string' && s.memo.includes('free_parlay')) {
          return { found: true, via: 'freeroll' };
        }
      }
      for (const s of batch) if (s && s.signature) sigs.push(s.signature);
      if (batch.length < 1000) break;
      before = batch[batch.length - 1].signature;
    }
  } catch (e) {
    return { error: `signatures: ${e.message}` };
  }
  if (sigs.length === 0) return { found: false, scanned: 0 };

  // Fan the order scan out across the RPC pool in chunks, exiting the moment any tx
  // touches a Predict program. (Freeroll players are already caught by the cheap
  // memo pass above; this is the paid-order / ALPHAQ-router fallback.)
  const candidates = sigs.slice(0, ONCHAIN_SCAN_MAX_TX);
  let scanned = 0;
  let fetchErrors = 0;
  for (let i = 0; i < candidates.length; i += RPC_CONCURRENCY) {
    const chunk = candidates.slice(i, i + RPC_CONCURRENCY);
    const txs = await Promise.all(
      chunk.map((sig) =>
        rpc('getTransaction', [
          sig,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]).then(
          (tx) => tx || null,
          () => null,
        ),
      ),
    );
    let hit = false;
    for (const tx of txs) {
      if (!tx) {
        fetchErrors++;
        continue;
      }
      scanned++;
      if (txTouchesPredict(tx)) {
        hit = true;
        break;
      }
    }
    if (hit) return { found: true, via: 'order' };
  }
  // Got signatures but couldn't fetch a single transaction → infra failure, not a
  // clean negative.
  if (scanned === 0) return { error: `all ${fetchErrors} transaction fetches failed` };
  return { found: false, scanned };
}

export async function checkJupiterPredictEligibility(wallet) {
  const key = process.env.JUPITER_PREDICT_API_KEY;
  if (!key) {
    return {
      eligible: true,
      skipped: true,
      reason: 'JUPITER_PREDICT_API_KEY not set; eligibility check disabled',
    };
  }

  // 1) Primary: Jupiter REST history (fast, one call). Catches everyone who placed
  //    orders directly — `pagination.total > 0` => has used Jupiter Predict.
  let restCount = null; // number, or null when the REST call itself failed
  try {
    const history = await fetchJup(`/history?ownerPubkey=${encodeURIComponent(wallet)}`, key);
    restCount =
      typeof history?.pagination?.total === 'number'
        ? history.pagination.total
        : Array.isArray(history?.data)
          ? history.data.length
          : 0;
    if (restCount > 0) return { eligible: true, via: 'rest', history: restCount };
  } catch (e) {
    console.warn('[wallet] REST history check unavailable:', e.message);
  }

  // 2) Fallback: on-chain. The REST API does NOT attribute freeroll / ALPHAQ
  //    router-placed predictions to the wallet, so a freeroll-only player shows 0
  //    history above. Confirm by scanning recent txns for a prediction-program touch.
  const oc = await checkOnChainPredictionInteraction(wallet);
  if (oc.found) {
    const detail = oc.via === 'freeroll' ? 'freeroll entry (free_parlay)' : 'Predict order';
    return {
      eligible: true,
      via: 'onchain',
      reason: `Jupiter Prediction activity found on-chain (${detail}).`,
    };
  }
  if (oc.error) {
    // Couldn't confirm on-chain — don't lock anyone out on infra failure.
    return {
      eligible: true,
      skipped: true,
      reason: `Eligibility check unavailable (on-chain: ${oc.error}). Will re-check.`,
    };
  }
  if (restCount === null) {
    // REST failed AND on-chain found nothing — we can't be sure REST would be 0.
    // Stay pending and let the cron retry rather than assert ineligible.
    return {
      eligible: true,
      skipped: true,
      reason: 'REST history unavailable; no on-chain activity found yet — will re-check.',
    };
  }
  // Both signals are a clean negative → genuinely no Jupiter Prediction activity.
  return {
    eligible: false,
    history: 0,
    reason:
      'No Jupiter Prediction activity found for this wallet. Enter the free World Cup Freeroll at https://jup.ag/prediction/world-cup, then we’ll re-check automatically.',
  };
}
