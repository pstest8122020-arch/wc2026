import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getIdentity, setIdentity } from '../lib/identity.js';
import ShareButton from '../components/ShareButton.jsx';

export default function Duels() {
  const id = getIdentity();
  const [discord, setDiscord] = useState(id?.discord || '');
  const [wallet, setWallet] = useState(id?.wallet || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [matchId, setMatchId] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  async function load(e) {
    e?.preventDefault();
    setError('');
    setData(null);
    setCreated(null);
    if (!discord.trim() || !wallet.trim()) {
      return setError('Handle + wallet are required to load your upcoming matches.');
    }
    try {
      const r = await api.participant(discord.trim(), wallet.trim());
      if (!r.is_owner) {
        setError('That wallet does not match this handle — we can only load your matches with your own wallet.');
        return;
      }
      setData(r);
      setIdentity({ discord: discord.trim(), wallet: wallet.trim() });
    } catch (err) {
      setError(err.message || 'Not found');
    }
  }

  useEffect(() => {
    if (id?.discord && id?.wallet) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upcoming = useMemo(
    () =>
      (data?.score_predictions || []).filter(
        (p) => p.status === 'SCHEDULED' && p.home_team !== 'TBD' && p.away_team !== 'TBD',
      ),
    [data],
  );

  async function create() {
    setCreating(true);
    setError('');
    try {
      const r = await api.createDuel({
        discord: discord.trim(),
        wallet_address: wallet.trim(),
        match_id: Number(matchId),
      });
      setCreated(r);
    } catch (err) {
      setError(err.message || 'Could not create the duel');
    } finally {
      setCreating(false);
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jup26wc.com';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud mb-1">Duels</h1>
      <p className="text-sm text-steel mb-5">
        Challenge anyone to a 1v1 prediction duel on a single match. Winner gets a “W” and a shareable
        result card — no payout, just bragging rights.
      </p>

      <form onSubmit={load} className="bg-meteorite border border-charcoal rounded-xl p-4 space-y-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder="X handle or Discord username"
            className="flex-1 min-w-[12rem] bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
          />
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Solana wallet"
            spellCheck={false}
            autoComplete="off"
            className="flex-[2] min-w-[14rem] bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud font-mono text-sm focus:border-nebula focus:outline-none"
          />
          <button type="submit" className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded">
            Load matches
          </button>
        </div>
        {error && <div className="text-sm text-trifid">{error}</div>}
      </form>

      {data && !created && (
        <div className="bg-meteorite border border-charcoal rounded-xl p-4 space-y-3">
          <div className="font-display font-bold text-cloud">Pick a match to challenge on</div>
          {upcoming.length === 0 ? (
            <div className="text-sm text-steel">
              No upcoming matches with locked predictions.{' '}
              <Link to="/submit" className="text-nebula underline">
                Submit a bracket
              </Link>{' '}
              first.
            </div>
          ) : (
            <>
              <select
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
              >
                <option value="">Select a match…</option>
                {upcoming.map((p) => (
                  <option key={p.match_id} value={p.match_id}>
                    #{p.match_num} · {p.home_team} vs {p.away_team} (your pick {p.pred_home}–{p.pred_away})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!matchId || creating}
                onClick={create}
                className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create challenge'}
              </button>
            </>
          )}
        </div>
      )}

      {created && (
        <div className="bg-meteorite border border-charcoal rounded-xl p-4 space-y-3">
          <div className="font-display font-bold text-cloud">Challenge created</div>
          <p className="text-sm text-steel">
            Share this link. The first eligible person to accept (before kickoff) becomes your opponent.
          </p>
          <div className="bg-charcoal border border-gunmetal rounded px-3 py-2 text-sm text-cloud break-all">
            {origin}/d/{created.invite_slug}
          </div>
          <div className="flex gap-3 flex-wrap">
            <ShareButton
              url={`${origin}/d/${created.invite_slug}`}
              title="WC 2026 prediction duel"
              text="I challenge you to a 1v1 World Cup 2026 prediction duel. Think you call it better?"
              artifact="duel"
              handle={discord.trim()}
              imageUrl={`/api/og/duel/${created.invite_slug}`}
              downloadName={`wc2026-duel-${created.invite_slug}.png`}
              label="Share challenge"
            />
            <Link
              to={`/d/${created.invite_slug}`}
              className="bg-meteorite border border-charcoal text-cloud font-display font-bold px-4 py-2 rounded"
            >
              Open duel page →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
