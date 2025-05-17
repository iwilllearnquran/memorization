// ui/gameCompletionUI.js

import gameSession from '/state/gameSession.js';
import { saveScore } from '/services/firestoreService.js';
import { getAuth }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { toggleGames }  from '/ui/toggleGames.js';

/**
 * Shows a modal popup when a game completes, with a "Claim Points" button.
 * @param {string} message - The completion message to display.
 */
export function showCompletionPopup(message) {
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

  // 2️⃣ Create popup content
  const popup = document.createElement('div');
  Object.assign(popup.style, {
    background: '#fff',
    padding: '24px',
    borderRadius: '8px',
    maxWidth: '400px',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
  });
  popup.innerHTML = `
    <p style="font-size:18px; margin-bottom:16px;">${message}</p>
    <button id="claimPointsBtn"  class="game-play-btn" style="margin-top: 12px;">
      Claim Ajr Points
    </button>
  `;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // 3️⃣ Wire up Claim Points
document.getElementById('claimPointsBtn')
    .addEventListener('click', async () => {
      const user = getAuth().currentUser;
      if (!user) {
        alert('Please log in to claim your Ajr points.');
        return;
      }
      try {
        await saveScore(user.uid, gameSession.score);
        alert('Ajr points claimed successfully! 🎉');
      } catch (e) {
        console.error('Error saving points:', e);
        alert('Failed to claim points.');
      }
      // Remove popup
      document.body.removeChild(overlay);
      
      // ⬆⬆ After removing, go back to the selector menu:
      toggleGames('selector');
    });
}
