import { useId } from 'react';

export default function ScoreInput({
  homeTeam,
  awayTeam,
  homeValue,
  awayValue,
  onChange,
  disabled,
  label,
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 py-1.5">
      {label && (
        <div className="text-xs uppercase tracking-wide text-steel w-12">{label}</div>
      )}
      <div className="flex-1 text-right pr-2 text-cloud truncate text-sm">{homeTeam}</div>
      <input
        id={`${id}-h`}
        type="number"
        inputMode="numeric"
        min={0}
        max={20}
        value={homeValue ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ home: clamp(e.target.value), away: awayValue })}
        className="w-14 text-center bg-charcoal border border-gunmetal rounded py-1 text-cloud focus:border-nebula focus:outline-none disabled:opacity-50"
        aria-label={`${homeTeam} goals`}
      />
      <span className="text-steel">–</span>
      <input
        id={`${id}-a`}
        type="number"
        inputMode="numeric"
        min={0}
        max={20}
        value={awayValue ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ home: homeValue, away: clamp(e.target.value) })}
        className="w-14 text-center bg-charcoal border border-gunmetal rounded py-1 text-cloud focus:border-nebula focus:outline-none disabled:opacity-50"
        aria-label={`${awayTeam} goals`}
      />
      <div className="flex-1 pl-2 text-cloud truncate text-sm">{awayTeam}</div>
    </div>
  );
}

function clamp(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Math.max(0, Math.min(20, Math.floor(n)));
}
