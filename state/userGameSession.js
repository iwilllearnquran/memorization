// src/state/userGameSession.js

import { GAME_CONFIG } from '/config/gameConfig.js';
import { updateStats } from '/ui/gameStatsUI.js';
import { showGameOverPopup } from '/ui/gameOverPopup.js';
import { startArrangeGame } from '/ui/arrangeGameUI.js';
import { startVerbGame } from '/ui/verbMatchUI.js';
import { toggleGames } from '/ui/toggleGames.js';


import {
  loadStatsFromFirestore,
  saveStatsToFirestore,
  addCompletedAyahToFirestore
} from '/services/_private/firestoreService.js';

class UserGameSession {
  constructor() {
    this.score = 0;
    this.sessionScore = 0;
    this.lives = GAME_CONFIG.maxLives;
    this.type = null;
  }

  async init(type) {
    this.type = type;
    this.lives = GAME_CONFIG.maxLives;
    this.sessionScore = 0;

    try {
      const { score } = await loadStatsFromFirestore();
      this.score = Number(score) || 0;
    } catch (err) {
      console.warn('[GameSession] Failed to load Firestore score; using in-memory fallback', err);
      this.score = Number(this.score) || 0;
    }

    updateStats();
  }

  addPoints(points = GAME_CONFIG.correctActionPoints) {
    this.sessionScore += points;
    updateStats();
  }


  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    updateStats();
  }

async resetToBeforeGame() {
  console.log('[GameSession] resetToBeforeGame()', {
    gameType: this.type,
    sessionScore: this.sessionScore,
    totalScore: this.score
  });

  // Reset in-memory state
  this.sessionScore = 0;
  this.lives = GAME_CONFIG.maxLives;
  updateStats();

  // Relaunch the game cleanly
  switch (this.type) {
    case 'arrange':
      await startArrangeGame();
      break;

    case 'verb':
      await startVerbGame();
      break;

    default:
      console.warn('[GameSession] resetToBeforeGame(): unknown game type', this.type);
  }
}


/**
 * Restart the same game:
 * - Keep points
 * - Reset lives
 * - Reset board/UI only
 */
async restartGameOnly() {
  console.log('[GameSession] restartGameOnly()', {
    gameType: this.type,
    score: this.score,
    sessionScore: this.sessionScore
  });

  this.lives = GAME_CONFIG.maxLives;
  updateStats();

  toggleGames('selector');
  toggleGames(this.type);

  switch (this.type) {
    case 'arrange':
      await startArrangeGame();
      break;
    case 'verb':
      await startVerbGame();
      break;
    default:
      console.warn('[GameSession] restartGameOnly(): unknown type', this.type);
  }
}







  async end(success = false) {
    if (!success) {
      this.sessionScore = 0;
      updateStats();
      return;
    }

    const earned = this.sessionScore;
    const nextScore = (Number(this.score) || 0) + (Number(earned) || 0);

    try {
      await saveStatsToFirestore({ score: nextScore });
      await addCompletedAyahToFirestore({
        surah: window.currentSurah,
        ayah: window.currentAyah
      });
      this.score = nextScore;
      this.sessionScore = 0;

      showGameOverPopup(
        'Nice work!',
        `You've earned ${earned} points.`,
        true
      );
    } catch (err) {
      console.error('[GameSession] Failed to persist end-of-game progress', err);
      showGameOverPopup(
        'Save failed',
        'Could not save this round right now. Please try again.',
        false
      );
    }

    updateStats();
  }
}

export default new UserGameSession();
