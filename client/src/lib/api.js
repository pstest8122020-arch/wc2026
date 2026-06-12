const BASE = '';

// Tracked link to Jupiter Predictions: routes through GET /api/go, which logs the
// click server-side and 302-redirects. Counts every navigation through the link —
// middle-click / right-click→new-tab / keyboard — which the in-page beacon misses.
export function jupGo(event, url = 'https://jup.ag/prediction/world-cup') {
  return `/api/go?e=${encodeURIComponent(event)}&to=${encodeURIComponent(url)}`;
}

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin', // send the wc_sess login cookie on same-origin API calls
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    ...opts,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  matches: () => request('/api/matches'),
  // Fire-and-forget click beacon for outbound CTAs (never blocks navigation).
  // Records the originating page + destination URL alongside the event.
  trackClick: (event, meta = {}) => {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          target_url: meta.target_url || '',
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  },
  bracket: () => request('/api/bracket'),
  news: () => request('/api/news'),
  jupiterOdds: () => request('/api/jupiter/odds'),
  leaderboard: () => request('/api/leaderboard'),
  players: (q, team) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (team) p.set('team', team);
    return request(`/api/players?${p.toString()}`);
  },
  // Full rosters (both teams of a match) for the tap-to-pick player modal.
  squads: (teams) => request(`/api/squads?teams=${encodeURIComponent(teams.filter(Boolean).join(','))}`),
  participant: (discord, wallet) => {
    const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
    return request(`/api/participants/${encodeURIComponent(discord)}${qs}`);
  },
  myBracket: () => request('/api/participants/me'),
  bracketStructure: () => request('/api/bracket-structure'),
  getMyBracket: () => request('/api/my-bracket'),
  submitMyBracket: (payload) =>
    request('/api/my-bracket', { method: 'POST', body: JSON.stringify(payload) }),
  // Update only the wallet for the logged-in participant (re-checks eligibility).
  updateWallet: (wallet) =>
    request('/api/my-wallet', { method: 'POST', body: JSON.stringify({ wallet_address: wallet }) }),
  submitPredictions: (payload) =>
    request('/api/predictions', { method: 'POST', body: JSON.stringify(payload) }),
  extendPredictions: (payload) =>
    request('/api/predictions/extend', { method: 'POST', body: JSON.stringify(payload) }),
  updatePredictions: (payload) =>
    request('/api/predictions/update', { method: 'POST', body: JSON.stringify(payload) }),
  copyBracket: (discord, token) => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    return request(`/api/participants/${encodeURIComponent(discord)}/copy${qs}`);
  },
  mintShareToken: (discord, wallet) =>
    request(`/api/participants/${encodeURIComponent(discord)}/share-token`, {
      method: 'POST',
      body: JSON.stringify({ wallet_address: wallet }),
    }),
  revokeShareToken: (discord, wallet) =>
    request(`/api/participants/${encodeURIComponent(discord)}/share-token`, {
      method: 'DELETE',
      body: JSON.stringify({ wallet_address: wallet }),
    }),
  submitPlayerPicks: (payload) =>
    request('/api/player-picks', { method: 'POST', body: JSON.stringify(payload) }),
  matchPlayerPicks: (matchId) =>
    request(`/api/player-picks/${matchId}`),
  myPlayerPick: (discord, matchId, wallet) => {
    const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
    return request(`/api/player-picks/mine/${encodeURIComponent(discord)}/${matchId}${qs}`);
  },
  // Session-based prefill: the logged-in user's own saved pick + score for one match
  // (returns null if nothing saved). No wallet needed — identity comes from the session.
  myMatchPick: (matchId) => request(`/api/player-picks/mine/${matchId}`),
  // Session-based: ALL of the logged-in user's match picks (for the My Picks page).
  myPlayerPicks: () => request('/api/my-player-picks'),

  auth: {
    me: () => request('/api/auth/discord/me'),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
  },

  admin: {
    stats: (token) =>
      request('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
    sybilReport: (token) =>
      request('/api/admin/sybil-report', { headers: { Authorization: `Bearer ${token}` } }),
    setResult: (token, id, payload) =>
      request(`/api/admin/matches/${id}/result`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }),
    setPlayerResult: (token, id, payload) =>
      request(`/api/admin/matches/${id}/player-result`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }),
    getPlayerResult: (token, id) =>
      request(`/api/admin/matches/${id}/player-result`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    // ESPN scoring-play suggestion to pre-fill the player-result form.
    espnSuggest: (token, id) =>
      request(`/api/admin/matches/${id}/espn-suggest`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    setAwards: (token, payload) =>
      request('/api/admin/awards', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }),
    getAwards: (token) =>
      request('/api/admin/awards', { headers: { Authorization: `Bearer ${token}` } }),
    sync: (token) =>
      request('/api/admin/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    participants: (token) =>
      request('/api/admin/participants', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    recheckEligibility: (token, discord) =>
      request(`/api/admin/participants/${encodeURIComponent(discord)}/recheck`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    disqualify: (token, discord, reason) =>
      request(`/api/admin/participants/${encodeURIComponent(discord)}/disqualify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      }),
    reinstate: (token, discord) =>
      request(`/api/admin/participants/${encodeURIComponent(discord)}/reinstate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
  },
};
