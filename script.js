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
let floatingClone = null;



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
    
	pracNav.innerHTML = `
      <span class="material-icons-outlined">more</span>
      <span class="nav-label">Go Back</span>
    `;
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
	pracNav.innerHTML = `
      <span class="material-icons-outlined">edit</span>
      <span class="nav-label">Practice</span>
    `;
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
// Helper to show/hide any section by ID
function toggleSection(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? 'block' : 'none';
}
window.toggleSection = toggleSection;

// Called when user picks panel translation language
function onPanelLangChange(lang) {
  const enDiv = document.getElementById('englishTranslation');
  const urDiv = document.getElementById('urduTranslation');
  const label = document.getElementById('currentLang');

  enDiv.style.display = lang === 'en' ? 'block' : 'none';
  urDiv.style.display = lang === 'ur' ? 'block' : 'none';
  label.innerText = lang === 'en' ? 'English' : 'Urdu';
}
window.onPanelLangChange = onPanelLangChange;


// Full Settings popup:
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
  const inRecite   = currentMode === 'reciting';

  // Build popup HTML
  let menuHTML = `
    <div id="settingsMenu" class="settings-popup">
      <div class="sm-header">
        <i class="material-icons-outlined">settings</i>
        <span>Settings</span>
      </div>`;

  // Practice Controls
  if (inPractice) {
    menuHTML += `
      <div class="sm-section-title">Practice Controls</div>
      <div class="sm-row">
        <button type="button" class="btn btn-sm" onclick="clearTranslitInputs()">
          Erase All Inputs
        </button>
      </div>`;
  }
  // Recite-only: translation panel toggle
  else if (inRecite) {
    menuHTML += `
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">language</i>
          <span>Show Translations Panel</span>
        </div>
        <label class="switch">
          <input id="toggleAllTrans" type="checkbox"
                 onchange="toggleSection('translation-section', this.checked)">
          <span class="slider"></span>
        </label>
      </div>`;
  }
  // Learn-only: word-level toggles
  else {
    menuHTML += `
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">translate</i>
          <span>Show Word Translations</span>
        </div>
        <label class="switch">
          <input id="toggleTrans" type="checkbox" onchange="toggleTranslations()">
          <span class="slider"></span>
        </label>
      </div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">account_tree</i>
          <span>Show Root</span>
        </div>
        <label class="switch">
          <input id="toggleRoot" type="checkbox" onchange="toggleElements('root-tag', this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">format_italic</i>
          <span>Show Grammar</span>
        </div>
        <label class="switch">
          <input id="toggleGram" type="checkbox" onchange="toggleElements('pos-tag', this.checked)">
          <span class="slider"></span>
        </label>
      </div>`;
  }

  // Audio Settings
  menuHTML += `
      <div class="sm-section-title">Audio Settings</div>
      <div class="sm-row">
        <div class="sm-label"><i class="material-icons-outlined">language</i><span>Language</span></div>
        <select id="audioLangSelect" onchange="onAudioLangChange(this.value)">
          <option value="ar">Arabic</option>
          <option value="en">English</option>
          <option value="ur">Urdu</option>
        </select>
      </div>
      <div class="sm-row">
        <div class="sm-label"><i class="material-icons-outlined">speed</i><span>Speed</span></div>
        <select id="speedSelect" onchange="onSpeedChange(this.value)">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1">1×</option>
          <option value="1.25">1.25×</option>
        </select>
      </div>
      <div class="sm-row">
        <div class="sm-label"><i class="material-icons-outlined">repeat</i><span>Repeat</span></div>
        <input type="number" id="repeatCount" min="1" max="20" value="1"/>
      </div>`;

  // **Always** show panel translation language selector, even in Learn
  menuHTML += `
      <div class="sm-section-title">Panel Translations</div>
      <div class="sm-row">
        <div class="sm-label">
          <i class="material-icons-outlined">translate</i>
          <span>Translation Language</span>
        </div>
        <select id="translationLangSelect" onchange="onPanelLangChange(this.value)">
          <option value="en">English</option>
          <option value="ur">Urdu</option>
        </select>
      </div>`;

  // Close container
  menuHTML += `</div>`;

  // Insert & wire up
  document.body.insertAdjacentHTML('beforeend', menuHTML);
  const menuEl = document.getElementById('settingsMenu');
  menuEl.getBoundingClientRect();
  menuEl.classList.add('show');
  attachSettingsAutoClose(btn, menuEl);

  // Sync toggles:
  if (!inPractice && !inRecite) {
    document.getElementById('toggleTrans').checked =
      Array.from(document.querySelectorAll('.toggle-translation'))
           .some(el => !el.classList.contains('hidden-toggle'));
    document.getElementById('toggleRoot').checked =
      Array.from(document.querySelectorAll('.toggle-root'))
           .some(el => !el.classList.contains('hidden-toggle'));
    document.getElementById('toggleGram').checked =
      Array.from(document.querySelectorAll('.toggle-pos'))
           .some(el => !el.classList.contains('hidden-toggle'));
  }

  if (inRecite) {
    const allTrans = document.getElementById('toggleAllTrans');
    const ts       = document.getElementById('translation-section');
    if (allTrans) allTrans.checked = ts && ts.style.display !== 'none';
  }

  // Sync panel language dropdown initial value
  const currentPanel = document.getElementById('currentLang').innerText.toLowerCase();
  const panelSelect = document.getElementById('translationLangSelect');
  if (panelSelect) panelSelect.value = currentPanel === 'urdu' ? 'ur' : 'en';

  // Sync audio selector:
  const langSelect = document.getElementById('audioLangSelect');
  const current   = document.getElementById('ayahAudio').src;
  const arSrc     = document.getElementById('audio-url-ar').dataset.src;
  const enSrc     = document.getElementById('audio-url-en').dataset.src;
  const urSrc     = document.getElementById('audio-url-ur').dataset.src;
  langSelect.value = current === arSrc ? 'ar'
                   : current === enSrc ? 'en'
                   : current === urSrc ? 'ur'
                   : 'ar';
};





