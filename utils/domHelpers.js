export function $(selector) {
  return document.querySelector(selector);
}

export function hide(...elements) {
  elements.forEach(el => el && (el.style.display = 'none'));
}

export function show(el, display = 'block') {
  if (el) el.style.display = display;
}
