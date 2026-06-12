import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Server caches the feed for 30 min, so polling every 15 min is plenty.
const REFRESH_MS = 15 * 60_000;

export function useNews() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function load() {
      try {
        const r = await api.news();
        if (cancelled) return;
        setData(r);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Failed to load news');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return {
    items: data?.items || [],
    source: data?.source || null,
    sourceUrl: data?.source_url || null,
    fetchedAt: data?.fetched_at || null,
    loading,
    error,
  };
}
