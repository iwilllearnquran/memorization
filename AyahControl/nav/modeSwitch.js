import { state } from '../core/state.js';

export function toggleModeNav() {
  state.mode = state.mode === 'learning' ? 'reciting' : 'learning';

  document.getElementById('learning-mode-content').style.display =
    state.mode === 'learning' ? 'block' : 'none';

  document.getElementById('reciting-mode-content').style.display =
    state.mode === 'reciting' ? 'block' : 'none';

  document.getElementById('navModeIcon').textContent =
    state.mode === 'learning' ? 'psychology' : 'menu_book';
}
