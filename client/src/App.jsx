import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Submit from './pages/Submit.jsx';
import Bracket from './pages/Bracket.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import MyPicks from './pages/MyPicks.jsx';
import MatchPicks from './pages/MatchPicks.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <div className="min-h-full flex flex-col bg-space text-cloud">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/bracket" element={<Bracket />} />
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
