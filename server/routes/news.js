import { Router } from 'express';
import { getNews } from '../services/news.js';

const router = Router();

// GET /api/news — cached WC 2026 headlines (Guardian RSS), read-only, public.
router.get('/news', async (req, res) => {
  try {
    const { items, fetchedAt, error } = await getNews();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      items: items || [],
      updated_at: fetchedAt ? new Date(fetchedAt).toISOString() : null,
      error: error || null,
    });
  } catch {
    res.json({ items: [], updated_at: null, error: 'unavailable' });
  }
});

export default router;
