// Declare globals for cross-scope use
let ayahAudio;
let audioPanel;
let playBtn;
let wordAudio = new Audio();
let navPlay;
let navPlayIcon;       // ← add this
let panelIcon;
let floatingBtn;
let playToggleBtn;
let currentMode = 'learning';
const LEGACY_IFRAME_RECITE_MODE_ENABLED = false;
let floatingClone = null;
let currentKey = null;
const root = document.body;
let currentSurah = 1, currentAyah = 1;
const audioCache = {};
const cleanupFns = [];
const RAW_ORIGIN = window.location.origin;
const PARENT_ORIGIN = RAW_ORIGIN === 'null' ? '*' : RAW_ORIGIN;
const IS_NATIVE_CONTAINER = (() => {
  try {
    return Boolean(
      window.ReactNativeWebView ||
      window.parent?.ReactNativeWebView ||
      window.top?.ReactNativeWebView
    );
  } catch {
    return Boolean(window.ReactNativeWebView);
  }
})();
let ticking = false;
const SHOW_DURATION = 3000;
let hideTimer = null;
let iframeDomVersion = 0;
let lastInitVersion  = -1;
let remainingRepeats = 1;
let pendingSwipeProgress = null;
let swipeRAFActive = false;
let rafSendProgress = false
let scrollEl;
let el;






let isScrolling = false;
let scrollEndTimer = null;
const SCROLL_END_DELAY = 120; // ms
let allowWordHint = true;
let allowSaveHint = true;
let appliedSettingsVersion = 0;
let holdNavVisible = false;
let saveHintOverlay;
let saveHint;
let saveHintText;
let saveHintLottie;
let closeSettingsMenuFn = null;
let settingsOutsideClickHandler = null;

function sanitizeTypographySettings(raw = {}) {
  const arabicFont = raw.arabicFont === 'UthmanicHafs' ? 'UthmanicHafs' : 'CustomArabic';
  const parsedSize = Number.parseFloat(raw.arabicSize);
  const arabicSize = Number.isFinite(parsedSize)
    ? Math.min(56, Math.max(16, parsedSize))
    : 28;
  const parsedWeight = Number.parseInt(raw.arabicWeight, 10);
  const weightBucket = Number.isFinite(parsedWeight)
    ? Math.round(parsedWeight / 100) * 100
    : 100;
  const arabicWeight = Math.min(900, Math.max(100, weightBucket));
  const englishRaw = Number.parseFloat(raw.englishScale);
  const englishScale = Number.isFinite(englishRaw)
    ? Math.min(160, Math.max(70, englishRaw))
    : 100;
  return {
    arabicFont,
    arabicSize,
    arabicWeight,
    arabicItalic: raw.arabicItalic === true,
    englishScale
  };
}

function applyTypographySettings(rawSettings = {}) {
  const settings = sanitizeTypographySettings(rawSettings);
  const html = document.documentElement;
  html.setAttribute('data-arabic-font', settings.arabicFont);
  html.style.setProperty('--qq-arabic-font-family', `'${settings.arabicFont}'`);
  html.style.setProperty('--qq-arabic-size', `${settings.arabicSize}px`);
  html.style.setProperty('--qq-arabic-weight', String(settings.arabicWeight));
  html.style.setProperty('--qq-arabic-style', settings.arabicItalic ? 'italic' : 'normal');
  html.style.setProperty('--qq-english-scale', String(settings.englishScale / 100));
}

function normalizeIframeReaderMode(modeCandidate) {
  const mode = String(modeCandidate || '').trim().toLowerCase();
  if (mode === 'reciting') {
    return LEGACY_IFRAME_RECITE_MODE_ENABLED ? 'reciting' : 'learning';
  }
  return mode === 'learning' ? 'learning' : 'learning';
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('input, textarea, [contenteditable="true"], .allow-text-select')
  );
}

function enableNativeInteractionGuard() {
  if (!IS_NATIVE_CONTAINER) return;

  document.documentElement.classList.add('native-app-embedded');
  if (document.body) {
    document.body.classList.add('native-app-embedded');
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body?.classList.add('native-app-embedded');
    }, { once: true });
  }

  const blockIfNotEditable = event => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', blockIfNotEditable, { capture: true });
  document.addEventListener('selectstart', blockIfNotEditable, { capture: true });
}

enableNativeInteractionGuard();

const debugLog = (typeof console !== 'undefined' && console.log)
  ? console.log.bind(console)
  : null;

document.addEventListener('DOMContentLoaded', () => {
  if (!debugLog) return;
  const bodyStyle = getComputedStyle(document.body);
  debugLog('paddingTop', bodyStyle.paddingTop);
  debugLog('paddingBottom', bodyStyle.paddingBottom);
});

const DISABLE_CONSOLE_LOGS = true;
if (DISABLE_CONSOLE_LOGS && typeof console !== 'undefined') {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = noop;
  console.group = noop;
  console.groupCollapsed = noop;
  console.groupEnd = noop;
  console.time = noop;
  console.timeEnd = noop;
}

const RECITE_ICON_SVG = `
  <svg viewBox="0 0 800 800" aria-hidden="true" focusable="false">
    <g>
      <path d="M689.861,762.52H43.427c-11.046,0-20-8.953-20-20v-72.432c0-5.303,2.107-10.391,5.858-14.141c51.399-51.4,119.739-79.707,192.428-79.707c57.578,0,112.424,17.758,158.286,50.689V243.124c0-11.046,8.954-20,20-20c11.045,0,20,8.954,20,20v426.964c0,8.09-4.873,15.383-12.348,18.479c-7.473,3.096-16.075,1.385-21.794-4.336c-88.582-88.582-231.533-90.465-322.431-5.658v43.947h626.434c11.047,0,20,8.955,20,20C709.861,753.566,700.908,762.52,689.861,762.52z"/>
      <path d="M756.572,762.52h-5.877c-11.047,0-20-8.953-20-20c0-11.045,8.953-20,20-20h5.877c11.047,0,20,8.955,20,20C776.572,753.566,767.619,762.52,756.572,762.52z"/>
      <path d="M756.576,690.09c-5.205,0-10.318-2.033-14.146-5.859c-67.463-67.461-171.348-86.76-258.504-48.021c-10.094,4.486-21.914-0.061-26.4-10.154s0.061-21.912,10.154-26.398c49.729-22.104,104.445-28.756,158.236-19.238c40.258,7.123,77.848,23,110.656,46.529V139.812c-90.896-84.806-233.848-82.922-322.432,5.657c-7.811,7.811-20.472,7.81-28.283,0c-88.582-88.58-231.533-90.464-322.431-5.657v423.221c0,11.047-8.954,20-20,20s-20-8.953-20-20V131.329c0-5.305,2.107-10.392,5.858-14.142C80.685,65.787,149.023,37.48,221.713,37.48c66.207,0,128.81,23.486,178.286,66.512C449.473,60.969,512.082,37.48,578.285,37.48c0.004,0-0.004,0,0,0c72.691,0,141.029,28.307,192.43,79.706c3.75,3.751,5.857,8.838,5.857,14.143v538.759c0,8.09-4.873,15.383-12.346,18.479C761.752,689.592,759.152,690.09,756.576,690.09z"/>
      <path d="M324.991,239.373c-2.735,0-5.514-0.564-8.172-1.756c-1.834-0.822-3.703-1.632-5.558-2.405c-10.193-4.255-15.008-15.967-10.753-26.161c4.254-10.193,15.967-15.008,26.16-10.753c2.175,0.908,4.367,1.857,6.518,2.821c10.079,4.52,14.585,16.354,10.065,26.433C339.923,234.972,332.629,239.373,324.991,239.373z"/>
      <path d="M118.427,239.377c-7.638,0-14.93-4.397-18.259-11.816c-4.522-10.078-0.019-21.913,10.059-26.436c47.997-21.538,100.96-28.667,153.164-20.617c10.916,1.684,18.401,11.898,16.718,22.814c-1.684,10.917-11.901,18.401-22.814,16.719c-44.56-6.871-89.752-0.793-130.69,17.578C123.945,238.813,121.164,239.377,118.427,239.377z"/>
      <path d="M324.994,379.21c-2.737,0-5.517-0.564-8.176-1.758c-40.946-18.373-86.146-24.45-130.712-17.573c-10.916,1.687-21.131-5.799-22.816-16.716c-1.684-10.916,5.799-21.131,16.716-22.816c52.212-8.057,105.184-0.929,153.187,20.611c10.078,4.522,14.582,16.357,10.06,26.435C339.924,374.812,332.63,379.21,324.994,379.21z"/>
      <path d="M118.427,379.212c-7.638,0-14.93-4.397-18.259-11.817c-4.522-10.077-0.019-21.913,10.06-26.435c2.171-0.975,4.374-1.928,6.547-2.835c10.193-4.253,21.906,0.563,26.159,10.757c4.253,10.194-0.563,21.906-10.757,26.159c-1.849,0.771-3.724,1.583-5.574,2.413C123.945,378.648,121.164,379.212,118.427,379.212z"/>
      <path d="M324.992,519.043c-2.737,0-5.52-0.565-8.179-1.76c-1.836-0.824-3.699-1.631-5.537-2.398c-10.193-4.254-15.009-15.966-10.754-26.16c4.253-10.192,15.965-15.008,26.159-10.754c2.164,0.903,4.354,1.852,6.513,2.82c10.077,4.523,14.579,16.359,10.056,26.438C339.919,514.646,332.627,519.043,324.992,519.043z"/>
      <path d="M118.429,519.047c-7.638,0-14.929-4.398-18.259-11.816c-4.522-10.078-0.019-21.914,10.059-26.436c48.009-21.545,100.987-28.672,153.207-20.609c10.916,1.684,18.399,11.9,16.714,22.816c-1.685,10.916-11.898,18.399-22.817,16.715c-44.572-6.881-89.777-0.805-130.727,17.572C123.948,518.481,121.166,519.047,118.429,519.047z"/>
      <path d="M475.008,239.373c-7.639,0-14.932-4.4-18.26-11.821c-4.52-10.078-0.014-21.913,10.064-26.433c2.15-0.964,4.344-1.913,6.518-2.821c10.193-4.255,21.906,0.56,26.16,10.753c4.256,10.193-0.559,21.906-10.752,26.161c-1.855,0.773-3.725,1.583-5.559,2.405C480.523,238.808,477.742,239.373,475.008,239.373z"/>
      <path d="M681.572,239.377c-2.738,0-5.518-0.564-8.178-1.758c-40.939-18.371-86.131-24.45-130.689-17.578c-10.916,1.683-21.131-5.802-22.814-16.719c-1.684-10.916,5.801-21.131,16.717-22.814c52.205-8.051,105.168-0.921,153.164,20.617c10.078,4.522,14.58,16.357,10.059,26.436C696.502,234.979,689.209,239.377,681.572,239.377z"/>
      <path d="M475.006,379.21c-7.639,0-14.93-4.397-18.26-11.817c-4.521-10.077-0.018-21.913,10.061-26.435c48.004-21.541,100.973-28.668,153.186-20.611c10.918,1.685,18.4,11.9,16.717,22.816c-1.686,10.917-11.9,18.399-22.816,16.716c-44.564-6.877-89.766-0.8-130.711,17.573C480.523,378.646,477.742,379.21,475.006,379.21z"/>
      <path d="M681.572,379.212c-2.738,0-5.518-0.564-8.176-1.757c-1.852-0.83-3.727-1.642-5.574-2.413c-10.195-4.253-15.01-15.965-10.758-26.159c4.254-10.194,15.967-15.01,26.16-10.757c2.172,0.907,4.375,1.86,6.547,2.835c10.076,4.521,14.58,16.357,10.059,26.435C696.502,374.814,689.209,379.212,681.572,379.212z"/>
      <path d="M475.008,519.043c-7.637,0-14.928-4.396-18.258-11.814c-4.523-10.078-0.021-21.914,10.055-26.438c2.158-0.969,4.35-1.917,6.514-2.82c10.193-4.254,21.906,0.561,26.158,10.754c4.256,10.194-0.561,21.906-10.754,26.16c-1.838,0.768-3.701,1.574-5.537,2.398C480.527,518.477,477.744,519.043,475.008,519.043z"/>
      <path d="M681.57,519.047c-2.738,0-5.518-0.565-8.178-1.758c-40.949-18.377-86.154-24.453-130.727-17.572c-10.918,1.684-21.133-5.799-22.816-16.715c-1.686-10.916,5.797-21.133,16.713-22.816c52.221-8.063,105.197-0.936,153.207,20.609c10.078,4.521,14.58,16.357,10.059,26.436C696.5,514.648,689.207,519.047,681.57,519.047z"/>
    </g>
  </svg>
`;




const pathMatch = window.location.pathname.match(/ayah_(\d+)_(\d+)/);
if (pathMatch) {
  currentSurah = parseInt(pathMatch[1], 10);
  currentAyah = parseInt(pathMatch[2], 10);
}
console.log('[IFRAME] script.js executed', location.pathname);

/* ============================
   BOOT APPLY SETTINGS (EARLY)
============================ */
(() => {
  const html = document.documentElement;
  // Default state: roots hidden unless user explicitly turns them on.
  html.classList.add('hide-root');
  try {
    const raw = localStorage.getItem('qq_settings');
    if (!raw) return;
    const settings = JSON.parse(raw);
    if (!settings || typeof settings !== 'object') return;

    html.classList.toggle('hide-root', settings.showRoot !== true);
    html.classList.toggle('hide-grammar', settings.showGrammar === false);
    html.classList.toggle('hide-word-translation', settings.showWordTranslation === false);
    html.classList.toggle('dark-mode', settings.darkMode === true);
    if (document.body) document.body.classList.toggle('dark-mode', settings.darkMode === true);
    if (typeof settings.showPanelTranslation === 'boolean') {
      html.classList.toggle('hide-panel-translation', !settings.showPanelTranslation);
    }
    if (settings.panelLang === 'en' || settings.panelLang === 'ur') {
      html.setAttribute('data-panel-lang', settings.panelLang);
    }
    applyTypographySettings(settings);
  } catch (err) {
    // Swallow parse errors to avoid blocking iframe boot.
  }
})();

