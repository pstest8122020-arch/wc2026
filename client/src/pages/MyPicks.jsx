import { useState } from 'react';
import { api } from '../lib/api.js';
import MatchCard from '../components/MatchCard.jsx';

const ROUND_ORDER = [
  'Group Stage',
  'Round of 32',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  '3rd Place',
  'Final',
];

export default function MyPicks() {
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function lookup(e) {
    e?.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const result = await api.participant(input.trim());
      setData(result);
    } catch (e) {
      setError(e.message || 'Not found');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold text-cloud mb-6">My Picks</h1>

      <form onSubmit={lookup} className="flex gap-2 mb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter your Discord username"
          className="flex-1 bg-meteorite border border-charcoal rounded px-3 py-2 text-cloud placeholder:text-steel focus:border-nebula focus:outline-none"
        />
        <button
          type="submit"
          className="bg-jupiter-gradient text-space font-display font-bold px-4 py-2 rounded"
        >
          Look up
        </button>
      </form>

      {loading && <div className="text-steel">Loading…</div>}
      {error && (
        <div className="text-trifid bg-trifid/10 border border-trifid/30 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {data && <PicksView data={data} />}
    </div>
  );
}

function PicksView({ data }) {
  const t = data.totals || {};

  const grouped = {};
  for (const p of data.score_predictions) {
    const r = p.round;
    if (!grouped[r]) grouped[r] = [];
    grouped[r].push(p);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-sm">
        <Stat label="Score pts" value={t.score_pts ?? 0} />
        <Stat label="Player pts" value={t.player_pts ?? 0} />
        <Stat label="Award pts" value={t.award_pts ?? 0} />
        <Stat label="Total" value={t.total ?? 0} accent />
        <Stat label="Rank / Prize" value={`#${t.rank ?? '—'} · $${t.prize ?? 0}`} />
      </div>

      <div className="bg-meteorite border border-charcoal rounded-xl p-4">
        <h2 className="font-display font-bold text-cloud mb-2">Award picks</h2>
        <ul className="text-sm space-y-1">
          <AwardLine label="Golden Boot" value={data.awards.golden_boot} />
          <AwardLine label="Top Assister" value={data.awards.top_assister} />
          <AwardLine label="Golden Glove" value={data.awards.golden_glove} />
          <AwardLine label="Best Young Player" value={data.awards.best_young} />
          <AwardLine label="Player of Tournament" value={data.awards.player_tournament} />
        </ul>
      </div>

      <div>
        <h2 className="font-display font-bold text-cloud mb-3">Score predictions</h2>
        <div className="space-y-4">
          {ROUND_ORDER.map((round) => {
            const items = grouped[round];
            if (!items?.length) return null;
            return (
              <div key={round}>
                <div className="text-sm font-display font-bold text-cloud mb-2">{round}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {items.map((p) => (
                    <MatchCard
                      key={p.match_id}
                      match={{
                        id: p.match_id,
                        home_team: p.home_team,
                        away_team: p.away_team,
                        home_goals: p.home_goals,
                        away_goals: p.away_goals,
                        status: p.status,
                        kickoff_utc: p.kickoff_utc,
                        round: p.round,
                        pts_multiplier: p.pts_multiplier,
                      }}
                      prediction={{ pred_home: p.pred_home, pred_away: p.pred_away }}
                      points={p.points_earned}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.player_picks?.length > 0 && (
        <div>
          <h2 className="font-display font-bold text-cloud mb-2">Per-match player picks</h2>
          <div className="bg-meteorite border border-charcoal rounded-xl overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-charcoal text-xs uppercase tracking-wide text-steel">
                <tr>
                  <th className="px-3 py-2 text-left">Match</th>
                  <th className="px-3 py-2 text-left">First Scorer</th>
                  <th className="px-3 py-2 text-left">Assist</th>
                  <th className="px-3 py-2 text-left">MOTM</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal">
                {data.player_picks.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-cloud">#{p.match_num} {p.home_team} vs {p.away_team}</td>
                    <td className="px-3 py-2 text-cloud/80">{p.first_scorer}</td>
                    <td className="px-3 py-2 text-cloud/80">{p.assist_player}</td>
                    <td className="px-3 py-2 text-cloud/80">{p.motm}</td>
                    <td className="px-3 py-2 text-right font-display font-bold text-helix">
                      {p.fs_points + p.assist_points + p.motm_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function AwardLine({ label, value }) {
  return (
    <li className="flex justify-between border-b border-charcoal py-1 last:border-b-0">
      <span className="text-steel">{label}</span>
      <span className="font-medium text-cloud">{value || <i className="text-steel">(blank)</i>}</span>
    </li>
  );
}
