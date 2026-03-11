// ui/gameOverPopup.js

import { toggleGames } from '/ui/toggleGames.js';
import gameSession from '/state/gameSession.js';

/**
 * Shows a game result overlay with Retry and New Game buttons.
 *
 * @param {string} title
 * @param {string} customMessage
 * @param {boolean} resetStats - when true, Retry uses resetToBeforeGame().
 */
export function showGameOverPopup(
  title = 'Oh no!',
  customMessage = "You've run out of lives.",
  resetStats = false
) {
  if (document.getElementById('gameOverOverlay')) return;

  const isFailure = resetStats === false;
  const animationPath = isFailure
    ? '/utils/assets/heartbreak.json'
    : '/utils/assets/heart.json';
  const accentColor = isFailure ? '#1aa179' : '#0a4d68';

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

  // Build dialog content via DOM to avoid innerHTML injection
  const animDiv = document.createElement('div');
  animDiv.id = 'gameOverAnim';
  Object.assign(animDiv.style, { width: '96px', height: '96px', margin: '0 auto 14px' });

  const heading = document.createElement('h2');
  Object.assign(heading.style, { margin: '0 0 6px', fontSize: '22px', fontWeight: '700', color: accentColor });
  heading.textContent = title;

  const msg = document.createElement('p');
  Object.assign(msg.style, { margin: '0 0 22px', fontSize: '15px', color: '#555', lineHeight: '1.5' });
  msg.textContent = customMessage;

  const btnWrap = document.createElement('div');
  Object.assign(btnWrap.style, { display: 'flex', flexDirection: 'column', gap: '12px' });

  const retryBtn = document.createElement('button');
  retryBtn.id = 'retryBtn';
  Object.assign(retryBtn.style, {
    padding: '12px', borderRadius: '10px', border: 'none',
    background: 'linear-gradient(135deg,#0a4d68,#0d6efd)',
    color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer'
  });
  retryBtn.textContent = 'Play Again';

  const newGameBtn = document.createElement('button');
  newGameBtn.id = 'newGameBtn';
  Object.assign(newGameBtn.style, {
    padding: '12px', borderRadius: '10px', border: '1px solid #ddd',
    background: '#f9f9f9', color: '#333', fontSize: '14px', cursor: 'pointer'
  });
  newGameBtn.textContent = 'Choose Different Game';

  btnWrap.appendChild(retryBtn);
  btnWrap.appendChild(newGameBtn);
  dialog.appendChild(animDiv);
  dialog.appendChild(heading);
  dialog.appendChild(msg);
  dialog.appendChild(btnWrap);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  if (window.lottie?.loadAnimation) {
    window.lottie.loadAnimation({
      container: animDiv,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: animationPath
    });
  }

  retryBtn.onclick = async () => {
    closePopup();
    if (resetStats) {
      await gameSession.resetToBeforeGame();
    } else {
      await gameSession.restartGameOnly();
    }
  };

  newGameBtn.onclick = () => {
    closePopup();
    toggleGames('selector');
  };

  function closePopup() {
    overlay.remove();
    document.body.classList.remove('modal-open');
  }
}
