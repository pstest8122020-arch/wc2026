import { forwardRef } from 'react';
import { flagImgUrl } from '../lib/flags.js';
import { formatKickoff } from '../lib/scoring.js';

// Off-screen "my match pick" slip → rasterised to a PNG by ShareImageModal.
// 1080px wide; self-hosted flags (same-origin) so the export canvas never taints.

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

function TeamBlock({ name }) {
  const flag = name ? flagImgUrl(name) : null;
  return (
    <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
      {flag ? (
        <img
          src={flag}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: 140,
            height: 94,
            objectFit: 'cover',
            borderRadius: 12,
            display: 'block',
            margin: '0 auto 18px',
            border: '1px solid rgba(255,255,255,0.14)',
            background: '#1D1D1C',
          }}
        />
      ) : (
        <div style={{ width: 140, height: 94, borderRadius: 12, margin: '0 auto 18px', background: '#1D1D1C', border: '1px solid #30302E' }} />
      )}
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', color: '#E8F9FF', lineHeight: 1.06 }}>
        {name || 'TBD'}
      </div>
    </div>
  );
}

const ShareableMatchPick = forwardRef(function ShareableMatchPick({ match = {}, pick = {}, handle }, ref) {
  const ph = pick.pred_home;
  const pa = pick.pred_away;
  const hasScore = ph !== null && ph !== undefined && pa !== null && pa !== undefined;
  const goalless = ph === 0 && pa === 0;
  const rows = [
    ['First goalscorer', goalless ? '—' : pick.first_scorer],
    ['Assist', goalless ? '—' : pick.assist_player],
    ['Man of the Match', pick.motm],
  ].filter(([, v]) => v);

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
      <div style={{ padding: '52px 64px 44px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderBottom: '1px solid #1D1D1C', paddingBottom: 22 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#707070', fontWeight: 700 }}>
              Jupiter Community Predictor Challenge
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, marginTop: 9 }}>
              <span style={gradientText()}>My call</span>
              <span style={{ color: '#707070', fontWeight: 600, fontSize: 22 }}>
                {'  ·  '}Match #{match.match_num} · {match.round}
              </span>
            </div>
          </div>
          <img src="/bracket-ball.png" alt="" aria-hidden="true" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
        </div>

        {/* Teams + predicted score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '44px 0 38px' }}>
          <TeamBlock name={match.home_team} />
          <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 210 }}>
            {/* Each digit is its own gradient span so the trailing number never gets
                clipped by -webkit-background-clip:text (the "3–" bug). */}
            <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              {hasScore ? (
                <>
                  <span style={{ ...gradientText(), padding: '0 2px' }}>{ph}</span>
                  <span style={{ color: '#6b6b68' }}>–</span>
                  <span style={{ ...gradientText(), padding: '0 2px' }}>{pa}</span>
                </>
              ) : (
                <span style={{ color: '#6b6b68' }}>–</span>
              )}
            </div>
            {match.kickoff_utc && (
              <div style={{ fontSize: 16, color: '#707070', marginTop: 14 }}>{formatKickoff(match.kickoff_utc)}</div>
            )}
          </div>
          <TeamBlock name={match.away_team} />
        </div>

        {/* Player picks */}
        {rows.length > 0 && (
          <div style={{ borderTop: '1px solid #1D1D1C', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 15 }}>
            {rows.map(([label, val]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#707070', fontWeight: 700 }}>
                  {label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#E8F9FF', textAlign: 'right' }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #1D1D1C', paddingTop: 22, marginTop: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#22CCEE', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {handle ? `@${handle}` : 'Make your picks'}
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.01em', flexShrink: 0, ...gradientText() }}>jup26wc.com</div>
        </div>
      </div>
    </div>
  );
});

export default ShareableMatchPick;
