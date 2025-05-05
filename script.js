// Declare globals for cross-scope use
let ayahAudio;
let audioPanel;
let playBtn;
let navPlay;
let navPlayIcon;       // ← add this
let panelIcon;
let floatingBtn;
let playToggleBtn;
let currentMode = 'learning';


// 1. toggleElements(type, show)
//    Shows or hides elements by class based on type and boolean 'show'.
function toggleElements(type, show) {
  const map = { translation: 'toggle-translation', 'root-tag': 'toggle-root', 'pos-tag': 'toggle-pos' };
  const cls = map[type] || type;
  document.querySelectorAll(`.${cls}`).forEach(el => {
    el.classList.toggle('hidden-toggle', !show);
  });
}
window.toggleElements = toggleElements;

// 2. showPopup(data)
//    Renders and displays the morphology popup with given data.
function showPopup(data) {
  let htmlContent = `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #ccc;padding-bottom:6px;margin-top:0;">
    <button onclick="hidePopup()" style="position:absolute;top:-14px;left:-14px;background:none;border:none;color:#0a4d68;font-size:20px;font-weight:bold;cursor:pointer;line-height:1;">×</button>
    <h3 style="font-size:20px;font-weight:bold;margin:0;">🔍 Word Explanation</h3>
    ${data['Audio URL'] ? `<button class='audio-button' onclick="playAudio('${data['Audio URL']}')" style="padding:6px 12px;font-size:14px;border-radius:8px;background:#0a4d68;color:white;border:none;cursor:pointer;">🔊 Play Word Audio</button>` : ''}
  </div>
  <div style="margin-top:12px;line-height:1.8;font-size:15px;text-align:left;">
  `;

  if (data['Word']) {
    const normalized = data['Word'].normalize('NFD').replace(/[ً-ٟۖ-ٰۭـ]/g, '').replace('ٱ', 'ا');
    htmlContent += `<div style="margin-bottom:10px;"><b style="color:#0a4d68;">Word:</b> <span style="font-size:20px;font-weight:bold;">${data['Word']}</span>
      <button onclick="openSearchTab('${normalized}')" style="margin-left:8px;font-size:12px;padding:4px 8px;border-radius:6px;background:#eef5ff;border:1px solid #ccc;cursor:pointer;">🔍 Look up in Quran</button>
    </div>`;
  }
  if (data['root_from_txt'] || data['tags_joined']) {
    const rootText = data['root_from_txt'] ? data['root_from_txt'].split('+').join(' + ') : '';
    const tagText = data['tags_joined'] ? ` <i>(${data['tags_joined'].split('+').join(' + ')})</i>` : '';
    if (rootText || tagText) htmlContent += `<div><b>Roots:</b> ${rootText}${tagText}</div>`;
  }
  if (data['Meaning Of Verb']) htmlContent += `<div><b>Meaning Of Verb:</b> ${data['Meaning Of Verb']}</div>`;
  if (data['Main Verb Grammar']) htmlContent += `<div><b>Main Verb Grammar:</b> ${data['Main Verb Grammar']}</div>`;
  if (data['Quran Morph Info']) htmlContent += `<div><b>Suffixes:</b> ${data['Quran Morph Info']}</div>`;
  if (data['root_from_gpt']) {
    const countText = data['count_of_verb'] > 0 ? ` <i>(appears ~${data['count_of_verb']} times)</i>` : '';
    htmlContent += `<div><b>Root Verb:</b> ${data['root_from_gpt']}${countText}</div>`;
  }
  if (data['Conjugation Table']) htmlContent += `<div style="margin-top:10px;">${data['Conjugation Table']}</div>`;

  htmlContent += `</div>`;
  const popup = document.getElementById('popupContent');
  const overlay = document.getElementById('overlay');
  popup.innerHTML = htmlContent;
  overlay.style.display = 'block';
  popup.style.display = 'block';
}
window.showPopup = showPopup;

// 3. hidePopup()
//    Hides the morphology popup and overlay.
function hidePopup() {
  document.getElementById('popupContent').style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
}
window.hidePopup = hidePopup;

