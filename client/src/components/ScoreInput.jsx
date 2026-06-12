import { useId } from 'react';
import TeamName from './TeamName.jsx';

// Two-row layout (mirrors MatchCard):
//   🇲🇽 Mexico         [_]
//   🇿🇦 South Africa   [_]
// Country names never get truncated, the score boxes line up vertically.

export default function ScoreInput({
  homeTeam,
  awayTeam,
  homeValue,
  awayValue,
  onChange,
  disabled,
}) {
  const id = useId();
  const inputCls =
    'w-20 text-center text-2xl font-display font-black bg-nebula/10 border-2 border-nebula/60 rounded-lg py-2 text-cloud tabular-nums shadow-[0_0_16px_-3px_rgba(0,182,231,0.45)] placeholder:text-nebula/40 hover:border-nebula focus:border-helix focus:bg-nebula/20 focus:ring-2 focus:ring-helix/40 focus:outline-none disabled:opacity-50 transition';

  // A focused <input type="number"> changes its value on mouse-wheel scroll,
  // which hijacks the page scroll and silently edits the user's pick. Blurring
  // on wheel lets the page scroll normally and leaves the number untouched
  // (we intentionally don't preventDefault — that would also block scrolling).
  const stopWheel = (e) => e.currentTarget.blur();

  return (
    <div className="py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <TeamName name={homeTeam} size={14} className="flex-1 min-w-0 text-cloud text-sm" />
        <input
          id={`${id}-h`}
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          placeholder="–"
          value={homeValue ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ home: clamp(e.target.value), away: awayValue })}
          onWheel={stopWheel}
          className={inputCls}
          aria-label={`${homeTeam} goals`}
        />
      </div>
      <div className="flex items-center gap-2">
        <TeamName name={awayTeam} size={14} className="flex-1 min-w-0 text-cloud text-sm" />
        <input
          id={`${id}-a`}
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          placeholder="–"
          value={awayValue ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ home: homeValue, away: clamp(e.target.value) })}
          onWheel={stopWheel}
          className={inputCls}
          aria-label={`${awayTeam} goals`}
        />
      </div>
    </div>
  );
}

function clamp(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Math.max(0, Math.min(20, Math.floor(n)));
}
