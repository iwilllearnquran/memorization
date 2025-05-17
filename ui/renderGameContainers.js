// renderGameContainers.js

import { GAME_CONFIG }         from '/config/gameConfig.js';
import { $ }                   from '/utils/domHelpers.js';
import { startArrangeGame }    from '/ui/arrangeGameUI.js';
import { startVerbGame }       from '/ui/verbMatchUI.js';
import { toggleGames }         from '/ui/toggleGames.js';

export function renderGameContainers() {
  console.group('🎲 renderGameContainers');
  const container = $(GAME_CONFIG.selectors.gameContainer);
  console.log('[🔍] gameContainer element:', container);

  // 1️⃣ Render selector cards
  console.log('[1️⃣] Rendering selector cards...');
  GAME_CONFIG.games.forEach(({ type, id, title, description, buttonId , fontFamily, fontSize, textAlign}) => {
    console.log(`   • Creating card for game type="${type}", id="${id}"`);
    const card = document.createElement('div');
    card.id           = id;               // e.g. "arrangeSelector"
    card.className    = 'game-card';
    card.dataset.game = type;             // so toggleGames can find it
    card.style.fontFamily = fontFamily  || "'Roboto', sans-serif";
    card.style.fontSize   = fontSize    || '1rem';
    if (textAlign)  card.style.setProperty('text-align', textAlign, 'important');
    card.innerHTML    = `
      <h3>${title}</h3>
      <p>${description}</p>
      <button id="${buttonId}" class="game-play-btn">Play ${title}</button>
    `;
    container.appendChild(card);
    console.log(`     → Appended card #${id}`);

    const btn = card.querySelector('button');
    btn.addEventListener('click', () => {
      console.log(`[🕹] Play button clicked for "${type}"`);
      // Switch to game view
      toggleGames(type);
      // Start the appropriate game logic
      if (type === 'arrange') {
        console.log('[🚀] Starting Arrange Game');
        startArrangeGame();
      } else if (type === 'verb') {
        console.log('[🚀] Starting Verb Match Game');
        startVerbGame();
      }
    });
  });

  // 2️⃣ Render hidden game panes
  console.log('[2️⃣] Rendering hidden game panes...');
  GAME_CONFIG.games.forEach(({ type }) => {
    console.log(`   • Creating pane for game type="${type}"`);
    const div = document.createElement('div');
    div.id               = `${type}GameContainer`;   // e.g. "arrangeGameContainer"
    div.dataset.game     = type;                     // data-game="arrange"
    div.style.display    = 'none';
    div.classList.add('game-section');

    if (type === 'arrange') {
      div.innerHTML = `
        <div class="prompt">Arrange the words in correct order</div>
        <div class="slots"   id="slotContainer"></div>
        <div class="options" id="optionsContainer"></div>
      `;
      console.log('     → Fill in Arrange UI');
    } else if (type === 'verb') {
      div.innerHTML = `
        <div class="prompt">Match the verb to its meaning</div>
        <div class="match-grid">
          <div id="meaningOptions" class="match-column-en"></div>
          <div id="verbOptions" class="match-column-ar"></div>
        </div>
      `;
      console.log('     → Fill in Verb UI');
    }

    container.appendChild(div);
    console.log(`     → Appended pane #${div.id}`);
  });

  // 3️⃣ Add shared SVG “glassEffect”
  if (!document.getElementById('glassEffect')) {
    console.log('[3️⃣] Injecting glassEffect SVG');
    document.body.insertAdjacentHTML('beforeend', `
      <svg id="glassEffect" viewBox="0 0 100 100"
           style="display:none; position:fixed; width:100px; height:100px;
                  pointer-events:none; z-index:9999;">
        <circle cx="50" cy="50" r="45"
                stroke="rgba(0,0,0,0.5)" stroke-width="1" fill="none">
          <animate attributeName="r" from="1" to="45" dur="0.4s" fill="freeze" />
          <animate attributeName="opacity" from="1" to="0" dur="0.4s" fill="freeze" />
        </circle>
      </svg>
    `);
    console.log('     → glassEffect SVG appended');
  } else {
    console.log('[3️⃣] glassEffect SVG already exists, skipping');
  }

  console.groupEnd();
}
