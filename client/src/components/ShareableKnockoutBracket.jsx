import { forwardRef } from 'react';
import { flagImgUrl, fifaCode } from '../lib/flags.js';

// Off-screen "your knockout bracket" card → rasterised to a PNG by ShareImageModal.
// Center-converging tree, self-hosted flags (same-origin), and connectors drawn as
// real <div>s (not CSS pseudo-elements) so html-to-image captures them every time.

const W = 1360;
const TIE_W = 116;
const GAP = 22;
const STUB = GAP / 2; // horizontal stub reaches the mid-gutter, where the vline sits
const LINE = '#3a3a38';
const TREE_H = 720;
const GRAD = 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)';
const MONO = "'ui-monospace', 'SFMono-Regular', 'SF Mono', Menlo, Consolas, monospace";

// Same column layout as the live builder.
const HALF = {
  L: { R32: [73, 75, 74, 77, 83, 84, 81, 82], R16: [89, 90, 93, 94], QF: [97, 98], SF: [101] },
  R: { R32: [76, 78, 79, 80, 86, 88, 85, 87], R16: [91, 92, 95, 96], QF: [99, 100], SF: [102] },
};

function gradientText(extra = {}) {
  return { background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent', ...extra };
}

function Flag({ name, w = 24, h = 16 }) {
  const src = name ? flagImgUrl(name) : null;
  if (!src) return <span style={{ width: w, height: h, background: '#30302E', borderRadius: 3, flexShrink: 0, display: 'block' }} />;
  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      style={{ width: w, height: h, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: '1px solid rgba(255,255,255,0.12)', background: '#1D1D1C', display: 'block', boxSizing: 'border-box' }}
    />
  );
}

