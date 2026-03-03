// src/state/guestGameSession.js

import { GAME_CONFIG } from '/config/gameConfig.js';
import { updateStats } from '/ui/gameStatsUI.js';
import { showGameOverPopup } from '/ui/gameOverPopup.js';
import { startArrangeGame } from '/ui/arrangeGameUI.js';
import { startVerbGame } from '/ui/verbMatchUI.js';



const POINTS_KEY = 'guestPoints';

class GuestGameSession {
  constructor() {
    this.score = 0;          // persisted total
    this.sessionScore = 0;   // earned this game
    this.lives = GAME_CONFIG.maxLives;
    this.type = null;
  }

  async init(type) {
    this.type = type;
    this.lives = GAME_CONFIG.maxLives;
    this.sessionScore = 0;
    this.score = Number(localStorage.getItem(POINTS_KEY)) || 0;
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





  end(success = false) {
    if (!success) {
      // ❌ discard session points
      this.sessionScore = 0;
      updateStats();
      return;
    }

    // ✅ save once
    this.score += this.sessionScore;
    localStorage.setItem(POINTS_KEY, String(this.score));

    const earned = this.sessionScore;
    this.sessionScore = 0;

    showGameOverPopup(
      'Nice work!',
      `You've earned ${earned} points.`,
      true
    );

    updateStats();
  }
}

export default new GuestGameSession();