// 4. playAudio(url)
//    Plays a word-specific audio snippet.
function playAudio(url) {
  new Audio(url).play();
}
window.playAudio = playAudio;

// 5. clearTranslitInputs()
//    Clears all practice-mode transliteration input fields.
function clearTranslitInputs() {
  document.querySelectorAll('.translit-input').forEach(input => {
    const key = input.dataset.key;
    if (key) localStorage.removeItem(key);
    input.value = '';
    input.dispatchEvent(new Event('input'));
  });
}

window.clearTranslitInputs = clearTranslitInputs;

// 6. toggleTranslations()
//    Toggles visibility of translation hints under inputs.
function toggleTranslations() {
  document.querySelectorAll('.toggle-translation').forEach(el => el.classList.toggle('hidden-toggle'));
}
window.toggleTranslations = toggleTranslations;

// 7. switchTranslation(lang)
//    Switches the displayed translation between English and Urdu.
function switchTranslation(lang) {
  const enDiv = document.getElementById('englishTranslation');
  const urDiv = document.getElementById('urduTranslation');
  const label = document.getElementById('currentLang');

  if (lang === 'en') {
    enDiv.style.display = 'block';
    urDiv.style.display = 'none';
    label.innerText    = 'English';
  } else {
    enDiv.style.display = 'none';
    urDiv.style.display = 'block';
    label.innerText    = 'Urdu';
  }

  // close the dropdown
  translationDropdown.classList.remove('active');
}
window.switchTranslation = switchTranslation;

// 8. togglePracticeNav()
//    Shows/hides the practice (transliteration) section.
function togglePracticeNav() {
  const pracNav    = document.getElementById('navPractice');
  const gamesNav   = document.getElementById('navGames');
  const modeNav    = document.getElementById('navMode');
  const learnSec   = document.getElementById('learning-mode-content');
  const recitSec   = document.getElementById('reciting-mode-content');
  const transSec   = document.getElementById('translation-section');
  const gramSec    = document.getElementById('main-grammar-section');
  const pracBox    = document.getElementById('transliteration-box');

  // are we already in Practice mode?
  const isOn = pracBox.style.display === 'block';

  // clear any nav-item .active
  clearNavActive();

  if (!isOn) {
    // —> TURN ON Practice
    pracNav.classList.add('active');
    // hide all the “original” sections
    [learnSec, recitSec, transSec, gramSec].forEach(el => el && (el.style.display = 'none'));
    // show only transliteration box
    pracBox.style.display = 'block';
    // hide the Games & Mode nav-buttons
    gamesNav.style.display = 'none';
    modeNav.style.display  = 'none';
    // re-initialize feedback
    initTranslitFeedback();

  } else {
    // —> TURN OFF Practice → restore original view
    // remove active
    pracNav.classList.remove('active');
    // show the section that was active before (we default back to learning)
    learnSec.style.display = 'block';
    recitSec.style.display = 'none';
    transSec.style.display = 'block';
    gramSec.style.display  = 'block';
    // hide practice box
    pracBox.style.display = 'none';
    // bring back the Games & Mode nav-buttons
    gamesNav.style.display = '';
    modeNav.style.display  = '';
  }
}
window.togglePracticeNav = togglePracticeNav;






// 9. togglePlay()
//    Toggles play/pause for ayahAudio and updates nav icon.
function togglePlay() {
  if (!ayahAudio) return console.error('No ayahAudio element');
  if (ayahAudio.paused) ayahAudio.play(); else ayahAudio.pause();
  const icon = document.getElementById('navPlayIcon');
  icon.textContent = ayahAudio.paused ? 'play_arrow' : 'pause';
}
window.togglePlay = togglePlay;


// ── Helper to auto-close the settings popup ──
function attachSettingsAutoClose(btn, menuEl) {
  // guard against missing parameters
  if (!btn || !menuEl) return;

  // prevent clicks inside the menu from bubbling up
  menuEl.addEventListener('click', e => e.stopPropagation());

  // listener that hides when you click outside
  function _hide(e) {
    if (!menuEl.contains(e.target) && !btn.contains(e.target)) {
      menuEl.remove();
      btn.classList.remove('active');
      document.removeEventListener('click', _hide);
    }
  }

  // delay so the same click that opened it doesn’t immediately close it
  setTimeout(() => document.addEventListener('click', _hide), 0);
}

