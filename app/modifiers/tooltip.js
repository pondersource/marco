import { modifier } from 'ember-modifier';

export default modifier((element) => {
  let tooltipEl = null;
  const portal = document.getElementById('modal-portal') || document.body;

  const show = () => {
    const text = element.getAttribute('aria-description');
    if (!text || tooltipEl) return;

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.textContent = text;
    portal.appendChild(tooltipEl);

    const rect = element.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const margin = 6;
    let top = rect.top - tipRect.height - margin;
    if (top < margin) top = rect.bottom + margin;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - tipRect.width - margin)
    );

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
  };

  const hide = () => {
    tooltipEl?.remove();
    tooltipEl = null;
  };

  element.addEventListener('mouseenter', show);
  element.addEventListener('mouseleave', hide);
  element.addEventListener('focus', show);
  element.addEventListener('blur', hide);

  return () => {
    element.removeEventListener('mouseenter', show);
    element.removeEventListener('mouseleave', hide);
    element.removeEventListener('focus', show);
    element.removeEventListener('blur', hide);
    hide();
  };
});
