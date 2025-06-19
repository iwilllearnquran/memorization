// src/state/gameSession.js

// — Internal UI & config imports
import { updateStats } from '/ui/gameStatsUI.js';
import { GAME_CONFIG } from '/config/gameConfig.js';
import { showCompletionPopup } from '/ui/gameCompletionUI.js';
import { StreakUI } from '/ui/StreakLogicAndUI.js';
import { toggleGames } from '/ui/toggleGames.js';
import { startArrangeGame }    from '/ui/arrangeGameUI.js';
import { startVerbGame }       from '/ui/verbMatchUI.js';
import { showGameOverPopup } from '/ui/gameOverPopup.js';

// — Firestore & Auth (only used in authenticated flow via postMessage)
import { auth, loadStatsFromFirestore, saveStatsToFirestore, recordStreak,
  addCompletedAyahToFirestore 
 } from '/services//_private/firestoreService.js';

// — Local storage guest session helpers
import { initGuestSession, addGuestPoints, recordGuestStreak, getGuestStats } from '/services/localStorageSession.js';

class GameSession {
  constructor() {
    this.score = 0;                 // total saved score for real user
    this.sessionScore = 0;          // points earned this play
    this.lastSavedScore = 0;
    this.lives = GAME_CONFIG.maxLives;
  }

  /**
   * Initialize a new game session: resets lives and scores.
   * For authenticated users, loads saved total score.
   */
  async init(type) {
    console.log('[GameSession] init() called with type:', type);
    this.type = type;                         // ← remember which game we’re in
    this.lives = GAME_CONFIG.maxLives;
    this.sessionScore = 0;
    console.log('[GameSession] lives reset to', this.lives, 'sessionScore reset to', this.sessionScore);
  
    if (auth.currentUser) {
      console.log('[GameSession] user is authenticated; loading Firestore score…');
      try {
        const { score } = await loadStatsFromFirestore();
        this.score = this.lastSavedScore = score;
        console.log('[GameSession] Firestore score loaded:', score);
      } catch (err) {
        console.error('⚠️ Failed to load stats from Firestore:', err);
      }
    } else if (localStorage.getItem('isGuest')) {
      console.log('[GameSession] guest session detected; loading localStorage stats…');
      const { points, streakHistory } = getGuestStats();
      this.score = this.lastSavedScore = points;
      console.log('[GameSession] Guest points:', points, 'Guest streak length:', streakHistory.length);
    } else {
      console.log('[GameSession] no user & no guest flag; starting fresh guest session');
      this.score = this.lastSavedScore = 0;
    }
  
    updateStats();
    console.log('[GameSession] init() complete — score:', this.score, 'lastSavedScore:', this.lastSavedScore);
  }
  /**
   * Award points for a correct action.
   */
  addPoints(points = GAME_CONFIG.correctActionPoints) {
    this.sessionScore += points;
    if (auth.currentUser) {
      this.score += points;
    } else if (localStorage.getItem('isGuest')) {
      this.score += points;
      addGuestPoints(points);
      recordGuestStreak();
    }
    updateStats();
  }

  /**
   * Deduct a life on incorrect action.
   */
  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    updateStats();
  }

  /**
   * Ends the session, handling both guest and authenticated flows.
   */
