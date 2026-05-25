const BASE = '';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
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
  bracket: () => request('/api/bracket'),
  leaderboard: () => request('/api/leaderboard'),
  participant: (discord) => request(`/api/participants/${encodeURIComponent(discord)}`),
  submitPredictions: (payload) =>
    request('/api/predictions', { method: 'POST', body: JSON.stringify(payload) }),
  extendPredictions: (payload) =>
    request('/api/predictions/extend', { method: 'POST', body: JSON.stringify(payload) }),
  submitPlayerPicks: (payload) =>
    request('/api/player-picks', { method: 'POST', body: JSON.stringify(payload) }),
  matchPlayerPicks: (matchId) =>
    request(`/api/player-picks/${matchId}`),
  myPlayerPick: (discord, matchId) =>
    request(`/api/player-picks/mine/${encodeURIComponent(discord)}/${matchId}`),

  admin: {
    stats: (token) =>
      request('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
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
  },
};
