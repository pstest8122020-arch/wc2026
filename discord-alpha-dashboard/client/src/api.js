const base = '';

async function get(path) {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const getOverview = () => get('/api/overview');
export const getSeries = () => get('/api/series');
export const getCallers = (channel) =>
  get('/api/callers' + (channel ? `?channel=${encodeURIComponent(channel)}` : ''));
export const getInsights = () => get('/api/insights');
export const getPredictionCallers = () => get('/api/prediction-callers');
export const getReddit = () => get('/api/reddit');
