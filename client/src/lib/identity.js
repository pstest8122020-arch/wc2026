// Stores the user's (discord, wallet) locally so MyPicks / MatchPicks can
// transparently prove ownership to the API. localStorage only — no cookies,
// no exposure to the server beyond the explicit request params.

const KEY = 'jcpc_identity_v1';

export function getIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.discord || !v?.wallet) return null;
    return v;
  } catch {
    return null;
  }
}

export function setIdentity({ discord, wallet }) {
  if (!discord || !wallet) return;
  localStorage.setItem(KEY, JSON.stringify({ discord, wallet }));
}

export function clearIdentity() {
  localStorage.removeItem(KEY);
}
