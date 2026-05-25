import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSocket } from './useSocket.js';

export function useLeaderboard() {
  const [rows, setRows] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .leaderboard()
      .then((data) => {
        if (!mounted) return;
        setRows(data);
        setUpdatedAt(new Date());
        setLoading(false);
      })
      .catch(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  useSocket({
    'leaderboard:update': (payload) => {
      setRows(payload);
      setUpdatedAt(new Date());
    },
  });

  return { rows, updatedAt, loading };
}
