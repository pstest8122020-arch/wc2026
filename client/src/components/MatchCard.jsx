import { formatKickoff } from '../lib/scoring.js';

export default function MatchCard({ match, prediction, points, dense = false }) {
  const { home_team, away_team, home_goals, away_goals, status, kickoff_utc, pts_multiplier } = match;

  const finished = status === 'FINISHED';
  const live = status === 'LIVE';

  let bg = 'bg-meteorite border-charcoal';
  let badgeColor = 'bg-charcoal text-steel border border-gunmetal';
  let pointsBadge = null;

  if (live) {
    bg = 'bg-meteorite border-nebula';
    badgeColor = 'bg-nebula/20 text-nebula border border-nebula/30';
  } else if (finished) {
    if (!prediction) {
      bg = 'bg-charcoal border-gunmetal opacity-70';
      badgeColor = 'bg-gunmetal text-steel';
    } else {
      const exact = prediction.pred_home === home_goals && prediction.pred_away === away_goals;
      const samePred = Math.sign(prediction.pred_home - prediction.pred_away);
      const sameAct = Math.sign(home_goals - away_goals);
      if (exact) {
        bg = 'bg-trifid/10 border-trifid';
        badgeColor = 'bg-trifid/20 text-trifid border border-trifid/40';
        pointsBadge = `Exact! +${3 * (pts_multiplier || 1)}`;
      } else if (samePred === sameAct) {
        bg = 'bg-helix/10 border-helix';
        badgeColor = 'bg-helix/20 text-helix border border-helix/40';
        pointsBadge = `+${1 * (pts_multiplier || 1)}`;
      } else {
        bg = 'bg-charcoal border-gunmetal';
        badgeColor = 'bg-gunmetal text-steel';
        pointsBadge = '+0';
      }
    }
  }

  return (
    <div className={`rounded-lg border ${bg} px-3 py-2 text-sm shadow ${dense ? '' : ''}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${badgeColor} flex items-center gap-1`}>
          {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-nebula animate-pulse-live" />}
          {status}
        </span>
        {pts_multiplier > 1 && (
          <span className="text-[10px] font-bold text-cosmic">2x</span>
        )}
      </div>

      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-cloud truncate pr-2">{home_team}</span>
          <span className={`tabular-nums font-display font-bold ${finished || live ? 'text-cloud' : 'text-steel'}`}>
            {home_goals ?? '–'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-medium text-cloud truncate pr-2">{away_team}</span>
          <span className={`tabular-nums font-display font-bold ${finished || live ? 'text-cloud' : 'text-steel'}`}>
            {away_goals ?? '–'}
          </span>
        </div>
      </div>

      <div className="mt-1.5 text-[11px] text-steel">{formatKickoff(kickoff_utc)}</div>

      {prediction && (
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-steel">
            Your pick: <b className="text-cloud">{prediction.pred_home}–{prediction.pred_away}</b>
          </span>
          {points != null && (
            <span className={`px-1.5 py-0.5 rounded font-semibold ${badgeColor}`}>
              {pointsBadge || `+${points}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