async end(success = true) {
  console.log('[GameSession] end()', { success, sessionScore: this.sessionScore });
  if (!success) return;

  const pendingPoints = this.sessionScore;

  // 4a. Guest vs. Auth check
  if (!auth.currentUser) {
    // If they've already chosen guest before, skip dialog
    if (localStorage.getItem('isGuest')) {
      continueAsGuestFlow(pendingPoints, window.currentSurah, window.currentAyah);
        showGameOverPopup(
    `Nice work!`,
    `You've earned ${pendingPoints} points and kept your streak alive.`,
    true
  );
      return;
    }

    // Otherwise, show dialog and branch on choice
    const choice = await showCompletionDialog(pendingPoints);
    if (choice === 'guest') {
      continueAsGuestFlow(pendingPoints, window.currentSurah, window.currentAyah);
    } else {
      triggerLoginFlow();
    }
    return;
  }

  // 4b. Authenticated user flow
try {
  await saveStatsToFirestore({ score: this.score });
  const { updated, oldLength, newLength } = await recordStreak();
  if (updated) StreakUI.renderPopup(true, oldLength, newLength);
  await addCompletedAyahToFirestore({
    surah: window.currentSurah,
    ayah:  window.currentAyah
  });

    showGameOverPopup(
    `Nice work!`,
    `You've earned ${pendingPoints} points and kept your streak alive.`,
    true
  );
} catch (err) {
  console.error('❌ Error ending session:', err);
}

}
  






  /**
   * Reset in-memory score/lives if user aborts mid-game.
   */
  async resetToBeforeGame() {
    // 1️⃣ Roll back to last saved score & full lives
    this.score        = this.lastSavedScore;
    this.sessionScore = 0;                      // clear any in-flight points
    this.lives        = GAME_CONFIG.maxLives;
    console.log(
      '[GameSession] after reset →',
      'score=', this.score,
      'sessionScore=', this.sessionScore,
      'lives=', this.lives
    );
  
    // 2️⃣ Refresh the header UI
    updateStats();
  
    // 3️⃣ Show the correct game panel
    toggleGames(this.type);
  
    // 4️⃣ Re-launch the actual game builder
    if (this.type === 'arrange') {
      await startArrangeGame();
    } else if (this.type === 'verb') {
      await startVerbGame();
    }
  }

  async restartGameOnly() {
    console.log('[GameSession] restartGameOnly() triggered');
  
    // 1️⃣ Reset just lives
    this.lives = GAME_CONFIG.maxLives;
  
    // 2️⃣ Save the current score if needed
    if (auth.currentUser) {
      try {
        await saveStatsToFirestore({ score: this.score });
        console.log('[GameSession] Saved score to Firestore:', this.score);
      } catch (err) {
        console.error('❌ Failed to save score to Firestore:', err);
      }
    } else if (localStorage.getItem('isGuest')) {
      try {
        localStorage.setItem('guestPoints', this.score.toString());
        console.log('[GameSession] Saved score to localStorage:', this.score);
      } catch (err) {
        console.error('❌ Failed to save score to localStorage:', err);
      }
    }
  
    // 3️⃣ Refresh UI
    updateStats();
  
    // 4️⃣ Re-show the current game panel
    toggleGames(this.type);
  
    // 5️⃣ Re-launch the actual game
    if (this.type === 'arrange') {
      await startArrangeGame();
    } else if (this.type === 'verb') {
      await startVerbGame();
    } else {
      console.warn('[GameSession] Unknown game type:', this.type);
    }
  }
  
}


export default new GameSession();

// ─── Global iframe listener ───
window.addEventListener('message', e => {
  if (e.data?.type === 'streakRecorded' && e.data.updated) {
    const { oldLength, newLength } = e.data;
    StreakUI.renderPopup(true, oldLength, newLength);
  }
});

function showCompletionDialog(pendingPoints) {
  return new Promise(resolve => {
    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'completionModal';
    modal.style = `
      position: fixed; top:0; left:0; right:0; bottom:0;
      background: rgba(0,0,0,0.6); display:flex;
      justify-content:center; align-items:center; z-index:1000;
    `;
    modal.innerHTML = `
      <div style="background:#fff; padding:24px; border-radius:8px; text-align:center; max-width:320px;">
        🎉 You’ve earned <strong>${pendingPoints}</strong> points and a streak!<br><br>
        <button id="loginGuestBtn"
                style="margin:8px;padding:8px 16px;border:none;background:#0a4d68;color:#fff;border-radius:6px;cursor:pointer;">
          Log in to save progress
        </button>
        <button id="continueGuestBtn"
                style="margin:8px;padding:8px 16px;border:none;background:#eee;color:#333;border-radius:6px;cursor:pointer;">
          Continue as guest
        </button>
      </div>
    `;
    document.body.append(modal);

    // Handle clicks
    modal.querySelector('#loginGuestBtn')
      .addEventListener('click', () => {
        modal.remove();
        resolve('login');
      }, { once: true });

    modal.querySelector('#continueGuestBtn')
      .addEventListener('click', () => {
        modal.remove();
        resolve('guest');
      }, { once: true });
  });
}

// ─── 2. Guest‐flow function ───────────────────────────────────────────────────
function continueAsGuestFlow(points, surah, ayah) {
  console.log('[Guest] Continuing as guest…');
  console.log('[Guest] Surah:', surah, 'Ayah:', ayah);

  addGuestPoints(points);
  recordGuestStreak();

  if (!surah || !ayah) {
    console.warn('⚠️ Missing surah or ayah, not recording completion.');
    return;
  }

  const key = 'completedAyahs';
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  const alreadyDone = list.some(x => x.surah === surah && x.ayah === ayah);

  if (!alreadyDone) {
    list.push({ surah, ayah });
    localStorage.setItem(key, JSON.stringify(list));
    console.log(`[Guest] ✅ Completed ayah saved: Surah ${surah}, Ayah ${ayah}`);
  }
}



// ─── 3. Login‐flow function ───────────────────────────────────────────────────
function triggerLoginFlow() {
  console.log('[GameSession] triggerLoginFlow()');
  window.parent.postMessage({ type: 'loginRequest' }, '*');

const onUserLoggedIn = e => {
  if (e.data?.type === 'userLoggedIn') {
    console.log('[GameSession] userLoggedIn received');
    window.removeEventListener('message', onUserLoggedIn);

    // Pull the firstName from the message (fallback to a generic greeting)
    const firstName = e.data.firstName || 'Friend';

    showGameOverPopup(
      `Assalamu’alaikum, ${firstName}!`,
      'Your progress is now saved!',
      false
    );
  }
};

window.addEventListener('message', onUserLoggedIn);

}