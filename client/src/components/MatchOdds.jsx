// Compact Jupiter Prediction odds pill: home · draw · away implied %. Links to
import { jupGo } from '../lib/api.js';
// the match's Prediction event by default; pass `linkless` to render a static
// span (e.g. when already inside another link). Renders nothing with no odds.
function fmtPct(p) {
  if (p == null || !Number.isFinite(p)) return '–';
  return `${Math.round(p * 100)}%`;
}

export default function MatchOdds({ odds, className = '', linkless = false, big = false }) {
  if (!odds || (odds.home_prob == null && odds.away_prob == null)) return null;
  // `big`: the prominent hero variant — larger type, roomier pill, stronger border.
  const sizing = big
    ? 'px-3.5 py-1.5 rounded-lg text-base sm:text-xl border-helix/60 bg-nebula/15'
    : 'px-1.5 py-0.5 rounded border-nebula/40 bg-nebula/10';
  const cls = `inline-flex items-center ${sizing} border tabular-nums text-nebula${linkless ? '' : ' hover:text-helix'} ${className}`;
  const inner = (
    <span className="font-display font-bold">
      {fmtPct(odds.home_prob)}
      <span className="text-steel mx-0.5">·</span>
      {fmtPct(odds.draw_prob)}
      <span className="text-steel mx-0.5">·</span>
      {fmtPct(odds.away_prob)}
    </span>
  );
  const title = `Jupiter Prediction Markets · ${odds.event_title || 'live odds'}`;
  if (linkless) {
    return (
      <span className={cls} title={title}>
        {inner}
      </span>
    );
  }
  return (
    <a
      href={jupGo('odds', odds.event_url || undefined)}
      target="_blank"
      rel="noreferrer"
      data-track-event="odds"
      title={title}
      className={cls}
    >
      {inner}
    </a>
  );
}
