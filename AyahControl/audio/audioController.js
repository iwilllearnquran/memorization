import { state } from '../core/state.js';
import { log } from '../core/logger.js';

const logger = log('AUDIO');

export function initAudio() {
  state.audio.el = document.getElementById('ayahAudio');
  state.ui.navPlayIcon = document.getElementById('navPlayIcon');
  state.ui.panelIcon =
    document.querySelector('#playToggleBtn .material-icons-outlined');

  if (!state.audio.el) {
    logger.error('ayahAudio not found');
    return;
  }

  state.audio.el.addEventListener('play', syncPlayIcons);
  state.audio.el.addEventListener('pause', syncPauseIcons);
  state.audio.el.addEventListener('ended', syncPauseIcons);
}

function syncPlayIcons() {
  state.ui.navPlayIcon.textContent = 'pause';
  state.ui.panelIcon.textContent = 'pause';
}

function syncPauseIcons() {
  state.ui.navPlayIcon.textContent = 'play_arrow';
  state.ui.panelIcon.textContent = 'play_arrow';
}

export function togglePlay(e) {
  e.preventDefault();
  e.stopPropagation();

  const audio = state.audio.el;
  audio.paused ? audio.play() : audio.pause();
}
