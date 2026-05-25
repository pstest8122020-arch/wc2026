import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import PlayerPickForm from '../components/PlayerPickForm.jsx';
import { formatKickoff } from '../lib/scoring.js';

const LOCK_MS = 15 * 60 * 1000;

export default function MatchPicks() {
  const { matchId } = useParams();
  const [matches, setMatches] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.matches().then(setMatches).catch((e) => setError(e.message));
  }, []);

  const match = useMemo(() => {
    if (!matches || !matchId) return null;
    return matches.find((m) => m.id === Number(matchId)) || null;
  }, [matches, matchId]);

  const upcoming = useMemo(() => {
    if (!matches) return [];
    return matches
      .filter((m) => m.status === 'SCHEDULED' && m.home_team !== 'TBD' && m.away_team !== 'TBD')
      .sort((a, b) => (a.kickoff_utc || '').localeCompare(b.kickoff_utc || ''))
      .slice(0, 20);
  }, [matches]);

  if (error) return <div className="max-w-2xl mx-auto p-6 text-trifid">{error}</div>;
  if (!matches) return <div className="max-w-2xl mx-auto p-6 text-steel">Loading…</div>;

  if (!matchId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-cloud mb-2">Per-match picks</h1>
        <p className="text-sm text-cloud/80 mb-6">
          Bonus points for calling the first scorer, assist, and Man of the Match before each game.
          Picks lock <b className="text-helix">15 minutes</b> before kickoff.
        </p>
        <UpcomingList matches={upcoming} />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-trifid mb-2">Match not found.</div>
        <Link className="text-nebula underline" to="/picks">Back to upcoming matches</Link>
      </div>
    );
  }

  const kickoffMs = match.kickoff_utc ? new Date(match.kickoff_utc).getTime() : null;
  const closed = match.status !== 'SCHEDULED' ||
    (kickoffMs && kickoffMs - Date.now() <= LOCK_MS);

  async function submit(payload) {
    await api.submitPlayerPicks({
      ...payload,
      match_id: match.id,
    });
    setSubmitted(payload);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/picks" className="text-sm text-nebula hover:text-helix underline">← All upcoming matches</Link>
      <div className="bg-meteorite border border-charcoal rounded-xl p-4 mb-6 mt-2">
        <div className="text-xs text-steel mb-1">Match #{match.match_num} · {match.round}</div>
        <div className="font-display font-bold text-xl text-cloud">
          {match.home_team} vs {match.away_team}
        </div>
        <div className="text-sm text-cloud/70">{formatKickoff(match.kickoff_utc)}</div>
        {kickoffMs && !closed && (
          <Countdown target={kickoffMs - LOCK_MS} />
        )}
      </div>

      {closed ? (
        <div className="bg-meteorite border border-trifid/40 text-cloud rounded-xl p-4">
          <div className="text-trifid font-semibold">Picks for this match are closed.</div>
          <div className="mt-2 text-sm">
            <Link className="underline text-nebula" to="/picks">See upcoming matches →</Link>
          </div>
        </div>
      ) : submitted ? (
        <div className="bg-meteorite border border-trifid rounded-xl p-4">
          <div className="font-display font-bold text-trifid mb-1">Picks saved.</div>
          <div className="text-sm text-cloud/80">
            First scorer: <b className="text-cloud">{submitted.first_scorer}</b> · Assist:{' '}
            <b className="text-cloud">{submitted.assist_player}</b> · MOTM:{' '}
            <b className="text-cloud">{submitted.motm}</b>
          </div>
          <div className="mt-3 text-sm">
            <Link className="underline text-nebula mr-3" to="/bracket">View bracket</Link>
            <Link className="underline text-nebula" to="/picks">Pick another match</Link>
          </div>
        </div>
      ) : (
        <PlayerPickForm onSubmit={submit} />
      )}

      <div className="mt-10">
        <h2 className="font-display font-bold text-cloud mb-2 text-sm">Upcoming matches</h2>
        <UpcomingList matches={upcoming.filter((m) => m.id !== match.id)} />
      </div>
    </div>
  );
}

function UpcomingList({ matches }) {
  if (!matches.length) {
    return <div className="text-steel text-sm">No upcoming matches with confirmed teams yet.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {matches.map((m) => (
        <Link
          key={m.id}
          to={`/picks/${m.id}`}
          className="block bg-meteorite border border-charcoal hover:border-nebula rounded-lg p-3 transition"
        >
          <div className="text-xs text-steel">#{m.match_num} · {m.round}</div>
          <div className="font-medium text-cloud">{m.home_team} vs {m.away_team}</div>
          <div className="text-xs text-steel">{formatKickoff(m.kickoff_utc)}</div>
        </Link>
      ))}
    </div>
  );
}

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = target - now;
  if (diff <= 0) return <div className="text-xs text-trifid mt-1">Picks close now.</div>;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return (
    <div className="text-xs text-cosmic mt-1">
      Picks close in <b>{hrs}h {mins}m {secs}s</b>
    </div>
  );
}
