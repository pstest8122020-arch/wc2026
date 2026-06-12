import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import ChallengeHero from '../components/ChallengeHero.jsx';
import BracketBuilder from '../components/BracketBuilder.jsx';

// Homepage: slim challenge banner → the interactive bracket builder (the star of
// the page; play freely, log in to submit). The news ticker renders in App.jsx so
// it sits ABOVE the site-wide banners.
//
// Once brackets lock (the server rule: first kickoff of the tournament), the
// builder comes DOWN for everyone — an editable bracket that 403s on save is a
// trap, not a toy — and the page points at the two things that still earn:
// per-match picks and the leaderboard. Submitted brackets live under My Picks.
export default function Bracket() {
  const [matches, setMatches] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api.matches().then(setMatches).catch(() => setMatches([]));
    // Tick so the page flips to the locked state at kickoff without a reload.
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Same rule as the server's bracketsLocked(): minimum kickoff across ALL
  // matches. Until matches load we render only the hero (no builder flash).
  const lockMs = useMemo(() => {
    if (!matches || matches.length === 0) return null;
    let min = Infinity;
    for (const m of matches) {
      const t = m.kickoff_utc ? new Date(m.kickoff_utc).getTime() : NaN;
      if (Number.isFinite(t) && t < min) min = t;
    }
    return Number.isFinite(min) ? min : null;
  }, [matches]);
  const locked = lockMs != null && now >= lockMs;

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <ChallengeHero />
        {matches === null ? (
          <div className="text-steel text-sm py-8">Loading…</div>
        ) : locked ? (
          <LockedHome />
        ) : (
          <BracketBuilder />
        )}
      </div>
    </>
  );
}

// Post-lock homepage for everyone (logged in or not): the tournament is on,
// brackets are sealed, and match picks are the game that keeps scoring.
function LockedHome() {
  return (
    <section className="bg-meteorite border border-charcoal rounded-2xl p-5 sm:p-7">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-cosmic/40 bg-cosmic/5 text-cosmic shrink-0">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 className="font-display font-black text-cloud text-xl sm:text-2xl leading-tight">
          The tournament is live — brackets are locked
        </h2>
      </div>
      <p className="text-sm sm:text-base text-cloud/75 mb-5 max-w-2xl">
        All submitted brackets are sealed and will score as results come in. You can still earn
        points <b className="text-cloud">every single match</b>: predict the score, first scorer,
        assist and Man of the Match — picks close 15 minutes before each kickoff. Your submitted
        bracket is under <Link to="/my-picks" className="text-nebula hover:text-helix underline">My Picks</Link>.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Link
          to="/picks"
          className="block text-center bg-jupiter-gradient text-space font-display font-bold px-5 py-4 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition"
        >
          Make your match picks →
        </Link>
        <Link
          to="/leaderboard"
          className="block text-center bg-meteorite border border-charcoal hover:border-nebula text-cloud font-display font-bold px-5 py-4 rounded-xl transition"
        >
          View the leaderboard →
        </Link>
      </div>
    </section>
  );
}
