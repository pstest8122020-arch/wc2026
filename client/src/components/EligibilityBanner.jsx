import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { api, jupGo } from '../lib/api.js';

const WC_FREEROLL_URL = 'https://jup.ag/prediction/world-cup';
const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Shown to a logged-in entrant whose submitted wallet has NO Jupiter Prediction
// activity (eligibility_status === 'ineligible'). The on-chain check now sees
// freeroll entries (free_parlay memo) and paid orders, so "ineligible" here means
// we genuinely found nothing — usually because the player entered the freeroll on a
// *different* wallet, or hasn't entered yet. Two fixes, no support ticket needed:
//   1. Point us at the right wallet (inline) — resets to pending + re-checks.
//   2. Enter the free World Cup Freeroll, then we re-check automatically.
// Renders nothing for eligible / pending / logged-out users, so it never nags
// anyone who's fine. Dismissible per session (re-appears on the next visit).
export default function EligibilityBanner() {
  const auth = useAuth();
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('eligibilityBannerDismissed') === '1',
  );

  // After a wallet swap we flip to "pending" locally; re-pull /me a few seconds
  // later so a now-eligible wallet makes the whole banner disappear on its own.
  useEffect(() => {
    if (!saved) return undefined;
    const t = setTimeout(() => auth.refresh(), 6000);
    return () => clearTimeout(t);
  }, [saved, auth.refresh]);

  // External trigger: a bracket/wallet submit elsewhere (e.g. the builder) fires
  // `eligibility:refresh`. The background re-check resolves in a few seconds, so we
  // re-pull /me a few times to catch it — this is how an ineligible wallet gets
  // flagged on the builder the moment you submit there. The component is always
  // mounted (it just renders null when you're fine), so the timers fire safely.
  useEffect(() => {
    const timers = [];
    const onRefresh = () => {
      auth.refresh();
      timers.push(setTimeout(() => auth.refresh(), 2500));
      timers.push(setTimeout(() => auth.refresh(), 6000));
      timers.push(setTimeout(() => auth.refresh(), 11000));
    };
    window.addEventListener('eligibility:refresh', onRefresh);
    return () => {
      window.removeEventListener('eligibility:refresh', onRefresh);
      timers.forEach(clearTimeout);
    };
  }, [auth.refresh]);

  // Impression: log once per session when the banner is actually shown to an
  // ineligible user, so we can measure reach. Deduped via sessionStorage so re-renders
  // and in-app navigation don't inflate it; the server allowlists the event and records
  // the logged-in handle, giving us distinct-users + total-shows.
  useEffect(() => {
    const visible =
      !auth.loading && auth.loggedIn && auth.eligibility_status === 'ineligible' && !dismissed;
    if (!visible) return;
    try {
      if (sessionStorage.getItem('eligibilityBannerShownLogged') === '1') return;
      sessionStorage.setItem('eligibilityBannerShownLogged', '1');
    } catch {
      /* ignore */
    }
    api.trackClick('eligibility_banner_shown');
  }, [auth.loading, auth.loggedIn, auth.eligibility_status, dismissed]);

  if (auth.loading || !auth.loggedIn) return null;
  if (auth.eligibility_status !== 'ineligible') return null;
  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem('eligibilityBannerDismissed', '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  async function save(e) {
    e.preventDefault();
    const w = wallet.trim();
    if (!SOLANA_ADDR.test(w)) {
      setErr('That does not look like a valid Solana wallet address.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await api.updateWallet(w);
      setSaved(true);
      auth.refresh(); // status -> pending, then the effect re-checks shortly after
    } catch (e2) {
      setErr(e2?.message || 'Could not update your wallet. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 pr-10">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 text-cloud/40 hover:text-cloud/80 transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-start gap-3">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-400 shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>

          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-cloud">Your wallet isn&apos;t eligible</div>

            {saved ? (
              <p className="text-sm text-cloud/80 leading-snug mt-1">
                Wallet updated — re-checking your Jupiter Prediction activity now. This usually
                takes a few seconds; you can keep using the site.
              </p>
            ) : (
              <>
                <p className="text-sm text-cloud/75 leading-snug mt-0.5">
                  We found <b className="text-cloud">no Jupiter Prediction Markets activity</b> on this
                  wallet, so your entry won&apos;t qualify for prizes. Fix it either way:
                </p>

                {/* Option 1 — point us at the wallet they actually used */}
                <form onSubmit={save} className="mt-3">
                  <label className="block text-xs text-cloud/70 mb-1">
                    Entered the freeroll on a <b className="text-cloud/90">different wallet</b>? Update it:
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      value={wallet}
                      onChange={(ev) => setWallet(ev.target.value)}
                      placeholder="Paste that Solana wallet…"
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      className="flex-1 min-w-0 bg-charcoal border border-gunmetal rounded-lg px-3 py-2 text-cloud font-mono text-xs focus:border-nebula focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="shrink-0 bg-nebula text-space font-display font-bold text-sm px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-60"
                    >
                      {busy ? 'Saving…' : 'Use this wallet'}
                    </button>
                  </div>
                  {err && <div className="text-xs text-rose-400 mt-1.5">{err}</div>}
                </form>

                {/* Option 2 — do the freeroll */}
                <div className="mt-3 text-sm text-cloud/75">
                  Haven&apos;t entered yet? Play the free{' '}
                  <a
                    href={WC_FREEROLL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-track-event="eligibility_freeroll"
                    className="text-cosmic hover:text-helix underline font-bold whitespace-nowrap"
                  >
                    World Cup Freeroll ↗
                  </a>{' '}
                  on Jupiter Predict — we&apos;ll re-check automatically.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
