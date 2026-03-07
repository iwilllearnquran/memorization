import { GAME_CONFIG } from '/config/gameConfig.js';
import { hide, show, $ } from '/utils/domHelpers.js';
import gameSession from '/state/gameSession.js';
import { renderGameContainers } from '/ui/renderGameContainers.js';
import { initStats } from '/ui/gameStatsUI.js';

const { learnSection, translationSection, gameContainer, bottomNav } = GAME_CONFIG.selectors;
const KEEP_NAV_IDS = ['navSettings'];

let uiInitialized = false;
let currentMode = 'learn';
let originalNavItems = [];
let inGameReturnBound = false;
let suppressReturnConfirm = false;

function ensureOriginalNavItems(nav) {
  if (!nav || originalNavItems.length > 0) return;
  originalNavItems = Array.from(nav.children);
}

function applyGameShell(container) {
  if (!container) return;
  document.body.classList.add('game-active');
  container.classList.add('fullscreen-game');
  container.style.overflowX = 'hidden';
  container.style.overflowY = 'auto';
  container.style.webkitOverflowScrolling = 'touch';
  container.style.touchAction = 'pan-y';
  container.style.overscrollBehaviorY = 'contain';
}

function applyModeInteraction(container, mode) {
  if (!container) return;

  // Selector/arrange remain naturally scrollable; verb stays fixed and static.
  if (mode === 'verb') {
    container.scrollTop = 0;
    container.style.setProperty('overflow-y', 'hidden', 'important');
    container.style.setProperty('touch-action', 'manipulation', 'important');
    return;
  }

  container.style.setProperty('overflow-y', 'auto', 'important');
  container.style.setProperty('touch-action', 'pan-y', 'important');
}

function clearGameShell(container) {
  if (!container) return;
  document.body.classList.remove('game-active');
  container.classList.remove('fullscreen-game');
  container.removeAttribute('data-mode');
  container.style.overflowX = '';
  container.style.overflowY = '';
  container.style.webkitOverflowScrolling = '';
  container.style.touchAction = '';
  container.style.overscrollBehaviorY = '';
}

function isArrangeGameFinished() {
  const slots = Array.from(document.querySelectorAll('#slotContainer .slot'));
  if (!slots.length) return false;
  return slots.every(slot => String(slot.dataset.word || '').trim().length > 0);
}

function isVerbGameFinished() {
  const cards = Array.from(document.querySelectorAll('#verbGameContainer .match-card'));
  if (!cards.length) return false;
  return cards.every(card => card.classList.contains('matched'));
}

function isCurrentGameFinished() {
  if (currentMode === 'arrange') return isArrangeGameFinished();
  if (currentMode === 'verb') return isVerbGameFinished();
  return true;
}

function requestReturnToGamesSelector() {
  if (currentMode === 'selector' || currentMode === 'learn') return;

  if (!suppressReturnConfirm && !isCurrentGameFinished()) {
    const ok = window.confirm(
      'Finish game before going to main page?\nPress OK to return now and lose current progress.'
    );
    if (!ok) return;
  }

  toggleGames('selector');
}

export function forceReturnToGamesSelector() {
  suppressReturnConfirm = true;
  try {
    requestReturnToGamesSelector();
  } finally {
    suppressReturnConfirm = false;
  }
}

export function forceExitGameToAyah() {
  const gc = $(gameContainer);
  if (!gc) return;

  clearGameShell(gc);
  gc.style.display = 'none';

  const nav = document.querySelector(bottomNav);
  _restoreNav(nav);

  const learn = $(learnSection);
  const translation = $(translationSection);
  if (learn) learn.style.display = '';
  if (translation) translation.style.display = '';

  currentMode = 'learn';
}

if (typeof window !== 'undefined') {
  window.__qqForceReturnToGamesSelector = forceReturnToGamesSelector;
  window.__qqForceExitGameToAyah = forceExitGameToAyah;
}

function bindInGameReturnActions(container) {
  if (!container || inGameReturnBound) return;

  container.addEventListener('click', event => {
    const ayahBtn = event.target.closest('[data-action="return-ayah"]');
    if (ayahBtn) {
      event.preventDefault();
      forceExitGameToAyah();
      return;
    }

    const btn = event.target.closest('[data-action="return-games"]');
    if (!btn) return;
    event.preventDefault();
    requestReturnToGamesSelector();
  });

  inGameReturnBound = true;
}

