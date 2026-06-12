import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getIdentity, setIdentity } from '../lib/identity.js';
import TeamName from '../components/TeamName.jsx';
import ShareButton from '../components/ShareButton.jsx';

export default function Duel() {
  const { slug } = useParams();
  const [duel, setDuel] = useState(null);
  const [error, setError] = useState('');
  const id = getIdentity();
  const [discord, setDiscord] = useState(id?.discord || '');
  const [wallet, setWallet] = useState(id?.wallet || '');
  const [accepting, setAccepting] = useState(false);
  const [acceptErr, setAcceptErr] = useState('');

  function load() {
    api.getDuel(slug).then(setDuel).catch((e) => setError(e.message || 'Not found'));
  }
  useEffect(() => {
    setDuel(null);
    setError('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-steel">
        Duel not found.{' '}
        <Link to="/duels" className="text-nebula underline">
          Start your own →
        </Link>
      </div>
    );
  }
  if (!duel) return <div className="max-w-2xl mx-auto px-4 py-12 text-steel">Loading…</div>;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jup26wc.com';
  const duelUrl = `${origin}/d/${slug}`;
  const imageUrl = `/api/og/duel/${encodeURIComponent(slug)}`;
  const m = duel.match;

  async function accept(e) {
    e.preventDefault();
    setAcceptErr('');
    if (!discord.trim() || !wallet.trim()) return setAcceptErr('Handle + wallet are required.');
    setAccepting(true);
    try {
      await api.acceptDuel(slug, { discord: discord.trim(), wallet_address: wallet.trim() });
      setIdentity({ discord: discord.trim(), wallet: wallet.trim() });
      load();
    } catch (err) {
      setAcceptErr(err.message || 'Could not accept the duel');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-[10px] uppercase tracking-[0.2em] text-steel font-medium mb-2">Head-to-head duel</div>
      <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud mb-1">
        @{duel.challenger} <span className="text-steel">vs</span>{' '}
        {duel.opponent ? `@${duel.opponent}` : <span className="text-steel">?</span>}
      </h1>
      {m && (
        <div className="text-sm text-steel mb-4 flex items-center gap-1">
          <TeamName name={m.home_team} size={14} /> <span className="text-steel">vs</span>{' '}
          <TeamName name={m.away_team} size={14} />
        </div>
      )}

      <div className="bg-meteorite border border-charcoal rounded-xl p-4 mb-5">
        <img
          src={imageUrl}
          alt="WC 2026 duel card"
          width={1200}
          height={630}
          className="w-full rounded-lg border border-charcoal"
        />
        <div className="mt-3">
          <ShareButton
            url={duelUrl}
            title={`WC 2026 duel: @${duel.challenger} vs ${duel.opponent ? '@' + duel.opponent : '?'}`}
            text={
              duel.status === 'OPEN'
                ? 'I challenge you to a 1v1 World Cup 2026 prediction duel. Accept and prove you call it better:'
                : 'World Cup 2026 prediction duel:'
            }
            artifact="duel"
            handle={duel.challenger}
            imageUrl={imageUrl}
            downloadName={`wc2026-duel-${slug}.png`}
            label="Share duel"
          />
        </div>
      </div>

      {duel.status === 'RESOLVED' ? (
        <div className="bg-meteorite border border-charcoal rounded-xl p-4">
          <div className="font-display font-bold text-cloud mb-3">Result</div>
          <div className="flex items-center justify-around text-center gap-2">
            <Side handle={duel.challenger} pts={duel.challenger_pts} pick={duel.challenger_pick} win={duel.winner === duel.challenger} />
            <div className="text-steel font-display font-bold">vs</div>
            <Side handle={duel.opponent} pts={duel.opponent_pts} pick={duel.opponent_pick} win={duel.winner === duel.opponent} />
          </div>
          <div className="text-center mt-3 text-sm text-cloud/80">
            {duel.winner === 'draw' ? (
              'Draw.'
            ) : (
              <>
                Winner: <b className="text-cosmic">@{duel.winner}</b>
              </>
            )}
          </div>
        </div>
      ) : duel.status === 'ACCEPTED' ? (
        <div className="bg-nebula/10 border border-nebula/30 text-cloud rounded-xl px-4 py-3 text-sm">
          Both players are locked in. Predictions stay sealed until kickoff — the winner is decided when
          the match goes final.
        </div>
      ) : duel.can_accept ? (
        <form onSubmit={accept} className="bg-meteorite border border-charcoal rounded-xl p-4 space-y-3">
          <div className="font-display font-bold text-cloud">Accept the challenge</div>
          <p className="text-sm text-steel">
            You need a submitted bracket with a locked prediction for this match, and you must accept
            before kickoff.
          </p>
          <input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder="X handle or Discord username"
            className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud focus:border-nebula focus:outline-none"
          />
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Solana wallet (proves it's you)"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-charcoal border border-gunmetal rounded px-3 py-2 text-cloud font-mono text-sm focus:border-nebula focus:outline-none"
          />
          {acceptErr && <div className="text-sm text-trifid">{acceptErr}</div>}
          <button
            type="submit"
            disabled={accepting}
            className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded disabled:opacity-50"
          >
            {accepting ? 'Accepting…' : 'Accept duel'}
          </button>
        </form>
      ) : (
        <div className="bg-meteorite border border-charcoal rounded-xl px-4 py-3 text-sm text-steel">
          This challenge can no longer be accepted — the match has already kicked off.
        </div>
      )}
    </div>
  );
}

function Side({ handle, pts, pick, win }) {
  return (
    <div className="flex-1">
      <div className={`font-display font-bold ${win ? 'text-cosmic' : 'text-cloud'}`}>
        {handle ? `@${handle}` : '—'}
      </div>
      <div className={`text-2xl font-display font-black ${win ? 'text-cosmic' : 'text-cloud'}`}>{pts ?? 0}</div>
      {pick && (
        <div className="text-xs text-steel">
          picked {pick.pred_home}–{pick.pred_away}
        </div>
      )}
    </div>
  );
}
