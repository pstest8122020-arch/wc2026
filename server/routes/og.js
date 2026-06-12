import { Router } from 'express';
import { createHash } from 'node:crypto';
import { getRankData, getMomentData } from '../services/og/cardData.js';
import { rankCard, momentCard } from '../services/og/cards.js';
import { renderPng } from '../services/og/render.js';

const router = Router();

function etagFor(tag, version) {
  return '"' + createHash('sha1').update(`${tag}:${version}`).digest('hex').slice(0, 16) + '"';
}

function setImageHeaders(res, etag) {
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=300');
  // OG images are fetched cross-origin by link crawlers / embedded elsewhere.
  // helmet sets CORP same-origin globally, so relax it just for these images.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'image/png');
}

// All card routes share the same shape: resolve data from the DB (never from
// query params), ETag-revalidate, then render the Satori card to PNG.
function cardRoute(tag, getData, buildCard) {
  return async (req, res) => {
    let data;
    try {
      data = getData(req.params);
    } catch (e) {
      console.error(`[og] ${tag} data error:`, e.message);
      return res.status(500).json({ error: 'data error' });
    }
    if (!data) return res.status(404).json({ error: 'Not found' });

    const etag = etagFor(tag, data.version);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    try {
      const png = await renderPng(buildCard(data));
      setImageHeaders(res, etag);
      return res.end(png);
    } catch (e) {
      console.error(`[og] ${tag} render failed:`, e.message);
      return res.status(500).json({ error: 'render failed' });
    }
  };
}

router.get('/rank/:handle', cardRoute('rank', (p) => getRankData(p.handle), rankCard));
router.get('/moment/:id', cardRoute('moment', (p) => getMomentData(Number(p.id)), momentCard));

export default router;
