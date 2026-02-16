import { grammarExplanations } from './grammarContent.js';

const boundOverlays = new WeakSet();

export function closeGrammarPopup() {
  const popup = document.getElementById('popupContent');
  const overlay = document.getElementById('overlay');

  if (!popup || !overlay) {
    return;
  }

  popup.innerHTML = '';
  popup.style.display = 'none';
  overlay.style.display = 'none';
}

export function showGrammarPopup(type) {
  const popup = document.getElementById('popupContent');
  const overlay = document.getElementById('overlay');

  if (!popup || !overlay) {
    return;
  }

  const content = grammarExplanations[type];

  if (content === null || content === undefined) {
    // Unknown or missing type: clear any stale content and hide the popup.
    popup.innerHTML = '';
    popup.style.display = 'none';
    overlay.style.display = 'none';
    return;
  }

  popup.innerHTML = content;
  popup.style.display = 'block';
  overlay.style.display = 'block';

  // Attach overlay click handler once, to allow closing the popup.
  if (!boundOverlays.has(overlay)) {
    overlay.addEventListener('click', closeGrammarPopup);
    boundOverlays.add(overlay);
  }
}
