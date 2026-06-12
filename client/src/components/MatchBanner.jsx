import { flagImgUrl, fifaCode } from '../lib/flags.js';
import { formatKickoff } from '../lib/scoring.js';
import MatchOdds from './MatchOdds.jsx';

// Flag-driven match banners (list card + detail hero), in the language of modern
// match-center UIs: the two flags fill the card as diagonal halves under a dark
// vignette, heavy italic uppercase team names, a glowing VS at the seam, and the
// meta (kickoff / odds / your pick) as a chip row. Flags are our self-hosted SVGs.

const SHADOW = { textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)' };
const VS_GLOW = { textShadow: '0 0 16px rgba(245,224,138,0.6), 0 2px 8px rgba(0,0,0,0.9)' };

// The two halves are MIRROR-symmetric around the center (equal flag area, the
// diagonal passes through dead center at 50%) — an uneven split reads as a layout
// bug on narrow cards. The halves meet exactly; the seam is drawn by SeamDivider.
export function FlagHalf({ team, side }) {
  const src = team ? flagImgUrl(team) : null;
  const clip =
    side === 'L'
      ? 'polygon(0 0, 54% 0, 46% 100%, 0 100%)'
      : 'polygon(54% 0, 100% 0, 100% 100%, 46% 100%)';
  const overlay =
    side === 'L'
      ? 'linear-gradient(90deg, rgba(9,9,9,0.92) 0%, rgba(9,9,9,0.55) 45%, rgba(9,9,9,0.42) 100%)'
      : 'linear-gradient(270deg, rgba(9,9,9,0.92) 0%, rgba(9,9,9,0.55) 45%, rgba(9,9,9,0.42) 100%)';
  return (
    <div className="absolute inset-0" style={{ clipPath: clip }} aria-hidden="true">
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" draggable="false" />
      ) : (
        <div className="w-full h-full bg-charcoal" />
      )}
      <div className="absolute inset-0" style={{ background: overlay }} />
    </div>
  );
}

// Crisp slanted divider on the seam — clipped in the SAME percentage space as the
// flag halves, so it sits exactly on the diagonal at any card width (a fixed-angle
// skew would drift). Reads as an intentional slash instead of a hollow gap.
export function SeamDivider() {
  return (
    <div
      className="absolute inset-0 z-[5]"
      style={{
        clipPath: 'polygon(53.7% 0, 54.3% 0, 46.3% 100%, 45.7% 100%)',
        background:
          'linear-gradient(180deg, rgba(232,249,255,0.12) 0%, rgba(232,249,255,0.4) 50%, rgba(232,249,255,0.12) 100%)',
      }}
      aria-hidden="true"
    />
  );
}

function FlagChip({ team, size = 18 }) {
  const src = team ? flagImgUrl(team) : null;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      style={{ width: Math.round(size * 1.45), height: size }}
      className="object-cover rounded-[3px] border border-white/25 shrink-0"
      draggable="false"
    />
  );
}

function Vs({ className = 'text-xl sm:text-2xl' }) {
  return (
    <span
      className={`font-black italic uppercase text-amber-200 leading-none select-none ${className}`}
      style={VS_GLOW}
      aria-hidden="true"
    >
      vs
    </span>
  );
}

function KickoffChip({ kickoff }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cloud/75 bg-white/5 border border-white/10 rounded-lg px-2 py-1 whitespace-nowrap">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      {formatKickoff(kickoff)}
    </span>
  );
}

// Very long names get their FIFA code on the compact cards (the FotMob approach) —
// "BOSNIA-HERZEGOVINA" → "BIH" beats an ellipsis mid-word.
function cardName(team) {
  if (!team) return '';
  return team.length > 15 ? fifaCode(team) : team;
}

// List card content — render INSIDE a <Link> (no nested anchors: odds render linkless).
export function MatchBannerCard({ match, odds, pick }) {
  return (
    <div className="relative">
      {/* flag stage */}
      <div className="relative h-[96px] bg-space">
        <FlagHalf team={match.home_team} side="L" />
        <FlagHalf team={match.away_team} side="R" />
        <SeamDivider />
        {/* eyebrow centered so neither side carries extra visual weight */}
        <div className="absolute top-2 inset-x-0 text-center text-[9px] uppercase tracking-[0.18em] font-bold text-cloud/70 z-10" style={SHADOW}>
          #{match.match_num} · {match.round}
        </div>
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Vs />
        </div>
        {/* home */}
        <div className="absolute inset-y-0 left-0 w-[42%] flex items-center pl-3 pt-3">
          <div className="flex items-center gap-2 min-w-0 w-full">
            <FlagChip team={match.home_team} />
            <span className="min-w-0 truncate font-black italic uppercase tracking-tight text-cloud text-sm md:text-base leading-none" style={SHADOW}>
              {match.home_team}
            </span>
          </div>
        </div>
        {/* away */}
        <div className="absolute inset-y-0 right-0 w-[42%] flex items-center justify-end pr-3 pt-3">
          <div className="flex items-center justify-end gap-2 min-w-0 w-full">
            <span className="min-w-0 truncate text-right font-black italic uppercase tracking-tight text-cloud text-sm md:text-base leading-none" style={SHADOW}>
              {match.away_team}
            </span>
            <FlagChip team={match.away_team} />
          </div>
        </div>
      </div>
      {/* meta row */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-space/80 border-t border-charcoal/80">
        <KickoffChip kickoff={match.kickoff_utc} />
        <div className="flex items-center gap-2 min-w-0">
          {pick && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cosmic truncate">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {pick.pred_home != null ? `${pick.pred_home}–${pick.pred_away}` : 'Picked'}
            </span>
          )}
          <MatchOdds odds={odds} linkless className="text-[11px]" />
        </div>
      </div>
    </div>
  );
}

// Detail-page hero — bigger stage, centered meta chips; children render extra meta
// (e.g. the lock countdown) inside the chip column.
export function MatchHero({ match, odds, children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-charcoal">
      <div className="relative h-36 sm:h-44 bg-space">
        <FlagHalf team={match.home_team} side="L" />
        <FlagHalf team={match.away_team} side="R" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
          <div className="text-[10px] sm:text-xs uppercase tracking-[0.26em] font-bold text-cloud/80 mb-2 sm:mb-3" style={SHADOW}>
            Match #{match.match_num} · {match.round}
          </div>
          <div className="w-full flex items-center justify-center gap-3 sm:gap-6 min-w-0">
            <div className="flex-1 min-w-0 flex items-center justify-end gap-2 sm:gap-2.5">
              <FlagChip team={match.home_team} size={22} />
              <span className="font-black italic uppercase tracking-tight text-cloud text-lg sm:text-3xl leading-none truncate" style={SHADOW}>
                {match.home_team}
              </span>
            </div>
            <Vs className="text-2xl sm:text-4xl" />
            <div className="flex-1 min-w-0 flex items-center justify-start gap-2 sm:gap-2.5">
              <span className="font-black italic uppercase tracking-tight text-cloud text-lg sm:text-3xl leading-none truncate" style={SHADOW}>
                {match.away_team}
              </span>
              <FlagChip team={match.away_team} size={22} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 px-3 py-3 bg-space/85 border-t border-charcoal/80">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <KickoffChip kickoff={match.kickoff_utc} />
          {odds && (
            <span className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-bold uppercase tracking-wide text-cloud/80">
              Live odds (H·D·A): <MatchOdds odds={odds} big />
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export default MatchBannerCard;
