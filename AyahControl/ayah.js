import { initAudio, togglePlay } from './audio/audioController.js';
import { initParentBridge } from './messaging/parentBridge.js';
import { toggleModeNav } from './nav/modeSwitch.js';
import { initSwipe } from './gestures/swipe.js';

window.togglePlay = togglePlay;
window.toggleModeNav = toggleModeNav;

document.addEventListener('DOMContentLoaded', () => {
  initParentBridge();
  initAudio();
  initSwipe();
});
