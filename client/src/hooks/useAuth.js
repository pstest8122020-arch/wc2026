import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Reads the "Log in with Discord" session state from /api/auth/discord/me.
//   { loading, configured, loggedIn, discord_id?, handle?, name?, refresh() }
// `configured` is false when the server has no DISCORD_CLIENT_ID set, so the UI
// can hide all login affordances and fall back to the legacy flow.
export function useAuth() {
  const [state, setState] = useState({ loading: true, configured: false, loggedIn: false });

  const refresh = useCallback(async () => {
    try {
      const r = await api.auth.me();
      setState({ loading: false, ...r });
    } catch {
      setState({ loading: false, configured: false, loggedIn: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore */
    }
    await refresh();
  }, [refresh]);

  return { ...state, refresh, logout };
}

// Full-page redirect URL that starts the Discord OAuth flow and returns the
// user to `returnTo` afterwards.
export function discordLoginUrl(returnTo) {
  const rt = returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/submit');
  return `/api/auth/discord/login?returnTo=${encodeURIComponent(rt)}`;
}
