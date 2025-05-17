// ui/gameOverPopup.js

import { toggleGames }      from '/ui/toggleGames.js';
import gameSession          from '/state/gameSession.js';
import { updateStats }      from '/ui/gameStatsUI.js';

export function showGameOverPopup() {
  // 1️⃣ Build overlay
  const overlay = document.createElement('div');
  overlay.id = 'gameOverPopup';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '10000'
  });

  // 2️⃣ Build dialog
  const dialog = document.createElement('div');
  Object.assign(dialog.style, {
    background: '#fff',
    padding: '24px',
    borderRadius: '8px',
    textAlign: 'center',
    maxWidth: '320px'
  });
  dialog.innerHTML = `
    <h2>Oh no!</h2>
    <p>You’ve run out of lives.</p>
    <button id="retryBtn"  class="game-play-btn">Retry</button>
    <button id="newGameBtn"  class="game-play-btn" style="margin-left:8px">New Game</button>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 3️⃣ Wire buttons
  document.getElementById('retryBtn')
    .addEventListener('click', () => {
      // reset session with fresh lives, same game type
      gameSession.init(gameSession.type);
      updateStats();
      toggleGames(gameSession.type);
      document.body.removeChild(overlay);
    });

  document.getElementById('newGameBtn')
    .addEventListener('click', () => {
      toggleGames('selector');
      document.body.removeChild(overlay);
    });
}
