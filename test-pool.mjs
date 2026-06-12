// Local validation of the rate-aware RPC pool in server/services/wallet.js.
// Mocks global.fetch (the module calls the global at runtime) to simulate Jupiter
// REST + Solana RPC, and measures concurrency / pacing / early-exit. No network.
process.env.JUPITER_PREDICT_API_KEY = 'test';
process.env.SOLANA_RPC_URL = 'https://fake-helius.example/';
process.env.SOLANA_RPC_GAP_MS = '10'; // fast pacing so the concurrency cap binds
process.env.SOLANA_RPC_CONCURRENCY = '4';
process.env.SOLANA_SCAN_MAX_TX = '20';
process.env.SOLANA_MEMO_PAGES = '1';

const PREDICT = '3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp';

let mode = 'none'; // 'none' = no predict hit, 'hit5' = sig5 touches predict
let inFlight = 0;
let maxInFlight = 0;
let getTxCount = 0;
let startTimes = [];

function jsonRes(obj) {
  return {
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.jup.ag')) return jsonRes({ pagination: { total: 0 } });
  const body = opts && opts.body ? JSON.parse(opts.body) : {};

  const method = body.method;
  if (method === 'getSignaturesForAddress') {
    const arr = Array.from({ length: 20 }, (_, i) => ({ signature: 'sig' + i, memo: null }));
    return jsonRes({ jsonrpc: '2.0', id: 1, result: arr });
  }
  if (method === 'getTransaction') {
    const sig = body.params[0];
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    getTxCount++;
    startTimes.push(Date.now());
    await new Promise((r) => setTimeout(r, 100)); // simulated latency
    inFlight--;
    const touches = mode === 'hit5' && sig === 'sig5';
    const instructions = touches ? [{ programId: PREDICT }] : [];
    return jsonRes({
      jsonrpc: '2.0',
      id: 1,
      result: { transaction: { message: { instructions } }, meta: { innerInstructions: [] } },
    });
  }
  return jsonRes({ jsonrpc: '2.0', id: 1, result: null });
};

const { checkJupiterPredictEligibility } = await import('./server/services/wallet.js');

function reset() {
  inFlight = 0;
  maxInFlight = 0;
  getTxCount = 0;
  startTimes = [];
}

function minGap(times) {
  let m = Infinity;
  for (let i = 1; i < times.length; i++) m = Math.min(m, times[i] - times[i - 1]);
  return m === Infinity ? 0 : m;
}

// Scenario A — no predict activity → full scan, concurrency capped at 4, paced.
mode = 'none';
reset();
let t0 = Date.now();
let resA = await checkJupiterPredictEligibility('SoMeWaLLet1111111111111111111111111111111111');
console.log('A (ineligible):', JSON.stringify(resA));
console.log(
  `   getTx=${getTxCount} maxInFlight=${maxInFlight} minStartGap=${minGap(startTimes)}ms elapsed=${Date.now() - t0}ms`,
);
console.log(
  `   expect: eligible=false, getTx=20, maxInFlight<=4, minStartGap~>=50ms => ${
    resA.eligible === false && getTxCount === 20 && maxInFlight <= 4 ? 'PASS' : 'FAIL'
  }`,
);

// Scenario B — sig5 touches Predict → early exit, NOT all 20 fetched.
mode = 'hit5';
reset();
t0 = Date.now();
let resB = await checkJupiterPredictEligibility('SoMeWaLLet2222222222222222222222222222222222');
console.log('B (eligible via order):', JSON.stringify(resB));
console.log(`   getTx=${getTxCount} maxInFlight=${maxInFlight} elapsed=${Date.now() - t0}ms`);
console.log(
  `   expect: eligible=true via onchain, getTx<20 (early exit) => ${
    resB.eligible === true && resB.via === 'onchain' && getTxCount < 20 ? 'PASS' : 'FAIL'
  }`,
);
