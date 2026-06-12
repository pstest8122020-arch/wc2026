import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { flagImgUrl, fifaCode } from '../lib/flags.js';
import { FlagHalf, SeamDivider } from './MatchBanner.jsx';

const LOCK_MS = 15 * 60 * 1000; // picks close 15 min before kickoff

// Site-wide nudge for the NEXT match whose picks are still open: "MEX vs RSA —
// picks close in 2h 41m". Shown to EVERYONE — even users who already picked the
// match (they may want to edit; visibility beats personalization here). Dismissal
// is per-match (sessionStorage), so the banner re-appears for every new match —
// prompt before every game, never nag about one.
export default function MatchPickPrompt() {
  const auth = useAuth();
  const [matches, setMatches] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [dismissedId, setDismissedId] = useState(null);

  useEffect(() => {
    api.matches().then(setMatches).catch(() => setMatches([]));
  }, []);

  // Tick every 30s so the countdown stays fresh and the banner rolls over to the
  // next match the moment picks close.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const next = useMemo(() => {
    if (!matches) return null;
    return (
      matches
        .filter(
          (m) =>
            m.status === 'SCHEDULED' &&
            m.home_team !== 'TBD' &&
            m.away_team !== 'TBD' &&
            m.kickoff_utc &&
            new Date(m.kickoff_utc).getTime() - LOCK_MS > now,
        )
        .sort((a, b) => (a.kickoff_utc || '').localeCompare(b.kickoff_utc || ''))[0] || null
    );
  }, [matches, now]);

  // Re-read the per-match dismissal whenever the promoted match changes.
  useEffect(() => {
    if (!next) return;
    try {
      setDismissedId(sessionStorage.getItem(`mpPromptDismissed:${next.id}`) === '1' ? next.id : null);
    } catch {
      setDismissedId(null);
    }
  }, [next?.id]);

  if (!next || dismissedId === next.id) return null;

  const closesMs = new Date(next.kickoff_utc).getTime() - LOCK_MS - now;
  const d = Math.floor(closesMs / 86400000);
  const h = Math.floor((closesMs % 86400000) / 3600000);
  const m = Math.max(1, Math.floor((closesMs % 3600000) / 60000));
  const closesIn = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const urgent = closesMs < 2 * 3600000;

  const dismiss = () => {
    try {
      sessionStorage.setItem(`mpPromptDismissed:${next.id}`, '1');
    } catch {
      /* ignore */
    }
    setDismissedId(next.id);
  };

  const Flag = ({ team, big }) => {
    const src = team ? flagImgUrl(team) : null;
    return src ? (
      <img
        src={src}
        alt=""
        className={`${big ? 'w-[30px] h-[20px]' : 'w-[22px] h-[15px]'} object-cover rounded-[3px] border border-white/25 shrink-0`}
      />
    ) : null;
  };
  const SHADOW = { textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)' };
  const VS_GLOW = { textShadow: '0 0 16px rgba(245,224,138,0.6), 0 2px 8px rgba(0,0,0,0.9)' };

  // Whole banner is the link (max tap target); the dismiss X stops propagation.
  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <Link
        to={`/picks/${next.id}`}
        className={`group block relative overflow-hidden rounded-2xl border transition shadow-lg ${
          urgent
            ? 'border-cosmic/60 hover:border-cosmic shadow-cosmic/10'
            : 'border-nebula/50 hover:border-helix shadow-nebula/10'
        }`}
      >
        {/* flag stage background */}
        <div className="absolute inset-0 bg-space" aria-hidden="true">
          <FlagHalf team={next.home_team} side="L" dim />
          <FlagHalf team={next.away_team} side="R" dim />
          <SeamDivider />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dismiss();
          }}
          aria-label="Dismiss"
          className="absolute top-2.5 right-2.5 z-20 text-cloud/50 hover:text-cloud transition p-1"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 px-4 sm:px-6 py-4 sm:py-5 pr-10">
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] uppercase tracking-[0.22em] font-bold text-cosmic mb-1.5"
              style={SHADOW}
            >
              {auth.loggedIn ? 'Next match you haven’t picked' : 'Next match'} · #{next.match_num} · {next.round}
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap">
              <Flag team={next.home_team} big />
              <span className="font-black italic uppercase tracking-tight text-cloud text-xl sm:text-3xl leading-none" style={SHADOW}>
                <span className="hidden md:inline">{next.home_team}</span>
                <span className="md:hidden">{fifaCode(next.home_team)}</span>
              </span>
              <span className="font-black italic uppercase text-amber-200 text-lg sm:text-2xl leading-none" style={VS_GLOW}>
                vs
              </span>
              <span className="font-black italic uppercase tracking-tight text-cloud text-xl sm:text-3xl leading-none" style={SHADOW}>
                <span className="hidden md:inline">{next.away_team}</span>
                <span className="md:hidden">{fifaCode(next.away_team)}</span>
              </span>
              <Flag team={next.away_team} big />
            </div>
            <div className="text-sm text-cloud/85 mt-2" style={SHADOW}>
              Picks close in{' '}
              <b className={`${urgent ? 'text-cosmic' : 'text-helix'} text-base`}>{closesIn}</b>
              {/* max per match = exact score (3 × knockout multiplier) + first scorer 6 + assist 4 + MOTM 4 */}
              <span className="text-cloud/50"> · </span>
              earn up to <b className="text-cosmic text-base">{14 + 3 * (next.pts_multiplier || 1)} pts</b>
            </div>
          </div>

          <span className="shrink-0 inline-flex items-center justify-center gap-2 bg-jupiter-gradient text-space font-display font-black text-base sm:text-lg px-6 py-3 rounded-xl shadow-lg shadow-cosmic/25 group-hover:scale-[1.03] transition-transform whitespace-nowrap">
            Make your picks →
          </span>
        </div>
      </Link>
    </div>
  );
}
