import { modifier } from 'ember-modifier';

export default modifier((element, [callback, disabled]) => {
  if (disabled) return;

  let observer;
  let cancelled = false;

  observer = new IntersectionObserver(
    (entries) => {
      if (cancelled) return;
      if (entries[0]?.isIntersecting) {
        callback();
      }
    },
    {
      root: null,
      rootMargin: '200px',
      threshold: 0,
    }
  );

  observer.observe(element);

  return () => {
    cancelled = true;
    if (observer) {
      observer.disconnect();
    }
  };
});
