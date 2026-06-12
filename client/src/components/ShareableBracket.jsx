import { forwardRef, useMemo } from 'react';
import { isoForCountry, fifaCode } from '../lib/flags.js';

// Downloadable bracket card. 1200px wide; height grows with content (no clipping).
// FIFA 3-letter codes so nothing truncates, and self-hosted flag SVGs rendered in
// a fixed box so every flag is the exact same size. Match rows use a fixed grid
// so the code / flag / score / flag / code columns line up perfectly.

const W = 1200;
const GRAD = 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)';
// Monospace for the match rows so every 3-letter FIFA code is the exact same
// width and the code / flag / score columns line up perfectly.
const MONO = "'ui-monospace', 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

function gradientText(extra = {}) {
  return {
    background: GRAD,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: 'transparent',
    ...extra,
  };
}

function flagSrc(name) {
  const iso = isoForCountry(name);
  if (!iso) return null;
  return `/flags/${iso}.svg`; // self-hosted, same-origin → no canvas taint on export
}

function Flag({ name, w = 23, h = 15 }) {
  const src = flagSrc(name);
  if (!src) {
    return <span style={{ display: 'inline-block', width: w, height: h, background: '#30302E', borderRadius: 3, flexShrink: 0 }} />;
  }
  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      style={{
        width: w,
        height: h,
        objectFit: 'cover',
        borderRadius: 3,
        display: 'block',
        flexShrink: 0,
        border: '1px solid rgba(255,255,255,0.12)',
        boxSizing: 'border-box',
        background: '#1D1D1C',
      }}
    />
  );
}

function MatchRow({ match }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 23px 52px 23px 1fr', alignItems: 'center', gap: 8, fontSize: 14, lineHeight: 1, fontFamily: MONO }}>
      <span style={{ textAlign: 'right', fontWeight: 700, color: '#E8F9FF' }}>{fifaCode(match.home_team)}</span>
      <Flag name={match.home_team} />
      <span style={{ textAlign: 'center', fontWeight: 700, color: '#E8F9FF', fontSize: 15 }}>
        {match.pred_home}
        <span style={{ color: '#5a5a58', margin: '0 3px' }}>–</span>
        {match.pred_away}
      </span>
      <Flag name={match.away_team} />
      <span style={{ textAlign: 'left', fontWeight: 700, color: '#E8F9FF' }}>{fifaCode(match.away_team)}</span>
    </div>
  );
}

const ShareableBracket = forwardRef(function ShareableBracket({ data }, ref) {
  const awards = data?.awards || {};
  const preds = data?.score_predictions || [];

  const byGroup = useMemo(() => {
    const m = {};
    for (const p of preds) {
      if (p.round !== 'Group Stage') continue;
      const g = p.group_name || '?';
      if (!m[g]) m[g] = [];
      m[g].push(p);
    }
    for (const g of Object.keys(m)) m[g].sort((a, b) => a.match_num - b.match_num);
    return m;
  }, [preds]);

  const groupLetters = Object.keys(byGroup).sort();
  const totals = data?.totals;
  const hasScored = (totals?.total ?? 0) > 0 || (totals?.matches_played ?? 0) > 0;

  return (
    <div
      ref={ref}
      style={{
        width: W,
        background: 'linear-gradient(180deg, #0C0C0C 0%, #151514 60%, #0C0C0C 100%)',
        color: '#E8F9FF',
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ padding: '46px 50px 38px' }}>
        {/* Header */}
        <div style={{ borderBottom: '1px solid #1D1D1C', paddingBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <div style={{ fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#707070', fontWeight: 600, marginBottom: 8 }}>
              Jupiter Community Predictor Challenge
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1 }}>
              <span style={gradientText()}>WC 2026</span> <span style={{ color: '#E8F9FF' }}>bracket</span>
            </div>
          </div>
          <img src="/bracket-ball.png" alt="" aria-hidden="true" style={{ width: 100, height: 100, objectFit: 'contain', flexShrink: 0 }} />
        </div>

        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginTop: 22, marginBottom: 22 }}>
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.025em', color: '#E8F9FF', lineHeight: 1.1, minWidth: 0, wordBreak: 'break-word' }}>
            {data?.discord || '—'}
          </div>
          {hasScored && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#707070' }}>Rank · Total · Prize</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#22CCEE', letterSpacing: '-0.02em' }}>
                #{totals.rank ?? '—'} · {totals.total ?? 0} pts · {totals.prize > 0 ? `$${totals.prize}` : '—'}
              </div>
            </div>
          )}
        </div>

        {/* Awards strip */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            ['Golden Ball', awards.player_tournament, '25P'],
            ['Golden Boot', awards.golden_boot, '20P'],
            ['Best Young', awards.best_young, '15P'],
          ].map(([label, val, pts]) => (
            <div key={label} style={{ flex: 1, background: '#151514', border: '1px solid #1D1D1C', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#707070', marginBottom: 5 }}>{label} · {pts}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#E8F9FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val || '—'}</div>
            </div>
          ))}
        </div>

        {/* Section label */}
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#707070', fontWeight: 700, margin: '28px 0 14px' }}>
          Group-stage score predictions
        </div>

        {/* Groups grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'min-content', gap: 12 }}>
          {groupLetters.slice(0, 12).map((g) => (
            <div key={g} style={{ background: '#131313', border: '1px solid #232322', borderRadius: 14, padding: '13px 16px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', color: '#22CCEE' }}>GROUP {g}</span>
                <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #2a2a28, rgba(0,0,0,0))' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(byGroup[g] || []).map((m) => (
                  <MatchRow key={m.match_id} match={m} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #1D1D1C', marginTop: 30, paddingTop: 22 }}>
          <div style={{ fontSize: 13, color: '#707070' }}>
            {preds.length} group-stage matches · $2,000 prize pool · $10,000 perfect-bracket bonus
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, ...gradientText() }}>jup26wc.com</div>
        </div>
      </div>
    </div>
  );
});

export default ShareableBracket;
