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
export function showGameOverPopup(
  
  title = 'Oh no!',
  customMessage = 'You’ve run out of lives.',
  resetStats = false
) {

  const isSuccess = resetStats === false;
  const icon = isSuccess ? '💔' : '💖';
  const accentColor = isSuccess ? '#1aa179' : '#0a4d68';
  // prevent duplicates
  if (document.getElementById('gameOverOverlay')) return;

  // 🔒 lock background scroll

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'gameOverOverlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000
  });

  // Dialog
  const dialog = document.createElement('div');
Object.assign(dialog.style, {
  background: '#fff',
  borderRadius: '18px',
  padding: '26px 22px',
  width: '90%',
  maxWidth: '360px',
  textAlign: 'center',
  position: 'relative',
  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  animation: 'modalPop 0.25s ease-out'
});


  dialog.innerHTML = `
  <!-- Close -->
  <button
    id="gameOverClose"
    style="
      position:absolute;
      top:14px;
      right:14px;
      border:none;
      background:none;
      font-size:22px;
      color:#999;
      cursor:pointer;
    "
  >✕</button>

<!-- Icon -->
<div style="
  font-size:48px;
  margin-bottom:10px;
">
  ${icon}
</div>

<!-- Title -->
<h2 style="
  margin:0 0 6px;
  font-size:22px;
  font-weight:700;
  color:${accentColor};
">
  ${title}
</h2>


  <!-- Message -->
  <p style="
    margin:0 0 22px;
    font-size:15px;
    color:#555;
    line-height:1.5;
  ">
    ${customMessage}
  </p>

  <!-- Actions -->
  <div style="
    display:flex;
    flex-direction:column;
    gap:12px;
  ">
    <button
      id="retryBtn"
      style="
        padding:12px;
        border-radius:10px;
        border:none;
        background:linear-gradient(135deg,#0a4d68,#0d6efd);
        color:#fff;
        font-size:15px;
        font-weight:600;
        cursor:pointer;
      "
    >
      🔁 Play Again
    </button>

    <button
      id="newGameBtn"
      style="
        padding:12px;
        border-radius:10px;
        border:1px solid #ddd;
        background:#f9f9f9;
        color:#333;
        font-size:14px;
        cursor:pointer;
      "
    >
      🎮 Choose Different Game
    </button>
  </div>
`;


  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ❌ Close (just dismiss)
  dialog.querySelector('#gameOverClose').onclick = closePopup;

  // 🟢 Retry
  dialog.querySelector('#retryBtn').onclick = async () => {
    closePopup();
    if (resetStats) {
      await gameSession.resetToBeforeGame();
    } else {
      await gameSession.restartGameOnly();
    }
  };

  // 🎮 New Game
  dialog.querySelector('#newGameBtn').onclick = () => {
    closePopup();
    toggleGames('selector');
  };

  function closePopup() {
    overlay.remove();
     document.body.classList.remove('modal-open');
}
}