// 11. toggleModeNav()
//     Toggles between "learning" and "reciting" modes globally.
function toggleModeNav() {
  // 1) always turn Practice off
  const pracBox = document.getElementById('transliteration-box');
  const pracNav = document.getElementById('navPractice');
  if (pracBox)    pracBox.style.display = 'none';
  if (pracNav)    pracNav.classList.remove('active');

  // 2) now do the normal Learn/Recite toggle
  clearNavActive();
  const btn = document.getElementById('navMode');
  btn.classList.add('active');
  currentMode = currentMode === 'learning' ? 'reciting' : 'learning';
  toggleMode(currentMode);
}
window.toggleModeNav = toggleModeNav;

// Helper: toggles mode display
// Helper: toggles learn/recite display (no longer touches practice)
function toggleMode(mode) {
  const learn  = document.getElementById('learning-mode-content');
  const recit  = document.getElementById('reciting-mode-content');

  // Toggle the two main sections
  learn.style.display = mode === 'learning' ? 'block' : 'none';
  recit.style.display = mode === 'reciting' ? 'block' : 'none';

  // Always hide Practice when switching modes
  document.getElementById('transliteration-box').style.display = 'none';

  // Update the icon
  document.getElementById('navModeIcon').textContent =
    mode === 'learning' ? 'psychology' : 'menu_book';
}
window.toggleMode = toggleMode;




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
  const panelIconEl   = document.querySelector('#playToggleBtn .material-icons-outlined');

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
  if (!btn) return;  
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
  const clearBtn = document.getElementById('clearAll');
  if (clearBtn) {
    clearBtn.onclick = () => {
      document.querySelectorAll('.translit-input').forEach(input => {
        const key = input.dataset.key;
        localStorage.removeItem(key);
        input.value = '';
        input.dispatchEvent(new Event('input'));
      });
    };
  }
  

  // 7) Hide/Show Translation FAB
  const hideTranslationsBtn = document.getElementById('hideTranslations');
  if (hideTranslationsBtn) {
    hideTranslationsBtn.onclick = () => {
      document.querySelectorAll('.toggle-translation')
              .forEach(el => el.classList.toggle('hidden-toggle'));
      document.querySelectorAll('.show-translit')
              .forEach(el => el.style.display = el.style.display === 'none' ? 'block' : 'none');
    };
  }
  
   
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
// Place this once, e.g. in your DOMContentLoaded block:
document.addEventListener('click', e => {
  const menu = document.getElementById('settingsMenu');
  const btn  = document.getElementById('navSettings');
  if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.remove();
    btn.classList.remove('active');
  }
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
  const block    = e.target.closest('.word-block-translit');

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

// Verb audio cache
const audioCache = {};

async function playVerbAudio(verb, tense, linkElement) {
  const key       = `${verb}_${tense}`;
  const iconSpan  = linkElement.querySelector(".audio-icon");
  const baseUrls  = [
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs1/",
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs2/",
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs3/",
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs4/"
  ];

  // If already cached, just toggle play/pause
  if (audioCache[key]) {
    const audio = audioCache[key];
    if (!audio.paused) {
      audio.pause();
      iconSpan && (iconSpan.textContent = "🔊");
    } else {
      audio.currentTime = 0;
      audio.play();
      iconSpan && (iconSpan.textContent = "⏸️");
    }
    return;
  }

  // Try each base URL by loading via Audio() and catching 'error'
  for (const base of baseUrls) {
    const url = `${base}${key}.mp3`;
    try {
      const audio = new Audio();
      let tried = false;

      // If it loads metadata, we know it's valid
      const onLoaded = () => {
        if (tried) return;
        tried = true;
        audioCache[key] = audio;
        audio.play();
        iconSpan && (iconSpan.textContent = "⏸️");
        audio.removeEventListener("error", onError);
        audio.removeEventListener("canplaythrough", onLoaded);
        audio.addEventListener("ended", () => {
          iconSpan && (iconSpan.textContent = "🔊");
        });
      };

      const onError = () => {
        audio.removeEventListener("error", onError);
        audio.removeEventListener("canplaythrough", onLoaded);
        // move on to next base URL
      };

      audio.addEventListener("canplaythrough", onLoaded, { once: true });
      audio.addEventListener("error",          onError,   { once: true });

      // Kick off loading
      audio.src = url;
      audio.load();

      // Wait up to 2 seconds to decide if canplaythrough happened
      await new Promise(res => setTimeout(res, 2000));
      if (tried) return;        // it did load
    } catch (e) {
      // ignore and try next
    }
  }

  // nothing worked
  alert(`⚠️ Audio for "${verb}" (${tense}) not found.`);
}

/*
window.addEventListener('DOMContentLoaded', () => {
  const nav           = document.querySelector('.bottom-nav');
  const playBtn       = document.getElementById('playToggleBtn');
  const audio         = document.getElementById('ayahAudio');
  const SHOW_DURATION = 3000;
  let   hideTimer;

  // your existing showNav() + scheduleHide() …
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => nav.classList.remove('visible'), SHOW_DURATION);
  }
  function showNav() {
    nav.classList.add('visible');
    scheduleHide();
  }

  // --- NEW: audio hook to “pop out” the playBtn ---
  function floatPlayBtn() {
    // 1) remove it from the nav
    nav.removeChild(playBtn);
    // 2) append to body and fix at bottom-centre
    document.body.appendChild(playBtn);
    Object.assign(playBtn.style, {
      position:   'fixed',
      bottom:     '16px',
      left:       '50%',
      transform:  'translateX(-50%)',
      zIndex:     9999,
    });
    // hide the rest of the nav immediately
    nav.classList.remove('visible');
  }

  function reattachPlayBtn() {
    // remove from body
    document.body.removeChild(playBtn);
    // clear the inline styles
    playBtn.style.position  = '';
    playBtn.style.bottom    = '';
    playBtn.style.left      = '';
    playBtn.style.transform = '';
    playBtn.style.zIndex    = '';
    // put back into the nav at its original spot
    nav.appendChild(playBtn);
    // then re-show the nav for 3s
    showNav();
  }

  // --- wire audio events ---
  audio.addEventListener('play', () => {
    floatPlayBtn();
  });
  audio.addEventListener('pause', () => {
    reattachPlayBtn();
  });
  audio.addEventListener('ended', () => {
    reattachPlayBtn();
  });

  // --- keep your existing logic for load/scroll/settings ---
  showNav();  // on load
  window.addEventListener('scroll', showNav, { passive: true });

  document.body.addEventListener('click', e => {
    if (e.target.closest('#navSettings')) {
      nav.classList.add('visible');
      clearTimeout(hideTimer);
    }
  });

  new MutationObserver(muts => {
    muts.forEach(m => {
      m.removedNodes.forEach(n => {
        if (n.id === 'settingsMenu') showNav();
      });
    });
  }).observe(document.body, { childList: true });

  document.querySelectorAll('.bottom-nav .nav-item')
          .forEach(i => i.addEventListener('click', showNav));
});
*/
window.addEventListener('DOMContentLoaded', () => {
  const nav           = document.querySelector('.bottom-nav');
  const playBtn       = document.getElementById('playToggleBtn');
  const audio         = document.getElementById('ayahAudio');
  const SHOW_DURATION = 3000;
  let   hideTimer;
  

  // auto-hide scheduler
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => nav.classList.remove('visible'), SHOW_DURATION);
  }

  // show nav + restart timer
  function showNav() {
    nav.classList.add('visible');
    scheduleHide();
  }

  // placeholder for re-insertion
  //const placeholder = document.createComment('play-btn-placeholder');
  //nav.insertBefore(placeholder, playBtn);
  
  placeholder = document.createElement('div');
  placeholder.className = 'nav-item play-btn-placeholder';
  // copy computed dimensions & margins from the real button
  const cs = getComputedStyle(playBtn);
  placeholder.style.cssText = `
    width:       ${cs.width};
    height:      ${cs.height};
    margin-top:  ${cs.marginTop};
    margin-left: ${cs.marginLeft};
    margin-right:${cs.marginRight};
    visibility:  hidden;
    flex-shrink: 0;
  `;

  // float the button out of the nav into the body
  function floatPlayBtn() {
    if (playBtn.parentNode === nav) {
      // insert our placeholder before we yank the real button out
      nav.insertBefore(placeholder, playBtn);
      nav.removeChild(playBtn);

      document.body.appendChild(playBtn);
      Object.assign(playBtn.style, {
        position:  'fixed',
        bottom:    '38px',
        left:      '50%',
        transform: 'translateX(-50%)',
        zIndex:    '9999',
      });
      scheduleHide();
    }
  }

  // put it back into the nav at the placeholder
  function reattachPlayBtn() {
    if (playBtn.parentNode === document.body) {
      document.body.removeChild(playBtn);
      // clear the inline styles
      ['position','bottom','left','transform','zIndex'].forEach(p => playBtn.style[p] = '');
      // swap placeholder back out for the real button
      nav.replaceChild(playBtn, placeholder);
      showNav();
    }
  }

  // wire audio events
  audio.addEventListener('play',  () => floatPlayBtn());
  audio.addEventListener('pause', () => reattachPlayBtn());
  audio.addEventListener('ended', () => reattachPlayBtn());

  // initial load + scroll
  showNav();
  window.addEventListener('scroll', showNav, { passive: true });

  // keep visible while settings are open, re-hide after closing
  document.body.addEventListener('click', e => {
    if (e.target.closest('#navSettings')) {
      nav.classList.add('visible');
      clearTimeout(hideTimer);
    }
  });
  new MutationObserver(muts => {
    muts.forEach(m => m.removedNodes.forEach(n => {
      if (n.id === 'settingsMenu') showNav();
    }));
  }).observe(document.body, { childList: true });

  // clicking any nav item also resets the 3s timer
  document.querySelectorAll('.bottom-nav .nav-item')
          .forEach(i => i.addEventListener('click', showNav));
});


