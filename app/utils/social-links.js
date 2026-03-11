// Helper to get value from multiple keys
const get = (tags, ...keys) => {
  for (const k of keys) {
    if (tags[k]) return tags[k];
  }
  return null;
};

export function getSocialInfo(tags, platform) {
  if (!tags) return null;

  const key = platform;
  const domain = `${platform}.com`;
  const val = get(tags, `contact:${key}`, key);

  if (!val) return null;

  // Check if it's a full URL
  if (val.startsWith('http')) {
    try {
      const url = new URL(val);

      // Handle Facebook profile.php?id=...
      if (
        platform === 'facebook' &&
        url.pathname === '/profile.php' &&
        url.searchParams.has('id')
      ) {
        return {
          url: val,
          username: url.searchParams.get('id'),
        };
      }

      // Clean up pathname to get username
      let username = url.pathname.replace(/^\/|\/$/g, '');
      return {
        url: val,
        username: username || val, // Fallback to full URL if path is empty
      };
    } catch {
      return { url: val, username: val };
    }
  }

  // Assume it's a username
  const username = val.replace(/^@/, ''); // Remove leading @
  return {
    url: `https://${domain}/${username}`,
    username: username,
  };
}
