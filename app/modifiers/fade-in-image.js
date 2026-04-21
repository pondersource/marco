import { modifier } from 'ember-modifier';

export default modifier((element, [url]) => {
  if (!url) return;

  // Remove classes when URL changes
  element.classList.remove('loaded');
  element.classList.remove('loaded-instant');

  // Create an off-DOM image to reliably check cache status
  // without waiting for the actual DOM element to load it
  const img = new Image();
  img.src = url;

  if (img.complete) {
    // Already in browser cache, skip the animation
    element.classList.add('loaded-instant');
    return;
  }

  const handleLoad = () => {
    element.classList.add('loaded');
  };

  element.addEventListener('load', handleLoad);

  return () => {
    element.removeEventListener('load', handleLoad);
  };
});
