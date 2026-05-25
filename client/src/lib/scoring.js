// Mirror of server scoring.js -- DO NOT use as the source of truth.
// Used only for client-side previews (e.g. "if your pick is right, you'd get X").

export function scorePoints(predHome, predAway, actualHome, actualAway, multiplier) {
  if (actualHome === null || actualHome === undefined) return 0;
  if (actualAway === null || actualAway === undefined) return 0;
  const m = multiplier || 1;
  if (predHome === actualHome && predAway === actualAway) return 3 * m;
  const predResult = Math.sign(predHome - predAway);
  const actualResult = Math.sign(actualHome - actualAway);
  if (predResult === actualResult) return 1 * m;
  return 0;
}

export function prizeFor(rank) {
  if (rank === 1) return 500;
  if (rank === 2) return 250;
  if (rank === 3) return 150;
  if (rank >= 4 && rank <= 10) return 50;
  if (rank >= 11 && rank <= 25) return 25;
  if (rank >= 26 && rank <= 50) return 15;
  return 0;
}

export function formatKickoff(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date} · ${time} UTC`;
}
