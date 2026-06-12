import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getIdentity } from '../lib/identity.js';
import TeamName from '../components/TeamName.jsx';
import ShareButton from '../components/ShareButton.jsx';

function fmtDate(s) {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function markOf(p) {
  if (p.status !== 'FINISHED' || p.home_goals == null || p.away_goals == null) return null;
  if (p.pred_home === p.home_goals && p.pred_away === p.away_goals) return 'exact';
  if (Math.sign(p.pred_home - p.pred_away) === Math.sign(p.home_goals - p.away_goals)) return 'correct';
  return 'wrong';
}

export default function Profile() {
  const { handle } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [moments, setMoments] = useState([]);

  useEffect(() => {
    setData(null);
    setError('');
    setMoments([]);
    const id = getIdentity();
    const wallet = id && id.discord === handle ? id.wallet : undefined;
    api.participant(handle, wallet).then(setData).catch((e) => setError(e.message || 'Not found'));
    api.moments(handle).then(setMoments).catch(() => setMoments([]));
  }, [handle]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-cloud/80 mb-4">
          No bracket found for <b className="text-cloud">@{handle}</b>.
        </div>
        <Link
          to="/submit"
          className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded inline-block"
        >
          Make your own predictions →
        </Link>
      </div>
    );
  }
  if (!data) return <div className="max-w-2xl mx-auto px-4 py-12 text-steel">Loading…</div>;

  const picksLocked = data.picks_locked || 0;
  const t = data.totals || {};
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jup26wc.com';
  const profileUrl = `${origin}/u/${encodeURIComponent(handle)}`;
  const imageUrl = `/api/og/rank/${encodeURIComponent(handle)}?v=${t.rank ?? 0}-${t.total ?? 0}`;
  const preds = data.score_predictions || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-[10px] uppercase tracking-[0.2em] text-steel font-medium mb-2">
        World Cup 2026 bracket
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-black text-cloud mb-1 break-all">@{handle}</h1>
      <div className="text-sm text-steel mb-3">
        {picksLocked} {picksLocked === 1 ? 'pick' : 'picks'} locked
        {fmtDate(data.submitted_at) ? ` · ${fmtDate(data.submitted_at)}` : ''}
      </div>
      <p className="text-sm text-cloud/70 mb-5 max-w-xl">
        Public profile for <b className="text-cloud">@{handle}</b>. The rank card below is a ready-to-post
        image — download it, copy it, or share it on social.
      </p>
      {data.forked_from && (
        <div className="text-sm text-steel mb-4 -mt-2">
          Based on{' '}
          <Link to={`/u/${encodeURIComponent(data.forked_from)}`} className="text-nebula hover:text-helix">
            @{data.forked_from}
          </Link>
          's bracket
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center text-sm mb-5">
        <Stat label="Picks locked" value={picksLocked} />
        <Stat label="Points" value={t.total ?? 0} accent />
        <Stat label="Rank" value={t.rank ? `#${t.rank}` : '—'} />
      </div>

      <div className="bg-meteorite border border-charcoal rounded-xl p-4 mb-6">
        <img
          src={imageUrl}
          alt={`@${handle} World Cup 2026 rank card`}
          width={1200}
          height={630}
          className="w-full rounded-lg border border-charcoal"
        />
        <div className="text-xs text-steel mt-2">
          On the card: rank, points, exact hits and percentile — updates live as results come in.
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <ShareButton
            url={profileUrl}
            title={`@${handle} · WC 2026 leaderboard`}
            text={`@${handle} on the World Cup 2026 Predictor leaderboard. Think you can beat them?`}
            artifact="rank"
            handle={handle}
            imageUrl={imageUrl}
            downloadName={`wc2026-rank-${handle}.png`}
            label="Get shareable image"
          />
          <Link to="/submit" className="text-nebula hover:text-helix underline text-sm">
            Make your own predictions →
          </Link>
        </div>
      </div>

      {moments.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display font-bold text-cloud mb-3">Moments</h2>
          <div className="space-y-2">
            {moments.map((mo) => {
              const label =
                mo.kind === 'exact'
                  ? 'Called it exactly'
                  : mo.kind === 'upset'
                    ? 'Called the upset'
                    : mo.detail || 'On a streak';
              return (
                <div
                  key={mo.id}
                  className="flex flex-wrap items-center justify-between gap-3 bg-meteorite border border-charcoal rounded-lg px-3 py-2"
                >
                  <div className="text-sm text-cloud/90 min-w-0">
                    <span className="text-cosmic font-bold">{label}</span>{' '}
                    <span className="text-steel">·</span> {mo.home_team} {mo.home_goals}–{mo.away_goals}{' '}
                    {mo.away_team}
                  </div>
                  <ShareButton
                    url={`${origin}/m/${mo.id}`}
                    title="I called it — WC 2026"
                    text={`${label}: ${mo.home_team} ${mo.home_goals}–${mo.away_goals} ${mo.away_team}. World Cup 2026 Predictor.`}
                    artifact="moment"
                    handle={handle}
                    imageUrl={`/api/og/moment/${mo.id}`}
                    downloadName={`wc2026-moment-${mo.id}.png`}
                    label="Share"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {preds.length > 0 ? (
        <div>
          <h2 className="font-display font-bold text-cloud mb-3">Predictions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {preds.map((p) => {
              const mk = markOf(p);
              const border =
                mk === 'exact'
                  ? 'border-trifid'
                  : mk === 'correct'
                    ? 'border-cosmic'
                    : mk === 'wrong'
                      ? 'border-charcoal opacity-70'
                      : 'border-charcoal';
              return (
                <div
                  key={p.match_id}
                  className={`flex items-center justify-between bg-meteorite border ${border} rounded-lg px-3 py-2 text-sm`}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <TeamName name={p.home_team} size={14} />
                    <span className="text-cloud font-display font-bold mx-1">
                      {p.pred_home}–{p.pred_away}
                    </span>
                    <TeamName name={p.away_team} size={14} />
                  </div>
                  {mk && (
                    <span
                      className={`text-xs font-bold whitespace-nowrap ${
                        mk === 'exact' ? 'text-trifid' : mk === 'correct' ? 'text-cosmic' : 'text-steel'
                      }`}
                    >
                      {mk === 'wrong' ? '✗' : mk === 'exact' ? '✓ exact' : '✓'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-nebula/10 border border-nebula/30 text-nebula rounded-xl px-4 py-3 text-sm">
          Picks are hidden until the tournament kicks off — this keeps late entrants from copying. The
          count and card above are public; full scorelines reveal at Match #1.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-nebula bg-nebula/10' : 'border-charcoal bg-meteorite'}`}>
      <div className="text-xs text-steel">{label}</div>
      <div className={`font-display font-bold ${accent ? 'text-helix' : 'text-cloud'}`}>{value}</div>
    </div>
  );
}
