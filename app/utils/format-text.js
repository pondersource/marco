export function humanizeOsmTag(text) {
  if (typeof text !== 'string' || !text) return '';
  // Replace underscores and dashes with spaces
  const spaced = text.replace(/[_-]/g, ' ');
  // Capitalize first letter of each word (Title Case)
  return spaced.replace(/\w\S*/g, (w) =>
    w.replace(/^\w/, (c) => c.toUpperCase())
  );
}
