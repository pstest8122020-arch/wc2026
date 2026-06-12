import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Refresh interval. Server caches for 60s, so polling more often is wasteful.
const REFRESH_MS = 60_000;

export function useJupiterOdds() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function load() {
      try {
        const result = await api.jupiterOdds();
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Failed to load odds');
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

  return { data, loading, error };
}