/* ============================
    GRAMMAR EXPLANATIONS
============================ */
const grammarExplanations = {

  nominative: `
    <h3 style="color:#f1948a;"> Nominative (Rafʿ — رَفْع)</h3>
    <p><b>“The Doer (or the main thing being talked about)”</b></p>

    <p><b>What it means (simple):</b><br>
    The one <b>doing the action</b> in a sentence.</p>

    <p><b>How to find it:</b></p>
    <ol>
      <li>Find the <span style="color:#f0ad4e;font-weight:bold;">action (verb)</span></li>
      <li>Ask: <b>Who is doing it?</b></li>
    </ol>

    <p>
      That word is <b style="color:#f1948a;">Rafʿ (Nominative)</b>.
    </p>

    <p><b>Important rule:</b><br>
    If there is <b>no special reason</b> to change a noun, it <b>stays in Rafʿ by default</b>.
    </p>

    <p><b>Example:</b></p>
    <p style="font-size:20px;">
      <span style="color:#f1948a;font-weight:bold;">اللَّهُ</span>
      <span style="color:#f0ad4e;"> خَلَقَ</span>
      السَّمَاوَاتِ
    </p>

    <p>
      → <span style="color:#f1948a;font-weight:bold;">Allah</span> is doing the action → <b>Rafʿ</b>
    </p>

    <p><b>In Arabic grammar words:</b><br>
    Rafʿ = <b>مرفوع</b></p>
  `,

  accusative: `
    <h3 style="color:#9ec5fe;">Accusative (Naṣb — نَصْب)</h3>
    <p><b>“Extra Details”</b></p>

    <p><b>What it means:</b><br>
    Anything that is <b>not the doer</b>, but gives <b>extra information</b> about the action.
    </p>

    <p><b>Key rule:</b><br>
    After finding the <b>action + doer</b>,<br>
    <b>everything else becomes Naṣb</b>.
    </p>

    <p><b>What counts as “details”?</b></p>
    <ul>
      <li>The object</li>
      <li>Time</li>
      <li>Place</li>
      <li>Manner</li>
      <li>Reason</li>
    </ul>

    <p><b>Example:</b></p>

    <p>
      Action: <span style="color:#f0ad4e;">guides</span><br>
      Doer: <span style="color:#f1948a;">Allah</span> (Rafʿ)<br>
      <span style="color:#9ec5fe;font-weight:bold;">People / path</span> → extra info → <b>Naṣb</b>
    </p>

    <p><b>In Arabic grammar words:</b><br>
    Naṣb = <b>منصوب</b></p>
  `,

  genitive: `
    <h3 style="color:#8fd19e;">Genitive (Jarr — جَرّ)</h3>
    <p><b>“After of / in / from / with …”</b></p>

    <p><b>What it means:</b><br>
    A word that comes after:
    </p>

    <ul>
      <li>of</li>
      <li>in</li>
      <li>from</li>
      <li>with</li>
      <li>to</li>
      <li>for</li>
    </ul>

    <p>
      These words are called <b>ḥurūf al-jarr</b> (prepositions).
    </p>

    <p><b>Big rule:</b><br>
    Any noun <b>after a preposition is ALWAYS Jarr</b>.
    </p>

    <p><b>Also includes possession:</b></p>
    <ul>
      <li>Book <b>of</b> Allah</li>
      <li>Mercy <b>of</b> Allah</li>
    </ul>

    <p>
      Even if “of” is hidden, you can rephrase to see it.
    </p>

    <p><b>Example:</b></p>
    <p style="font-size:20px;">
      رَسُولُ <span style="color:#8fd19e;font-weight:bold;">اللَّهِ</span>
    </p>

    <p>
      “of Allah” → <span style="color:#8fd19e;font-weight:bold;">Allah</span> = <b>Jarr</b>
    </p>

    <p><b>In Arabic grammar words:</b><br>
    Jarr = <b>مجرور</b></p>
  `,

  verb: `
    <h3 style="color:#f0ad4e;">Verb (Fiʿl — فِعْل)</h3>
    <p><b>“The Action Itself”</b></p>

    <p><b>What it means:</b><br>
    A word that has <b>time</b>:
    </p>

    <ul>
      <li>Past</li>
      <li>Present</li>
      <li>Future</li>
    </ul>

    <p><b>Test:</b><br>
    Put <b>“I”</b> before the word:
    </p>

    <ul>
      <li>“I ate” ✅ → Verb</li>
      <li>“I book” ❌ → Not a verb</li>
    </ul>

    <p><b>Why verbs matter:</b></p>
    <ul>
      <li>They decide who is <b>Rafʿ</b></li>
      <li>They decide what becomes <b>Naṣb</b></li>
    </ul>

    <p><b>Example:</b></p>
    <p>
      Allah <span style="color:#f0ad4e;font-weight:bold;">knows</span>
      <span style="color:#9ec5fe;font-weight:bold;">everything</span>
    </p>

    <p>
      Knows = <b>Fiʿl</b><br>
      Allah = <b>Rafʿ</b><br>
      Everything = <b>Naṣb</b>
    </p>
  `
};

/*************************************************
 * LOGGER — NAMESPACED DEBUG LOGGING
 *************************************************/

