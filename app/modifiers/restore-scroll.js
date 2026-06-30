import { modifier } from 'ember-modifier';

export default modifier((element, [scrollTop]) => {
  if (element && typeof scrollTop === 'number' && scrollTop > 0) {
    // Restore inside requestAnimationFrame to guarantee layout rendering is ready
    requestAnimationFrame(() => {
      element.scrollTop = scrollTop;
    });
  }
});
