// Satori card components for the viral-loop OG images (1200×630 PNG).
//
// Design (research-backed): one dominant focal element, bold high-contrast type,
// consistent brand (logo + gradient), and "sports card" energy via a subtle
// gradient background, soft brand glows, a left brand rail, and a gradient stat
// panel/accent — so the canvas reads as designed, not empty. All values come
// from the DB (see routes/og.js); never from query params.

import { h } from './render.js';

const C = {
  bg: '#0C0C0C',
  panel: '#151514',
  border: '#30302E',
  text: '#E8F9FF',
  steel: '#8A8A88',
  nebula: '#00B6E7',
  cosmic: '#A4D756',
};
const GRADIENT = 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)';

function brandRow() {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center' } },
      h('div', { style: { display: 'flex', width: 30, height: 30, borderRadius: 9, background: GRADIENT, marginRight: 14 } }),
      h('div', { style: { display: 'flex', fontSize: 25, fontWeight: 700, color: C.text } }, 'Jupiter Predictor Challenge'),
    ),
    h('div', { style: { display: 'flex', fontSize: 18, fontWeight: 800, color: '#0C0C0C', background: GRADIENT, padding: '8px 18px', borderRadius: 999 } }, 'WC 2026'),
  );
}

function footerRow(verifyUrl, rightText) {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 21, color: C.steel } },
    h('div', { style: { display: 'flex' } }, verifyUrl),
    rightText ? h('div', { style: { display: 'flex' } }, rightText) : h('div', { style: { display: 'flex' } }, ''),
  );
}

function glow(style) {
  return h('div', { style: { display: 'flex', position: 'absolute', ...style } });
}

// Branded shell: gradient backdrop + two soft brand glows + a left gradient rail,
// then the padded content column (brand row / body / footer).
function CardShell({ children, verifyUrl, footerRight }) {
  return h(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        width: 1200,
        height: 630,
        background: 'linear-gradient(135deg, #0C0C0C 0%, #0E1417 55%, #0C0C0C 100%)',
        fontFamily: 'Inter',
        overflow: 'hidden',
      },
    },
    glow({ top: -180, right: -120, width: 640, height: 640, borderRadius: 9999, background: 'radial-gradient(circle, rgba(0,182,231,0.22) 0%, rgba(12,12,12,0) 70%)' }),
    glow({ bottom: -220, left: -140, width: 600, height: 600, borderRadius: 9999, background: 'radial-gradient(circle, rgba(164,215,86,0.16) 0%, rgba(12,12,12,0) 70%)' }),
    h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: GRADIENT } }),
    h(
      'div',
      {
        style: {
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 1200,
          height: 630,
          padding: 54,
          paddingLeft: 66,
        },
      },
      brandRow(),
      h('div', { style: { display: 'flex', flex: 1, paddingTop: 20, paddingBottom: 20 } }, children),
      footerRow(verifyUrl, footerRight),
    ),
  );
}

// Gradient display text (focal numbers). Falls back gracefully to solid cosmic
// if a renderer ignores background-clip:text.
function gradientText(value, fontSize, extra = {}) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        fontSize,
        fontWeight: 800,
        color: C.cosmic,
        background: GRADIENT,
        backgroundClip: 'text',
        '-webkit-background-clip': 'text',
        '-webkit-text-fill-color': 'transparent',
        ...extra,
      },
    },
    value,
  );
}

export function rankCard(data) {
  const { handle, rank, ofN, total, exactHits, percentLabel, delta } = data;
  const deltaText = delta > 0 ? `+${delta} since last matchday` : delta < 0 ? `${delta} since last matchday` : null;

  const panelRow = (label, value) =>
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 } },
      h('div', { style: { display: 'flex', fontSize: 19, fontWeight: 700, color: '#0C0C0C', opacity: 0.6 } }, label),
      h('div', { style: { display: 'flex', fontSize: 30, fontWeight: 800, color: '#0C0C0C', lineHeight: 1, whiteSpace: 'nowrap' } }, String(value)),
    );

  const panel = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', width: 348, borderRadius: 24, padding: 30, background: GRADIENT } },
    h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 800, letterSpacing: 1, color: '#0C0C0C', opacity: 0.65 } }, 'POINTS'),
    h('div', { style: { display: 'flex', fontSize: 96, fontWeight: 800, color: '#0C0C0C', lineHeight: 1 } }, String(total)),
    h('div', { style: { display: 'flex', height: 2, background: 'rgba(12,12,12,0.25)', marginTop: 18, marginBottom: 16 } }),
    panelRow('Exact hits', exactHits, false),
    panelRow('Percentile', percentLabel, false),
  );

  const left = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' } },
    h('div', { style: { display: 'flex', fontSize: 23, fontWeight: 700, color: C.nebula, letterSpacing: 3 } }, 'WORLD CUP 2026 · LEADERBOARD'),
    h('div', { style: { display: 'flex', fontSize: 50, fontWeight: 800, color: C.text, marginTop: 8 } }, `@${handle}`),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 4 } },
      gradientText(`#${rank}`, 168, { lineHeight: 0.9 }),
      h('div', { style: { display: 'flex', fontSize: 34, fontWeight: 700, color: C.steel, paddingBottom: 26 } }, `of ${ofN}`),
    ),
    deltaText
      ? h('div', { style: { display: 'flex', fontSize: 22, fontWeight: 700, color: delta > 0 ? C.cosmic : C.steel, marginTop: 10 } }, deltaText)
      : h('div', { style: { display: 'flex' } }, ''),
  );

  return CardShell({
    verifyUrl: `jup26wc.com/u/${handle}`,
    footerRight: 'Can you beat me?',
    children: h(
      'div',
      { style: { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 36 } },
      left,
      panel,
    ),
  });
}

export function momentCard(data) {
  const { handle, kind, detail, home, away, resH, resA, predH, predA } = data;
  const headline = kind === 'exact' ? 'I CALLED IT' : kind === 'upset' ? 'CALLED THE UPSET' : (detail || 'ON A STREAK').toUpperCase();
  const sub =
    kind === 'exact'
      ? 'Called the exact scoreline'
      : kind === 'upset'
        ? `Called the upset · my pick ${predH}–${predA}`
        : `My pick ${predH}–${predA}`;
  const headlineSize = headline.length > 12 ? 78 : 92;

  const scoreTile = h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        background: 'rgba(232,249,255,0.04)',
        border: `2px solid ${C.border}`,
        borderRadius: 22,
        padding: '22px 34px',
      },
    },
    h('div', { style: { display: 'flex', fontSize: 46, fontWeight: 800, color: C.text } }, home),
    gradientText(`${resH}–${resA}`, 54),
    h('div', { style: { display: 'flex', fontSize: 46, fontWeight: 800, color: C.text } }, away),
  );

  return CardShell({
    verifyUrl: `jup26wc.com/u/${handle}`,
    footerRight: `@${handle}`,
    children: h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%' } },
      h('div', { style: { display: 'flex', fontSize: 25, fontWeight: 700, color: C.nebula, letterSpacing: 4 } }, 'WORLD CUP 2026'),
      h('div', { style: { display: 'flex', fontSize: headlineSize, fontWeight: 800, color: C.cosmic, lineHeight: 1, marginTop: 6 } }, headline),
      h('div', { style: { display: 'flex', width: 200, height: 8, borderRadius: 9999, background: GRADIENT, marginTop: 18, marginBottom: 26 } }),
      scoreTile,
      h('div', { style: { display: 'flex', fontSize: 24, color: C.steel, marginTop: 18 } }, sub),
    ),
  });
}
