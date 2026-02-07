import { log } from '../core/logger.js';
import { send } from '../messaging/parentBridge.js';
import { MSG } from '../messaging/messageTypes.js';

const logger = log('SETTINGS');

/* ============================
   ENTRY
============================ */
export function initSettingsPopup() {
  const btn = document.getElementById('navSettings');
  if (!btn) return;

  btn.addEventListener('click', toggleSettings);
}

/* ============================
   TOGGLE
============================ */
function toggleSettings(e) {
  e.preventDefault();
  e.stopPropagation();

  const existing = document.getElementById('settingsMenu');
  if (existing) {
    closeSettings();
    return;
  }

  openSettings();
}

/* ============================
   OPEN
============================ */
function openSettings() {
  logger.info('open');

  document.body.insertAdjacentHTML('beforeend', buildHTML());
  const menu = document.getElementById('settingsMenu');

  wireControls(menu);
  autoClose(menu);

  send(MSG.SETTINGS_OPENED);
}

/* ============================
   CLOSE
============================ */
function closeSettings() {
  logger.info('close');

  document.getElementById('settingsMenu')?.remove();
  document.getElementById('navSettings')?.classList.remove('active');

  send(MSG.SETTINGS_CLOSED);
}

/* ============================
   HTML
============================ */
function buildHTML() {
  return `
    <div id="settingsMenu" class="settings-popup">
      <h3>Settings</h3>

      <div class="row">
        <label>
          <input type="checkbox" id="toggleRoot">
          Show Root
        </label>
      </div>

      <div class="row">
        <label>
          <input type="checkbox" id="toggleGrammar">
          Show Grammar
        </label>
      </div>

      <div class="row">
        <label>
          Speed
          <select id="speedSelect">
            <option value="0.75">0.75×</option>
            <option value="1" selected>1×</option>
            <option value="1.25">1.25×</option>
          </select>
        </label>
      </div>
    </div>
  `;
}

/* ============================
   WIRES
============================ */
function wireControls(menu) {
  menu.querySelector('#toggleRoot')
    ?.addEventListener('change', e => {
      document.documentElement
        .classList.toggle('hide-root', !e.target.checked);

      send(MSG.UPDATE_SETTING, { showRoot: e.target.checked });
    });

  menu.querySelector('#toggleGrammar')
    ?.addEventListener('change', e => {
      document.documentElement
        .classList.toggle('hide-grammar', !e.target.checked);

      send(MSG.UPDATE_SETTING, { showGrammar: e.target.checked });
    });

  menu.querySelector('#speedSelect')
    ?.addEventListener('change', e => {
      send(MSG.UPDATE_SETTING, { speed: parseFloat(e.target.value) });
    });
}

/* ============================
   AUTOCLOSE
============================ */
function autoClose(menu) {
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) {
        closeSettings();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}
