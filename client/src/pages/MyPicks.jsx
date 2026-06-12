import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, discordLoginUrl } from '../hooks/useAuth.js';
import BracketBuilder from '../components/BracketBuilder.jsx';
import TeamName from '../components/TeamName.jsx';
import ShareImageModal from '../components/ShareImageModal.jsx';
import ShareableMatchPick from '../components/ShareableMatchPick.jsx';

// "My Bracket" — the logged-in user's saved bracket, rendered read-only via the
// same BracketBuilder used to build it. Loads from the Discord session.
export default function MyPicks() {
  const auth = useAuth();
  const [bracket, setBracket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noBracket, setNoBracket] = useState(false);
  const [matchPicks, setMatchPicks] = useState(null);
  const [shareRow, setShareRow] = useState(null); // match-pick row being shared as an image

  useEffect(() => {
    if (!auth.loggedIn) return;
    setLoading(true);
    setError('');
    setNoBracket(false);
    setBracket(null);
    setMatchPicks(null);
    api
      .getMyBracket()
      .then((b) => setBracket(b))
      .catch((e) => {
        if (e.status === 404) setNoBracket(true);
        else setError(e.message || 'Could not load your bracket');
      })
      .finally(() => setLoading(false));
    // Independent — the user's per-match picks (score + players), shown below.
    api
      .myPlayerPicks()
      .then((rows) => setMatchPicks(Array.isArray(rows) ? rows : []))
      .catch(() => setMatchPicks([]));
  }, [auth.loggedIn]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud mb-6">
        {auth.handle
          ? `@${auth.handle}’s ${noBracket ? 'Match Picks' : 'Bracket'}`
          : noBracket
            ? 'My Match Picks'
            : 'My Bracket'}
      </h1>

      {auth.loading ? (
        <div className="text-steel">Loading…</div>
      ) : !auth.configured ? (
        <div className="bg-meteorite border border-charcoal rounded-xl p-6 text-cloud/80 text-sm max-w-md">
          Discord login isn’t configured in this environment.
        </div>
      ) : !auth.loggedIn ? (
        <div className="bg-meteorite border border-charcoal rounded-xl p-6 text-center space-y-3 max-w-md">
          <div className="text-sm text-cloud/80">Log in with Discord to see your bracket.</div>
          <a
            href={discordLoginUrl('/my-picks')}
            className="inline-flex items-center gap-2 text-sm font-display font-bold text-white bg-[#5865F2] hover:bg-[#4752c4] rounded px-4 py-2 transition"
          >
            Log in with Discord
          </a>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-steel mb-5">
            <span className="inline-block w-2 h-2 rounded-full bg-cosmic" />
            Logged in as <b className="text-cloud">@{auth.handle}</b>
          </div>

          {loading && <div className="text-steel">Loading your bracket…</div>}
          {error && (
            <div className="text-trifid bg-trifid/10 border border-trifid/30 rounded px-3 py-2 mb-4">{error}</div>
          )}

          {/* No bracket submitted → the page is just their match picks (no
              "build your bracket" dead-end; brackets lock at the first kickoff). */}
          {bracket && (
            <>
              <div className="mb-4 text-sm">
                {bracket.locked ? (
                  <span className="text-steel">Locked — the tournament has started.</span>
                ) : (
                  <Link to="/" className="text-nebula hover:text-helix underline">Edit your bracket →</Link>
                )}
              </div>
              <BracketBuilder readOnly initialBracket={bracket} />
            </>
          )}

          {/* Match picks below the bracket */}
          <div className="mt-8">
            <MyMatchPicks picks={matchPicks} onShare={setShareRow} />
          </div>

          {shareRow && (
            <ShareImageModal
              title="Share your match pick"
              chips={[
                `${shareRow.home_team} ${shareRow.pred_home != null ? `${shareRow.pred_home}–${shareRow.pred_away}` : ''} ${shareRow.away_team}`
                  .replace(/\s+/g, ' ')
                  .trim(),
              ]}
              filename={`wc2026-match-${shareRow.match_id}.png`}
              shareTitle="My World Cup 2026 match call"
              shareText={`My call: ${shareRow.home_team} ${shareRow.pred_home != null ? `${shareRow.pred_home}–${shareRow.pred_away}` : ''} ${shareRow.away_team} — Jupiter Community Predictor Challenge. Make your picks at jup26wc.com`}
              previewAspect="1080 / 680"
              card={<ShareableMatchPick match={shareRow} pick={shareRow} handle={auth.handle} />}
              onClose={() => setShareRow(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// The logged-in user's saved per-match picks (score + first scorer / assist / MOTM).
// Each row links back to that match so they can edit; the Share button raises the
// row to the parent's ShareImageModal. null = still loading.
function MyMatchPicks({ picks, onShare }) {
  if (picks === null) return null;
  if (picks.length === 0) {
    return (
      <div className="mb-8 bg-meteorite border border-charcoal rounded-xl px-5 py-4 text-sm text-cloud/70">
        You haven’t saved any match picks yet.{' '}
        <Link to="/picks" className="text-nebula hover:text-helix underline">
          Pick upcoming matches →
        </Link>
      </div>
    );
  }
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-cloud text-lg">Your match picks ({picks.length})</h2>
        <Link to="/picks" className="text-sm text-nebula hover:text-helix underline">Pick more →</Link>
      </div>
      <div className="space-y-2">
        {picks.map((p) => (
          <Link
            key={p.match_id}
            to={`/picks/${p.match_id}`}
            className="block bg-meteorite border border-charcoal hover:border-nebula rounded-lg px-3 py-2.5 transition"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 text-cloud">
                <span className="text-xs text-steel w-7 shrink-0">#{p.match_num}</span>
                <TeamName name={p.home_team} size={16} />
                <span className="font-display font-bold">
                  {p.pred_home != null ? `${p.pred_home}–${p.pred_away}` : '—'}
                </span>
                <TeamName name={p.away_team} size={16} />
              </div>
              <div className="text-xs text-cloud/70 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                {p.first_scorer && <span title="First scorer">⚽ {p.first_scorer}</span>}
                {p.assist_player && <span title="Assist">🅰️ {p.assist_player}</span>}
                {p.motm && <span title="Man of the Match">★ {p.motm}</span>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShare?.(p);
                  }}
                  className="shrink-0 inline-flex items-center bg-charcoal border border-cosmic/50 text-cosmic font-display font-bold text-[11px] px-2.5 py-1 rounded-lg hover:bg-cosmic/10 transition"
                >
                  Share ↗
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
