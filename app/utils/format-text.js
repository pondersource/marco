export function humanizeOsmTag(text) {
  if (typeof text !== 'string' || !text) return '';
  // Replace underscores and dashes with spaces
  const spaced = text.replace(/[_-]/g, ' ');
  // Capitalize first letter of each word (Title Case)
  return spaced.replace(/\w\S*/g, (w) =>
    w.replace(/^\w/, (c) => c.toUpperCase())
  );
}

export function capitalize(text) {
  if (typeof text !== 'string' || !text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatRelativeDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