function Chip({ team, state, big }) {
  const h = big ? 38 : 30;
  const styles = {
    win: { background: 'rgba(0,182,231,0.22)', border: '1px solid #00B6E7', color: '#E8F9FF' },
    dim: { background: '#141413', border: '1px solid #232322', color: 'rgba(232,249,255,0.38)' },
    plain: { background: '#161615', border: '1px solid #2a2a28', color: '#E8F9FF' },
    empty: { background: '#0f0f0e', border: '1px solid #1d1d1c', color: 'transparent' },
  }[state];
  return (
    <div style={{ height: h, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px', fontSize: big ? 15 : 13, fontWeight: 800, fontFamily: MONO, boxSizing: 'border-box', ...styles }}>
      <Flag name={team} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team ? fifaCode(team) : ''}</span>
    </div>
  );
}

function Tie({ a, b, winner, big }) {
  const st = (t) => (!t ? 'empty' : winner ? (winner === t ? 'win' : 'dim') : 'plain');
  return (
    <div style={{ width: big ? TIE_W + 16 : TIE_W, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Chip team={a} state={st(a)} big={big} />
      <Chip team={b} state={st(b)} big={big} />
    </div>
  );
}

// Connector lines for a cell. `side` L = feeds rightward (stub on right), R mirrors.
function Conn({ side, isParent }) {
  const fwd =
    side === 'L'
      ? { left: '100%' }
      : { right: '100%' };
  const inc =
    side === 'L'
      ? { right: '100%' }
      : { left: '100%' };
  const vline =
    side === 'L'
      ? { right: '100%', marginRight: STUB }
      : { left: '100%', marginLeft: STUB };
  return (
    <>
      <span style={{ position: 'absolute', top: '50%', width: STUB, height: 2, marginTop: -1, background: LINE, ...fwd }} />
      {isParent && <span style={{ position: 'absolute', top: '50%', width: STUB, height: 2, marginTop: -1, background: LINE, ...inc }} />}
      {isParent && <span style={{ position: 'absolute', top: '25%', height: '50%', width: 2, background: LINE, ...vline }} />}
    </>
  );
}

const ShareableKnockoutBracket = forwardRef(function ShareableKnockoutBracket({ teamsByMatch = {}, winners = {}, champion, handle, awards = {} }, ref) {
  const cell = (mn, side, isParent) => {
    const [a, b] = teamsByMatch[mn] || [null, null];
    return (
      <div key={mn} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Conn side={side} isParent={isParent} />
        <Tie a={a} b={b} winner={winners[mn]} />
      </div>
    );
  };
  const col = (side, matches, isParent) => (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: TIE_W }}>
      {matches.map((mn) => cell(mn, side, isParent))}
    </div>
  );

  const champFlag = champion ? flagImgUrl(champion) : null;
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
        background: 'linear-gradient(180deg, #0C0C0C 0%, #151514 60%, #0C0C0C 100%)',
        color: '#E8F9FF',
        fontFamily: "'Inter', system-ui, sans-serif",
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '46px 50px 40px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderBottom: '1px solid #1D1D1C', paddingBottom: 22 }}>
          <div>
            <div style={{ fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#707070', fontWeight: 600, marginBottom: 8 }}>
              Jupiter Community Predictor Challenge
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1 }}>
              <span style={gradientText()}>World Cup 2026</span> <span style={{ color: '#E8F9FF' }}>bracket</span>
            </div>
            {handle && (
              <div style={{ fontSize: 32, fontWeight: 900, color: '#22CCEE', marginTop: 12, letterSpacing: '-0.02em' }}>
                @{handle}
              </div>
            )}
          </div>
          {champion ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#151514', border: '1px solid #1D1D1C', borderRadius: 14, padding: '12px 18px' }}>
              <span style={{ fontSize: 30 }}>🏆</span>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A4D756', fontWeight: 700 }}>Champion</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 3 }}>
                  {champFlag && <img src={champFlag} alt="" crossOrigin="anonymous" style={{ width: 30, height: 20, objectFit: 'cover', borderRadius: 3, border: '1px solid rgba(255,255,255,0.14)' }} />}
                  <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', color: '#E8F9FF' }}>{champion}</span>
                </div>
              </div>
            </div>
          ) : (
            <img src="/bracket-ball.png" alt="" aria-hidden="true" style={{ width: 92, height: 92, objectFit: 'contain', flexShrink: 0 }} />
          )}
        </div>

        {/* Tree */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: GAP, height: TREE_H, marginTop: 28 }}>
          {col('L', HALF.L.R32, false)}
          {col('L', HALF.L.R16, true)}
          {col('L', HALF.L.QF, true)}
          {col('L', HALF.L.SF, true)}

          {/* center: 3rd place + Final */}
          <div style={{ minWidth: TIE_W + 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#707070', marginBottom: 6 }}>3rd place</div>
              <Tie a={teamsByMatch[103]?.[0]} b={teamsByMatch[103]?.[1]} winner={winners[103]} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A4D756', fontWeight: 800, marginBottom: 6 }}>Final</div>
              <Tie a={teamsByMatch[104]?.[0]} b={teamsByMatch[104]?.[1]} winner={winners[104]} big />
            </div>
          </div>

          {col('R', HALF.R.SF, true)}
          {col('R', HALF.R.QF, true)}
          {col('R', HALF.R.R16, true)}
          {col('R', HALF.R.R32, false)}
        </div>

        {/* Award picks */}
        {pickedAwards.length > 0 && (
          <div style={{ display: 'flex', gap: 40, borderTop: '1px solid #1D1D1C', marginTop: 24, paddingTop: 20 }}>
            {pickedAwards.map(([label, val]) => (
              <div key={label} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#707070', fontWeight: 700, marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#E8F9FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #1D1D1C', marginTop: 26, paddingTop: 22 }}>
          <div style={{ fontSize: 13, color: '#707070' }}>Round of 32 → Final · $2,000 prize pool · $10,000 perfect-bracket bonus</div>
          <div style={{ fontSize: 15, fontWeight: 800, ...gradientText() }}>jup26wc.com</div>
        </div>
      </div>
    </div>
  );
});

export default ShareableKnockoutBracket;
