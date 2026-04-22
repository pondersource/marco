import { modifier } from 'ember-modifier';

export default modifier((element, [url]) => {
  if (!url) return;

  // Remove classes when URL changes
  element.classList.remove('loaded');
  element.classList.remove('loaded-instant');

  let observer;

  const handleLoad = () => {
    // Only apply the fade-in animation if it wasn't already loaded instantly
    if (!element.classList.contains('loaded-instant')) {
      element.classList.add('loaded');
    }
  };

  element.addEventListener('load', handleLoad);

  const loadWhenVisible = (entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Stop observing once we start loading
        obs.unobserve(element);

        // Check if the image is already in the browser cache
        // Create an off-DOM image to reliably check cache status
        // without waiting for the actual DOM element to load it
        const img = new Image();
        img.src = url;

        if (img.complete) {
          // Already in browser cache, skip the animation
          element.classList.add('loaded-instant');
        }

        // If this image is inside a <picture> tag, we also need to swap <source> tags
        const parent = element.parentElement;
        if (parent && parent.tagName === 'PICTURE') {
          const sources = parent.querySelectorAll('source');
          sources.forEach((source) => {
            if (source.dataset.srcset) {
              source.srcset = source.dataset.srcset;
            }
          });
        }

        // Swap data-src to src to trigger the actual network fetch (or render from cache)
        if (element.dataset.src) {
          element.src = element.dataset.src;
        } else {
          // Fallback if data-src wasn't used but the modifier was called
          element.src = url;
        }
      }
    });
  };

  // Setup Intersection Observer to only load when the image enters the viewport
  observer = new IntersectionObserver(loadWhenVisible, {
    root: null, // Use the viewport as the root
    rootMargin: '100px 100%', // Load one full viewport width ahead/behind
    threshold: 0, // Trigger immediately when any part enters the expanded margin
  });

  observer.observe(element);

  return () => {
    element.removeEventListener('load', handleLoad);
    if (observer) {
      observer.disconnect();
    }
  };
});
