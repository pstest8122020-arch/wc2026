// Solana wallet validation + Jupiter Predict eligibility check.
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
  // leading zero bytes (base58 '1's)
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

// Jupiter Predict eligibility.
//
// To keep this self-contained and free, we hit the public Solana RPC and look
// for any signed transaction that touched the Jupiter Predict program. Any
// wallet that has *at least one* signature interacting with Predict is
// considered eligible.
//
// Configure via JUPITER_PREDICT_PROGRAM (program ID) and SOLANA_RPC_URL.
// If JUPITER_PREDICT_PROGRAM is empty, eligibility is skipped (dev mode).

export async function checkJupiterPredictEligibility(wallet) {
  const programId = process.env.JUPITER_PREDICT_PROGRAM;
  if (!programId) {
    return { eligible: true, skipped: true, reason: 'JUPITER_PREDICT_PROGRAM not set; eligibility check disabled' };
  }
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  try {
    // First check: signatures for the wallet's address, filter to txns that
    // involve the Predict program. The cheaper alternative is checking the
    // wallet's recent tx list and looking up each for program calls — but for
    // a free RPC this is a reasonable shortcut.
    const sigs = await rpcCall(rpc, 'getSignaturesForAddress', [
      wallet,
      { limit: 1000 },
    ]);

    if (!Array.isArray(sigs) || sigs.length === 0) {
      return { eligible: false, reason: 'No on-chain activity found for this wallet' };
    }

    // We sample up to 25 most-recent transactions for performance. If the
    // wallet is a heavy user, Predict txns will almost certainly be in this
    // window; if not, you can raise the limit.
    const SAMPLE = sigs.slice(0, 25);
    for (const s of SAMPLE) {
      const tx = await rpcCall(rpc, 'getTransaction', [
        s.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ]);
      const accounts = tx?.transaction?.message?.accountKeys || [];
      const programs = accounts.map((a) => (typeof a === 'string' ? a : a.pubkey));
      if (programs.includes(programId)) {
        return { eligible: true, signature: s.signature };
      }
    }

    return {
      eligible: false,
      reason: 'No Jupiter Predict interaction found in the wallet\'s recent 25 transactions',
    };
  } catch (e) {
    // Don't lock people out because of an RPC blip — log and let them through.
    console.warn('[wallet] eligibility check failed, allowing through:', e.message);
    return { eligible: true, skipped: true, reason: `RPC error: ${e.message}` };
  }
}

async function rpcCall(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result;
}
