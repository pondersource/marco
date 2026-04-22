import { modifier } from 'ember-modifier';

const CACHE_NAME = 'nostr-image-cache-v1';

export default modifier((element, [url]) => {
  let objectUrl = null;

  async function loadImage() {
    if (!url) {
      element.src = '';
      return;
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(url);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        objectUrl = URL.createObjectURL(blob);
        element.src = objectUrl;
        return;
      }

      // Not in cache, try to fetch it
      // eslint-disable-next-line warp-drive/no-external-request-patterns
      const response = await fetch(url, {
        mode: 'cors', // Required to read the blob for caching
        credentials: 'omit',
      });

      if (response.ok) {
        // Clone the response before reading the blob because a response stream can only be read once
        const cacheResponse = response.clone();
        await cache.put(url, cacheResponse);

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        element.src = objectUrl;
      } else {
        // Fetch failed (e.g. 404), fallback to standard browser loading
        element.src = url;
      }
    } catch (error) {
      // CORS errors or network failures will land here.
      // Fallback to letting the browser handle it directly.
      console.warn(
        `Failed to cache image ${url}, falling back to standard src`,
        error
      );
      element.src = url;
    }
  }

  loadImage();

  // Cleanup: revoke the object URL when the element is destroyed or the URL changes
  return () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };
});