const LOG = {
  ui:     (...args) => console.log('[UI]', ...args),
  audio:  (...args) => console.log('[AUDIO]', ...args),
  swipe:  (...args) => console.log('[SWIPE]', ...args),
  popup:  (...args) => console.log('[POPUP]', ...args),
  init:   (...args) => console.log('[INIT]', ...args),
  debug:  (...args) => console.log('[DEBUG]', ...args),
  iframe: (...args) => console.log('[IFRAME]', ...args), 
};



    /* ==========================================================
   SWIPE ENGINE (MOVED FROM PARENT → IFRAME)
   Logic preserved 1:1
========================================================== */

      let swipeStartX = 0;
      let swipeStartY = 0;
      let swipeDX = 0; //distance
      let swipeStartTime = 0;
      let isSwiping = false;
      let swipeCommitted = false;
      let swipeLocked = false;
      let swipeBlockedByHint = false;
      let swipeDir = 0; // -1 = right, 1 = left
      let hasPointerCapture = false;
      let swipeScrollLocked = false;

      function setSwipeBlockedByHint(blocked) {
        swipeBlockedByHint = !!blocked;
      }

      function blockSwipeForHint() {
        setSwipeBlockedByHint(true);
        swipeLocked = true;
        isSwiping = false;
        swipeCommitted = false;
        swipeDir = 0;
        swipeDX = 0;
        lastSentFrame = 0;
        unlockSwipeScroll();
        window.parent?.postMessage({ type: 'SWIPE_CANCEL' }, PARENT_ORIGIN);
      }

      function unblockSwipeForHint() {
        swipeLocked = false;
        setSwipeBlockedByHint(false);
      }

      function lockSwipeScroll() {
        if (!swipeScrollLocked) {
          document.body.style.overflow = 'hidden';
          swipeScrollLocked = true;
        }
      }

      function unlockSwipeScroll() {
        if (swipeScrollLocked) {
          document.body.style.overflow = '';
          swipeScrollLocked = false;
        }
      }


      // 🔑 SAME FEEL CONSTANTS
      const VERTICAL_RATIO = 1;
      const INTENT_DISTANCE = 2; // tap/click dead-zone
      const HORIZONTAL_LOCK_RATIO = 1;
      const DRAG_DAMPING = 1;
      let lastSettings = null;

      const SWIPE_IGNORE_SELECTOR = [
        '.bottom-nav',
        '#settingsMenu',
        '.settings-popup',
        '#overlay',
        '#popupContent'
      ].join(',');

      function shouldIgnoreSwipeTarget(target) {
        if (!(target instanceof Element)) return false;
        return !!target.closest(SWIPE_IGNORE_SELECTOR);
      }

      function isGameModeActive() {
        const gameEl = document.getElementById('game-mode-content');
        if (!gameEl) return false;
        const style = window.getComputedStyle(gameEl);
        return (
          document.body.classList.contains('game-active') &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      const SWIPE_DEBUG_TAPS = false;
      function debugSwipeState(label, e) {
        if (!SWIPE_DEBUG_TAPS) return;
        const target = e?.target;
        const tag = target?.tagName;
        const id = target?.id ? `#${target.id}` : '';
        const cls = target?.className ? `.${String(target.className).split(' ').join('.')}` : '';
        console.log(`[SWIPE][DBG] ${label}`, {
          swipeLocked,
          isScrolling,
          isSwiping,
          swipeDir,
          target: `${tag || 'unknown'}${id}${cls}`
        });
      }
      
      let lastSentFrame = 0;
      let swipeBaseWidth = 0;

      function onSwipePointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (isGameModeActive()) {
          swipeLocked = false;
          isSwiping = false;
          swipeCommitted = false;
          unlockSwipeScroll();
          return;
        }
        debugSwipeState('pointerdown:before', e);
        if (swipeBlockedByHint) {
          debugSwipeState('pointerdown:blocked-hint', e);
          return;
        }
        if (shouldIgnoreSwipeTarget(e.target)) {
          debugSwipeState('pointerdown:ignored-target', e);
          return;
        }
        hasPointerCapture = false;

        console.groupCollapsed('%c[SWIPE ↓] pointerdown', 'color:#4CAF50;font-weight:bold');

        console.log('BEFORE', {
          swipeDir,
          lastSentFrame,
          swipeStartX,
          swipeStartY,
          isSwiping,
          swipeCommitted,
          swipeLocked
        });

        if (swipeLocked) {
          if (isScrolling) {
            console.warn('Swipe ignored → swipeLocked = true');
            debugSwipeState('pointerdown:blocked-scrolling', e);
            console.groupEnd();
            return;
          }
          // Clear stale lockouts after taps/clicks.
          swipeLocked = false;
          debugSwipeState('pointerdown:cleared-stale-lock', e);
        }

        // reset state
        swipeDir = 0;
        lastSentFrame = 0;

        swipeStartX = e.screenX;
        swipeStartY = e.screenY;
        swipeStartTime = performance.now();
        isSwiping = true;
        swipeCommitted = false;

        window.parent.postMessage({ type: 'SWIPE_START' }, PARENT_ORIGIN);

        console.log('AFTER', {
          swipeDir,
          lastSentFrame,
          swipeStartX,
          swipeStartY,
          isSwiping,
          swipeCommitted,
          swipeLocked,
          time: swipeStartTime.toFixed(1)
        });

        console.groupEnd();
      }

      function onSwipePointerMove(e) {
        if (isGameModeActive()) return;
        if (swipeBlockedByHint) return;
        debugSwipeState('pointermove', e);
        if (!isSwiping || swipeLocked) return;

        const dx = e.screenX - swipeStartX;
        const dy = e.screenY - swipeStartY;

        console.groupCollapsed(
          `%c[SWIPE →] pointermove`,
          'color:#03A9F4;font-weight:bold'
        );

        console.log('Movement', {
          dx: dx.toFixed(1),
          dy: dy.toFixed(1),
          swipeDir,
          isSwiping
        });

        /* --------------------------------------------------
          🚫 Vertical intent → cancel swipe
        -------------------------------------------------- */
        if (!swipeDir && Math.abs(dy) > Math.abs(dx) * VERTICAL_RATIO) {
          console.warn('[SWIPE →] Vertical intent detected → cancelling swipe');

          isSwiping = false;
          swipeDir = 0;
          swipeDX = 0;
          lastSentFrame = 0;
          unlockSwipeScroll();

          window.parent.postMessage({ type: 'SWIPE_CANCEL' }, PARENT_ORIGIN);

          console.groupEnd();
          return;
        }

        /* --------------------------------------------------
          🔒 Lock horizontal direction (once, intentionally)
        -------------------------------------------------- */
        if (
          !swipeDir &&
          Math.abs(dx) > Math.abs(dy) * HORIZONTAL_LOCK_RATIO
        ) {
          swipeDir = dx < 0 ? 1 : -1;
          lockSwipeScroll();

          console.log('[SWIPE →] Horizontal intent LOCKED', {
            swipeDir,
            reason: `|dx| > |dy| * ${HORIZONTAL_LOCK_RATIO}`
          });
          if (e.pointerId && el.setPointerCapture) {
            try {
              el.setPointerCapture(e.pointerId);
              hasPointerCapture = true;
            } catch (err) {}
          }
        }

        if (!swipeDir) {
          console.log(' [SWIPE →] No intent yet → waiting');
          console.groupEnd();
          return;
        }

        /* --------------------------------------------------
          🧲 Rubber band calculation
        -------------------------------------------------- */
        const width = swipeBaseWidth || window.innerWidth;
        const dampedDX = dx * DRAG_DAMPING;
        swipeDX = dampedDX;

        console.log('[SWIPE →] Drag applied', {
          rawDX: dx.toFixed(1),
          dampedDX: swipeDX.toFixed(1),
          progress: (swipeDX / width).toFixed(3)
        });

        /* --------------------------------------------------
          🚀 RAF-throttled progress send
        -------------------------------------------------- */
        if (!rafSendProgress) {
          rafSendProgress = true;

          requestAnimationFrame(() => {
            rafSendProgress = false;

            // ensure last drag position is applied
      window.parent.postMessage({
        type: 'SWIPE_PROGRESS',
        dir: swipeDir,
        dx: swipeDX,
        progress: swipeDX / width,
        width
      }, PARENT_ORIGIN);


            console.log('[SWIPE →] SWIPE_PROGRESS sent');
          });
        }

        console.groupEnd();
      }

      function onSwipePointerUp(e) {
    if (isGameModeActive()) return;
    if (swipeBlockedByHint) return;
    debugSwipeState('pointerup:before', e);
    unlockSwipeScroll();
    if (hasPointerCapture && e.pointerId && el.releasePointerCapture) {
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    hasPointerCapture = false;

    console.groupCollapsed(
      '%c[SWIPE ↑] pointerup',
      'color:#FF5722;font-weight:bold'
    );

    console.log('State BEFORE decision', {
      isSwiping,
      swipeLocked,
      swipeDir,
      swipeCommitted
    });

    if (!isSwiping || swipeLocked) {
      console.warn('PointerUp ignored', { isSwiping, swipeLocked });
      debugSwipeState('pointerup:ignored', e);
      console.groupEnd();
      return;
    }

    const dx = e.screenX - swipeStartX;
    const dy = e.screenY - swipeStartY;
    const dt = performance.now() - swipeStartTime;
    const velocity = Math.abs(dx) / dt;

    console.log('Raw gesture data', {
      dx: dx.toFixed(1),
      dy: dy.toFixed(1),
      dt: dt.toFixed(1),
      velocity: velocity.toFixed(3)
    });

    isSwiping = false;
    unlockSwipeScroll();

    // Tap without swipe intent: let normal click flow.
    if (!swipeDir && Math.abs(dx) < INTENT_DISTANCE && Math.abs(dy) < INTENT_DISTANCE) {
      swipeCommitted = false;
      console.groupEnd();
      return;
    }

    /* --------------------------------------------------
      🚫 Vertical wins → cancel
    -------------------------------------------------- */
    if (Math.abs(dy) > Math.abs(dx)) {
      console.warn('Vertical movement wins → CANCEL swipe');

      window.parent.postMessage({ type: 'SWIPE_CANCEL' }, PARENT_ORIGIN);

      swipeDir = 0;
      swipeCommitted = false;

      console.groupEnd();
      return;
    }

    /* --------------------------------------------------
      🎯 Reels-style commit logic
    -------------------------------------------------- */
    const width = swipeBaseWidth || window.innerWidth;

    const distance = Math.abs(dx);
    const speed = Math.min(velocity, 1.6); // clamp for stability

    const minDist = width * 0.12; // fast swipe
    const maxDist = width * 0.45; // slow swipe

    const t = Math.min(speed / 1.1, 1); // normalize velocity
    const requiredDistance = maxDist - (maxDist - minDist) * t;
    // Guard against accidental commits from tiny taps that report non-zero velocity.
    const quickFlickDistance = Math.max(10, width * 0.025);
    const speedCommitDistance = Math.max(4, width * 0.01);
    const quickFlick = speed > 0.75 && distance > quickFlickDistance;

    const commitByDistance = distance > requiredDistance;
    const commitBySpeed = speed > 0.5 && distance > speedCommitDistance;
    const commit = commitByDistance || commitBySpeed || quickFlick;

    console.log('Commit evaluation', {
      distance: distance.toFixed(1),
      requiredDistance: requiredDistance.toFixed(1),
      speed: speed.toFixed(3),
      commitByDistance,
      commitBySpeed,
      commit
    });

    /* --------------------------------------------------
      ✅ Commit OR ❌ Cancel
    -------------------------------------------------- */
    if (commit) {
      swipeCommitted = true;
      const dir = dx > 0 ? -1 : 1;

      console.log('✅ SWIPE COMMITTED', { dir });

      window.parent.postMessage({
        type: 'SWIPE_COMMIT',
        dir
      }, PARENT_ORIGIN);
    } else {
      console.log('↩️ Swipe cancelled → snap back');

      swipeCommitted = false;

      window.parent.postMessage({
        type: 'SWIPE_CANCEL'
      }, PARENT_ORIGIN);
    }

    /* --------------------------------------------------
      🧹 Cleanup & lockout
    -------------------------------------------------- */
    swipeDir = 0;
    swipeLocked = true;

    console.log('Cleanup', {
      swipeDir,
      swipeLocked
    });

    requestAnimationFrame(() => {
      swipeLocked = false;
      debugSwipeState('swipe-unlocked-timeout', e);
      console.log('Swipe unlocked');
    });

    console.groupEnd();
      }

      
      // SET_SWIPE_WIDTH handled in onParentMessage


/*************************************************
 * Helpers
 *************************************************/
      function on(el, event, handler, opts) {
        el.addEventListener(event, handler, opts);
        cleanupFns.push(() => el.removeEventListener(event, handler, opts));
      }

      function resetNavVisibility() {
        if (!nav) return;

        nav.classList.remove('visible');
        clearTimeout(hideTimer);

        // optional but clean
        nav.style.transition = 'none';
        nav.getBoundingClientRect(); // force reflow
        nav.style.transition = '';
      }

      function getSurahAyahFromURL() {
        const path = window.location.pathname;

        console.log('[URL] Parsing surah/ayah from path:', path);

        const match = path.match(
          /surah_(\d+)\/ayah_\d+_(\d+)\.html/
        );

        if (!match) {
          console.warn('[URL] No surah/ayah match found');
          return null;
        }

        const surah = Number(match[1]);
        const ayah  = Number(match[2]);

        console.log('[URL] Parsed location:', { surah, ayah });

        return { surah, ayah };
      }

      function notifyParentPracticeMode(isOn) {
          window.parent.postMessage(
            {
              type: 'PRACTICE_MODE',
              active: isOn
            },
            PARENT_ORIGIN
          );
      }

      function clearNavActive() {
        document
          .querySelectorAll('.bottom-nav .nav-item')
          .forEach(item => item.classList.remove('active'));
      }
      window.clearNavActive = clearNavActive;

      function resetApp() {
        // Run all registered cleanup functions
        cleanupFns.forEach(fn => {
          try {
            fn();
          } catch (err) {
            console.warn('[CLEANUP] Error during cleanup', err);
          }
        });

        // Clear cleanup registry
        cleanupFns.length = 0;

        // Reset one-time init guards so re-init works
        if (typeof initNav === 'function') {
          initNav.done = false;
        }

        if (typeof initMessaging === 'function') {
          initMessaging.done = false;
        }

        console.log('[INIT] App reset complete');
        
        isScrolling = false;
        if (scrollEndTimer) {
          clearTimeout(scrollEndTimer);
          scrollEndTimer = null;
        }
        swipeLocked = false;
        isSwiping = false;
        swipeCommitted = false;
      }

      function waitForAudioLoad(audio) {
        return new Promise((resolve, reject) => {
          audio.addEventListener('canplaythrough', resolve, { once: true });
          audio.addEventListener('error', reject, { once: true });
        });
      }

      function onScroll() {
        isScrolling = true;
        swipeLocked = true;

        if (isSwiping && !swipeDir) {
          isSwiping = false;
          window.parent.postMessage({ type: 'SWIPE_CANCEL' }, PARENT_ORIGIN);
        }

        if (scrollEndTimer) {
          clearTimeout(scrollEndTimer);
        }
        scrollEndTimer = setTimeout(() => {
          isScrolling = false;
          swipeLocked = false;
          scrollEndTimer = null;
        }, SCROLL_END_DELAY);
      }

      function bindAyahScroll() {
       

        if (!scrollEl) {
          console.warn('[IFRAME] ayahScroll not found — scroll disabled');
          return;
        }

        // prevent duplicate listeners
        scrollEl.removeEventListener('scroll', onScroll);
        scrollEl.addEventListener('scroll', onScroll, { passive: true });

        console.log('[IFRAME] ayahScroll scroll listener bound');
      }

      function bindSwipeEngine() {

        
        
        if (!el) {
          el = document.body;
        }
console.log('[SWIPE] Bound to element:', el?.id || el?.tagName);

        el.removeEventListener('pointerdown', onSwipePointerDown, true);
        el.removeEventListener('pointerup', onSwipePointerUp, true);
        el.removeEventListener('pointercancel', onSwipePointerUp, true);
        el.removeEventListener('pointermove', onSwipePointerMove, true);

el.addEventListener('pointerdown', onSwipePointerDown, { passive: false, capture: true });
el.addEventListener('pointerup', onSwipePointerUp, { passive: false, capture: true });
el.addEventListener('pointercancel', onSwipePointerUp, { passive: false, capture: true });
el.addEventListener('pointermove', onSwipePointerMove, { passive: false, capture: true });

        // Ensure taps/clicks don’t leave swipe locked.
        el.removeEventListener('click', unlockSwipeLock, true);
        el.addEventListener('click', unlockSwipeLock, { capture: true });

        if (SWIPE_DEBUG_TAPS) {
          document.removeEventListener('click', debugSwipeDocClick, true);
          document.addEventListener('click', debugSwipeDocClick, { capture: true });
        }


      }

      function unlockSwipeLock() {
        debugSwipeState('click:unlockSwipeLock', null);
        if (!isScrolling) {
          swipeLocked = false;
        }
      }

      function debugSwipeDocClick(e) {
        debugSwipeState('document:click', e);
      }

/*************************************************
 * SETTINGS APPLICATION (FROM PARENT)
 *************************************************/
      /**
       * Applies persisted user settings to the iframe UI.
       * Called when parent sends updated settings.
       *
       * @param {Object} settings
       * @param {boolean} settings.showRoot
       * @param {boolean} settings.showGrammar
       * @param {boolean} settings.showWordTranslation
       * @param {boolean} settings.showPanelTranslation
       * @param {string}  settings.panelLang
       * @param {number}  settings.speed
       */
      function applySettings(settings) {
        LOG.iframe('Applying settings', settings);
        lastSettings = settings || lastSettings;
        applyTypographySettings(settings || {});

        const html = document.documentElement;

        // Visibility toggles
        html.classList.toggle('hide-root', settings.showRoot !== true);
        html.classList.toggle('hide-grammar', settings.showGrammar === false);
        html.classList.toggle('hide-word-translation', settings.showWordTranslation === false);
        html.classList.toggle('dark-mode', settings.darkMode === true);
        if (document.body) document.body.classList.toggle('dark-mode', settings.darkMode === true);
        if (typeof settings.showPanelTranslation === 'boolean') {
          setPanelTranslationVisible(settings.showPanelTranslation);
        }

        // Panel translation language
        if (settings.panelLang) {
          html.setAttribute('data-panel-lang', settings.panelLang);
          LOG.ui('Panel language set:', settings.panelLang);
        }

                // Learning / Reciting mode
        if (settings.mode === 'learning' || settings.mode === 'reciting') {
          const nextMode = normalizeIframeReaderMode(settings.mode);
          if (currentMode !== nextMode) {
            currentMode = nextMode;
            toggleMode(currentMode);
          } else {
            toggleMode(currentMode);
          }
        }

        // Audio playback speed
        if (settings.speed && window.ayahAudio) {
          ayahAudio.playbackRate = parseFloat(settings.speed);
          LOG.audio('Playback speed set:', settings.speed);
        }
      }

      function updateSetting(patch) {
        window.parent.postMessage({
          type: 'UPDATE_SETTING',
          patch
        }, PARENT_ORIGIN);
      }

      function applyLastSettings() {
        if (lastSettings) {
          applySettings(lastSettings);
        }
      }

      function applySettingsFromStorage() {
        try {
          const raw = localStorage.getItem('qq_settings');
          if (!raw) return;
          const parsed = JSON.parse(raw);
          applySettings(parsed || {});
        } catch (err) {
          console.warn('[SETTINGS] Failed to apply stored settings', err);
        }
      }

      function closeSettingsMenu(options = {}) {
        const { suppressNotify = false } = options;
        const menuEl = document.getElementById('settingsMenu');
        if (!menuEl) return false;
        if (settingsOutsideClickHandler) {
          document.removeEventListener('click', settingsOutsideClickHandler, true);
          settingsOutsideClickHandler = null;
        }
        menuEl.remove();
        const btn = document.getElementById('navSettings');
        if (btn) btn.classList.remove('active');
        if (!suppressNotify) {
          parent.postMessage({ type: 'SETTINGS_CLOSED' }, PARENT_ORIGIN);
        }
        closeSettingsMenuFn = null;
        return true;
      }

      function closeActivePopup(options = {}) {
        const { suppressNotify = false } = options;
        if (closeSettingsMenu({ suppressNotify })) return true;

        if (popup && overlay && overlay.style.display !== 'none') {
          hidePopup({ suppressNotify });
          return true;
        }
        return false;
      }
      window.closeActivePopup = closeActivePopup;

/*************************************************
 * SETTINGS POPUP — MAIN TOGGLE
 *************************************************/

      /**
       * Opens / closes the Settings popup.
       *
       * Behavior:
       * - Toggles popup visibility
       * - Adapts content based on current mode:
       *   • Practice
       *   • Reciting
       *   • Learning
       * - Syncs UI state with actual settings
       * - Notifies parent when opened
       */
      function toggleSettingsNav(e) {
        e.preventDefault();
        e.stopPropagation();

        clearNavActive();

        const btn = document.getElementById('navSettings');
        if (!btn) {
          console.warn('[SETTINGS] navSettings button not found');
          return;
        }

        btn.classList.add('active');

        // ---------------------------------------------
        // Close if already open
        // ---------------------------------------------
        const existing = document.getElementById('settingsMenu');
        if (existing) {
          console.log('[SETTINGS] Closing existing menu');
          closeSettingsMenu();
          return;
        }


        // ---------------------------------------------
        // Determine current context
        // ---------------------------------------------

        const inPractice = pracBox && pracBox.style.display === 'block';
        const inRecite   = currentMode === 'reciting';
        const translationSection = document.getElementById('translation-section');
        const html = document.documentElement;
        const autoSwipeEnabled = lastSettings?.autoSwipe !== false;

        // Use saved preference when available; fall back to DOM state.
        let isTranslationVisible = !html.classList.contains('hide-panel-translation');
        if (lastSettings && typeof lastSettings.showPanelTranslation === 'boolean') {
          isTranslationVisible = lastSettings.showPanelTranslation;
        } else if (translationSection) {
          isTranslationVisible =
            window.getComputedStyle(translationSection).display !== 'none';
        }

        console.log('[SETTINGS] Context:', { inPractice, inRecite });

        // ---------------------------------------------
        // Build popup HTML
        // ---------------------------------------------
        let menuHTML = `
          <div id="settingsMenu" class="settings-popup">
            <div class="sm-header">
              <i class="material-icons-outlined">settings</i>
              <span>Settings</span>
              <button type="button" class="sm-close-icon" id="settingsCloseTop" aria-label="Close settings">
                <i class="material-icons-outlined">close</i>
              </button>
            </div>
        `;

        // ===== PRACTICE MODE =====
        if (inPractice) {
          menuHTML += `
            <div class="sm-section-title">Practice Controls</div>
            <div class="sm-row">
              <button type="button" class="btn btn-sm">
                Erase All Inputs
              </button>
            </div>
          `;
        }

        // ===== RECITING MODE =====
        else if (inRecite) {
          menuHTML += ``;
        }

        // ===== LEARNING MODE =====
        else {
          menuHTML += `
            <div class="sm-row">
              <div class="sm-label">
                <i class="material-icons-outlined">translate</i>
                <span>Show Word Translations</span>
              </div>
              <label class="switch">
                <input id="toggleTrans" type="checkbox">
                <span class="slider"></span>
              </label>
            </div>

            <div class="sm-row">
              <div class="sm-label">
                <i class="material-icons-outlined">account_tree</i>
                <span>Show Root</span>
              </div>
              <label class="switch">
                <input id="toggleRoot" type="checkbox">
                <span class="slider"></span>
              </label>
            </div>

            <div class="sm-row">
              <div class="sm-label">
                <i class="material-icons-outlined">format_italic</i>
                <span>Show Grammar</span>
              </div>
              <label class="switch">
                <input id="toggleGram" type="checkbox">
                <span class="slider"></span>
              </label>
            </div>
          `;
        }

        // ===== AUDIO SETTINGS =====
        menuHTML += `
          <div class="sm-section-title">Text Appearance</div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">font_download</i>
              <span>Arabic Font</span>
            </div>
            <select id="arabicFontSelect">
              <option value="CustomArabic">IndoPak</option>
              <option value="UthmanicHafs">UthmanicHafs</option>
            </select>
          </div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">format_size</i>
              <span>Arabic Size</span>
            </div>
            <input type="number" id="arabicSizeInput" min="16" max="56" step="1" value="28"/>
          </div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">line_weight</i>
              <span>Arabic Weight</span>
            </div>
            <select id="arabicWeightSelect">
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
              <option value="400">400</option>
              <option value="500">500</option>
              <option value="600">600</option>
              <option value="700">700</option>
              <option value="800">800</option>
              <option value="900">900</option>
            </select>
          </div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">format_italic</i>
              <span>Arabic Italic</span>
            </div>
            <label class="switch">
              <input id="arabicItalicToggle" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">text_fields</i>
              <span>English Size (%)</span>
            </div>
            <input type="number" id="englishScaleInput" min="70" max="160" step="5" value="100"/>
          </div>

          <div class="sm-section-title">Audio Settings</div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">language</i>
              <span>Language</span>
            </div>
            <select id="audioLangSelect">
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
            <select id="speedSelect">
              <option value="0.5">0.5×</option>
              <option value="0.75">0.75×</option>
              <option value="1">1×</option>
              <option value="1.25">1.25×</option>
            </select>
          </div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">repeat</i>
              <span>Repeat</span>
            </div>
            <input type="number" id="repeatCount"
                  min="1" max="20" value="1"/>
          </div>

          <div class="sm-row">
            <div class="sm-label">
              <i class="material-icons-outlined">swipe</i>
              <span>Auto Swipe</span>
            </div>
            <div class="sm-radio">
              <label class="radio-option">
                <input type="radio" name="autoSwipeSetting" id="autoSwipeYes" value="yes" ${autoSwipeEnabled ? 'checked' : ''}>
                <span>Yes</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="autoSwipeSetting" id="autoSwipeNo" value="no" ${!autoSwipeEnabled ? 'checked' : ''}>
                <span>No</span>
              </label>
            </div>
          </div>
        `;

        // ===== PANEL TRANSLATIONS =====
          menuHTML += `
            <div class="sm-section-title">Translations Panel</div>
            <div class="sm-row">
              <div class="sm-label">
                <i class="material-icons-outlined">language</i>
                <span>Show Translations</span>
              </div>
              <label class="switch">
                <input
                  id="toggleAllTrans"
                  type="checkbox"
                  ${isTranslationVisible ? 'checked' : ''}
                >
                <span class="slider"></span>
              </label>
            </div>

            <div class="sm-row">
              <div class="sm-label">
                <i class="material-icons-outlined">translate</i>
                <span>Translation Language</span>
              </div>
              <select id="translationLangSelect">
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </select>
            </div>
          `;

        menuHTML += `
            <div class="sm-footer">
              <button type="button" class="sm-close-btn" id="settingsClose">
                Close
              </button>
            </div>
          </div>
        `;

        // ---------------------------------------------
        // Inject popup into DOM
        // ---------------------------------------------
        document.body.insertAdjacentHTML('beforeend', menuHTML);
        const menuEl = document.getElementById('settingsMenu');
        


        if (!menuEl) {
          console.error('[SETTINGS] Failed to create settingsMenu');
          return;
        }

        // ---------------------------------------------
        // Wire settings controls (NO inline onclick)
        // ---------------------------------------------

        menuEl.querySelector('#toggleTrans')
          ?.addEventListener('change', toggleWordTranslations);

        menuEl.querySelector('#toggleRoot')
          ?.addEventListener('change', e =>
            toggleElements('root-tag', e.target.checked)
          );

        menuEl.querySelector('#toggleGram')
          ?.addEventListener('change', e =>
            toggleElements('pos-tag', e.target.checked)
          );

        menuEl.querySelector('#toggleAllTrans')
          ?.addEventListener('change', e =>
            toggleSection('translation-section', e.target.checked)
          );

        menuEl.querySelector('#arabicFontSelect')
          ?.addEventListener('change', e =>
            updateSetting({ arabicFont: e.target.value })
          );

        menuEl.querySelector('#arabicSizeInput')
          ?.addEventListener('change', e =>
            updateSetting({ arabicSize: Number(e.target.value) || 28 })
          );

        menuEl.querySelector('#arabicWeightSelect')
          ?.addEventListener('change', e =>
            updateSetting({ arabicWeight: Number(e.target.value) || 100 })
          );

        menuEl.querySelector('#arabicItalicToggle')
          ?.addEventListener('change', e =>
            updateSetting({ arabicItalic: !!e.target.checked })
          );

        menuEl.querySelector('#englishScaleInput')
          ?.addEventListener('change', e =>
            updateSetting({ englishScale: Number(e.target.value) || 100 })
          );

        menuEl.querySelector('#audioLangSelect')
          ?.addEventListener('change', e =>
            onAudioLangChange(e.target.value)
          );

        menuEl.querySelector('#speedSelect')
          ?.addEventListener('change', e =>
            onSpeedChange(e.target.value)
          );

        menuEl.querySelector('#translationLangSelect')
          ?.addEventListener('change', e =>
            onPanelLangChange(e.target.value)
          );

        menuEl.querySelector('#repeatCount')
          ?.addEventListener('change', e => {
            setRepeatCount(e.target.value, 'settingsPopup');
          });

        menuEl.querySelector('#autoSwipeYes')
          ?.addEventListener('change', e => {
            if (e.target.checked) {
              updateSetting({ autoSwipe: true });
            }
          });

        menuEl.querySelector('#autoSwipeNo')
          ?.addEventListener('change', e => {
            if (e.target.checked) {
              updateSetting({ autoSwipe: false });
            }
          });



        window.parent.postMessage({ type: 'SETTINGS_OPENED' }, PARENT_ORIGIN);

        // ---------------------------------------------
        // FORCE repeat value into settings textbox
        // ---------------------------------------------
        const repeatBox = menuEl.querySelector('#repeatCount');

        if (repeatBox && ayahAudio) {
          const repeat =
            parseInt(ayahAudio.dataset.repeat || '1', 10);

          repeatBox.value = repeat;

          console.log('[SETTINGS][REPEAT] synced textbox →', repeat);
        }


        // Force reflow for animation
        menuEl.getBoundingClientRect();
        menuEl.classList.add('show');

        const closeMenu = (options = {}) => {
          if (!menuEl?.isConnected) return;
          closeSettingsMenu(options);
        };
        closeSettingsMenuFn = closeMenu;

        menuEl.querySelector('#settingsClose')
          ?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            closeMenu();
          });
        menuEl.querySelector('#settingsCloseTop')
          ?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            closeMenu();
          });

        attachSettingsAutoClose(btn, menuEl, closeMenu);

        // ---------------------------------------------
        // Sync toggle states with current UI
        // ---------------------------------------------
        rootToggle 		= document.getElementById('toggleRoot');
        gramToggle 		= document.getElementById('toggleGram');
        transToggle 	= document.getElementById('toggleTrans');

        
        if (rootToggle) {
          rootToggle.checked = !html.classList.contains('hide-root');
        }

       
        if (gramToggle) {
          gramToggle.checked = !html.classList.contains('hide-grammar');
        }

        
        if (transToggle) {
          transToggle.checked =
            !html.classList.contains('hide-word-translation');
        }

        const autoSwipeYes = menuEl.querySelector('#autoSwipeYes');
        const autoSwipeNo  = menuEl.querySelector('#autoSwipeNo');
        if (autoSwipeYes && autoSwipeNo) {
          autoSwipeYes.checked = autoSwipeEnabled;
          autoSwipeNo.checked  = !autoSwipeEnabled;
        }

        if (allTrans) {
          if (lastSettings && typeof lastSettings.showPanelTranslation === 'boolean') {
            allTrans.checked = lastSettings.showPanelTranslation;
          } else {
            allTrans.checked =
              !document.documentElement.classList.contains('hide-panel-translation');
          }
        }

        const typoSettings = sanitizeTypographySettings(lastSettings || {});
        const arabicFontSelect = menuEl.querySelector('#arabicFontSelect');
        const arabicSizeInput = menuEl.querySelector('#arabicSizeInput');
        const arabicWeightSelect = menuEl.querySelector('#arabicWeightSelect');
        const arabicItalicToggle = menuEl.querySelector('#arabicItalicToggle');
        const englishScaleInput = menuEl.querySelector('#englishScaleInput');
        if (arabicFontSelect) arabicFontSelect.value = typoSettings.arabicFont;
        if (arabicSizeInput) arabicSizeInput.value = String(Math.round(typoSettings.arabicSize));
        if (arabicWeightSelect) arabicWeightSelect.value = String(typoSettings.arabicWeight);
        if (arabicItalicToggle) arabicItalicToggle.checked = typoSettings.arabicItalic;
        if (englishScaleInput) englishScaleInput.value = String(Math.round(typoSettings.englishScale));

        // ---------------------------------------------
        // FORCE audio language dropdown to saved value
        // ---------------------------------------------
        const langSelectEl = menuEl.querySelector('#audioLangSelect');

        if (langSelectEl) {
          const savedLang =
            window.settings?.audioLang ||
            ayahAudio?.dataset?.audioLang ||
            'ar';

          langSelectEl.value = savedLang;

          console.log('[SETTINGS][AUDIO LANG] restored →', savedLang);
        }

        

        console.log('[SETTINGS] Settings menu opened');

        // ---------------------------------------------
        // Sync translation language dropdown
        // ---------------------------------------------
        const panelLangSelect = menuEl.querySelector('#translationLangSelect');

        if (panelLangSelect) {
          const currentLang =
            document.documentElement.getAttribute('data-panel-lang') || 'en';

          panelLangSelect.value = currentLang;
        }
      };
      window.toggleSettingsNav = toggleSettingsNav;


      function toggleWordTranslations() {
        const html = document.documentElement;

        // Toggle visibility class
        const isHidden = html.classList.toggle('hide-word-translation');

        // Notify parent of updated preference
        updateSetting({ showWordTranslation: !isHidden });
      }
      window.toggleWordTranslations = toggleWordTranslations;


      function toggleElements(type, show) {
        const html = document.documentElement;

        LOG.ui('Toggle element:', type, show);

        if (type === 'root-tag') {
          html.classList.toggle('hide-root', !show);
          updateSetting({ showRoot: show });
        }

        if (type === 'pos-tag') {
          html.classList.toggle('hide-grammar', !show);
          updateSetting({ showGrammar: show });
        }
      }
      window.toggleElements = toggleElements;

      function setPanelTranslationVisible(show) {
        const html = document.documentElement;
        const shouldShow = !!show;
        html.classList.toggle('hide-panel-translation', !shouldShow);

        if (shouldShow) {
          html.classList.remove('hide-translation');
        }

        const translationSection = document.getElementById('translation-section');
        if (translationSection) {
          translationSection.classList.toggle('active', shouldShow);
          translationSection.style.display = shouldShow ? 'block' : 'none';
        }
      }

      function toggleSection(id, show) {
        if (!id) {
          console.warn('[UI] toggleSection called without id');
          return;
        }

        const el = document.getElementById(id);

        if (!el) {
          console.warn('[UI] toggleSection: element not found', id);
          return;
        }

        if (id === 'translation-section') {
          setPanelTranslationVisible(!!show);
          updateSetting({ showPanelTranslation: !!show });
          return;
        }

        el.style.display = show ? 'block' : 'none';

        console.log(
          '[UI] Section',
          id,
          show ? 'SHOWN' : 'HIDDEN'
        );
      }
      window.toggleSection = toggleSection;


      function attachSettingsAutoClose(btn, menuEl, closeMenu) {
        function handleOutsideClick(e) {
          if (!menuEl.contains(e.target) && !btn.contains(e.target)) {
            closeMenu?.();
          }
        }

        if (settingsOutsideClickHandler) {
          document.removeEventListener('click', settingsOutsideClickHandler, true);
          settingsOutsideClickHandler = null;
        }
        settingsOutsideClickHandler = handleOutsideClick;

        // prevent bubbling inside popup
        menuEl.addEventListener('click', e => e.stopPropagation());

        // delay avoids immediate close
        setTimeout(() => {
          document.addEventListener('click', handleOutsideClick, true);
        }, 0);
      }

      function onAudioLangChange(lang) {
        if (!lang) return;

        console.log('[AUDIO] Language changed →', lang);

        // 🔑 1. Persist language (parent)
        updateSetting({ audioLang: lang });

        // 🔑 2. Persist language (iframe state)
        if (ayahAudio) {
          ayahAudio.dataset.audioLang = lang;
        }

        // ---------------------------------------------
        // Reset audio playback + UI
        // ---------------------------------------------
        ayahAudio.pause();

        if (navIcon)     navIcon.textContent     = 'play_arrow';
        if (panelIconEl) panelIconEl.textContent = 'play_arrow';

        // ---------------------------------------------
        // Swap audio source
        // ---------------------------------------------
        const srcEl  = document.getElementById(`audio-url-${lang}`);
        const newSrc = srcEl?.dataset?.src;

        if (newSrc) {
          ayahAudio.src = newSrc;
          ayahAudio.load();
        } else {
          console.warn('[AUDIO] No audio source found for lang:', lang);
        }

        console.log('[AUDIO] Audio language applied & saved:', lang);
      }
      window.onAudioLangChange = onAudioLangChange;


      function onSpeedChange(speed) {
        const rate = parseFloat(speed);

        if (Number.isNaN(rate)) {
          console.warn('[AUDIO] Invalid playback speed:', speed);
          return;
        }

        console.log('[AUDIO] Playback speed changed to:', rate);

        // Persist preference in parent
        updateSetting({ speed: rate });
        // Apply speed immediately
        
        if (!ayahAudio) {
          console.warn('[AUDIO] ayahAudio element not found');
          return;
        }

        ayahAudio.playbackRate = rate;
      }
      window.onSpeedChange = onSpeedChange;


      function onPanelLangChange(lang) {
        if (!lang) return;

        console.log('[SETTINGS] Panel language changed:', lang);

        // Save preference
        updateSetting({ panelLang: lang, showPanelTranslation: true });

        // Apply language
        document.documentElement.setAttribute('data-panel-lang', lang);
        setPanelTranslationVisible(true);

        // 🔑 Ensure translation panel is visible
        const ts = document.getElementById('translation-section');
        if (ts) {
          ts.classList.add('active');
        }
      }

      window.onPanelLangChange = onPanelLangChange;

