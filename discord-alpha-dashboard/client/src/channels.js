// Display config per alpha channel.
export const CHANNELS = {
  'token-trading': { label: 'token-trading', emoji: '🪙', color: '#f5a623' },
  'stock-trading': { label: 'stock-trading', emoji: '📰', color: '#4f9dff' },
  'yield-hunting': { label: 'yield-hunting', emoji: '📈', color: '#34d399' },
  'prediction-alpha': { label: 'prediction-alpha', emoji: '🔎', color: '#c084fc' },
};

export const META = (name) =>
  CHANNELS[name] || { label: name, emoji: '•', color: '#8a97a8' };

export const ORDER = ['token-trading', 'stock-trading', 'yield-hunting', 'prediction-alpha'];
