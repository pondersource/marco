import { modifier } from 'ember-modifier';

export default modifier((element, [callback]) => {
  const handler = (event) => {
    // Check if the click target is contained within the element
    if (element && !element.contains(event.target)) {
      callback(event);
    }
  };

  // Delay attaching the listener to avoid catching the opening click
  // (using a microtask or setTimeout 0)
  const timer = setTimeout(() => {
    document.addEventListener('click', handler);
  }, 0);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('click', handler);
  };
});
