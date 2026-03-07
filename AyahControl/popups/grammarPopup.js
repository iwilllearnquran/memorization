import { grammarExplanations } from './grammarContent.js';

export function showGrammarPopup(type) {
  const popup = document.getElementById('popupContent');
  const overlay = document.getElementById('overlay');

  popup.innerHTML = grammarExplanations[type];
  popup.style.display = 'block';
  overlay.style.display = 'block';
}
