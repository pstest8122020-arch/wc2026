// Server-side OG/Twitter meta injection for public "verify" pages.
//
// The client is a Vite SPA, so client-rendered meta tags are invisible to link
// crawlers (X/Telegram/Discord don't run our JS). For the shareable pages we
// serve the SAME built index.html but with the page-specific og:/twitter: tags
// swapped in server-side, so a pasted link unfurls into the right card. Humans
// still get the SPA, which hydrates and renders the interactive page.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let baseHtmlCache = null;

function baseHtml(clientDist) {
  if (baseHtmlCache) return baseHtmlCache;
  baseHtmlCache = readFileSync(resolve(clientDist, 'index.html'), 'utf8');
  return baseHtmlCache;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function absoluteBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['host'];
  return `${proto}://${host}`;
}

// Returns the built index.html with its title + og/twitter/description meta
// replaced by the page-specific values.
export function buildPage(clientDist, { title, description, url, image, card = 'summary_large_image' }) {
  let out = baseHtml(clientDist);

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);

  // Drop the generic og/twitter/description tags from the template.
  out = out
    .replace(/[ \t]*<meta[^>]+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/[ \t]*<meta[^>]+name="twitter:[^"]*"[^>]*>\s*/gi, '')
    .replace(/[ \t]*<meta[^>]+name="description"[^>]*>\s*/gi, '');

  const tags = [
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:site_name" content="Jupiter Community Predictor Challenge" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    image ? `<meta property="og:image:width" content="1200" />` : '',
    image ? `<meta property="og:image:height" content="630" />` : '',
    `<meta name="twitter:card" content="${esc(card)}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  return out.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}
