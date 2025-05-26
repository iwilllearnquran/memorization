// ui/gameStatsUI.js
import { GAME_CONFIG } from '/config/gameConfig.js';
import gameSession     from '/state/gameSession.js';

let statsEl = null;

// 🧱 Initializes the stats bar
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

// 🎯 Updates stats bar in UI only
export function updateStats() {
  if (!statsEl) return;

  const username  = gameSession.username || 'Player';
  const avatar    = gameSession.avatar || 'https://via.placeholder.com/24';
  const ajrPoints = gameSession.score;
  const lives     = gameSession.lives;

  const userHTML = `
    <div class="user-pill">
      <span class="coin">✨${ajrPoints} Ajr Points</span>
    </div>
  `;

  const statsHTML = `
    <div class="score-pill">
      <span class="score">♥️${lives} Lives</span>
    </div>
  `;

  statsEl.innerHTML = userHTML + statsHTML;
}


