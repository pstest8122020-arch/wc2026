// Inter font buffers for Satori (OG image rendering).
// Satori supports TTF/OTF/WOFF (not WOFF2). @fontsource/inter ships .woff
// (woff1) files which we load straight from node_modules — no network needed
// at runtime, so this works identically in dev and in the Fly container.

import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const WEIGHTS = [
  { weight: 400, file: 'inter-latin-400-normal.woff' },
  { weight: 600, file: 'inter-latin-600-normal.woff' },
  { weight: 700, file: 'inter-latin-700-normal.woff' },
  { weight: 800, file: 'inter-latin-800-normal.woff' },
];

function locateFile(file) {
  // 1) deep package resolution (works if @fontsource exposes ./files/*)
  try {
    return require.resolve(`@fontsource/inter/files/${file}`);
  } catch {}
  // 2) resolve the package root via package.json, then join
  try {
    const pkg = require.resolve('@fontsource/inter/package.json');
    const p = join(dirname(pkg), 'files', file);
    if (existsSync(p)) return p;
  } catch {}
  // 3) hoisted root node_modules (npm workspaces) + local fallbacks
  const candidates = [
    resolve(__dirname, '..', '..', '..', 'node_modules', '@fontsource', 'inter', 'files', file),
    resolve(__dirname, '..', '..', 'node_modules', '@fontsource', 'inter', 'files', file),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

let cached = null;

export function getFonts() {
  if (cached) return cached;
  const fonts = [];
  for (const w of WEIGHTS) {
    const p = locateFile(w.file);
    if (!p) continue;
    try {
      fonts.push({ name: 'Inter', data: readFileSync(p), weight: w.weight, style: 'normal' });
    } catch {}
  }
  if (fonts.length === 0) {
    throw new Error('[og] no Inter .woff font files found for Satori');
  }
  cached = fonts;
  return cached;
}