// 1) Capture original nav nodes & order
window.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector(bottomNav);
  if (!nav) return;
  ensureOriginalNavItems(nav);
});

/**
 * Main entry: modes are 'selector', 'arrange', or 'verb'
 */
export function toggleGames(mode = 'selector') {
  initStats('#game-mode-content');

  const container = document.querySelector(gameContainer);
  if (!container) return;
  const navEl = document.querySelector(bottomNav);
  ensureOriginalNavItems(navEl);

  applyGameShell(container);

  currentMode = mode;
  container.dataset.mode = mode;
  applyModeInteraction(container, mode);

  if (navEl) {
    navEl.classList.toggle('nav-hidden', mode === 'verb');
  }

  if (history.state?.mode !== mode) {
    history.pushState({ mode }, '');
  } else {
    history.replaceState({ mode }, '');
  }

  // 2) Hide learn/translate, show game UI
  hide($(learnSection), $(translationSection));
  show($(gameContainer));

  // 3) One-time render of game containers
  if (!uiInitialized) {
    renderGameContainers();
    uiInitialized = true;
  }

  bindInGameReturnActions(container);

  // 4) Show the right sub-section
  _showSection(mode);

  // 5) Rebuild nav for game context
  _updateNav();

  // 6) Initialize game logic
  gameSession.init(mode);
}

// Helper: pick which panel to show
function _showSection(mode) {
  const container = $(gameContainer);
  if (!container) return;
  const cards = container.querySelectorAll('.game-card');
  const arrange = container.querySelector('.game-section[data-game="arrange"]');
  const verb = container.querySelector('.game-section[data-game="verb"]');
  const selectorReturn = container.querySelector('#selectorReturnWrap');

  if (mode === 'selector') {
    cards.forEach(card => {
      card.style.display = '';
    });
    if (selectorReturn) selectorReturn.style.display = '';
    if (arrange) arrange.style.display = 'none';
    if (verb) verb.style.display = 'none';
    return;
  }

  cards.forEach(card => {
    card.style.display = 'none';
  });
  if (selectorReturn) selectorReturn.style.display = 'none';
  if (arrange) arrange.style.display = mode === 'arrange' ? '' : 'none';
  if (verb) verb.style.display = mode === 'verb' ? '' : 'none';
}

// Helper: hide non-keepers and inject back icon
function _updateNav() {
  const nav = document.querySelector(bottomNav);
  if (!nav) return;
  ensureOriginalNavItems(nav);
  if (!originalNavItems.length) return;

  nav.querySelector('.back-btn')?.remove();

  Array.from(nav.children).forEach(child => {
    child.style.display = KEEP_NAV_IDS.includes(child.id) ? '' : 'none';
  });

  const back = document.createElement('div');
  back.className = 'nav-item back-btn';
  back.id = 'navBackBtn';
  back.innerHTML = '<span class="material-icons-outlined">arrow_back</span>';
  back.addEventListener('click', () => _handleBack());
  nav.prepend(back);
}

// Helper: handle Back click
function _handleBack() {
  const nav = document.querySelector(bottomNav);

  if (currentMode === 'selector') {
    // 1) Hide game container
    const gc = $(gameContainer);
    if (gc) {
      clearGameShell(gc);
      gc.style.display = 'none';
    }

    // 2) Restore nav
    _restoreNav(nav);

    // 3) Force-show learn & translation
    const ls = $(learnSection);
    const ts = $(translationSection);
    if (ls) ls.style.display = '';
    if (ts) ts.style.display = '';

    currentMode = 'learn';
    return;
  }

  requestReturnToGamesSelector();
}

// Helper: wipe nav and re-append originals in order
function _restoreNav(nav) {
  if (!nav) return;
  ensureOriginalNavItems(nav);
  if (!originalNavItems.length) return;
  nav.classList.remove('nav-hidden');
  nav.innerHTML = '';
  originalNavItems.forEach(node => {
    node.style.display = '';
    nav.appendChild(node);
  });
}

// handle hardware/browser back button
window.addEventListener('popstate', () => {
  if (currentMode !== 'learn') {
    _handleBack();
    history.pushState({ mode: 'learn' }, '');
  }
});

// ensure initial state in history
history.replaceState({ mode: 'learn' }, '');

