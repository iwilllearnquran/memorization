import { toggleGames } from '/ui/toggleGames.js';

/**
 * Shows a modal popup when a game completes or when guest needs to log in.
 * @param {string} messageHtml - HTML string for the content of the popup.
 * @param {object} [options]
 * @param {boolean} [options.hideContinue=false] - if true, hides the Continue button.
 */
export function showCompletionPopup(messageHtml, options = {}) {
  const { hideContinue = false } = options;

  // 1️⃣ Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'gameCompletionPopup';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '10000'
  });

  // 2️⃣ Create popup container
  const popup = document.createElement('div');
  popup.id = 'messageBox';
  Object.assign(popup.style, {
    background: '#fff',
    padding: '24px',
    borderRadius: '8px',
    maxWidth: '400px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
  });

  // 3️⃣ Insert HTML message safely
  const msgContainer = document.createElement('div');
  msgContainer.innerHTML = messageHtml;
  msgContainer.style.marginBottom = '16px';
  popup.appendChild(msgContainer);

  // 4️⃣ Optionally add Continue button
  if (!hideContinue) {
    const continueBtn = document.createElement('button');
    continueBtn.id = 'closePopupBtn';
    continueBtn.className = 'game-play-btn';
    continueBtn.textContent = 'Continue';
    continueBtn.style.marginTop = '12px';
    popup.appendChild(continueBtn);

    continueBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      toggleGames('selector');
    });
  }

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}
