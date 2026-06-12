// Satori → PNG render pipeline (no JSX; the server has no build step).
//
// `h()` returns a React-element-like object { type, props } that Satori accepts
// directly. Satori requires every element with >1 child to declare
// `display: 'flex'` in its style — the card builders honor that.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getFonts } from './fonts.js';

export function h(type, props, ...children) {
  const flat = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false && c !== true);
  return {
    type,
    props: {
      ...(props || {}),
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}

export async function renderPng(element, { width = 1200, height = 630 } = {}) {
  const fonts = getFonts();
  const svg = await satori(element, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  return resvg.render().asPng();
}
