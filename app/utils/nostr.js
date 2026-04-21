export function normalizeRelayUrl(url) {
  if (!url) return '';
  let normalized = url.trim().toLowerCase();
  if (!normalized) return '';

  if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
    normalized = 'wss://' + normalized;
  }

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