//10 ── toggleSettingsNav, now with a safe guard around attachSettingsAutoClose ──
window.toggleSettingsNav = function () {
  clearNavActive();
  const btn = document.getElementById('navSettings');
  btn.classList.add('active');

  // close if already open
  const existing = document.getElementById('settingsMenu');
  if (existing) {
    existing.remove();
    btn.classList.remove('active');
    return;
  }

  const inPractice = document.getElementById('transliteration-box').style.display === 'block';

  let menuHTML = `
    <div id="settingsMenu" class="settings-popup">
      <div class="sm-header">
        <i class="material-icons-outlined">settings</i>
        <span>Settings</span>
      </div>

      <!-- DISPLAY TOGGLES -->
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">translate</i>
          <span>Show Translation</span>
        </div>
        <label class="switch">
          <input type="checkbox" checked onchange="toggleTranslations()">
          <span class="slider"></span>
        </label>
      </div>`;

  if (!inPractice) {
    menuHTML += `
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">account_tree</i>
          <span>Show Root</span>
        </div>
        <label class="switch">
          <input type="checkbox" checked onchange="toggleElements('root-tag', this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">format_italic</i>
          <span>Show Grammar</span>
        </div>
        <label class="switch">
          <input type="checkbox" checked onchange="toggleElements('pos-tag', this.checked)">
          <span class="slider"></span>
        </label>
      </div>`;
  }

  if (inPractice) {
    // proper button row
    menuHTML += `
      <div class="sm-section-title">Practice Controls</div>
      <div class="sm-row">
        <button type="button" class="btn btn-sm" onclick="clearTranslitInputs()">
          Erase All Inputs
        </button>
      </div>`;
  }

  // AUDIO SETTINGS (unchanged)
  menuHTML += `
      <div class="sm-section-title">Audio Settings</div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">language</i>
          <span>Language</span>
        </div>
        <select id="audioLangSelect" onchange="onAudioLangChange(this.value)">
          <option value="ar">Arabic</option>
          <option value="en">English</option>
          <option value="ur">Urdu</option>
        </select>
      </div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">speed</i>
          <span>Speed</span>
        </div>
        <select id="speedSelect" onchange="onSpeedChange(this.value)">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1" selected>1×</option>
          <option value="1.25">1.25×</option>
        </select>
      </div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">repeat</i>
          <span>Repeat</span>
        </div>
        <input type="number" id="repeatCount" min="1" max="20" value="1"/>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', menuHTML);
  const menuEl = document.getElementById('settingsMenu');
  attachSettingsAutoClose(btn, menuEl);

  // sync audio language selector
  const langSelect = document.getElementById('audioLangSelect');
  const current = document.getElementById('ayahAudio').src;
  const arSrc    = document.getElementById('audio-url-ar').dataset.src;
  const enSrc    = document.getElementById('audio-url-en').dataset.src;
  const urSrc    = document.getElementById('audio-url-ur').dataset.src;

  langSelect.value = 
       current === arSrc ? 'ar'
     : current === enSrc ? 'en'
     : current === urSrc ? 'ur'
     : 'ar';
};



// 11. toggleModeNav()
//     Toggles between "learning" and "reciting" modes globally.
function toggleModeNav() {
  clearNavActive();
  const btn = document.getElementById('navMode');
  btn.classList.add('active');
  currentMode = currentMode === 'learning' ? 'reciting' : 'learning';
  toggleMode(currentMode);
}
window.toggleModeNav = toggleModeNav;

// Helper: toggles mode display
function toggleMode(mode) {
  const learn = document.getElementById('learning-mode-content');
  const recit = document.getElementById('reciting-mode-content');
  const practice = document.getElementById('transliteration-box');
  learn.style.display = mode === 'learning' ? 'block' : 'none';
  recit.style.display = mode === 'reciting' ? 'block' : 'none';
  if (practice) practice.style.display = mode === 'learning' ? 'block' : 'none';
  document.getElementById('navModeIcon').textContent =
    mode === 'learning' ? 'psychology' : 'menu_book';
}


// switch audio source
function onAudioLangChange(lang) {
  const audio       = document.getElementById('ayahAudio');
  const navIcon     = document.getElementById('navPlayIcon');
  const panelIconEl = document.querySelector('#playToggleBtn .material-icons-outlined');
  
  // Pause immediately
  audio.pause();
  // Reset icons to “play”
  navIcon.textContent     = 'play_arrow';
  if (panelIconEl) panelIconEl.textContent = 'play_arrow';
  
  // Swap the source
  const newSrc = document.getElementById(`audio-url-${lang}`).dataset.src;
  if (newSrc) {
    audio.src  = newSrc;
    audio.load();
  }
}
window.onAudioLangChange = onAudioLangChange;


// change playback speed
function onSpeedChange(speed) {
  document.getElementById('ayahAudio').playbackRate = parseFloat(speed);
}

window.onSpeedChange     = onSpeedChange;

// AUDIO CONTROL SETUP
function audioControlSetup() {
  const langSelect   = document.getElementById('audioLangSelect');
  const speedSelect  = document.getElementById('speedSelect');
  const repeatInput  = document.getElementById('repeatCount');
  const audio        = document.getElementById('ayahAudio');
  const playIcon     = document.getElementById('navPlayIcon');
  const panelIcon    = document.querySelector('#playToggleBtn .material-icons-outlined');

  // whenever we change language, reset speed & repeat, stop audio
  langSelect?.addEventListener('change', () => {
    // pause immediately
    audio.pause();
    // reset speed & repeat UI
    if (speedSelect)  speedSelect.value = '1';
    if (repeatInput)  repeatInput.value = '1';
    // swap src
    const newSrc = document.getElementById(`audio-url-${langSelect.value}`)?.dataset.src;
    if (newSrc) {
      audio.src = newSrc;
      audio.load();
    }
    // update icons to “play”
    playIcon.textContent  = 'play_arrow';
    panelIcon.textContent = 'play_arrow';
  });

  // speed control
  speedSelect?.addEventListener('change', () => {
    audio.playbackRate = parseFloat(speedSelect.value);
  });

  // repeat control (you’ll need your own loop logic elsewhere)
  repeatInput?.addEventListener('change', () => {
    // e.g. store repeat count for your play-loop logic
    audio.dataset.repeat = repeatInput.value;
  });

  // ensure play/pause icons always reflect actual state
  audio.addEventListener('play',  () => { playIcon.textContent = panelIcon.textContent = 'pause'; });
  audio.addEventListener('pause', () => { playIcon.textContent = panelIcon.textContent = 'play_arrow'; });
}



// Initialize on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  ayahAudio     = document.getElementById('ayahAudio');
  audioPanel    = document.getElementById('audioControls');
  playBtn       = document.getElementById('playToggleBtn');
  navPlay       = document.getElementById('navPlay');
  panelIcon     = document.querySelector('#playToggleBtn .material-icons-outlined');
  navPlayIcon   = document.getElementById('navPlayIcon');   // ← add this
  floatingBtn   = document.getElementById('floatingPlayer');
  playToggleBtn = document.getElementById('playToggleBtn');
  const translationDropdown = document.getElementById('translationDropdown');
  const translationMenu     = translationDropdown.querySelector('.dropdown-menu-custom');
  const translationButton   = translationDropdown.querySelector('.dropdown-button');

  // 1) Grab the two icons by their real IDs/selectors
  const navPlayIconEl = document.getElementById('navPlayIcon');
  const panelIconEl   = document.querySelector('#fab .material-icons-outlined');

  // 2) Sanity check—if either is missing, we’ll see it immediately
  if (!navPlayIconEl || !panelIconEl) {
    console.error('Icon element not found:', {
      navPlayIconEl,    // should be the nav bar play/pause icon
      panelIconEl       // should be the FAB/playToggle button icon
    });
    // Don’t proceed, or you’ll keep getting null errors
    return;
  }

  // 3) Attach your audio play/pause listeners only once you know both exist
  ayahAudio.addEventListener('play', () => {
    navPlayIconEl.textContent = 'pause';
    panelIconEl.textContent   = 'pause';
  });
  ayahAudio.addEventListener('pause', () => {
    navPlayIconEl.textContent = 'play_arrow';
    panelIconEl.textContent   = 'play_arrow';
  });


  //  ---- Insert audio-control hookup here ----
  audioControlSetup();

  //  Dropdown wiring for top toggles
// open/close any dropdown-container when its button is clicked
document.querySelectorAll('.dropdown-container').forEach(dd => {
  const btn = dd.querySelector('.dropdown-button');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    // close all others
    document.querySelectorAll('.dropdown-container.active').forEach(d => {
      if (d !== dd) d.classList.remove('active');
    });
    // toggle this one
    dd.classList.toggle('active');
  });
});

// close dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-container.active')
          .forEach(dd => dd.classList.remove('active'));
});

  
  clearNavActive();
  navDesc.style.display = 'none';
  
  
  
  initTranslitFeedback();
  
  document.querySelectorAll('.translit-input').forEach(input => {
    const key = input.dataset.key;
    input.value = localStorage.getItem(key) || '';
    input.addEventListener('input', () => {
      localStorage.setItem(key, input.value);
      translitHandler({ target: input });
    });
  });

  // 6) Eraser FAB: clear all caches and inputs
  document.getElementById('clearAll').onclick = () => {
    document.querySelectorAll('.translit-input').forEach(input => {
      const key = input.dataset.key;
      localStorage.removeItem(key);
      input.value = '';
      input.dispatchEvent(new Event('input'));
    });
  };

  // 7) Hide/Show Translation FAB
  document.getElementById('hideTranslations').onclick = () => {
    document.querySelectorAll('.toggle-translation').forEach(el =>
      el.classList.toggle('hidden-toggle')
    );
    document.querySelectorAll('.show-translit').forEach(el =>
      el.style.display = el.style.display === 'none' ? 'block' : 'none'
    );
  };
   
 document.querySelectorAll('.translit-input').forEach(input => {
    const key = input.dataset.key;
    if (!key) return;

    // On load: populate from cache
    const saved = localStorage.getItem(key);
    if (saved !== null) input.value = saved;

    // On every input: save and run your feedback logic
    input.addEventListener('input', () => {
      localStorage.setItem(key, input.value);
      translitHandler({ target: input });
    });
  });  
   
});

function openSearchTab(normalizedWord) {
  const url = `/memorization/search_results.html?q=${encodeURIComponent(normalizedWord)}`;
  window.open(url, "_blank");
}

// Clear nav helper
function clearNavActive() {
  document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
}

///feedback

function initTranslitFeedback() {
  document.querySelectorAll('.translit-input').forEach(input => {
    input.removeEventListener('input', translitHandler);
    input.addEventListener('input', translitHandler);
  });
}

function translitHandler(e) {
  const normalize = s => s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ʿ/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase().trim();

  const levenshtein = (a, b) => {
    const dp = Array(a.length+1).fill().map(() => Array(b.length+1));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(
          dp[i-1][j] + 1,
          dp[i][j-1] + 1,
          dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
        );
    return dp[a.length][b.length];
  };

  const expected = normalize(e.target.dataset.expected || '');
  const actual   = normalize(e.target.value || '');
  const dist     = levenshtein(actual, expected);
  const block    = e.target.closest('.translit-block');

  block.style.borderColor = 'gray';
  block.classList.remove('confetti');
  if (!actual) {
    block.style.backgroundColor = 'white';
  } else if (dist === 0) {
    block.style.backgroundColor = '#d4edda';
    block.style.borderColor     = '#28a745';
    block.classList.add('confetti');
  } else if (dist <= 2) {
    block.style.backgroundColor = '#fff3cd';
    block.style.borderColor     = '#ffc107';
  } else {
    block.style.backgroundColor = '#f8d7da';
    block.style.borderColor     = '#dc3545';
  }
}




//games





