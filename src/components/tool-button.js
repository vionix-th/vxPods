/**
 * Compact icon-only action for repeated, unambiguous utility controls.
 * @param {{ label: string, glyph: string, className?: string, onClick?: () => void }} args
 */
export function createToolButton({ label, glyph, className = '', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `tool-button ${className}`.trim();
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = glyph;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}
