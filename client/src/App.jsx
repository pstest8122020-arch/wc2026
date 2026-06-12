import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import BracketIncompletePrompt from './components/BracketIncompletePrompt.jsx';
import EligibilityBanner from './components/EligibilityBanner.jsx';
import MatchPickPrompt from './components/MatchPickPrompt.jsx';
import NewsFeed from './components/NewsFeed.jsx';
import { api } from './lib/api.js';
import Rules from './pages/Rules.jsx';
import Bracket from './pages/Bracket.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import MyPicks from './pages/MyPicks.jsx';
import MatchPicks from './pages/MatchPicks.jsx';
import Admin from './pages/Admin.jsx';
import BracketBuilder from './components/BracketBuilder.jsx';

export default function App() {
  // Capture ?ref=<slug> from a shared link for analytics-only funnel tracking,
  // then strip it from the URL. Grants nothing (no reward) — see routes/share.js.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;
    api.shareVisit(ref).catch(() => {});
    params.delete('ref');
    const qs = params.toString();
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
    );
  }, []);

  // One delegated listener records every click on a Jupiter Prediction Markets
  // link — event name from the link's data-track-event (catch-all otherwise),
  // plus the originating page + destination URL. Centralised so no link is missed
  // and clicks are never double-counted.
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest?.('a[href*="jup.ag/prediction"]');
      if (!a) return;
      api.trackClick(a.dataset.trackEvent || 'jup_prediction', { target_url: a.href });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // Nudge users with an incomplete submitted bracket — everywhere except the
  // builder ("/") itself, where the in-page checklist already guides them.
  const loc = useLocation();
  const onBuilder = loc.pathname === '/';
  // The next-match nudge shows everywhere except the picks flow itself.
  const onPicks = loc.pathname.startsWith('/picks');

  return (
    <div className="min-h-full flex flex-col bg-space text-cloud">
      <Navbar />
      <main className="flex-1">
        {/* Full-bleed news ticker (home page) sits ABOVE all the nudge banners. */}
        {onBuilder && <NewsFeed />}
        {/* Eligibility banner shows everywhere, INCLUDING the builder, so an ineligible
            wallet is flagged right where you submit (it re-checks itself after a submit). */}
        <EligibilityBanner />
        {!onPicks && <MatchPickPrompt />}
        {!onBuilder && <BracketIncompletePrompt />}
        <Routes>
          <Route path="/" element={<Bracket />} />
          <Route path="/build" element={<Navigate to="/" replace />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/submit" element={<Navigate to="/" replace />} />
          <Route path="/bracket" element={<Navigate to="/" replace />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/my-picks" element={<MyPicks />} />
          <Route path="/picks/:matchId" element={<MatchPicks />} />
          <Route path="/picks" element={<MatchPicks />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-steel py-6 border-t border-charcoal mt-12">
        Jupiter Community Predictor Challenge · WC 2026 Edition · All times in UTC
      </footer>
    </div>
  );
}