/*************************************************

/*************************************************
 * WORD MORPHOLOGY POPUP
 *************************************************/

      function escapeHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function sanitizeUrl(url) {
        if (!url) return '';
        const raw = String(url).trim();
        if (raw.startsWith('#')) return raw;
        try {
          const parsed = new URL(raw, window.location.href);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
          }
        } catch (_) {}
        return '';
      }

      function sanitizeStyle(value) {
        if (!value) return '';
        return String(value)
          .replace(/url\s*\([^)]*\)/gi, '')
          .replace(/expression\s*\(/gi, '');
      }

      function sanitizeHtml(raw) {
        if (!raw) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${raw}</div>`, 'text/html');
        const root = doc.body.firstElementChild || doc.body;
        const allowedTags = new Set([
          'div', 'span', 'p', 'b', 'strong', 'i', 'em', 'small',
          'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
          'ul', 'ol', 'li', 'a'
        ]);
        const allowedAttrs = new Set([
          'href', 'src', 'style', 'class', 'id', 'title', 'target', 'rel',
          'aria-label', 'role', 'colspan', 'rowspan', 'width', 'height',
          'align', 'valign'
        ]);

        const scrubNode = node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (!allowedTags.has(tag)) {
              const text = doc.createTextNode(node.textContent || '');
              node.replaceWith(text);
              return;
            }

            const onclick = node.getAttribute('onclick');
            if (onclick) {
              const match = onclick.match(/playVerbAudio\('([^']+)'\s*,\s*'([^']+)'\s*,\s*this\)/);
              if (match) {
                node.setAttribute('data-verb', match[1]);
                node.setAttribute('data-tense', match[2]);
              }
              node.removeAttribute('onclick');
            }

            for (const attr of Array.from(node.attributes)) {
              const name = attr.name.toLowerCase();
              const value = attr.value;

              if (name.startsWith('on')) {
                node.removeAttribute(attr.name);
                continue;
              }

              if (!allowedAttrs.has(name) && !name.startsWith('data-')) {
                node.removeAttribute(attr.name);
                continue;
              }

              if (name === 'href' || name === 'src') {
                const safe = sanitizeUrl(value);
                if (!safe) {
                  node.removeAttribute(attr.name);
                } else {
                  node.setAttribute(attr.name, safe);
                }
              }

              if (name === 'style') {
                const safeStyle = sanitizeStyle(value);
                if (safeStyle) node.setAttribute('style', safeStyle);
                else node.removeAttribute('style');
              }

              if (name === 'target' && value === '_blank') {
                node.setAttribute('rel', 'noopener noreferrer');
              }
            }
          }

          Array.from(node.childNodes).forEach(scrubNode);
        };

        scrubNode(root);
        return root.innerHTML;
      }

    /**
     * Renders and displays the word-level morphology popup.
     * This popup shows roots, grammar, meanings, conjugations, etc.
     *
     * Side effects:
     * - Blocks swipe gestures in parent
     * - Injects HTML into #popupContent
     * - Shows overlay + popup
     *
     * @param {Object} data - Morphology payload for a word
     */
      function showPopup(data) {
        console.log('[POPUP] showPopup called', data);

        // 🔒 Inform parent to temporarily disable swipe gestures
        window.parent.postMessage(
          { type: 'WORD_DETAILS_OPENED' },
          PARENT_ORIGIN
        );

        const audioUrl = sanitizeUrl(data?.['Audio URL']);

        // -----------------------------
        // Build popup header
        // -----------------------------
        let htmlContent = `
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            border-bottom:1px dashed #ccc;
            padding-bottom:6px;
            margin-top:0;
            position:relative;
          ">
            <!-- Close button -->
            <button
              style="
                position:absolute;
                top:-14px;
                left:-14px;
                background:none;
                border:none;
                color:#0a4d68;
                font-size:20px;
                font-weight:bold;
                cursor:pointer;
                line-height:1;
              "
              aria-label="Close popup"
            >
              ×
            </button>

            <h3 style="font-size:20px;font-weight:bold;margin:0;">
              🔍 Word Explanation
            </h3>

            ${
              audioUrl
                ? `<button
                    class="audio-button"
                    data-audio-url="${escapeHtml(audioUrl)}"
                    style="
                      padding:6px 12px;
                      font-size:14px;
                      border-radius:8px;
                      background:#0a4d68;
                      color:white;
                      border:none;
                      cursor:pointer;
                    "
                  >
                    🔊 Play Word Audio
                  </button>`
                : ''
            }
          </div>

          <div style="
            margin-top:12px;
            line-height:1.8;
            font-size:15px;
            text-align:left;
          ">
        `;

        // -----------------------------
        // Word + search shortcut
        // -----------------------------
        if (data?.Word) {
          const normalizedWord = data.Word
            .normalize('NFD')
            .replace(/[ً-ٟۖ-ٰۭـ]/g, '')
            .replace('ٱ', 'ا');
          const safeWord = escapeHtml(data.Word);

          htmlContent += `
            <div style="margin-bottom:10px;">
              <b style="color:#0a4d68;">Word:</b>
              <span style="font-size:20px;font-weight:bold;">
                ${safeWord}
              </span>
              <button
                class="word-search-btn"
                data-search-word="${escapeHtml(normalizedWord)}"
                style="
                  margin-left:8px;
                  font-size:12px;
                  padding:4px 8px;
                  border-radius:6px;
                  background:#eef5ff;
                  border:1px solid #ccc;
                  cursor:pointer;
                "
              >
                🔍 Look up in Quran
              </button>
            </div>
          `;
        }

        // -----------------------------
        // Roots + grammar tags
        // -----------------------------
        if (data?.root_from_txt || data?.tags_joined) {
          const rootText = data.root_from_txt
            ? data.root_from_txt.split('+').join(' + ')
            : '';

          const tagTextValue = data.tags_joined
            ? data.tags_joined.split('+').join(' + ')
            : '';
          const tagText = tagTextValue
            ? ` <i>(${escapeHtml(tagTextValue)})</i>`
            : '';

          if (rootText || tagText) {
            htmlContent += `
              <div>
                <b>Roots:</b> ${escapeHtml(rootText)}${tagText}
              </div>
            `;
          }
        }

        // -----------------------------
        // Verb meaning & grammar
        // -----------------------------
        if (data?.['Meaning Of Verb']) {
          htmlContent += `
            <div>
              <b>Meaning Of Verb:</b>
              ${escapeHtml(data['Meaning Of Verb'])}
            </div>
          `;
        }

        if (data?.['Main Verb Grammar']) {
          htmlContent += `
            <div>
              <b>Main Verb Grammar:</b>
              ${escapeHtml(data['Main Verb Grammar'])}
            </div>
          `;
        }

        // -----------------------------
        // Morphological suffixes
        // -----------------------------
        if (data?.['Quran Morph Info']) {
          htmlContent += `
            <div>
              <b>Suffixes:</b>
              ${escapeHtml(data['Quran Morph Info'])}
            </div>
          `;
        }

        // -----------------------------
        // GPT root + frequency
        // -----------------------------
        if (data?.root_from_gpt) {
          const countText =
            data.count_of_verb > 0
              ? ` <i>(appears ~${escapeHtml(data.count_of_verb)} times)</i>`
              : '';

          htmlContent += `
            <div>
              <b>Root Verb:</b>
              ${escapeHtml(data.root_from_gpt)}${countText}
            </div>
          `;
        }

        // -----------------------------
        // Conjugation table (HTML)
        // -----------------------------
        if (data?.['Conjugation Table']) {
          const safeTable = sanitizeHtml(data['Conjugation Table']);
          htmlContent += `
            <div style="margin-top:10px;">
              ${safeTable}
            </div>
          `;
        }

        // Close content wrapper
        htmlContent += `</div>`;

        if (!popup || !overlay) {
          console.error('[POPUP] Missing popupContent or overlay element');
          return;
        }

        window.parent.postMessage(
          { type: 'WORD_DETAILS_OPENED' },
          PARENT_ORIGIN
        );

        document.body.classList.add('modal-open');
        popup.innerHTML = htmlContent;
        popup.style.display   = 'block';
        overlay.style.display = 'block';

        const closeBtn = popup.querySelector('[aria-label="Close popup"]');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => hidePopup());
        }

        const audioBtn = popup.querySelector('.audio-button[data-audio-url]');
        if (audioBtn) {
          audioBtn.addEventListener('click', () => {
            const url = audioBtn.getAttribute('data-audio-url');
            if (url) playAudio(url);
          });
        }

        const searchBtn = popup.querySelector('.word-search-btn');
        if (searchBtn) {
          searchBtn.addEventListener('click', () => {
            const word = searchBtn.getAttribute('data-search-word');
            if (word) openSearchTab(word);
          });
        }

        popup.querySelectorAll('[data-verb][data-tense]').forEach(link => {
          link.addEventListener('click', evt => {
            evt.preventDefault();
            const verb = link.getAttribute('data-verb');
            const tense = link.getAttribute('data-tense');
            if (verb && tense) {
              playVerbAudio(verb, tense, link);
            }
          });
        });

        console.log('[POPUP] Popup rendered and shown');
      }
      window.showPopup = showPopup;

      function hidePopup(options = {}) {
        console.log('[POPUP] hidePopup called');

        const { suppressNotify = false } = options;

        // Always clear modal state, even if elements are missing.
        document.body.classList.remove('modal-open');

        if (!popup || !overlay) {
          console.warn('[POPUP] Cannot hide popup — elements missing', {
            popupFound: !!popup,
            overlayFound: !!overlay
          });
        } else {
          // Hide UI
          popup.style.display   = 'none';
          overlay.style.display = 'none';

          // Remove animation / active states
          popup.classList.remove('active');
          overlay.classList.remove('active');
        }

        // 🔓 Notify parent to re-enable swipe gestures
        if (!suppressNotify) {
          window.parent.postMessage(
            { type: 'WORD_DETAILS_CLOSED' },
            PARENT_ORIGIN
          );
        }

        console.log('[POPUP] Popup hidden, swipe restored');
      }
      window.hidePopup = hidePopup;

      function openSearchTab(normalizedWord) {
          if (!normalizedWord) {
            console.warn('[SEARCH] openSearchTab called without word');
            return;
          }

          const params = new URLSearchParams({
            q: normalizedWord,
            fromSurah: String(currentSurah),
            fromAyah: String(currentAyah)
          });
          const url = `/search_results.html?${params.toString()}`;
          console.log('[SEARCH] Opening search tab:', url);

          const target = window.parent && window.parent !== window ? window.parent : window;
          target.location.assign(url);
        }
      window.openSearchTab = openSearchTab;

      function playAudio(url) {
        if (!url) {
          console.warn('[AUDIO] playAudio called without URL');
          return;
        }

        try {
          wordAudio.pause();
          wordAudio.src = url;
          wordAudio.currentTime = 0;
          wordAudio.play().catch(err => {
            console.error('[AUDIO] Word audio play failed', err);
          });
        } catch (err) {
          console.error('[AUDIO] Error playing word audio', err);
        }
      }
      window.playAudio = playAudio;

/*************************************************
 * AUDIO CONTROLS
 *************************************************/

      function startAyahAudio(options = {}) {
        const { reset = true } = options;
        if (!ayahAudio) return console.error('No ayahAudio element');

        if (reset) {
          const repeat = parseInt(ayahAudio.dataset.repeat || '1', 10);
          remainingRepeats = Math.max(1, repeat);
          ayahAudio.currentTime = 0;
        }

        const playPromise = ayahAudio.play();
        if (playPromise?.catch) {
          playPromise.catch(err => {
            console.warn('[AUDIO] Play failed', err);
          });
        }

        navPlayIcon.textContent = 'pause';
        panelIcon.textContent   = 'pause';
      }

      function togglePlay(e) {
        e.preventDefault();
        e.stopPropagation();
        //e.stopImmediatePropagation();

        if (!ayahAudio) return console.error('No ayahAudio element');

        if (ayahAudio.paused) {
          startAyahAudio({ reset: true });
        } else {
          ayahAudio.pause();
          navPlayIcon.textContent = 'play_arrow';
          panelIcon.textContent   = 'play_arrow';
        }
      }
      window.togglePlay = togglePlay;

/*************************************************
 * MODE SWITCH — LEARNING ↔ RECITING (NAV)
 *************************************************/

      /**
       * Toggles the global mode between:
       * - "learning"
       * - "reciting"
       *
       * Rules:
       * - Practice mode is ALWAYS turned off first
       * - Nav active state is updated
       * - Actual UI switch is delegated to toggleMode()
       */
      function toggleModeNav() {
        console.log('[MODE] toggleModeNav called');

        if (!LEGACY_IFRAME_RECITE_MODE_ENABLED) {
          currentMode = 'learning';
          toggleMode(currentMode);
          updateSetting({ mode: currentMode });
          return;
        }

        // ---------------------------------------------
        // Always disable Practice mode first
        // ---------------------------------------------
        if (pracBox) {
          pracBox.style.display = 'none';
          console.log('[MODE] Practice box hidden');
        }

        if (pracNav) {
          pracNav.classList.remove('active');
        }

        // ---------------------------------------------
        // Toggle Learning ↔ Reciting
        // ---------------------------------------------
        clearNavActive();

        btn   = document.getElementById('navMode');
        if (!btn) {
          console.warn('[MODE] navMode button not found');
          return;
        }

        btn.classList.add('active');

        // Flip mode
        const previousMode = currentMode;
        currentMode = currentMode === 'learning' ? 'reciting' : 'learning';

        console.log('[MODE] Mode changed:', previousMode, '→', currentMode);

        // Delegate UI updates
        toggleMode(currentMode);
        updateSetting({ mode: currentMode });
      }
      window.toggleModeNav = toggleModeNav;

       /**
       * Applies UI changes for the given mode.
       * This function ONLY handles Learn ↔ Recite display.
       */
            function toggleMode(mode) {
        const resolvedMode = normalizeIframeReaderMode(mode);
        currentMode = resolvedMode;
        console.log('[MODE] toggleMode called with:', mode, '=>', resolvedMode);

        if (!learnSection || !recitSection) return;
        learnSection.style.display =
          resolvedMode === 'learning' ? 'block' : 'none';

        recitSection.style.display =
          resolvedMode === 'reciting' ? 'block' : 'none';

        if (pracBox) pracBox.style.display = 'none';

        document
          .querySelectorAll('.bottom-nav .nav-item.active')
          .forEach(el => el.classList.remove('active'));



        if (resolvedMode === 'learning') {
          const navMode = document.getElementById('navMode');
          if (navMode) {
            navMode.classList.remove('active');
            navMode.blur();              // 🔑 removes focus highlight
          }
        }

        // ---------------------------------------------
        // Update nav icon + label (action-based)
        // ---------------------------------------------
        updateNavModeActionUI();

        console.log('[MODE] UI + nav applied for mode:', resolvedMode);
      }
      window.toggleMode = toggleMode;

      function updateNavModeActionUI() {
        const navModeLabel = document.querySelector('#navMode .nav-label');
        if (!modeIcon || !navModeLabel) return;

        if (currentMode === 'reciting') {
          modeIcon.classList.add('material-icons-outlined');
          modeIcon.innerHTML = '';
          modeIcon.textContent = 'psychology'; // learn icon
          navModeLabel.textContent = 'Learn';
          return;
        }

        modeIcon.classList.remove('material-icons-outlined');
        modeIcon.innerHTML = RECITE_ICON_SVG;
        navModeLabel.textContent = 'Recite';
      }


      /*************************************************
       * AUDIO HANDLER
       *************************************************/

      function onAyahEnded() {
        remainingRepeats--;

        if (remainingRepeats > 0) {
          ayahAudio.currentTime = 0;
          ayahAudio.play();
          console.log('[AUDIO] Repeating, remaining:', remainingRepeats);
        } else {
          navPlayIcon.textContent = 'play_arrow';
          panelIcon.textContent   = 'play_arrow';
          console.log('[AUDIO] Repeat finished');
          if (isAutoSwipeEnabled()) {
            requestAutoSwipeNext();
          }
        }
      }

      function onAyahPlay() {
        navPlayIcon.textContent = 'pause';
        panelIcon.textContent  = 'pause';
        if (isAutoSwipeEnabled()) {
          window.parent.postMessage(
            {
              type: 'AUTO_SWIPE_PROGRESS',
              surah: currentSurah,
              ayah: currentAyah,
              timestamp: Date.now()
            },
            PARENT_ORIGIN
          );
        }
      }

      function onAyahPause() {
        navPlayIcon.textContent = 'play_arrow';
        panelIcon.textContent  = 'play_arrow';
      }

      function isAutoSwipeEnabled() {
        if (lastSettings && typeof lastSettings.autoSwipe === 'boolean') {
          return lastSettings.autoSwipe;
        }
        try {
          const raw = localStorage.getItem('qq_settings');
          if (!raw) return true;
          const parsed = JSON.parse(raw);
          if (typeof parsed.autoSwipe === 'boolean') {
            return parsed.autoSwipe;
          }
        } catch (err) {
          console.warn('[SETTINGS] Failed to read autoSwipe', err);
        }
        return true;
      }

      function requestAutoSwipeNext() {
        window.parent.postMessage(
          { type: 'AUTO_SWIPE_NEXT' },
          PARENT_ORIGIN
        );
      }

      function initAudio() {
        if (!ayahAudio) return;
        // prevent duplicate listeners
        ayahAudio.onplay  = null;
        ayahAudio.onpause = null;
        ayahAudio.onended = onAyahEnded;
        on(ayahAudio, 'play',  onAyahPlay);
        on(ayahAudio, 'pause', onAyahPause);
        //on(ayahAudio, 'ended', onAyahPause);

        audioControlSetup();
      }

      function audioControlSetup() {
        if (!ayahAudio) {
          console.warn('[AUDIO] ayahAudio element not found — aborting setup');
          return;
        }
        // ---------------------------------------------
        // Language change → hard reset audio state
        // ---------------------------------------------
        const langSelect = document.getElementById('audioLangSelect');
        langSelect?.addEventListener('change', () => {
          const lang = langSelect.value;
          ayahAudio.pause();
          // Reset UI controls
          if (speedSelect) speedSelect.value = '1';
          if (repeatInput) {
            repeatInput.value = '1';
            setRepeatCount(1, 'audioLangReset');

          }

          // Swap audio source
          const srcEl  = document.getElementById(`audio-url-${lang}`);
          const newSrc = srcEl?.dataset?.src;
          if (newSrc) {
            ayahAudio.src = newSrc;
            ayahAudio.load();
          } else {
            console.warn('[AUDIO] No audio source found for language:', lang);
          }
          // Reset play icons
          if (navIcon)   navIcon.textContent   = 'play_arrow';
          if (panelIcon) panelIcon.textContent = 'play_arrow';
        });

        // ---------------------------------------------
        // Playback speed control
        // ---------------------------------------------
        speedSelect?.addEventListener('change', () => {
          const rate = parseFloat(speedSelect.value);
          if (Number.isNaN(rate)) {
            console.warn('[AUDIO] Invalid speed value:', speedSelect.value);
            return;
          }
          ayahAudio.playbackRate = rate;
        });

        // ---------------------------------------------
        // Repeat count control (preference only)
        // ---------------------------------------------
        repeatInput?.addEventListener('change', () => {
          setRepeatCount(repeatInput.value, 'audioControl');
        });

      }

      function setRepeatCount(value, source = 'unknown') {
        const repeat = Math.max(1, parseInt(value, 10) || 1);

        // 🔑 source of truth
        ayahAudio.dataset.repeat = String(repeat);
        remainingRepeats = parseInt(ayahAudio.dataset.repeat || '1', 10);


        // 🔄 FORCE UI SYNC
        if (repeatInput) {
          repeatInput.value = repeat;
        }

        const settingsRepeat = document.querySelector('#settingsMenu #repeatCount');
        if (settingsRepeat) {
          settingsRepeat.value = repeat;
        }

        console.log(`[REPEAT][SYNC] from ${source}`, {
          repeat,
          dataset: ayahAudio.dataset.repeat,
          remainingRepeats
        });

        updateSetting({ repeat });
      }

/*************************************************
* Transliteration feedback + persistence
 *************************************************/
      function initPractice() {
        document.querySelectorAll('.translit-input').forEach(input => {
          const key = input.dataset.key;
          if (!key) return;

          const saved = localStorage.getItem(key);
          if (saved !== null) input.value = saved;

          input.oninput = () => {
            localStorage.setItem(key, input.value);
            translitHandler({ target: input });
          };
        });   
        if (clearBtn) {
          clearBtn.onclick = clearTranslitInputs;
        }

        if (hideTranslationsBtn) {
          hideTranslationsBtn.onclick = () => {
            document
              .querySelectorAll('.toggle-translation')
              .forEach(el => el.classList.toggle('hidden-toggle'));

            document
              .querySelectorAll('.show-translit')
              .forEach(el => {
                el.style.display =
                  el.style.display === 'none' ? 'block' : 'none';
              });
          };
        }
      }

      function initTranslitFeedback() {
        console.log('[PRACTICE] Initializing transliteration feedback');

        document.querySelectorAll('.translit-input').forEach(input => {
          input.removeEventListener('input', translitHandler);
          input.addEventListener('input', translitHandler);
        });
      }
      window.initTranslitFeedback = initTranslitFeedback;

      function translitHandler(e) {
        const input = e?.target;
        if (!input) return;

        const block = input.closest('.word-block-translit');
        if (!block) return;

        // ---------------------------------------------
        // Normalization helper
        // ---------------------------------------------
        const normalize = str =>
          str
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')     // remove diacritics
            .replace(/ʿ/g, '')        // remove ayn marker
            .replace(/[^a-z]/gi, '')  // letters only
            .toLowerCase()
            .trim();

        // ---------------------------------------------
        // Levenshtein distance helper
        // ---------------------------------------------
        const levenshtein = (a, b) => {
          const dp = Array.from({ length: a.length + 1 }, () =>
            Array(b.length + 1).fill(0)
          );

          for (let i = 0; i <= a.length; i++) dp[i][0] = i;
          for (let j = 0; j <= b.length; j++) dp[0][j] = j;

          for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
              dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
              );
            }
          }

          return dp[a.length][b.length];
        };

        // ---------------------------------------------
        // Compare expected vs actual
        // ---------------------------------------------
        const expected = normalize(input.dataset.expected || '');
        const actual   = normalize(input.value || '');
        const dist     = levenshtein(actual, expected);

        // Reset styles
        block.style.borderColor = 'gray';
        block.classList.remove('confetti');

        // ---------------------------------------------
        // Visual feedback rules
        // ---------------------------------------------
        if (!actual) {
          // Empty input
          block.style.backgroundColor = 'white';
        }
        else if (dist === 0) {
          // Correct
          block.style.backgroundColor = '#d4edda';
          block.style.borderColor     = '#28a745';
          block.classList.add('confetti');
        }
        else if (dist <= 2) {
          // Close
          block.style.backgroundColor = '#fff3cd';
          block.style.borderColor     = '#ffc107';
        }
        else {
          // Incorrect
          block.style.backgroundColor = '#f8d7da';
          block.style.borderColor     = '#dc3545';
        }
      }
      window.translitHandler = translitHandler;

      function togglePracticeNav() {
        if (!pracNav || !pracBox) {
          console.warn('[PRACTICE] Required elements missing');
          return;
        }
        const isPracticeOn = pracBox.style.display === 'block';
        clearNavActive();

        // =====================================================
        // TURN PRACTICE MODE ON
        // =====================================================
        if (!isPracticeOn) {
          console.log('[PRACTICE] Activating practice mode');

          // Ensure any popups are closed so the view isn't blocked.
          try { hidePopup(); } catch (err) {}

          // Update nav button to "Go Back"
          pracNav.innerHTML = `
            <span class="material-icons-outlined">more</span>
            <span class="nav-label">Go Back</span>
          `;

          // Hide all primary content sections
          [learnSec, recitSec, transSec, gramSec].forEach(el => {
            if (el) el.style.display = 'none';
          });

          // Show transliteration box
          pracBox.style.display = 'block';

          // Hide Games + Mode nav buttons
          if (gamesNav) gamesNav.style.display = 'none';
          if (modeNav)  modeNav.style.display  = 'none';
          if (saveNav)  saveNav.style.display  = 'none';

          // Re-bind transliteration feedback logic
          initTranslitFeedback();

          // Reset scroll so practice content is visible
          requestAnimationFrame(() => {
            if (scrollEl) scrollEl.scrollTop = 0;
          });

          console.log('[PRACTICE] Practice mode enabled');
          notifyParentPracticeMode(true);
          return;
        }

        // =====================================================
        // TURN PRACTICE MODE OFF
        // =====================================================
        console.log('[PRACTICE] Deactivating practice mode');
        notifyParentPracticeMode(false);


        // Restore default Learning view
        if (learnSec) learnSec.style.display = 'block';
        if (recitSec) recitSec.style.display = 'none';
        if (gramSec)  gramSec.style.display  = 'block';

        // Hide practice box
        pracBox.style.display = 'none';

        // Restore translation panel visibility based on saved preference
        if (lastSettings && typeof lastSettings.showPanelTranslation === 'boolean') {
          setPanelTranslationVisible(lastSettings.showPanelTranslation);
        } else {
          setPanelTranslationVisible(
            !document.documentElement.classList.contains('hide-panel-translation')
          );
        }

        // Restore nav buttons
        if (gamesNav) gamesNav.style.display = '';
        if (modeNav)  modeNav.style.display  = LEGACY_IFRAME_RECITE_MODE_ENABLED ? '' : 'none';
        if (saveNav)  saveNav.style.display  = '';

        // Restore nav button label
        pracNav.innerHTML = `
          <span class="material-icons-outlined">edit</span>
          <span class="nav-label">Practice</span>
        `;

        pracNav.classList.remove('active');

        // Reset scroll after layout changes
        requestAnimationFrame(() => {
          if (scrollEl) scrollEl.scrollTop = 0;
        });

        console.log('[PRACTICE] Practice mode disabled');
      }
      window.togglePracticeNav = togglePracticeNav;

      /**
       * Clears all transliteration input fields used in practice mode.
       *
       * Side effects:
       * - Removes cached values from localStorage
       * - Clears input values
       * - Triggers input event to refresh feedback UI
       */
      function clearTranslitInputs() {
        console.log('[PRACTICE] Clearing all transliteration inputs');

        const inputs = document.querySelectorAll('.translit-input');

        if (!inputs.length) {
          console.warn('[PRACTICE] No transliteration inputs found');
          return;
        }

        inputs.forEach(input => {
          const key = input.dataset.key;

          // Remove persisted value
          if (key) {
            localStorage.removeItem(key);
            console.log('[PRACTICE] Cleared cache key:', key);
          }

          // Clear UI value
          input.value = '';

          // Re-trigger validation / feedback logic
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        console.log('[PRACTICE] Transliteration inputs reset complete');
      }
      window.clearTranslitInputs = clearTranslitInputs;

/*************************************************
 * UI — AUTO-HIDING BOTTOM NAV + FLOATING PLAY BTN
 *************************************************/

      function initNav() {
        if (initNav.done) return;
        initNav.done = true;
        console.log('[NAV] Initializing auto-hide nav');

        if (!nav || !playBtn || !ayahAudio) {
          console.warn('[NAV] Missing required elements', { nav, playBtn, ayahAudio });
          return;
        }
        function scheduleHide() {
          clearTimeout(hideTimer);
          if (holdNavVisible || (ayahAudio && !ayahAudio.paused)) return;

          hideTimer = setTimeout(() => {
            if (holdNavVisible || (ayahAudio && !ayahAudio.paused)) return;
            nav.classList.remove('visible');
          }, SHOW_DURATION);
        }

        function showNav({ keepVisible = false } = {}) {
          nav.classList.add('visible');
          clearTimeout(hideTimer);
          if (!keepVisible) {
            scheduleHide();
          }
        }

        // Keep play FAB visible while audio is playing; auto-hide when paused/stopped.
        on(ayahAudio, 'play', () => showNav({ keepVisible: true }));
        on(ayahAudio, 'pause', () => showNav());
        on(ayahAudio, 'ended', () => showNav());


        // Initial load
        requestAnimationFrame(() => {
          requestAnimationFrame(showNav);
        });


        // Scroll reveals nav
        on(window, 'scroll', showNav, { passive: true });

        // Any click reveals nav
        on(document.body, 'click', e => {
          const clickedSettings = e.target.closest('#settingsMenu');
          const clickedInput    = e.target.closest('input, textarea');

          if (!clickedSettings && !clickedInput) {
            showNav();
          }
        });

        // Keep nav visible while settings are open
        on(document.body, 'click', e => {
          if (e.target.closest('#navSettings')) {
            showNav({ keepVisible: true });
          }
        });

        // When settings menu closes, restore auto-hide
        const observer = new MutationObserver(mutations => {
          mutations.forEach(m =>
            m.removedNodes.forEach(node => {
              if (node.id === 'settingsMenu') {
                showNav();
              }
            })
          );
        });

        observer.observe(document.body, { childList: true });

        // cleanup
        cleanupFns.push(() => observer.disconnect());


        // Clicking any nav item resets timer
        nav.querySelectorAll('.nav-item')
          .forEach(item => on(item, 'click', showNav))

        console.log('[NAV] Auto-hide nav ready');


        // Translation section click → show nav


        if (translationSection) {
          on(translationSection, 'click', () => {
            console.log('[NAV] Translation clicked → show nav');
            showNav();
          });
        }
        };
      window.initNav = initNav;

/*************************************************
 * PROGRESS SAVE REQUEST (IFRAME → PARENT)
 *************************************************/
      /**
       * Sends a SAVE_PROGRESS request to the parent.
       * Includes streak recording and timestamp.
       */
      function requestSaveProgress() {
        console.log('[IFRAME] Requesting SAVE_PROGRESS', {
          surah: currentSurah,
          ayah: currentAyah
        });

        window.parent.postMessage(
          {
            type: 'SAVE_PROGRESS',
            surah: currentSurah,
            ayah: currentAyah,
            recordStreak: true,
            timestamp: Date.now()
          },
          PARENT_ORIGIN
        );
      }

      function setSaveButtonsSavedState(saved) {
        const isSaved = !!saved;
        ['stripSaveProgress', 'navSaveProgress'].forEach(id => {
          const btn = document.getElementById(id);
          if (!btn) return;
          btn.classList.toggle('is-saved', isSaved);
          btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
          const icon = btn.querySelector('.material-symbols-outlined');
          if (icon) {
            icon.textContent = isSaved ? 'bookmark_added' : 'bookmark';
          }
        });
      }
      function ensureInlineSaveProgressButton() {
        const playPracticeBtn = document.getElementById('stripNavGames');
        if (!playPracticeBtn) return;

        const host = playPracticeBtn.parentElement;
        if (!host) return;

        host.classList.add('strip-action-row');
        playPracticeBtn.classList.add('strip-btn-inline');
        const playLabel =
          playPracticeBtn.querySelector('.btn-text') ||
          playPracticeBtn.querySelector('.nav-label');
        if (playLabel) {
          playLabel.textContent = 'Play & Practice';
        } else {
          playPracticeBtn.textContent = 'Play & Practice';
        }

        let saveBtn = document.getElementById('stripSaveProgress');
        if (!saveBtn) {
          saveBtn = document.createElement('button');
          saveBtn.id = 'stripSaveProgress';
          saveBtn.type = 'button';
          saveBtn.className = 'strip-btn strip-btn-inline';
          saveBtn.innerHTML = '<span class="btn-text">Save Progress</span>';
          host.appendChild(saveBtn);
        }
        saveBtn.classList.add('strip-btn-inline');
        saveBtn.classList.remove('is-saved');
        saveBtn.type = 'button';
        saveBtn.innerHTML = `
          <span class="material-symbols-outlined" aria-hidden="true">bookmark</span>
          <span class="btn-text">Save</span>
        `;

        saveBtn.onclick = e => {
          if (e?.preventDefault) e.preventDefault();
          requestSaveProgress();
          saveBtn.blur();
        };

        let memoBtn = document.getElementById('stripMemorizeAyah');
        if (!memoBtn) {
          memoBtn = document.createElement('button');
          memoBtn.id = 'stripMemorizeAyah';
          memoBtn.type = 'button';
          memoBtn.className = 'strip-btn strip-btn-inline';
          memoBtn.innerHTML = '<span class="btn-text">Memorize</span>';
          host.appendChild(memoBtn);
        }
        memoBtn.innerHTML = '<span class="btn-text">Memorize</span>';

        memoBtn.onclick = e => {
          if (e?.preventDefault) e.preventDefault();
          window.parent.postMessage(
            {
              type: 'OPEN_MEMORIZATION_AYAH',
              surah: currentSurah,
              ayah: currentAyah
            },
            PARENT_ORIGIN
          );
          memoBtn.blur();
        };
      }

/*************************************************
 * IFRAME ↔ PARENT MESSAGE ROUTER
 *************************************************/

      function bindInternalAppLinkRouting() {
        if (bindInternalAppLinkRouting.done) return;
        bindInternalAppLinkRouting.done = true;

        const normalizeHost = host => String(host || '').toLowerCase().replace(/^www\./, '');

        document.addEventListener('click', evt => {
          const anchor = evt.target instanceof Element ? evt.target.closest('a[href]') : null;
          if (!anchor) return;

          const href = anchor.getAttribute('href');
          if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

          let parsed;
          try {
            parsed = new URL(href, window.location.href);
          } catch (_) {
            return;
          }

          const sameAppHost = normalizeHost(parsed.hostname) === 'myquranquest.com';
          const relativeLink = href.startsWith('/') || href.startsWith('./') || href.startsWith('../');
          if (!sameAppHost && !relativeLink) return;

          evt.preventDefault();
          evt.stopPropagation();
          window.parent.postMessage({ type: 'OPEN_INTERNAL_LINK', url: parsed.href }, PARENT_ORIGIN);
        }, { capture: true });
      }
      function initMessaging() {
          if (initMessaging.done) return;
          initMessaging.done = true;

          console.log('[INIT] initMessaging');

          on(window, 'message', onParentMessage);
          bindInternalAppLinkRouting();
      }

      function bindInlineReplacements() {
        if (bindInlineReplacements.done) return;
        bindInlineReplacements.done = true;

        const overlayEl = document.getElementById('overlay');
        if (overlayEl) {
          overlayEl.addEventListener('click', () => hidePopup());
        }

        const navPracticeBtn = document.getElementById('navPractice');
        if (navPracticeBtn) {
          navPracticeBtn.addEventListener('click', e => {
            e.preventDefault();
            togglePracticeNav();
            navPracticeBtn.blur();
          });
        }

                const navModeBtn = document.getElementById('navMode');
        if (navModeBtn) {
          if (!LEGACY_IFRAME_RECITE_MODE_ENABLED) {
            navModeBtn.style.display = 'none';
            navModeBtn.setAttribute('aria-hidden', 'true');
          } else {
            navModeBtn.addEventListener('click', e => {
              e.preventDefault();
              toggleModeNav();
              navModeBtn.blur();
            });
          }
        }

        const playBtnEl = document.getElementById('playToggleBtn');
        if (playBtnEl) {
          playBtnEl.addEventListener('click', e => {
            e.preventDefault();
            togglePlay(e);
          });
        }

        const navSettingsBtn = document.getElementById('navSettings');
        if (navSettingsBtn) {
          navSettingsBtn.addEventListener('click', e => {
            e.preventDefault();
            toggleSettingsNav(e);
            navSettingsBtn.blur();
          });
        }

        const saveBtn = document.getElementById('navSaveProgress');
        if (saveBtn) {
          saveBtn.addEventListener('click', e => {
            e.preventDefault();
            requestSaveProgress();
            saveBtn.blur();
          });
        }

        document.querySelectorAll('.grammar-item[data-grammar]')
          .forEach(item => {
            item.addEventListener('click', () => {
              const type = item.getAttribute('data-grammar');
              if (type) {
                showGrammarPopup(type);
              }
            });
          });

        document.body.addEventListener('click', e => {
          const word = e.target.closest('.word-block[data-popup]');
          if (!word) return;
          const raw = word.getAttribute('data-popup');
          if (!raw) return;
          try {
            const data = JSON.parse(raw);
            showPopup(data);
          } catch (err) {
            console.warn('[POPUP] Failed to parse word popup data', err);
          }
        });
      }

      function isTrustedParentMessage(e) {
        if (e.source !== window.parent) return false;
        if (RAW_ORIGIN === 'null') {
          return e.origin === 'null';
        }
        return e.origin === RAW_ORIGIN;
      }

      function onParentMessage(e) {
        if (!isTrustedParentMessage(e)) return;
        const data = e.data || {};
        const { type } = data;
        if (!type) return;
        switch (type) {

          case 'APPLY_SETTINGS': {
            const nextVersion = Number(data.version || 0);
            if (nextVersion && nextVersion <= appliedSettingsVersion) {
              return;
            }
            if (nextVersion) {
              appliedSettingsVersion = nextVersion;
            }
            applySettings(data.settings || {});
            return;
          }

          case 'APPLY_THEME': {
            const enabled = data.darkMode === true;
            document.documentElement.classList.toggle('dark-mode', enabled);
            if (document.body) document.body.classList.toggle('dark-mode', enabled);
            return;
          }

          case 'SET_SWIPE_WIDTH': {
            if (data.width) {
              swipeBaseWidth = data.width;
              console.log('[SWIPE] Base width set:', swipeBaseWidth);
            }
            return;
          }

          case 'SET_HINT_POLICY': {
            if (typeof data.allowWordHint === 'boolean') {
              allowWordHint = data.allowWordHint;
            }
            if (typeof data.allowSaveHint === 'boolean') {
              allowSaveHint = data.allowSaveHint;
            }
            return;
          }

          case 'TRIGGER_WORD_HINT': {
            triggerWordHintNow();
            return;
          }

          case 'TRIGGER_SAVE_HINT': {
            showSaveHint(saveNav);
            return;
          }

          case 'CLOSE_ACTIVE_POPUP': {
            closeActivePopup({ suppressNotify: true });
            return;
          }

          case 'OPEN_SETTINGS': {
            const isAlreadyOpen = !!document.getElementById('settingsMenu');
            if (!isAlreadyOpen) {
              toggleSettingsNav({
                preventDefault() {},
                stopPropagation() {}
              });
            }
            return;
          }

          case 'PAUSE_ALL_AUDIO': {
            if (ayahAudio) {
              ayahAudio.pause();
            }
            if (wordAudio) {
              wordAudio.pause();
            }
            Object.values(audioCache).forEach(a => {
              if (!a.paused) a.pause();
            });
            return;
          }

          case 'PLAY_AYAH_AUDIO': {
            startAyahAudio({ reset: true });
            return;
          }

          case 'RETURN_TO_AYAH': {
            const forceExit = data.force === true;
            if (typeof togglePracticeNav === 'function' && pracBox?.style.display === 'block') {
              togglePracticeNav();
            }

            const cleanupGameShell = () => {
              const gameEl = document.getElementById('game-mode-content');
              if (gameEl) {
                gameEl.classList.remove('fullscreen-game');
                gameEl.style.overflowX = '';
                gameEl.style.overflowY = '';
                gameEl.style.webkitOverflowScrolling = '';
                gameEl.style.touchAction = '';
                gameEl.style.overscrollBehaviorY = '';
              }
              document.body.classList.remove('game-active');
            };

            const backBtn = document.getElementById('navBackBtn');
            if (forceExit && typeof window.__qqForceExitGameToAyah === 'function') {
              window.__qqForceExitGameToAyah();
              cleanupGameShell();
              return;
            }

            if (backBtn) {
              if (forceExit && typeof window.__qqForceReturnToGamesSelector === 'function') {
                window.__qqForceReturnToGamesSelector();
              } else {
                backBtn.click();
              }
              cleanupGameShell();
              return;
            }

            const gameEl = document.getElementById('game-mode-content');
            if (gameEl) {
              gameEl.style.display = 'none';
              cleanupGameShell();
            }
            return;
          }

          // =============================================
          // Simulated click forwarding (parent → iframe)
          // =============================================
          case 'CLICK': {
            const { x, y } = data;

            if (typeof x !== 'number' || typeof y !== 'number') {
              console.warn('[IFRAME] CLICK message missing coordinates');
              return;
            }

            const el = document.elementFromPoint(x, y);
            el?.click();
            return;
          }


          

          // =============================================
          // Save progress results (parent → iframe)
          // =============================================
          case 'SAVE_PROGRESS_SUCCESS': {
            console.log('[IFRAME] Progress saved successfully');
            setSaveButtonsSavedState(true);

            showToast(
              data.streakUpdated
                ? '🔥 Streak updated!'
                : '💾 Progress saved'
            );
            return;
          }

          case 'SAVE_PROGRESS_FAILED': {
            console.warn('[IFRAME] Progress save failed');
            showToast('⚠️ Could not save progress', '#dc3545');
            return;
          }

          // =============================================
          // Parent requests iframe to save progress
          // =============================================
          case 'REQUEST_SAVE_PROGRESS': {
            requestSaveProgress();
            return;
          }

          // =============================================
          // Unknown / future message types
          // =============================================
          default:
            // console.warn('[IFRAME] Unhandled message type:', type, data);
            return;
        }
      }

/*************************************************
 * GAMES — VERB AUDIO PLAYBACK (CACHED + FALLBACK)
 *************************************************/

      /**
       * Plays verb audio for a given verb + tense.
       *
       * Features:
       * - Caches loaded Audio objects
       * - Toggles play / pause on repeated clicks
       * - Tries multiple base URLs as fallback
       * - Updates UI icon state
       *
       * @param {string} verb
       * @param {string} tense
       * @param {HTMLElement} linkElement - Clicked element containing `.audio-icon`
       */
      async function playVerbAudio(verb, tense, linkElement) {
        const key = `${verb}_${tense}`;
        const iconSpan = linkElement?.querySelector('.audio-icon');

        console.log('[VERB_AUDIO] Requested:', key);

        // ---------------------------------------------
        // Cached audio → toggle play / pause
        // ---------------------------------------------
        if (audioCache[key]) {
          const audio = audioCache[key];

          if (!audio.paused) {
            audio.pause();
            iconSpan && (iconSpan.textContent = '🔊');
          } else {
            audio.currentTime = 0;
            Object.values(audioCache).forEach(a => !a.paused && a.pause());
            audio.play();
            iconSpan && (iconSpan.textContent = '⏸️');
          }
          return;
        }

        const baseUrls = [
          'https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs1/',
          'https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs2/',
          'https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs3/',
          'https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs4/'
        ];

        // ---------------------------------------------
        // Load all candidates in parallel
        // ---------------------------------------------
        const candidates = baseUrls.map(base => {
          const audio = new Audio(`${base}${key}.mp3`);
          audio.preload = 'auto';

          return waitForAudioLoad(audio)
            .then(() => audio)
            .catch(() => null);
        });

        // ---------------------------------------------
        // First successful audio wins
        // ---------------------------------------------
        const audio = (await Promise.any(
          candidates.map(p =>
            p.then(a => {
              if (!a) throw new Error();
              return a;
            })
          )
        )).catch(() => null);

        if (!audio) {
          console.warn('[VERB_AUDIO] Audio not found:', key);
          alert(`⚠️ Audio for "${verb}" (${tense}) not found.`);
          return;
        }

        // ---------------------------------------------
        // Play & cache
        // ---------------------------------------------
        audioCache[key] = audio;

        Object.values(audioCache).forEach(a => !a.paused && a.pause());

        audio.play();
        iconSpan && (iconSpan.textContent = '⏸️');

        audio.addEventListener('ended', () => {
          iconSpan && (iconSpan.textContent = '🔊');
        });

        console.log('[VERB_AUDIO] Playing:', audio.src);
      }

      window.playVerbAudio = playVerbAudio;


/*************************************************
 * UI — TOAST NOTIFICATION
 *************************************************/

      /**
       * Displays a temporary toast message at the bottom
       * center of the screen.
       *
       * @param {string} message - Text to display
       * @param {string} [color='#333'] - Background color
       */
      function showToast(message, color = '#333') {
        if (!message) {
          console.warn('[TOAST] showToast called without message');
          return;
        }

        console.log('[TOAST] Showing toast:', message);

        const toast = document.createElement('div');
        toast.textContent = message;

        // Inline styles keep this fully self-contained
        toast.style.cssText = `
          position: fixed;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          background: ${color};
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          z-index: 9999;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        `;

        document.body.appendChild(toast);

        // Fade in on next frame
        requestAnimationFrame(() => {
          toast.style.opacity = '1';
        });

        // Auto-dismiss after delay
        const DISPLAY_TIME = 1800;
        const FADE_TIME    = 300;

        setTimeout(() => {
          toast.style.opacity = '0';

          setTimeout(() => {
            toast.remove();
            console.log('[TOAST] Toast removed');
          }, FADE_TIME);

        }, DISPLAY_TIME);
      }
      window.showToast = showToast;

/*************************************************
 * SWIPE — TOUCH ONLY (MOBILE)
 * Left / Right swipe → notify parent
 *************************************************/

   /*   function initIframeTouchSwipe() {
        // Only enable on touch devices
        if (!('ontouchstart' in window)) {
          console.log('[SWIPE] Touch not supported — skipping touch swipe');
          return;
        }

        console.log('[SWIPE] Initializing touch swipe');

        const root = document.body;
        let startX = 0;
        let startY = 0;

        root.addEventListener('touchstart', e => {
          if (e.touches.length !== 1) return;

          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        }, { passive: true });

        root.addEventListener('touchend', e => {
          if (!startX || !startY) return;

          const dx = e.changedTouches[0].clientX - startX;
          const dy = e.changedTouches[0].clientY - startY;

          // Horizontal swipe only
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
            const dir = dx < 0 ? 1 : -1;

            console.log('[SWIPE] Touch swipe detected:', dir);
            window.parent.postMessage(
              { type: 'QQ_SWIPE', dir },
              PARENT_ORIGIN
            );
          }

          startX = startY = 0;
        }, { passive: true });
      }
      window.initIframeTouchSwipe = initIframeTouchSwipe;



      


/*************************************************
 * GRAMMAR POPUP — SHOW / HIDE
 *************************************************/
      function showGrammarPopup(type) {
        // 🔒 block gesture layer
        window.parent.postMessage(
          { type: 'WORD_DETAILS_OPENED' },
          PARENT_ORIGIN
        );
        console.log('[GrammarPopup] Requested type:', type);

        const content = grammarExplanations[type];
        if (!content) {
          console.warn('[GrammarPopup] No explanation found for type:', type);
          return;
        }

        console.log('[GrammarPopup] Found explanation content, length:', content.length);

        // Close any existing popup first
        console.log('[GrammarPopup] Closing any existing popup');
        hidePopup({ suppressNotify: true });



        if (!popup || !overlay) {
          console.error('[GrammarPopup] Missing popup or overlay element', {
            popupFound: !!popup,
            overlayFound: !!overlay
          });
          return;
        }

        console.log('[GrammarPopup] Popup and overlay elements found');

        // Inject content
        popup.innerHTML = content;
        console.log('[GrammarPopup] Content injected into popup');

        // Make visible
        popup.style.display = 'block';
        overlay.style.display = 'block';
        document.body.classList.add('modal-open');
        console.log('[GrammarPopup] Display styles set to block');

        // Activate animations / classes
        popup.classList.add("active");
        overlay.classList.add("active");
        console.log('[GrammarPopup] Active classes added — popup should now be visible');
      }
      window.showGrammarPopup = showGrammarPopup;

/*************************************************
 * ONBOARDING — WORD CLICK HINT (ONE-TIME)
 *************************************************/

      function findFirstVerbWord() {
        const verbEl = document.querySelector('.word-block.verb-highlight');
        if (verbEl) return verbEl;

        const words = document.querySelectorAll('.word-block');
        for (const el of words) {
          const onclick = el.getAttribute('onclick') || '';
          const match = onclick.match(/\"tags_joined\"\\s*:\\s*\"([^\"]+)\"/);
          if (match && /\\bverb\\b/i.test(match[1])) {
            return el;
          }
        }
        return null;
      }

      function initWordClickHint() {
        if (!allowWordHint) return;
        const WORD_KEY  = 'word_click_hint_shown_v1';
        const SWIPE_KEY = 'swipe_hint_shown_v1';

        if (localStorage.getItem(WORD_KEY)) return;

        function start() {
          if (localStorage.getItem(WORD_KEY)) return;
          triggerWordHintNow();
        }

        if (localStorage.getItem(SWIPE_KEY)) {
          start();
          return;
        }

        // Fallback: if swipe hint never fires (or is skipped), still show word hint.
        clearTimeout(initWordClickHint.fallbackTimer);
        initWordClickHint.fallbackTimer = setTimeout(() => {
          if (!localStorage.getItem(WORD_KEY)) {
            start();
          }
        }, 1800);
      }
      window.initWordClickHint = initWordClickHint;

      function triggerWordHintNow() {
        if (!allowWordHint) return;
        const WORD_KEY = 'word_click_hint_shown_v1';
        if (localStorage.getItem(WORD_KEY)) return;

        const firstVerb = findFirstVerbWord();
        if (!firstVerb) {
          triggerWordHintNow.retryCount = (triggerWordHintNow.retryCount || 0) + 1;
          if (triggerWordHintNow.retryCount > 120) {
            triggerWordHintNow.retryCount = 0;
            window.parent?.postMessage(
              { type: 'WORD_HINT_SKIPPED_NO_VERB' },
              '*'
            );
            return;
          }
          requestAnimationFrame(triggerWordHintNow);
          return;
        }
        triggerWordHintNow.retryCount = 0;
        showWordHint(firstVerb);
      }
      window.triggerWordHintNow = triggerWordHintNow;

      function ensureSaveHintElements() {
        if (saveHintOverlay) return;
        saveHintOverlay = document.getElementById('saveHintOverlay');
        if (saveHintOverlay) {
          saveHint = document.getElementById('saveHint');
          saveHintText = document.getElementById('saveHintText');
          saveHintLottie = document.getElementById('saveHintLottie');
          return;
        }

        saveHintOverlay = document.createElement('div');
        saveHintOverlay.id = 'saveHintOverlay';
        saveHintOverlay.className = 'hidden';
        saveHintOverlay.innerHTML = `
          <div id="saveHintText" class="save-hint-text">
            Tap Save to keep your streak alive and mark this ayah as read.
          </div>
          <div id="saveHint" class="save-hint">
            <div id="saveHintLottie"></div>
          </div>
        `;
        document.body.appendChild(saveHintOverlay);

        saveHint = document.getElementById('saveHint');
        saveHintText = document.getElementById('saveHintText');
        saveHintLottie = document.getElementById('saveHintLottie');
      }

      function showSaveHint(targetEl) {
        const SAVE_KEY = 'save_click_hint_shown_v1';
        if (localStorage.getItem(SAVE_KEY)) return;
        if (!allowSaveHint) return;

        ensureSaveHintElements();
        if (!saveHintOverlay || !saveHint || !saveHintLottie) return;

        const target = targetEl || saveNav;
        if (!target) {
          showSaveHint.retryCount = (showSaveHint.retryCount || 0) + 1;
          if (showSaveHint.retryCount <= 6) {
            setTimeout(() => showSaveHint(targetEl), 250);
          }
          return;
        }
        showSaveHint.retryCount = 0;

        holdNavVisible = true;
        clearTimeout(hideTimer);
        nav?.classList.add('visible');

        saveHintOverlay.classList.remove('hidden');
        saveHintOverlay.style.pointerEvents = 'none';
        localStorage.setItem(SAVE_KEY, '1');
        blockSwipeForHint();
        window.parent?.postMessage({ type: 'SAVE_HINT_SHOWN' }, PARENT_ORIGIN);

        const SCALE = 2.8;
        const AUTO_CLOSE = 4200;
        const hasLottie = !!window.lottie;

        function position() {
          if (!document.body.contains(target)) return;
          const rect = target.getBoundingClientRect();
          const width = rect.width * SCALE;
          const height = rect.height * SCALE;
          saveHint.style.width = `${width}px`;
          saveHint.style.height = `${height}px`;
          saveHint.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
          saveHint.style.top = `${rect.top + rect.height / 2 - height / 2}px`;
        }

        requestAnimationFrame(() => requestAnimationFrame(position));

        saveHintLottie.innerHTML = '';
        const anim = hasLottie
          ? lottie.loadAnimation({
              container: saveHintLottie,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              path: '/utils/assets/save_click.json'
            })
          : null;
        if (anim) {
          anim.setSpeed(0.6);
        }

        const ro = new ResizeObserver(position);
        ro.observe(target);

        let cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          ro.disconnect();
          if (anim) anim.destroy();
          saveHintOverlay.classList.add('hidden');
          saveHintOverlay.style.pointerEvents = 'none';
          unblockSwipeForHint();
          holdNavVisible = false;
          window.parent?.postMessage({ type: 'SAVE_HINT_DONE' }, PARENT_ORIGIN);
          if (nav?.classList.contains('visible')) {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
              if (!holdNavVisible) nav.classList.remove('visible');
            }, SHOW_DURATION);
          }
        }

        target.addEventListener('click', cleanup, { once: true });
        setTimeout(cleanup, AUTO_CLOSE);
      }
      window.showSaveHint = showSaveHint;

      function showWordHint(wordEl) {
        if (!wordEl) return;

        if (!wordHintOverlay || !hint || !container) return;

        const SCALE        = 4;
        const AUTO_CLOSE   = 3500;
        const STORAGE_KEY  = 'word_click_hint_shown_v1';

        wordHintOverlay.classList.remove('hidden');
        wordHintOverlay.style.pointerEvents = 'none';
        localStorage.setItem(STORAGE_KEY, '1');
        blockSwipeForHint();
        window.parent?.postMessage({ type: 'WORD_HINT_SHOWN' }, PARENT_ORIGIN);

        // ------------------------------
        // Position hint over word
        // ------------------------------
        function position() {
          if (!document.body.contains(wordEl)) {
            cleanup('word-removed');
            return;
          }

          const rect = wordEl.getBoundingClientRect();

          const width  = rect.width * SCALE;
          const height = rect.height * SCALE;

          hint.style.width  = `${width}px`;
          hint.style.height = `${height}px`;
          hint.style.left   = `${rect.left + window.scrollX + rect.width / 2 - width / 2}px`;
          hint.style.top    = `${rect.top  + window.scrollY + rect.height / 2 - height / 2}px`;
        }

        requestAnimationFrame(() => requestAnimationFrame(position));

        // ------------------------------
        // Lottie animation
        // ------------------------------
        container.innerHTML = '';
        const anim = window.lottie
          ? lottie.loadAnimation({
              container,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              path: '/utils/assets/tap.json'
            })
          : null;
        if (anim) {
          anim.setSpeed(0.6);
        }

        // ------------------------------
        // Resize observer
        // ------------------------------
        const ro = new ResizeObserver(position);
        ro.observe(wordEl);

        // ------------------------------
        // Cleanup
        // ------------------------------
        let cleaned = false;

        function cleanup(reason) {
          if (cleaned) return;
          cleaned = true;

          ro.disconnect();
          if (anim) anim.destroy();

          wordHintOverlay.classList.add('hidden');
          wordHintOverlay.style.pointerEvents = 'none';
          unblockSwipeForHint();
          window.parent?.postMessage({ type: 'WORD_HINT_DONE' }, PARENT_ORIGIN);

          document.querySelectorAll('.word-block')
            .forEach(el => el.removeEventListener('click', onWordClick));
        }

        function onWordClick() {
          cleanup('word-click');
        }

        document.querySelectorAll('.word-block')
          .forEach(el => el.addEventListener('click', onWordClick, { once: true }));

        setTimeout(() => cleanup('timeout'), AUTO_CLOSE);
      }
      window.showWordHint = showWordHint;

/******************************************************
 *  MAIN IFRAME APP INITIALIZATION - DOM CONTENT LOADED
 ******************************************************/

      function cacheDOM() {
        ayahAudio     = document.getElementById('ayahAudio');
        audioPanel    = document.getElementById('audioControls');
        playBtn       = document.getElementById('playToggleBtn');
        navPlay       = document.getElementById('navPlay');
        navPlayIcon   = document.getElementById('navPlayIcon');
        floatingBtn   = document.getElementById('floatingPlayer');
        playToggleBtn = document.getElementById('playToggleBtn');
        wordHintOverlay = document.getElementById('wordHintOverlay');
        hint          = document.getElementById('wordHint');
        container     = document.getElementById('wordHintLottie');
        scrollEl      = document.getElementById('ayahScroll');
        el            = document.body;
        btn           = document.getElementById('navSettings');
        existing      = document.getElementById('settingsMenu');
        audio         = document.getElementById('ayahAudio');
        pracBox 			= document.getElementById('transliteration-box');
        menuEl 				= document.getElementById('settingsMenu');
        rootToggle 		= document.getElementById('toggleRoot');
        gramToggle 		= document.getElementById('toggleGram');
        transToggle 	= document.getElementById('toggleTrans');
        allTrans 		  = document.getElementById('toggleAllTrans');
        ts 					  = document.getElementById('translation-section');
        langSelect 		= document.getElementById('audioLangSelect');
        arSrc   			= document.getElementById('audio-url-ar')?.dataset.src;
        enSrc   			= document.getElementById('audio-url-en')?.dataset.src;
        urSrc   			= document.getElementById('audio-url-ur')?.dataset.src;
        popup   			= document.getElementById('popupContent');
        overlay 			= document.getElementById('overlay');
        enDiv 				= document.getElementById('englishTranslation');
        urDiv 				= document.getElementById('urduTranslation');
        dropdown 			= document.getElementById('translationDropdown');
        pracNav  			= document.getElementById('navPractice');
        gamesNav 			= document.getElementById('navGames');
        modeNav  			= document.getElementById('navMode');
        learnSec 			= document.getElementById('learning-mode-content');
        recitSec 			= document.getElementById('reciting-mode-content');
        transSec 			= document.getElementById('translation-section');
        gramSec  			= document.getElementById('main-grammar-section');
        btn 			  	= document.getElementById('navMode');
        learnSection	= document.getElementById('learning-mode-content');
        recitSection 	= document.getElementById('reciting-mode-content');
        modeIcon     	= document.getElementById('navModeIcon');
        speedSelect 	= document.getElementById('speedSelect');
        repeatInput 	= document.getElementById('repeatCount');
        navIcon   		= document.getElementById('navPlayIcon');
        saveNav  			= document.getElementById('stripSaveProgress') || document.getElementById('navSaveProgress');

        clearBtn 			 = document.getElementById('clearAll');
        hideTranslationsBtn = document.getElementById('hideTranslations');
        translationSection = document.getElementById('translation-section');


        panelIcon     = document.querySelector('#playToggleBtn .material-icons-outlined');
        panelIcon 		= document.querySelector('#playToggleBtn .material-icons-outlined');
        panelIconEl 	= document.querySelector('#playToggleBtn .material-icons-outlined');
        nav           = document.querySelector('.bottom-nav');


        if (!ayahAudio) {
          console.warn('[INIT] ayahAudio not found');
        }
      }

      function ensureAyahScrollLayout() {
        const scroll = document.getElementById('ayahScroll');
        if (!scroll) return;

        // These sections are authored outside #ayahScroll in the HTML.
        // Move them inside so they are visible/scrollable within the iframe.
        const ids = [
          'translation-section',
          'game-mode-content',
          'transliteration-box'
        ];

        ids.forEach(id => {
          const el = document.getElementById(id);
          if (el && !scroll.contains(el)) {
            scroll.appendChild(el);
          }
        });
      }

      function normalizeArabicDisplayText(raw) {
        return String(raw || '')
          // Normalize tanween-before-alif variant to standard fathatan.
          .replace(/\u0657(?=\u0627)/g, '\u064B')
          // Normalize remaining Quranic tanween variant to standard dammatan.
          .replace(/\u0657/g, '\u064C')
          // Normalize Quranic sukun mark to standard sukun for font compatibility.
          .replace(/\u06E1/g, '\u0652');
      }

      function normalizeArabicDisplayInView() {
        const selectors = ['.word-text', '#reciting-mode-content', '.ayah-arabic'];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(node => {
            const before = node.textContent || '';
            const after = normalizeArabicDisplayText(before);
            if (after !== before) node.textContent = after;
          });
        });
      }


      

      function initIframeApp() {  
       if (lastInitVersion === iframeDomVersion) {
          console.log('[INIT] initIframeApp skipped (same DOM)');
          return;
        }

        lastInitVersion = iframeDomVersion;

        console.log('[INIT] initIframeApp running for DOM version', iframeDomVersion);

        console.log('[INIT] initIframeApp'              );
        ensureInlineSaveProgressButton();
        cacheDOM();
        if (!LEGACY_IFRAME_RECITE_MODE_ENABLED) {
          currentMode = 'learning';
          if (recitSection) {
            recitSection.style.display = 'none';
            recitSection.setAttribute('aria-hidden', 'true');
          }
        }
        normalizeArabicDisplayInView();
        bindInlineReplacements();
        if (scrollEl) {
          document.body.classList.add('has-ayah-scroll');
        } else {
          document.body.classList.remove('has-ayah-scroll');
        }
        updateNavModeActionUI();
        ensureAyahScrollLayout();
        // Set default translation panel language if missing
        const html = document.documentElement;
        if (!html.hasAttribute('data-panel-lang')) {
          html.setAttribute('data-panel-lang', 'en');
        }

        setRepeatCount(1, 'init');




        console.log('[INIT] cacheDOM complete'          );
        initNav();
        console.log('[INIT] initNav complete'           );
        initAudio();
        console.log('[INIT] initAudio complete'         );
        applySettingsFromStorage();
        applyLastSettings();

        //initIframeTouchSwipe();
        //initScrollEdgeSwipe();
        initPractice();
        console.log('[INIT] initPractice complete'      );
        initMessaging();
        console.log('[INIT] initMessaging complete'     );
        // Word hint is driven by parent sequencing now.
        bindAyahScroll(); 
        console.log('[INIT] bindAyahScroll complete'    );
        bindSwipeEngine();
        console.log('[INIT] bindSwipeEngine complete'   );
        if (scrollEl) {
          scrollEl.scrollTop = 0;
        }
      }

      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initIframeApp, { once: true });
      } else {
        initIframeApp();
      }



