import { forwardRef } from 'react';
import { flagImgUrl } from '../lib/flags.js';

// Off-screen "champion pick" card → rasterised to a PNG by ShareImageModal.
// 1080px wide; self-hosted flags (same-origin) so the canvas never taints.

const W = 1080;
const GRAD = 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)';

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

const ShareableChampion = forwardRef(function ShareableChampion({ champion, handle, awards = {} }, ref) {
  const flag = champion ? flagImgUrl(champion) : null;
  const pickedAwards = [
    ['Golden Ball', awards.player_tournament],
    ['Golden Boot', awards.golden_boot],
    ['FIFA Young Player Award', awards.best_young],
  ]
    .map(([label, v]) => [label, String(v || '').trim()])
    .filter(([, v]) => v);
  return (
    <div
      ref={ref}
      style={{
        width: W,
        background: 'linear-gradient(180deg, #0C0C0C 0%, #151514 55%, #0C0C0C 100%)',
        color: '#E8F9FF',
        fontFamily: "'Inter', system-ui, sans-serif",
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '54px 64px 46px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderBottom: '1px solid #1D1D1C', paddingBottom: 24 }}>
          <div style={{ fontSize: 15, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#707070', fontWeight: 600 }}>
            Jupiter Community Predictor Challenge
          </div>
          <img src="/bracket-ball.png" alt="" aria-hidden="true" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
        </div>

        {/* Reveal */}
        <div style={{ textAlign: 'center', padding: '54px 0 46px' }}>
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 26 }}>🏆</div>
          <div style={{ fontSize: 16, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#22CCEE', fontWeight: 700, marginBottom: 30 }}>
            My World Cup 2026 Champion
          </div>

          {flag ? (
            <img
              src={flag}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: 240,
                height: 160,
                objectFit: 'cover',
                borderRadius: 14,
                display: 'block',
                margin: '0 auto 28px',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
                background: '#1D1D1C',
              }}
            />
          ) : (
            <div style={{ width: 240, height: 160, borderRadius: 14, margin: '0 auto 28px', background: '#1D1D1C', border: '1px solid #30302E' }} />
          )}

          <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.04, ...gradientText() }}>
            {champion || 'Pick your winner'}
          </div>
          {handle && (
            <div style={{ fontSize: 30, fontWeight: 900, color: '#22CCEE', marginTop: 18, letterSpacing: '-0.02em' }}>
              @{handle}
            </div>
          )}
          <div style={{ fontSize: 18, color: '#9EA7AB', marginTop: handle ? 4 : 18 }}>
            My pick to lift the World Cup.
          </div>
        </div>

        {/* Award picks */}
        {pickedAwards.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 44, flexWrap: 'wrap', borderTop: '1px solid #1D1D1C', paddingTop: 30, paddingBottom: 30 }}>
            {pickedAwards.map(([label, val]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#707070', fontWeight: 700, marginBottom: 8 }}>
                  {label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#E8F9FF' }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #1D1D1C', paddingTop: 24 }}>
          <div style={{ fontSize: 14, color: '#707070' }}>Build your bracket · $2,000 prize pool</div>
          <div style={{ fontSize: 16, fontWeight: 800, ...gradientText() }}>jup26wc.com</div>
        </div>
      </div>
    </div>
  );
});

export default ShareableChampion;
