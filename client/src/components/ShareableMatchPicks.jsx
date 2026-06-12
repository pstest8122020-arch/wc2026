import { forwardRef } from 'react';
import { isoForCountry, fifaCode } from '../lib/flags.js';

// Off-screen 1080×1080 card rendered to PNG for "Share my picks". Mirrors
// ShareableBracket's conventions: inline styles, flagcdn flags + FIFA codes,
// branded gradient + footer, faint soccer-ball watermark.

const SIZE = 1080;
const FLAGCDN_HEIGHTS = [20, 24, 40, 60, 80, 120, 160, 240];
function flagSrc(name, hPx) {
  const iso = isoForCountry(name);
  if (!iso) return null;
  const want = hPx * 2;
  const snapped = FLAGCDN_HEIGHTS.find((s) => s >= want) || FLAGCDN_HEIGHTS[FLAGCDN_HEIGHTS.length - 1];
  return `https://flagcdn.com/h${snapped}/${iso}.png`;
}
function Flag({ name, w = 64, h = 40 }) {
  const base = { width: w, height: h, objectFit: 'cover', borderRadius: 6, display: 'inline-block', flexShrink: 0, background: '#1D1D1C' };
  const src = flagSrc(name, h);
  return src ? <img src={src} alt="" crossOrigin="anonymous" style={base} /> : <span style={base} />;
}

const ShareableMatchPicks = forwardRef(function ShareableMatchPicks(
  { match, picks = {}, username, lockGoalPicks },
  ref,
) {
  if (!match) return null;
  const rows = [
    ['First goalscorer', lockGoalPicks ? '—' : picks.first_scorer || '—'],
    ['Assist', lockGoalPicks ? '—' : picks.assist_player || '—'],
    ['Man of the Match', picks.motm || '—'],
  ];
  const handle = username ? (username.startsWith('@') ? username : `@${username}`) : 'My picks';

  return (
    <div
      ref={ref}
      style={{
        width: SIZE,
        height: SIZE,
        background: 'linear-gradient(180deg, #0C0C0C 0%, #151514 55%, #0C0C0C 100%)',
        color: '#E8F9FF',
        fontFamily: "'Inter', system-ui, sans-serif",
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: 64,
      }}
    >
      {/* Soccer/pitch glow — pure CSS (no external image), so html-to-image
          can never fail or taint the canvas on a resource fetch. */}
      <div
        style={{
          position: 'absolute',
          right: -180,
          bottom: -220,
          width: 640,
          height: 640,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(164,215,86,0.12) 0%, rgba(0,182,231,0.07) 45%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 18, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#707070', fontWeight: 600, marginBottom: 10 }}>
          Jupiter Community Predictor Challenge
        </div>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.0 }}>
          <span style={{ background: 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            WC 2026
          </span>{' '}
          match picks
        </div>
      </div>

      {/* Match */}
      <div style={{ position: 'relative', marginTop: 44, background: '#151514', border: '1px solid #1D1D1C', borderRadius: 18, padding: '26px 32px' }}>
        <div style={{ fontSize: 16, color: '#707070', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>
          Match #{match.match_num} · {match.round}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 44, fontWeight: 900, letterSpacing: '-0.02em' }}>
          <Flag name={match.home_team} w={64} h={40} />
          <span>{fifaCode(match.home_team)}</span>
          <span style={{ color: '#707070', fontSize: 28, fontWeight: 700 }}>vs</span>
          <span>{fifaCode(match.away_team)}</span>
          <Flag name={match.away_team} w={64} h={40} />
        </div>
        <div style={{ fontSize: 18, color: '#A9B6BC', marginTop: 10 }}>
          {match.home_team} vs {match.away_team}
        </div>
      </div>

      {/* Picks */}
      <div style={{ position: 'relative', marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        {rows.map(([label, val]) => (
          <div key={label} style={{ background: '#151514', border: '1px solid #1D1D1C', borderRadius: 16, padding: '20px 28px' }}>
            <div style={{ fontSize: 15, color: '#707070', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: '#E8F9FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #1D1D1C', paddingTop: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#E8F9FF' }}>{handle}</div>
        <div style={{ fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
          jup26wc.com
        </div>
      </div>
    </div>
  );
});

export default ShareableMatchPicks;
