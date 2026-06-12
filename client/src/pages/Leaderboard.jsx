import { useEffect, useState } from 'react';
import LeaderboardRow from '../components/LeaderboardRow.jsx';
import { useLeaderboard } from '../hooks/useLeaderboard.js';

export default function Leaderboard() {
  const { rows, updatedAt, loading } = useLeaderboard();
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = rows.filter((r) =>
    !filter ? true : r.discord.toLowerCase().includes(filter.toLowerCase()),
  );

  const ago = updatedAt ? Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000)) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-black text-cloud">Leaderboard</h1>
          {ago !== null && (
            <div className="text-xs text-steel">
              Last updated: {ago === 0 ? 'just now' : `${ago}s ago`}
            </div>
          )}
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by user…"
          className="bg-meteorite border border-charcoal rounded px-3 py-1.5 text-sm w-64 text-cloud placeholder:text-steel focus:border-nebula focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="text-steel">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-steel bg-meteorite border border-charcoal rounded-xl p-6 text-center">
          No participants yet. Be the first to submit a bracket.
        </div>
      ) : (
        <>
        {/* Mobile: compact cards so the whole row fits without horizontal scroll */}
        <div className="sm:hidden space-y-2">
          {filtered.map((r) => (
            <div
              key={r.discord}
              className={`rounded-xl border border-charcoal p-3 flex items-center gap-3 ${
                r.rank === 1 ? 'bg-cosmic/10' : r.rank === 2 ? 'bg-cloud/5' : r.rank === 3 ? 'bg-venus/10' : 'bg-meteorite'
              }`}
            >
              <div className="w-7 text-center font-display font-black text-cloud shrink-0">{r.rank}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-cloud truncate">{r.discord}</div>
                <div className="text-[11px] text-cloud/55 mt-0.5 flex gap-x-2.5 gap-y-0.5 flex-wrap">
                  <span>Bracket <b className="text-cosmic">{r.bracket_pts ?? 0}</b></span>
                  <span>Score <b className="text-cloud/80">{r.score_pts}</b></span>
                  <span>Player <b className="text-cloud/80">{r.player_pts}</b></span>
                  <span>Awards <b className="text-cloud/80">{r.award_pts}</b></span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display font-black text-lg text-helix tabular-nums leading-none">{r.total}</div>
                <div className="text-[9px] uppercase tracking-wider text-steel mt-0.5">total</div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:block overflow-x-auto bg-meteorite border border-charcoal rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-charcoal text-steel text-left text-xs uppercase tracking-wide">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2 text-right">Bracket</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Player</th>
                <th className="px-3 py-2 text-right">Awards</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal">
              {filtered.map((r) => (
                <LeaderboardRow key={r.discord} row={r} />
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div className="mt-6 bg-meteorite border border-charcoal rounded-xl p-4 text-xs">
        <div className="font-display font-bold text-cloud mb-2">Prize structure</div>
        <div className="bg-jupiter-gradient rounded-lg p-[1px] mb-3">
          <div className="bg-space rounded-[7px] px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-[9px] uppercase tracking-[0.18em] text-cosmic font-bold">Special prize · </span>
              <span className="text-cloud font-semibold">Perfect bracket bonus</span>
              <span className="text-cloud/60"> · 100% correct predictions · split between the winners</span>
            </div>
            <div className="font-display font-black text-base bg-jupiter-gradient bg-clip-text text-transparent">
              $10,000
            </div>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-steel font-bold mb-1.5 mt-1">
          By final leaderboard rank
        </div>
        <div className="flex flex-wrap gap-3 text-cloud/80">
          <span>1st: <b className="text-cosmic">$500</b></span>
          <span>2nd: <b className="text-cosmic">$250</b></span>
          <span>3rd: <b className="text-cosmic">$150</b></span>
          <span>4–10: <b className="text-cosmic">$50</b></span>
          <span>11–25: <b className="text-cosmic">$25</b></span>
          <span>26–50: <b className="text-cosmic">$15</b></span>
        </div>
      </div>
    </div>
  );
}