/////GAMES section
///// GAMES section
window.toggleGames = function () {
  console.log("🔄 toggleGames called");

  const learnSec = document.getElementById("learning-mode-content");
  const gameContainer = document.getElementById("game-mode-content");

  if (!gameContainer) {
    console.error("❌ game-mode-content not found in DOM.");
    return;
  }

  // Toggle views
  learnSec.style.display = "none";
  gameContainer.style.display = "block";

  if (gameContainer.dataset.initialized === "true") return;

  console.log("🧩 Injecting game content...");

  const wordElements = Array.from(document.querySelectorAll("#learning-mode-content .word-block"));
  const correctOrder = wordElements.map(el => el.textContent.trim());

  gameContainer.innerHTML = `
    <div class="prompt">Click the words below in correct order</div>
    <div class="slots" id="slotContainer"></div>
    <div class="options" id="optionsContainer"></div>
    <button class="check-btn" onclick="checkAnswer()">✔ Check</button>
    <div class="result" id="resultText"></div>
  `;

  const optionsContainer = gameContainer.querySelector('#optionsContainer');
  const slotContainer = gameContainer.querySelector('#slotContainer');
  const resultText = gameContainer.querySelector('#resultText');

  // Create empty slots
  correctOrder.forEach(() => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slotContainer.appendChild(slot);
  });

  // Shuffle and clone word blocks with all classes & prevent popup
  const shuffled = [...wordElements].sort(() => 0.5 - Math.random());
  shuffled.forEach(original => {
    const box = original.cloneNode(true); // deep clone
    box.classList.add('word-box');
    box.removeAttribute('onclick'); // prevent showPopup if set inline
    box.onclick = null;

    // Also block any showPopup added by addEventListener
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      placeWord(box);
    });

    optionsContainer.appendChild(box);
  });

  gameContainer.dataset.initialized = "true";

  // Place word in next empty slot with animation
  window.placeWord = function (box) {
    const emptySlot = [...document.querySelectorAll('.slot')].find(s => !s.dataset.word);
    if (!emptySlot) return;

    const rectFrom = box.getBoundingClientRect();
    const rectTo = emptySlot.getBoundingClientRect();

    const movingClone = box.cloneNode(true);
    movingClone.classList.add('clone');
    movingClone.style.position = 'fixed';
    movingClone.style.left = `${rectFrom.left}px`;
    movingClone.style.top = `${rectFrom.top}px`;
    movingClone.style.width = `${rectFrom.width}px`;
    movingClone.style.height = `${rectFrom.height}px`;
    movingClone.style.transition = 'transform 0.4s ease';
    document.body.appendChild(movingClone);

    requestAnimationFrame(() => {
      movingClone.style.transform = `translate(${rectTo.left - rectFrom.left}px, ${rectTo.top - rectFrom.top}px)`;
    });

    setTimeout(() => {
      movingClone.remove();
      const arabicText = box.querySelector('.word-text')?.textContent.trim() || box.textContent.trim();
      emptySlot.textContent = arabicText;


      emptySlot.dataset.word = box.textContent.trim();
      emptySlot.classList.add('filled');
    }, 400);

    box.remove(); // remove from options
  };

  // Answer checking logic
  window.checkAnswer = function () {
    const current = [...document.querySelectorAll('.slot')].map(s => s.dataset.word || '');
    const isCorrect = current.every((w, i) => w === correctOrder[i]);
    resultText.textContent = isCorrect ? '🎉 Correct! Well done!' : '❌ Not quite right. Try again!';
    resultText.style.color = isCorrect ? 'green' : 'red';
  };
};


