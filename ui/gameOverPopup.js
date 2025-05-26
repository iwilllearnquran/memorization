// ui/gameOverPopup.js

import { toggleGames }   from '/ui/toggleGames.js';
import gameSession       from '/state/gameSession.js';
import { updateStats }   from '/ui/gameStatsUI.js';

/**
 * Shows a “Game Over” overlay with Retry and New Game buttons.
 * Keeps itself UI-agnostic: it only resets state or switches back
 * to the selector. The actual game-type restart is handled by
 * gameSession.resetToBeforeGame(), which knows how to rebuild
 * the correct game UI.
 */
export function showGameOverPopup(title = 'Oh no!',customMessage = 'You’ve run out of lives.', resetStats = true) {
  // 1️⃣ Create the semi-opaque overlay
  const overlay = document.createElement('div');
  overlay.id = 'gameOverPopup';
  Object.assign(overlay.style, {
    position:       'fixed',
    top:            0,
    left:           0,
    right:          0,
    bottom:         0,
    background:     'rgba(0,0,0,0.7)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         '10000'
  });

  // 2️⃣ Create the dialog box
  const dialog = document.createElement('div');
  Object.assign(dialog.style, {
    background:   '#fff',
    padding:      '24px',
    borderRadius: '8px',
    textAlign:    'center',
    maxWidth:     '320px',
    width:        '80%'
  });
  dialog.innerHTML = `
    <h2>${title}</h2>
    <p>${customMessage}</p>
    <button id="retryBtn" class="game-play-btn-verbs">Retry</button>
    <button id="newGameBtn" class="game-play-btn-verbs" style="margin-left:8px">New Game</button>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 3️⃣ Wire the Retry button
  const retryBtn = dialog.querySelector('#retryBtn');
  dialog.querySelector('#retryBtn').addEventListener('click', async () => {
    overlay.remove();
    if (resetStats) {
      await gameSession.resetToBeforeGame();  // Reset points & restart game
    } else {
      await gameSession.restartGameOnly();  // Preserve points, just restart
    }
  });

  // 4️⃣ Wire the New Game button
  const newGameBtn = dialog.querySelector('#newGameBtn');
  newGameBtn.addEventListener('click', () => {
    overlay.remove();             // remove the popup
    toggleGames('selector');      // go back to the game selector
  });
}
