// renderGameContainers.js

import { GAME_CONFIG, getEnabledGames } from '/config/gameConfig.js';
import { $ }                   from '/utils/domHelpers.js';
import { startArrangeGame }    from '/ui/arrangeGameUI.js';
import { startVerbGame }       from '/ui/verbMatchUI.js';
import { startWordTypeGame }   from '/ui/wordTypeUI.js';
import { startVerbFormGame }   from '/ui/verbFormUI.js';
import { toggleGames }         from '/ui/toggleGames.js';

export function renderGameContainers() {
  console.group('renderGameContainers');
  const container = $(GAME_CONFIG.selectors.gameContainer);
  console.log('[game] gameContainer element:', container);
  if (!container) {
    console.warn('[game] gameContainer not found; skipping renderGameContainers');
    console.groupEnd();
    return;
  }

  const enabledGames = getEnabledGames();

  // 1) Render selector cards
  console.log('[1] Rendering selector cards...');
  enabledGames.forEach(({ type, id, title, description, buttonId, fontFamily, fontSize, textAlign }) => {
    console.log(`  - Creating card for game type="${type}", id="${id}"`);
    const card = document.createElement('div');
    card.id = id;
    card.className = 'game-card';
    card.dataset.game = type;
    card.style.fontFamily = fontFamily || "'Roboto', sans-serif";
    card.style.fontSize = fontSize || '1rem';
    if (textAlign) card.style.setProperty('text-align', textAlign, 'important');

    card.innerHTML = `
      <h3>${title}</h3>
      <p>${description}</p>
      ${buttonId ? `<button id="${buttonId}" class="game-play-btn">Play ${title}</button>` : ''}
    `;

    container.appendChild(card);
    console.log(`    -> Appended card #${id}`);

    const btn = card.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => {
        console.log(`[game] Play button clicked for "${type}"`);
        toggleGames(type);
        if (type === 'arrange') {
          startArrangeGame();
        } else if (type === 'verb') {
          startVerbGame();
        } else if (type === 'wordType') {
          startWordTypeGame();
        } else if (type === 'verbForm') {
          startVerbFormGame();
        }
      });
    }
  });

  // Selector-level quick exit back to current Learn ayah
  const selectorReturnWrap = document.createElement('div');
  selectorReturnWrap.id = 'selectorReturnWrap';
  selectorReturnWrap.className = 'game-selector-return';
  selectorReturnWrap.innerHTML = `
    <button
      id="selectorReturnAyahBtn"
      class="game-play-btn selector-return-ayah-btn"
      data-action="return-ayah"
      type="button"
    >
      Return to Ayah
    </button>
  `;
  container.appendChild(selectorReturnWrap);
  console.log('    -> Appended selector return-to-ayah control');

  // 2) Render hidden game panes
  console.log('[2] Rendering hidden game panes...');
  enabledGames.forEach(({ type }) => {
    console.log(`  - Creating pane for game type="${type}"`);
    const div = document.createElement('div');
    div.id = `${type}GameContainer`;
    div.dataset.game = type;
    div.style.display = 'none';
    div.classList.add('game-section');

    if (type === 'arrange') {
      div.innerHTML = `
        <div class="slots" id="slotContainer"></div>
        <div class="options" id="optionsContainer"></div>
        <div id="arrangeControls" class="game-inline-controls">
          <button
            id="arrangeReturnBtn"
            class="game-play-btn return-ayah-btn game-play-btn-no-shine"
            data-action="return-ayah"
            type="button"
          >
            Return to Ayah
          </button>
        </div>
      `;
      console.log('    -> Fill in Arrange UI');
    } else if (type === 'verb') {
      div.innerHTML = `
        <div class="match-grid">
          <div id="meaningOptions" class="match-column-en"></div>
          <div id="verbOptions" class="match-column-ar"></div>
        </div>
      `;
      console.log('    -> Fill in Verb UI');
    } else if (type === 'wordType') {
      // wordTypeUI.js populates this container dynamically
      console.log('    -> Fill in Word Type UI');
    } else if (type === 'verbForm') {
      // verbFormUI.js populates this container dynamically
      console.log('    -> Fill in Verb Form UI');
    }

    container.appendChild(div);
    console.log(`    -> Appended pane #${div.id}`);
  });

  // 3) Add shared SVG "glassEffect"
  if (!document.getElementById('glassEffect')) {
    console.log('[3] Injecting glassEffect SVG');
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
    console.log('    -> glassEffect SVG appended');
  } else {
    console.log('[3] glassEffect SVG already exists, skipping');
  }

  console.groupEnd();
}

