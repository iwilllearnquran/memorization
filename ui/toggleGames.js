import { GAME_CONFIG }          from '/config/gameConfig.js';
import { hide, show, $ }        from '/utils/domHelpers.js';
import gameSession              from '/state/gameSession.js';
import { renderGameContainers } from '/ui/renderGameContainers.js';


const { learnSection, translationSection, gameContainer, bottomNav } = GAME_CONFIG.selectors;
const KEEP_NAV_IDS = ['playToggleBtn', 'navSettings'];
let uiInitialized    = false;
let currentMode      = 'learn';
let originalNavItems = [];

// ── 1) Capture original nav nodes & order ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector(bottomNav);
  if (!nav) return;
  originalNavItems = Array.from(nav.children);
});

/**
 * Main entry: modes are 'selector', 'arrange', or 'verb'
 */
export function toggleGames(mode = 'selector') {

  const container = document.querySelector(GAME_CONFIG.selectors.gameContainer);
  document.body.classList.add('game-active');
  container.classList.add('fullscreen-game');


  console.log(`[toggleGames] →`, mode);
  currentMode = mode;

  const navEl = document.querySelector(bottomNav);
  // ② Hide for verb, show otherwise
  navEl.classList.toggle('nav-hidden', mode === 'verb');


  history.pushState({ mode }, '');


  // 2) Hide learn/translate, show game UI
  hide($(learnSection), $(translationSection));
  show($(gameContainer));

  // 3) One-time render of game containers
  if (!uiInitialized) {
    renderGameContainers();
    uiInitialized = true;
  }

  // 4) Show the right sub-section
  _showSection(mode);

  // 5) Rebuild nav for game context
  _updateNav();

  // 6) Initialize game logic
  gameSession.init(mode);
}

// ── Helper: pick which panel to show ─────────────────────────────
function _showSection(mode) {
  const container = $(gameContainer);
  const cards     = container.querySelectorAll('.game-card');
  const arrange   = container.querySelector('.game-section[data-game="arrange"]');
  const verb      = container.querySelector('.game-section[data-game="verb"]');

  if (mode === 'selector') {
    cards.forEach(c => c.style.display = '');
    arrange.style.display = 'none';
    verb.style.display    = 'none';
  } else {
    cards.forEach(c => c.style.display = 'none');
    arrange.style.display = (mode === 'arrange') ? '' : 'none';
    verb.style.display    = (mode === 'verb')    ? '' : 'none';
  }
}

// ── Helper: hide non-keepers & inject Google-style Back icon ──────
function _updateNav() {
  const nav = document.querySelector(bottomNav);
  if (!nav) return;
  // remove old back btn if still there
  nav.querySelector('.back-btn')?.remove();

  // hide everything except audio & settings
  Array.from(nav.children).forEach(ch => {
    ch.style.display = KEEP_NAV_IDS.includes(ch.id) ? '' : 'none';
  });

  // inject a Material-Icons back button
  const back = document.createElement('div');
  back.className = 'nav-item back-btn';
  back.id        = 'navBackBtn';
  back.innerHTML = `<span class="material-icons-outlined">arrow_back</span>`;
  back.addEventListener('click', () => _handleBack());
  nav.prepend(back);
}

// ── Helper: handle Back click, with confirm in-game ──────────────
function _handleBack() {
  console.log('[_handleBack] currentMode =', currentMode);
  const nav = document.querySelector(bottomNav);



  if (currentMode === 'selector') {
    console.log('→ Back from selector: restoring learn + translation');
    
    // 1) Hide game container
    const gc = $(gameContainer);
    gc.style.display = 'none';
    console.log('   hid gameContainer');

    // 2) Restore nav
    _restoreNav(nav);
    console.log('   nav restored');

    // 3) Force-show learn & translation
    const ls = $(learnSection);
    const ts = $(translationSection);
    ls.style.display = '';
    ts.style.display = '';
    console.log('   show learnSection & translationSection');

    currentMode = 'learn';
    console.log('   currentMode set to', currentMode);

  } else {
    console.log('→ Back from in-game: asking confirmation');
    const ok = confirm(
      'Are you sure you want to go back?\nYour game progress will be lost.'
    );
    if (ok) {
      console.log('   confirmed, switching to selector');
      toggleGames('selector');
    } else {
      console.log('   cancelled, staying in', currentMode);
    }
  }



}


// ── Helper: wipe nav & re-append originals in order ───────────────
function _restoreNav(nav) {
  nav.innerHTML = '';
  originalNavItems.forEach(node => {
    node.style.display = '';
    nav.appendChild(node);
  });
}
// ── Helper: show/hide elements by ID ──────────────────────────────
function _show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

// handle hardware/browser back button
window.addEventListener('popstate', (evt) => {
  // if we have game state, intercept
  if (currentMode !== 'learn') {
    console.log('[popstate] intercept, currentMode=', currentMode);
    // restore our UI instead of letting the browser navigate away
    _handleBack();
    // push a fresh “learn” state so further back presses keep working
    history.pushState({ mode: 'learn' }, '');
  }
});

// ensure initial state in history
history.replaceState({ mode: 'learn' }, '');
