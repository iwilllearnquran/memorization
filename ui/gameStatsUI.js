// ui/gameStatsUI.js
import { GAME_CONFIG } from '/config/gameConfig.js';
import gameSession     from '/state/gameSession.js';

let statsEl = null;

export function initStats(parentSelector) {
  const parent = document.querySelector(parentSelector);
  if (!parent) {
    console.error('initStats: parent not found:', parentSelector);
    return;
  }

  statsEl = parent.querySelector('#gameStats');
  if (!statsEl) {
    statsEl = document.createElement('div');
    statsEl.id = 'gameStats';
    statsEl.className = 'game-stats-bar';
    parent.prepend(statsEl);
  }

  updateStats();
}

export function updateStats() {
  if (!statsEl) return;

  // Score section
  const scoreHTML = `
    <div class="stats-section score-section">
      <span class="stats-icon">✨</span>
      <span class="stats-label">Points:</span>
      <span class="stats-value">${gameSession.score}</span>
    </div>
  `;

  // Lives section
  const max   = GAME_CONFIG.maxLives;
  const live  = gameSession.lives;
  let hearts  = '';
  for (let i = 1; i <= max; i++) {
    const icon = i <= live ? 'favorite' : 'favorite_border';
    hearts += `<span class="stats-heart material-icons-outlined">${icon}</span>`;
  }
  const livesHTML = `
    <div class="stats-section lives-section">
      <span class="stats-label">Lives:</span>
      ${hearts}
    </div>
  `;

  statsEl.innerHTML = scoreHTML + livesHTML;
}
