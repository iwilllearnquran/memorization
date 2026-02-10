// index-script.js
// Quran Quest: Main UI & Game-Mode Logic
// ========================================
// Features:
// 1. Surah/Ayah navigation and persistence (Start/Resume)
// 2. Game-mode toggles (enabling/disabling UI during games)
// 3. Firebase authentication: Google sign-in, anonymous guests
// 4. Firestore persistence: points, streaks, last-read location
// 5. LocalStorage fallback for guest stats and last-read
// 6. FCM foreground message handling
// 7. Progress tracking for Surah cards
// 8. Wake Lock API to prevent screen dimming

// ————— Imports —————
import {
  auth,
  onAuthChange,
  persistProfile,
  getUserDoc,
  saveStatsToFirestore,
  onForegroundMessage,
  getLastReadFromDb,
  recordStreak,
  updateLastRead,
  addPointsToFirestore} from '/services//_private/firestoreService.js';

import {
  addGuestPoints,
  recordGuestStreak,
  getGuestLastRead,
  setGuestLastRead
} from '/services/localStorageSession.js';

import { StreakUI } from '/ui/StreakLogicAndUI.js';
import { fetchSurahList } from '/services/quranApi.js';

// ————— Constants & State —————
const DEFAULT_SURAH = 1;
const DEFAULT_AYAH  = 1;
const STORAGE_KEY = 'swipe_hint_shown_v1';
const iframe = document.getElementById('ayahViewer');
const aboutBtn = document.getElementById('aboutBtn')
const ring = {cards: [],};
const D = {};
const SWIPE_IFRAME = '[SWIPE:IFRAME]';
const SWIPE_PARENT = '[SWIPE:PARENT]';
const dragState = {
  active: false,
  dx: 0,
  dir: 0,
  raf: 0
};
let swipeLockedUntilFrame = 0;
let swipeTransitionTimer = 0;
let pendingSwipeFrame = null;
let pendingSwipeData = null;
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
const popupHistoryStack = [];
let ignoreNextPopState = false;
let setDuasMode = null;
let pendingDuaReturn = false;

function pushPopupHistory(closeFn) {
  popupHistoryStack.push(closeFn);
  history.pushState({ popup: true }, '');
}

function popPopupHistoryFromChild() {
  if (!popupHistoryStack.length) return;
  popupHistoryStack.pop();
  ignoreNextPopState = true;
  history.back();
}

function closeTopPopupFromBack() {
  const closeFn = popupHistoryStack.pop();
  if (typeof closeFn === 'function') {
    closeFn();
  }
}

window.addEventListener('popstate', () => {
  if (ignoreNextPopState) {
    ignoreNextPopState = false;
    return;
  }
  if (popupHistoryStack.length) {
    closeTopPopupFromBack();
    return;
  }
  if (pendingDuaReturn && !isDuasMode && typeof setDuasMode === 'function') {
    pendingDuaReturn = false;
    setDuasMode(true);
  }
});




let surahData    = [];
let currentSurah = DEFAULT_SURAH;
let currentAyah  = DEFAULT_AYAH;
let isGameMode = false;
let isCurrentAyahDirty = false;
let pendingSwipeDone = false;
let isDuasMode = false;
let duasModeState = null;
let swipeStartX = 0;
let swipeDir = 0; // -1 = prev, 1 = next
let swipeStartY = 0;
let swipeDX = 0;
let swipeStartTime = 0;
let didSwipe = false;
let isSwiping = false;
let swipeHintShown = false;
const SWIPE_LOG = true;
let wakeLock = null;
let logicalOffset = 0;
let baseSurah = DEFAULT_SURAH;
let baseAyah  = DEFAULT_AYAH;
let ayahList = [];        // [{surah, ayah}]
let ayahIndexMap = {};   // "1:1" → index
let currentIndex = 0;
let progressMapCache = {};
let progressTipTimer = 0;
let startX = 0;
let startY = 0;
let deltaX = 0;
let startTime = 0;
const iframePool = new Map(); // index -> iframe
let swipeCommitted = false;
const prewarmedIndices = new Set();
const iframeReadySet = new WeakSet();
const ayahHTMLCache = new Map(); // key = "surah:ayah", value = html string
const menuAnimation = lottie.loadAnimation({
        container: document.getElementById('menuLottie'),
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: '/utils/assets/hamburger_menu.json'
      });
const SWIPE_DEBUG = true;
const log = (...args) => SWIPE_DEBUG && console.log(...args);
const t0 = performance.now();
let swipeWidth = 0;
let isAnimatingSwipe = false;
let journeyTrackTimer = null;
const PROGRESS_MILESTONES = [10, 35, 50, 90, 100];
const MILESTONE_MESSAGES = {
  10: '10% milestone unlocked — the verse is starting to breathe with you.',
  35: 'Momentum steady at 35% — your focus is deepening.',
  50: 'Halfway through the surah — each syllable is now a companion.',
  90: '90% — the finish line is in sight. Breathe, stay present.',
  100: 'Surah complete! Pause, reflect, and let gratitude settle in.'
};
const MOTIVATION_MESSAGES = [
  'Remember to save your progress and keep your streak.'
];

const MILESTONE_TOAST_DURATION = 4200;
const MOTIVATION_COOLDOWN_MS = 500000;
const NUDGE_COOLDOWN_MS = 5000;
const SMALL_SURAH_MAX_AYAHS = 7;
let nextMilestoneIndex = 0;
let milestoneSchedule = PROGRESS_MILESTONES.slice();
let lastMilestoneSurah = null;
let lastNudgeAt = 0;
let hintBusy = false;
let swipeHintQueued = false;
let wordHintQueued = false;
let suppressNudgesUntil = 0;
let pendingMilestone = null;
let saveHintTimer = 0;
let saveHintKey = '';
let pendingWordHint = false;
let wordHintFromIndex = null;
let wordHintTriedIndex = null;
let pendingSaveHint = false;
let saveHintFromIndex = null;
let saveHintTriedIndex = null;
let milestoneActive = false;
let milestoneTimer = 0;
let lastMotivationAt = 0;
let motivationRetryTimer = 0;
let minuteMotivationTimer = 0;
let minuteMotivationShown = false;




/* ==========================================================
   Broadcasting and Saving settings
========================================================== */

const DEFAULT_SETTINGS = {
  showWordTranslation: true,
  showRoot: true,
  showGrammar: true,
  showPanelTranslation: true,
  panelLang: 'en',
  audioLang: 'ar',
  mode: 'learning',
  speed: '1',
  repeat: '1'
};
let settingsVersion = 0;
const iframeSettingsVersion = new WeakMap();

      function getSettings() {
        return {
          ...DEFAULT_SETTINGS,
          ...(JSON.parse(localStorage.getItem('qq_settings')) || {})
        };
      }

      function saveSettings(patch) {
        const next = {
          ...getSettings(),
          ...patch
        };

        localStorage.setItem('qq_settings', JSON.stringify(next));

        settingsVersion += 1;
        broadcastSettings(next);
      }

      function broadcastSettings(settings) {
        console.log('📡 Broadcasting settings');

        iframePool.forEach((iframe) => {
          if (!iframeReadySet.has(iframe)) {
            console.log('⏳ iframe not ready, skipping broadcast');
            return;
          }

          iframeSettingsVersion.set(iframe, settingsVersion);
          iframe.contentWindow?.postMessage(
            { type: 'APPLY_SETTINGS', settings, version: settingsVersion },
            '*'
          );
        });
      }


/* ==========================================================
   Utility: Get Surah Name by Number
   ========================================================== */
      async function resolveSurahName(num) {
        const list = await fetchSurahList();
        const entry = list.find(surah => surah.number === num);

        return entry ? entry.englishName : `Surah ${num}`;
      }

/* ==========================================================
   Initialize Start / Resume Button
   ========================================================== */
      async function initStartButton() {
        const btn = D.startBtn;
        let lastRead = null;

        /* ------------------------------------------
          1️⃣ Fetch last-read location
          ------------------------------------------ */
        try {
          if (auth.currentUser) {
            lastRead = await getLastReadFromDb();
          } else {
            lastRead = getGuestLastRead();
          }
        } catch (err) {
          console.error('❌ initStartButton → error fetching last-read:', err);
        }

        console.log('📍 initStartButton: last-read loc =', lastRead);


        /* ------------------------------------------
          2️⃣ Configure button behavior
          ------------------------------------------ */
        if (lastRead?.surah && lastRead?.ayah) {
          /* -------- Resume Case -------- */
          const surahName = await resolveSurahName(lastRead.surah);

          console.log(
            `📍 Resuming from Surah ${lastRead.surah} Ayah ${lastRead.ayah} (${surahName})`
          );

          btn.textContent = `Resume from ${surahName} Ayah ${lastRead.ayah}`;

          btn.onclick = () => {
            console.log(
              `📍 [Button Click] loadAyah(${lastRead.surah}, ${lastRead.ayah})`
            );

            // Show reader UI
            D.surahContainer.style.display = 'none';
            D.hero.style.display           = 'none';
            D.viewer.style.display         = 'block';
            D.dropdowns.style.display      = 'flex';


            loadAyah(lastRead.surah, lastRead.ayah);
          };

        } else {
          /* -------- Start Learning Case -------- */
          btn.textContent = 'Start Learning';

          btn.onclick = () => {
            // Show reader UI
            D.surahContainer.style.display = 'none';
            D.hero.style.display           = 'none';
            D.viewer.style.display         = 'block';
            D.dropdowns.style.display      = 'flex';

            loadAyah(DEFAULT_SURAH, DEFAULT_AYAH);
          };
        }
      }

/* ==========================================================
   Helpers
   ========================================================== */

      /**
       * Update Surah progress for guest users
       * (only moves progress forward)
       */
      function updateSurahProgressGuest(surah, ayah) {
        const STORAGE_KEY = 'completedSurahs_new';
        const progressMap = JSON.parse(
          localStorage.getItem(STORAGE_KEY) || '{}'
        );

        // Only advance progress (never regress)
        if (!progressMap[surah] || ayah > progressMap[surah]) {
          progressMap[surah] = ayah;
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(progressMap)
          );

          console.log(
            `📊 Progress updated → Surah ${surah}: Ayah ${ayah}`
          );

          progressMapCache[surah] = progressMap[surah];
          updateSurahProgressBar(surah, ayah, {
            allowMilestones: false
          });
        }
      }


/* ==========================================================
   Render Surah Overview Grid & Dropdown
   ========================================================== */
      async function renderSurahOverview() {
        const chapters = await fetchSurahList();
        surahData = chapters;


        

        for (const surah of chapters) {
          /* ------------------------------------------
            Populate Surah dropdown
            ------------------------------------------ */
          const option = new Option(
            `${surah.number}. ${surah.englishName}`,
            surah.number
          );
          D.surahSelect.append(option);
 

          /* ------------------------------------------
            Create Surah card
            ------------------------------------------ */
          const card = document.createElement('div');
          card.className = 'surah-card';
          card.innerHTML = `
            <div class="surah-header">
              <span class="surah-number">Surah ${surah.number}</span>
              <span class="surah-ayah-count">(${surah.ayahCount} verses)</span>
            </div>

            <div class="surah-title">
              <span class="surah-english">${surah.englishName}</span>
              <span class="surah-arabic">${surah.arabicName}</span>
            </div>

            <button class="resume-btn" data-surah="${surah.number}">▶</button>
          `;

          D.surahContainer.append(card);


          /* ------------------------------------------
            🔍 Fetch progress (user / guest)
            ------------------------------------------ */
          let maxAyahRead = 0;

          if (auth.currentUser) {
            const snap = await getUserDoc();
            const progressMap = snap.data()?.completedSurahs_new || {};
            maxAyahRead = progressMap[surah.number] || 0;
          } else {
            const progressMap = JSON.parse(
              localStorage.getItem('completedSurahs_new') || '{}'
            );
            maxAyahRead = progressMap[surah.number] || 0;
          }


          /* ------------------------------------------
            Determine resume label & next ayah
            ------------------------------------------ */
          const totalAyahs = surah.ayahCount;
          let labelHTML = '';
          let nextAyah = 1;

          if (maxAyahRead === 0) {
            // Not started
            labelHTML = `
              <span class="material-symbols-outlined"
                    style="vertical-align:middle;font-size:18px;">
                book_5
              </span>&nbsp;
              <span>Start Surah ${surah.number}</span>
            `;
            nextAyah = 1;

          } else if (maxAyahRead >= totalAyahs) {
            // Completed
            labelHTML = `
              <span class="material-icons-outlined"
                    style="vertical-align:middle;font-size:18px;">
                restart_alt
              </span>&nbsp;
              <span>Repeat Surah</span>
            `;
            nextAyah = 1;

            console.log(`🎉 Surah ${surah.number} fully completed.`);

          } else {
            // Partially completed
            labelHTML = `
              <span class="material-symbols-outlined"
                    style="vertical-align:middle;font-size:20px;">
                play_arrow
              </span>&nbsp;
              <span>Resume from Ayah ${maxAyahRead}</span>
            `;
            nextAyah = maxAyahRead + 1;

            console.log(
              `⏯️ Surah ${surah.number} partially done. Resuming from Ayah ${nextAyah}`
            );
          }


          /* ------------------------------------------
            Resume button behavior
            ------------------------------------------ */
          const resumeBtn = card.querySelector('.resume-btn');
          resumeBtn.innerHTML = labelHTML;
          resumeBtn.dataset.nextAyah = nextAyah;

          resumeBtn.addEventListener('click', e => {
            e.stopPropagation();

            D.surahContainer.style.display = 'none';
            D.hero.style.display           = 'none';
            D.viewer.style.display         = 'block';
            D.dropdowns.style.display      = 'flex';

            loadAyah(surah.number, nextAyah);
          });


          /* ------------------------------------------
            Card click → start from Ayah 1
            ------------------------------------------ */
          card.addEventListener('click', () => {
            D.surahContainer.style.display = 'none';
            D.hero.style.display           = 'none';
            D.viewer.style.display         = 'block';
            D.dropdowns.style.display      = 'flex';

            loadAyah(surah.number, 1);
          });
        }

        refreshAllProgress();

        /* ===============================
          REEL SWIPE INIT (ONE TIME)
        =============================== */
        buildAyahIndex();
        //bindSwipe();
      }

/* ------------------------------------------
   Freeze animation at midpoint after play
   ------------------------------------------ */
      menuAnimation.addEventListener('DOMLoaded', () => {
        const freezeFrame = Math.floor(
          menuAnimation.totalFrames / 2
        );

        menuAnimation.addEventListener('complete', () => {
          menuAnimation.goToAndStop(freezeFrame, true);
        });
      });

/* ==========================================================
   Show Swipe User Guide
   ========================================================== */
      function showSwipeHint() {
        if (swipeHintShown) {
          console.log('[SwipeHint] Already shown, skipping');
          return;
        }

        if (hintBusy) {
          swipeHintQueued = true;
          return;
        }

        const overlay   = document.getElementById('swipeHint');
        const container = document.getElementById('swipeLottie');

        if (!overlay || !container) {
          console.warn('[SwipeHint] Missing overlay / lottie');
          hintBusy = false;
          localStorage.setItem('swipe_hint_shown_v1', '1');
          window.dispatchEvent(new CustomEvent('swipeHintFinished'));
          return;
        }

        hintBusy = true;
        swipeHintShown = true;

        console.log('[SwipeHint] Showing swipe animation');

        overlay.classList.remove('hidden');


        /* ------------------------------------------
          Load Lottie animation
          ------------------------------------------ */
        const MAX_LOOPS = 2;
        let loopCount = 0;

        let anim = null;
        if (window.lottie) {
          anim = lottie.loadAnimation({
            container,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '/utils/assets/swipe.json'
          });

          // Slow down animation
          anim.setSpeed(0.6);

          anim.addEventListener('loopComplete', () => {
            loopCount++;
            console.log('[SwipeHint] loop', loopCount);

            if (loopCount >= MAX_LOOPS) {
              anim.stop();               // freeze
              anim.goToAndStop(0, true); // stay visible
            }
          });
        }


        /* ------------------------------------------
          Hide logic
          ------------------------------------------ */
        const hide = reason => {
          console.log('[SwipeHint] Hiding swipe hint:', reason);

          overlay.classList.add('hidden');
          if (anim) anim.destroy();

          localStorage.setItem('swipe_hint_shown_v1', '1');
          hintBusy = false;
          setNudgeCooldown();
          flushPendingMilestone();

          // 🔔 Notify same-page listeners
          window.dispatchEvent(
            new CustomEvent('swipeHintFinished')
          );

          queueWordHintAfterCurrentAyah();
        };


        /* ------------------------------------------
          Auto-hide + user interaction hide
          ------------------------------------------ */
        setTimeout(() => hide('timeout'), 4000);

        ['touchstart', 'wheel', 'mousedown'].forEach(event =>
          window.addEventListener(
            event,
            () => hide(event),
            { once: true }
          )
        );
      }

/* ==========================================================
   Swipe Hint Observer (safe init)
   ========================================================== */
      function initSwipeHintObserver() {
        const iframe = document.getElementById('ayahViewer');

        if (!iframe || localStorage.getItem(STORAGE_KEY)) {
          return;
        }

        const showHintIfReady = () => {
          const src = iframe.getAttribute('src');
          if (!src) return false;

          showSwipeHint();
          return true;
        };

        // Hard refresh case
        if (showHintIfReady()) return;

        // Dynamic src case
        const observer = new MutationObserver((mutations, obs) => {
          for (const m of mutations) {
            if (
              m.type === 'attributes' &&
              m.attributeName === 'src'
            ) {
              if (showHintIfReady()) {
                obs.disconnect();
                return;
              }
            }
          }
        });

        observer.observe(iframe, {
          attributes: true,
          attributeFilter: ['src']
        });
      }

/* ==========================================================
   Game Mode Toggle Helpers
   ========================================================== */

      function enableGameMode() {
        isGameMode = true;

        document.body.classList.add('game-mode');

        D.surahSelect.disabled = true;
        D.ayahSelect.disabled  = true;
        D.returnBtn.style.display = 'block';


      }

      function disableGameMode() {
        isGameMode = false;

        document.body.classList.remove('game-mode');

        D.surahSelect.disabled = false;
        D.ayahSelect.disabled  = false;
        D.returnBtn.style.display = 'none';

      }

      function applyDragFrame() {
        dragState.raf = 0;

        if (!dragState.active) return;

        const { dx, dir } = dragState;
        const w = swipeWidth || D.viewer.clientWidth;

        const center = ring.cards[1];
        const side   = dir === 1 ? ring.cards[2] : ring.cards[0];

        // 🔒 snap to device pixels (kills micro jitter)

        dragState.lastDx = dx;

        center.style.transition = 'none';
        side.style.transition = 'none';

        center.style.transform =
          `translate3d(${dx}px,0,0)`;

        side.style.transform =
          `translate3d(${dx + dir * w}px,0,0)`;
      }


/* ==========================================================
   Iframe Message Listener
   (Game events, swipe events, persistence)
   ========================================================== */
   
window.addEventListener('message', async e => {
  const data = e.data || {};

switch (data.type) {

    case 'UPDATE_SETTING': {
  const { patch } = data;

  console.log('⚙️ UPDATE_SETTING from iframe', patch);

  saveSettings(patch);       // saves + broadcasts
  break;
}

    case 'SETTINGS_OPENED':
    case 'WORD_DETAILS_OPENED': {
      pushPopupHistory(() => {
        const activeFrame = getActiveIframe();
        activeFrame?.contentWindow?.postMessage(
          { type: 'CLOSE_ACTIVE_POPUP' },
          '*'
        );
      });
      break;
    }

    case 'SETTINGS_CLOSED':
    case 'WORD_DETAILS_CLOSED': {
      popPopupHistoryFromChild();
      break;
    }

    case 'NAVIGATE_TO_AYAH': {
      const surah = Number(data.surah);
      const ayah = Number(data.ayah);
      if (!Number.isFinite(surah) || !Number.isFinite(ayah)) break;

      pendingDuaReturn = true;
      history.pushState({ fromDuas: true, surah, ayah }, '');

      if (D.duasFrame?.contentWindow) {
        D.duasFrame.contentWindow.postMessage({ type: 'PAUSE_DUAS_AUDIO' }, '*');
      }

      if (typeof setDuasMode === 'function') {
        setDuasMode(false);
      }

      if (D.surahContainer) D.surahContainer.style.display = 'none';
      if (D.hero) D.hero.style.display = 'none';
      if (D.viewer) D.viewer.style.display = 'block';
      if (D.dropdowns) D.dropdowns.style.display = 'flex';

      loadAyah(surah, ayah);
      break;
    }




    /* ------------------------------------------
       Game mode lifecycle
       ------------------------------------------ */
    case 'gamesReady':
      enableGameMode();
      break;

    case 'gameExited':
      disableGameMode();
      break;


    /* ------------------------------------------
       Auth / UI requests
       ------------------------------------------ */
    case 'loginRequest':
      console.log('[loginRequest] Guest-only mode — ignoring login request');
      break;


    /* ------------------------------------------
       Persist game stats (points)
       ------------------------------------------ */
    case 'persistStats': {
      const { score } = data;

      if (!auth.currentUser) {
        addGuestPoints(score);
      } else {
        await addPointsToFirestore(score);
      }
      

      break;
    }

case 'SWIPE_START': {
  // Clear any leftover settle/transition so drag can begin immediately.
  isAnimatingSwipe = false;
  swipeLockedUntilFrame = 0;
  if (swipeTransitionTimer) {
    clearTimeout(swipeTransitionTimer);
    swipeTransitionTimer = 0;
  }
  if (ring.cards.length) {
    ring.cards.forEach(card => {
      card.style.transition = 'none';
    });
  }
  prewarmNeighbors(3);
  break;
}


case 'SWIPE_COMMIT': {
  const { dir } = data;

  // 🧹 STOP live drag immediately
  dragState.active = false;
  dragState.dx = 0;
  dragState.dir = 0;
  dragState.lastDx = null;

  if (dragState.raf) {
    cancelAnimationFrame(dragState.raf);
    dragState.raf = 0;
  }

  const w = swipeWidth || D.viewer.clientWidth;

  // ❌ Cannot move → bounce back
  if (!canMove(dir)) {
    window.postMessage({ type: 'SWIPE_CANCEL' }, '*');
    return;
  }

  const center = ring.cards[1];
  const side   = dir === 1 ? ring.cards[2] : ring.cards[0];

  // Allow immediate interaction with the incoming card during animation.
  const centerIframe = center?.querySelector('iframe');
  const sideIframe = side?.querySelector('iframe');
  if (centerIframe) centerIframe.style.pointerEvents = 'none';
  if (sideIframe) sideIframe.style.pointerEvents = 'auto';

  const DURATION = 420;
  const EASING   = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

  isAnimatingSwipe = true;
  if (swipeTransitionTimer) {
    clearTimeout(swipeTransitionTimer);
    swipeTransitionTimer = 0;
  }
  let didFinalize = false;
  const onCommitDone = () => {
    if (didFinalize) return;
    didFinalize = true;
    if (swipeTransitionTimer) {
      clearTimeout(swipeTransitionTimer);
      swipeTransitionTimer = 0;
    }
    isAnimatingSwipe = false;
    swipeLockedUntilFrame = performance.now() + 32; // allow settle
    finalizeSwipe(dir);
  };

  center.style.transition = `transform ${DURATION}ms ${EASING}`;
  side.style.transition   = `transform ${DURATION}ms ${EASING}`;

  center.style.transform =
    `translate3d(${-dir * w}px,0,0)`;

  side.style.transform =
    `translate3d(0,0,0)`;

  center.addEventListener('transitionend', onCommitDone, { once: true });
  swipeTransitionTimer = setTimeout(onCommitDone, DURATION + 80);


  break;
}




case 'SWIPE_PROGRESS': {
  // ⛔ iframe still settling → ignore drag
  if (performance.now() < swipeLockedUntilFrame) {
    return;
  }

  if (isAnimatingSwipe) return;

  dragState.active = true;
  dragState.dx  = data.dx;
  dragState.dir = data.dir;
  if (dragState.lastDx == null) {
    dragState.lastDx = data.dx;
  }
  if (data.width && data.width > 0) {
    swipeWidth = data.width;
  }

  if (!dragState.raf) {
    dragState.raf = requestAnimationFrame(applyDragFrame);
  }
  break;
}




case 'SWIPE_CANCEL': {
  // 🧹 STOP live drag immediately
  dragState.active = false;
  dragState.dx = 0;
  dragState.dir = 0;
  dragState.lastDx = null;

  if (dragState.raf) {
    cancelAnimationFrame(dragState.raf);
    dragState.raf = 0;
  }

  const w = swipeWidth || D.viewer.clientWidth;

  const center = ring.cards[1];
  const left   = ring.cards[0];
  const right  = ring.cards[2];

  const DURATION = 320;
  const EASING   = 'cubic-bezier(0.18, 0.89, 0.32, 1.15)';

  isAnimatingSwipe = true;
  swipeLockedUntilFrame = performance.now() + DURATION;
  if (swipeTransitionTimer) {
    clearTimeout(swipeTransitionTimer);
    swipeTransitionTimer = 0;
  }
  let didCancel = false;
  const onCancelDone = () => {
    if (didCancel) return;
    didCancel = true;
    if (swipeTransitionTimer) {
      clearTimeout(swipeTransitionTimer);
      swipeTransitionTimer = 0;
    }
    isAnimatingSwipe = false;
    [center, left, right].forEach(el => {
      el.style.transition = 'none';
    });
  };

  [center, left, right].forEach(el => {
    el.style.transition = `transform ${DURATION}ms ${EASING}`;
  });

  center.style.transform = 'translate3d(0,0,0)';
  left.style.transform   = `translate3d(-${w}px,0,0)`;
  right.style.transform  = `translate3d(${w}px,0,0)`;

  center.addEventListener('transitionend', onCancelDone, { once: true });
  swipeTransitionTimer = setTimeout(onCancelDone, DURATION + 80);

  break;
  
}







    case 'WORD_HINT_SHOWN': {
      hintBusy = true;
      setNudgeCooldown();
      break;
    }

    case 'WORD_HINT_DONE': {
      hintBusy = false;
      setNudgeCooldown();
      pendingWordHint = false;
      wordHintFromIndex = null;
      wordHintTriedIndex = null;
      queueSaveHintAfterCurrentAyah();
      if (swipeHintQueued && !swipeHintShown) {
        swipeHintQueued = false;
        showSwipeHint();
      }
      flushPendingMilestone();
      maybeTriggerQueuedHints();
      break;
    }

    case 'WORD_HINT_SKIPPED_NO_VERB': {
      // keep pending, but require next ayah before retry
      pendingWordHint = true;
      wordHintFromIndex = currentIndex;
      wordHintTriedIndex = null;
      break;
    }

    case 'SAVE_HINT_SHOWN': {
      hintBusy = true;
      setNudgeCooldown();
      break;
    }

case 'SAVE_HINT_DONE': {
      hintBusy = false;
      setNudgeCooldown();
      pendingSaveHint = false;
      saveHintFromIndex = null;
      saveHintTriedIndex = null;
      flushPendingMilestone();
      maybeTriggerQueuedHints();
      scheduleMotivationAfterNudge({ force: true });
      break;
    }

    /* ------------------------------------------
       Save progress request from iframe
       ------------------------------------------ */
    case 'SAVE_PROGRESS': {
      
      const {
        surah,
        ayah,
        timestamp,
        recordStreak
      } = data;

      console.log(
        '📥 Parent received SAVE_PROGRESS',
        { surah, ayah, recordStreak }
      );

      try {
        if (auth.currentUser) {
          /* -------- Logged-in user -------- */
          await updateLastRead(surah, ayah);

          // 🔥 Record streak ONLY if asked
          if (recordStreak) {
            const {
              updated,
              oldLength,
              newLength
            } = await recordStreak();

            console.log(
              '🔥 recordStreak result',
              { updated, oldLength, newLength }
            );

            // Popup handled via Firestore snapshot
          }

        } else {
          /* -------- Guest user -------- */
          setGuestLastRead(surah, ayah);
          updateSurahProgressGuest(surah, ayah);

          isCurrentAyahDirty = false;

          if (recordStreak) {
            const result = recordGuestStreak();
            if (result.updated) {
              window.postMessage(
                {
                  type: 'streakUpdate',
                  date: result.today,
                  freezes: result.freezes
                },
                '*'
              );
            }
          } else {
            console.log(
              '⏭️ [SAVE_PROGRESS] recordStreak=false → skipping guest streak'
            );
          }
        }

        // 📘 Track learning journey locally (both guest + user)
        trackLearningJourney(surah, ayah);

        /* -------- Notify parent (self) -------- */
        window.postMessage(
          {
            type: 'SAVE_PROGRESS_SUCCESS',
            surah,
            ayah,
            savedAt: new Date(
              timestamp || Date.now()
            ).toISOString()
          },
          '*'
        );

        /* -------- Notify iframe (toast UI) -------- */
        e.source.postMessage(
          {
            type: 'SAVE_PROGRESS_SUCCESS',
            surah,
            ayah
          },
          '*'
        );

      } catch (err) {
        console.error('❌ Save progress failed', err);

        e.source.postMessage(
          {
            type: 'SAVE_PROGRESS_FAILED',
            error: err.message
          },
          '*'
        );
      }

      break;
    }


    /* ------------------------------------------
       Save completed acknowledgment
       ------------------------------------------ */
    case 'SAVE_PROGRESS_SUCCESS': {
      isCurrentAyahDirty = false;

      // 🚀 Deferred navigation after save
      if (typeof window.__pendingGoHome === 'function') {
        const goHome = window.__pendingGoHome;
        window.__pendingGoHome = null;
        goHome(); // reload AFTER save completes
      }

      break;
    }
  }
});
/* ==========================================================
   Sync Surah & Ayah Dropdowns
   ========================================================== */
      function syncDropdowns(surah, ayah) {
        const surahNum = Number(surah);
        const ayahNum = Number(ayah);

        if (D.surahSelect) {
          D.surahSelect.value = surahNum;
        }

        if (!D.ayahSelect) return;

        D.ayahSelect.innerHTML = '';

        const totalAyahs =
          surahData.find(x => x.number === surahNum)?.ayahCount || 0;

        for (let i = 1; i <= totalAyahs; i++) {
          D.ayahSelect.append(new Option(i, i));
        }

        D.ayahSelect.value = ayahNum;
      }

      function resetMilestoneTracking() {
        nextMilestoneIndex = 0;
      }

      function syncMilestoneIndexToProgress(pct) {
        if (!Number.isFinite(pct)) return;
        const idx = PROGRESS_MILESTONES.findIndex(m => pct < m);
        nextMilestoneIndex = idx === -1 ? PROGRESS_MILESTONES.length : idx;
      }

      function getSurahAyahCount(surahNum) {
        const found = surahData.find(x => x.number === surahNum);
        return found?.ayahCount || 0;
      }

      function isSmallSurah(surahNum = currentSurah) {
        const total = getSurahAyahCount(surahNum);
        return total > 0 && total <= SMALL_SURAH_MAX_AYAHS;
      }

      function setNudgeCooldown(ms = NUDGE_COOLDOWN_MS) {
        suppressNudgesUntil = Date.now() + ms;
      }

      function shouldSuppressMilestones() {
        return hintBusy || milestoneActive || Date.now() < suppressNudgesUntil;
      }

      function clearPendingMilestone() {
        pendingMilestone = null;
      }

      function maybeQueueMilestone(surah, ayah) {
        pendingMilestone = { surah, ayah };
      }

      function flushPendingMilestone() {
        if (!pendingMilestone) return;
        const { surah, ayah } = pendingMilestone;
        if (surah !== currentSurah || ayah !== currentAyah) {
          pendingMilestone = null;
          return;
        }
        const totalAyahs = getSurahAyahCount(surah);
        if (!totalAyahs) {
          pendingMilestone = null;
          return;
        }
        const effective = Math.max(1, Math.min(totalAyahs, ayah));
        const pct = Math.min(100, Math.max(0, (effective / totalAyahs) * 100));
        if (!shouldSuppressMilestones()) {
          maybeTriggerMilestone(pct, surah, effective);
        }
        pendingMilestone = null;
      }

      function runMilestoneConfetti() {
        const confettiFn = window?.confetti;
        if (typeof confettiFn !== 'function') return;
        if (navigator?.vibrate) {
          navigator.vibrate(25);
        }
        confettiFn({
          particleCount: 65,
          spread: 70,
          origin: { y: 0.2 }
        });
        confettiFn({
          particleCount: 40,
          spread: 110,
          origin: { x: 0.25, y: 0.1 }
        });
      }

      function showMilestoneTip(message) {
        if (!D.progressTip || !message) return;
        const defaultMessage = D.progressTip.dataset.defaultMessage || D.progressTip.textContent;
        D.progressTip.textContent = message;
        D.progressTip.classList.add('is-visible');
        clearTimeout(progressTipTimer);
        progressTipTimer = window.setTimeout(() => {
          D.progressTip.classList.remove('is-visible');
          if (defaultMessage) {
            D.progressTip.textContent = defaultMessage;
          }
        }, MILESTONE_TOAST_DURATION);
      }

      function showMotivationToast(message) {
        if (!message) return;
        const toast = document.createElement('div');
        toast.className = 'motivation-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
          toast.classList.add('show');
        });

        const DISPLAY_TIME = 2600;
        const FADE_TIME = 300;

        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            toast.remove();
          }, FADE_TIME);
        }, DISPLAY_TIME);
      }

      function maybeShowMotivation(options = {}) {
        if (shouldSuppressMilestones()) return;
        const { force = false } = options;
        const now = Date.now();
        if (!force && now - lastMotivationAt < MOTIVATION_COOLDOWN_MS) return;
        if (!MOTIVATION_MESSAGES.length) return;

        const message =
          MOTIVATION_MESSAGES[Math.floor(Math.random() * MOTIVATION_MESSAGES.length)];

        showMotivationToast(message);
        lastMotivationAt = now;
      }

      function scheduleMotivationAfterNudge(options = {}) {
        const { force = false, retries = 3 } = options;
        let delay = Math.max(0, suppressNudgesUntil - Date.now()) + 150;
        if (delay <= 200 && shouldSuppressMilestones()) {
          delay = 1000;
        }
        if (motivationRetryTimer) {
          clearTimeout(motivationRetryTimer);
        }
        motivationRetryTimer = window.setTimeout(() => {
          motivationRetryTimer = 0;
          if (shouldSuppressMilestones()) {
            if (retries > 0) {
              scheduleMotivationAfterNudge({ force, retries: retries - 1 });
            }
            return;
          }
          maybeShowMotivation({ force });
        }, delay);
      }

      function maybeTriggerMilestone(pct, surah, ayah) {
        if (!Number.isFinite(pct)) return;
        if (nextMilestoneIndex >= PROGRESS_MILESTONES.length) return;
        const milestone = PROGRESS_MILESTONES[nextMilestoneIndex];
        if (pct < milestone) return;

        const template =
          MILESTONE_MESSAGES[milestone] || `You reached ${milestone}% — keep going`;
        const message = `${milestone}% • ${template} (Surah ${surah}, Ayah ${ayah})`;
        milestoneActive = true;
        clearTimeout(milestoneTimer);
        showMilestoneTip(message);
        runMilestoneConfetti();
        setNudgeCooldown();
        nextMilestoneIndex += 1;
        milestoneTimer = window.setTimeout(() => {
          milestoneActive = false;
          maybeTriggerQueuedHints();
        }, MILESTONE_TOAST_DURATION + 200);
      }

      function updateSurahProgressBar(
        surah = currentSurah,
        ayah = currentAyah,
        options = {}
      ) {
        if (!D.progressFill) {
          D.progressWrap = document.getElementById('surahProgressWrap');
          D.progressFill = document.getElementById('surahProgressFill');
          D.progressInfo = document.getElementById('surahProgressInfo');
          D.progressTip = document.getElementById('surahProgressTip');
        }

        if (!D.progressFill) return;

        const { allowMilestones = false, fromSwipe = false } = options;

        const surahNum = Number(surah);
        const ayahNum = Number(ayah);
        if (!Number.isFinite(surahNum) || surahNum <= 0) {
          D.progressFill.style.width = '0%';
          return;
        }

        const totalAyahs =
          surahData.find(x => x.number === surahNum)?.ayahCount || 0;

        if (!totalAyahs) {
          D.progressFill.style.width = '0%';
          return;
        }

        const effective = Math.max(1, Math.min(totalAyahs, ayahNum || 1));
        const pct = Math.min(100, Math.max(0, (effective / totalAyahs) * 100));

        D.progressFill.style.width = `${pct}%`;

        const wrapWidth =
          D.progressWrap?.clientWidth ||
          D.progressWrap?.offsetWidth ||
          0;
        const iconCenter =
          wrapWidth > 0
            ? Math.min(wrapWidth, Math.max(0, wrapWidth * (pct / 100)))
            : 0;

        if (D.progressTip) {
          let note = 'Keep reading, you are building something beautiful.';
          if (pct < 20) note = 'This is your progress so far — keep going.';
          else if (pct < 50) note = 'Steady progress — keep going.';
          else if (pct < 80) note = 'You are more than halfway there.';
          else if (pct < 95) note = 'You are very close to finishing this surah.';
          else note = 'Almost complete — just a little more.';

          const defaultMessage = `Ayah ${effective} of ${totalAyahs}. ${note}`;
          D.progressTip.dataset.defaultMessage = defaultMessage;
          if (!D.progressTip.classList.contains('is-visible')) {
            D.progressTip.textContent = defaultMessage;
          }
        }

        if (D.progressMarkers) {
          const markerNodes = D.progressMarkers.querySelectorAll('span');
          markerNodes.forEach(marker => {
            const markerPct = Number(marker.dataset.pct);
            if (!Number.isFinite(markerPct)) return;
            marker.style.left = `${Math.min(100, Math.max(0, markerPct))}%`;
          });
        }

        if (allowMilestones && fromSwipe) {
          if (shouldSuppressMilestones()) {
            maybeQueueMilestone(surahNum, effective);
          } else {
            maybeTriggerMilestone(pct, surahNum, effective);
          }
        } else if (!allowMilestones) {
          syncMilestoneIndexToProgress(pct);
        }

        if (D.progressInfo) {
          D.progressInfo.style.left = `${iconCenter}px`;
        }

      }

      function setReaderMode(active) {
        document.body.classList.toggle('reader-mode', active);
        clearPendingMilestone();
        if (!active) {
          swipeHintQueued = false;
          wordHintQueued = false;
          pendingWordHint = false;
          wordHintFromIndex = null;
          wordHintTriedIndex = null;
          pendingSaveHint = false;
          saveHintFromIndex = null;
          saveHintTriedIndex = null;
        }

        const wrap = D.progressWrap || document.getElementById('surahProgressWrap');
        if (wrap) {
          wrap.style.display = active ? 'block' : 'none';
          wrap.setAttribute('aria-hidden', active ? 'false' : 'true');
        }

        if (active) {
          resetMilestoneTracking();
          clearPendingMilestone();
          if (!minuteMotivationShown && !minuteMotivationTimer) {
            minuteMotivationTimer = window.setTimeout(() => {
              minuteMotivationTimer = 0;
              minuteMotivationShown = true;
              scheduleMotivationAfterNudge({ force: true });
            }, 60000);
          }
        } else if (minuteMotivationTimer) {
          clearTimeout(minuteMotivationTimer);
          minuteMotivationTimer = 0;
        }

        if (!active && D.progressTip) {
          D.progressTip.classList.remove('is-visible');
        }
      }

      function isHomeVisible() {
        if (!D.hero || !D.surahContainer) return false;
        const heroVisible =
          window.getComputedStyle(D.hero).display !== 'none';
        const listVisible =
          window.getComputedStyle(D.surahContainer).display !== 'none';
        return heroVisible || listVisible;
      }

      function isViewerVisible() {
        if (!D.viewer) return false;
        return window.getComputedStyle(D.viewer).display !== 'none';
      }

      function ensureHomeScroll() {
        if (!isHomeVisible()) return;

        document.body.classList.remove('reader-mode');

        if (D.drawer && !D.drawer.classList.contains('open')) {
          document.body.classList.remove('drawer-open');
        }

        if (!document.querySelector('.qq-overlay')) {
          document.body.classList.remove('modal-open');
        }

        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }

      function getActiveIframe() {
        return ring.cards?.[1]?.querySelector('iframe') ||
          document.getElementById('ayahViewer');
      }

/* ==========================================================
   Confirm Exit Popup
   ========================================================== */
      function showConfirmPopup({ title, message, onGoHome }) {
        const overlay = document.createElement('div');
        overlay.classList.add('qq-overlay');
        overlay.style.cssText = `
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        `;

        overlay.innerHTML = `
          <div class="qq-modal" style="
            position: relative;
            background: #fff;
            padding: 20px;
            border-radius: 12px;
            max-width: 340px;
            width: 85%;
            text-align: center;
          ">
            <!-- ❌ Close -->
            <button id="popupClose" style="
              position: absolute;
              top: 8px;
              right: 10px;
              border: none;
              background: none;
              font-size: 18px;
              cursor: pointer;
              color: #888;
            ">✕</button>

            <h3>${title}</h3>

            <p style="
              font-size: 14px;
              color: #444;
              line-height: 1.5;
            ">
              ${message}
            </p>

            <div style="
              display: flex;
              gap: 10px;
              justify-content: center;
              margin-top: 18px;
            ">
              <button id="popupSaveGo" style="
                padding: 8px 14px;
                border-radius: 8px;
                border: none;
                background: #0a4d68;
                color: #fff;
              ">
                Save & Go Home
              </button>

              <button id="popupGoHome" style="
                padding: 8px 14px;
                border-radius: 8px;
                border: 1px solid #ccc;
                background: #fff;
              ">
                Go Home
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);


        /* ------------------------------------------
          Close (X) → stay on ayah
          ------------------------------------------ */
        overlay.querySelector('#popupClose').onclick = () => {
          overlay.remove();
        };


        /* ------------------------------------------
          💾 Save & Go Home
          ------------------------------------------ */
        overlay.querySelector('#popupSaveGo').onclick = () => {
          // Ask iframe to save progress
          const iframe = getActiveIframe();
          iframe?.contentWindow?.postMessage(
            { type: 'REQUEST_SAVE_PROGRESS' },
            '*'
          );

          console.log('🟡 Save & Go Home clicked');

          // Defer navigation until SAVE_PROGRESS_SUCCESS
          window.__pendingGoHome = onGoHome;
          console.log(
            '🟡 pendingGoHome set:',
            window.__pendingGoHome
          );

          overlay.remove();
        };


        /* ------------------------------------------
          🏠 Go Home without saving
          ------------------------------------------ */
        overlay.querySelector('#popupGoHome').onclick = () => {
          overlay.remove();

          if (typeof onGoHome === 'function') {
            onGoHome();
          }
        };


        /* ------------------------------------------
          Click outside → stay
          ------------------------------------------ */
        overlay.onclick = e => {
          if (e.target === overlay) {
            overlay.remove();
          }
        };
      }

/* ==========================================================
   Bind UI Event Handlers
   ========================================================== */
      function bindUIActions() {
        /* ------------------------------------------
          Cache DOM elements
          ------------------------------------------ */
        D.surahContainer = document.getElementById('surahContainer');
        D.hero           = document.getElementById('hero');
        D.viewer         = document.getElementById('viewer');
        D.dropdowns      = document.querySelector('.dropdowns');
        D.surahSelect    = document.getElementById('surahSelect');
        D.ayahSelect     = document.getElementById('ayahSelect');
        D.prevArrow      = document.querySelector('.prev');
        D.nextArrow      = document.querySelector('.next');
        D.returnBtn      = document.getElementById('returnToAyah');
        D.startBtn       = document.getElementById('startLearningBtn');
        D.ptsEl          = document.getElementById('ajrPoints');
        D.streakEl       = document.getElementById('streakDisplay');
        D.closeBtn       = document.getElementById('drawerCloseBtn');
        D.drawer         = document.getElementById('profileDrawer');
        D.card = document.getElementById('ayahCard');
        D.progressMarkers = document.getElementById('surahProgressMarkers');
        D.progressWrap = document.getElementById('surahProgressWrap');
        D.progressFill = document.getElementById('surahProgressFill');
        D.progressInfo = document.getElementById('surahProgressInfo');
        D.progressTip = document.getElementById('surahProgressTip');
         D.surahSelect = document.getElementById('surahSelect');
        D.duasView       = document.getElementById('duasView');
        D.duasFrame      = document.getElementById('duasFrame');
        D.navLearnQuran  = document.getElementById('navLearnQuran');
        D.navRamzanDuas  = document.getElementById('navRamzanDuas');
        D.bottomNav      = document.getElementById('bottomNav');
        D.randomDuaCard  = document.getElementById('randomDuaCard');


        const menuBtn = document.getElementById('menuBtn');
        let drawerOverlay = null;

        const syncNavHeights = () => {
          const nav = document.getElementById('mainNavbar');
          if (nav) {
            document.body.style.setProperty('--navbar-h', `${nav.offsetHeight}px`);
          }
        };

        const setActiveNav = (isDuas) => {
          if (D.navLearnQuran) D.navLearnQuran.classList.toggle('active', !isDuas);
          if (D.navRamzanDuas) D.navRamzanDuas.classList.toggle('active', isDuas);
        };

        const pauseQuranAudio = () => {
          const activeFrame = getActiveIframe();
          activeFrame?.contentWindow?.postMessage(
            { type: 'PAUSE_ALL_AUDIO' },
            '*'
          );
        };

        const pauseDuasAudio = () => {
          if (D.duasFrame?.contentWindow) {
            D.duasFrame.contentWindow.postMessage(
              { type: 'PAUSE_DUAS_AUDIO' },
              '*'
            );
          }
        };

        setDuasMode = (enabled) => {
          if (enabled === isDuasMode) return;
          isDuasMode = enabled;
          syncNavHeights();

          if (enabled) {
            requestWakeLock();
            pendingDuaReturn = false;
            pauseQuranAudio();
            duasModeState = {
              hero: D.hero?.style.display ?? '',
              surah: D.surahContainer?.style.display ?? '',
              viewer: D.viewer?.style.display ?? '',
              dropdowns: D.dropdowns?.style.display ?? ''
            };

            document.body.classList.add('duas-mode');
            closeDrawer();
            if (D.drawer) D.drawer.style.display = 'none';
            if (menuBtn) menuBtn.style.display = 'none';
            if (D.duasView) D.duasView.setAttribute('aria-hidden', 'false');
            if (D.duasFrame && !D.duasFrame.src) {
              D.duasFrame.src = 'duas/duas.html';
            }

            if (D.hero) D.hero.style.display = 'none';
            if (D.surahContainer) D.surahContainer.style.display = 'none';
            if (D.viewer) D.viewer.style.display = 'none';
            if (D.dropdowns) D.dropdowns.style.display = 'none';
            setActiveNav(true);
          } else {
            requestWakeLock();
            pauseDuasAudio();
            document.body.classList.remove('duas-mode');
            if (D.drawer) D.drawer.style.display = '';
            if (menuBtn) menuBtn.style.display = '';
            if (D.duasView) D.duasView.setAttribute('aria-hidden', 'true');

            if (duasModeState) {
              if (D.hero) D.hero.style.display = duasModeState.hero;
              if (D.surahContainer) D.surahContainer.style.display = duasModeState.surah;
              if (D.viewer) D.viewer.style.display = duasModeState.viewer;
              if (D.dropdowns) D.dropdowns.style.display = duasModeState.dropdowns;
              duasModeState = null;
            } else {
              if (D.hero) D.hero.style.display = '';
              if (D.surahContainer) D.surahContainer.style.display = '';
              if (D.viewer) D.viewer.style.display = '';
              if (D.dropdowns) D.dropdowns.style.display = '';
            }

            setActiveNav(false);
          }
        };

        const openDuaFromHero = () => {
          if (!D.randomDuaCard) return;
          const ref = D.randomDuaCard.getAttribute('data-ref');
          if (!ref) return;
          setDuasMode(true);

          const sendScroll = () => {
            if (D.duasFrame?.contentWindow) {
              D.duasFrame.contentWindow.postMessage(
                { type: 'SCROLL_TO_DUA', reference: ref },
                '*'
              );
            }
          };

          if (D.duasFrame?.contentWindow && D.duasFrame.src) {
            sendScroll();
          } else if (D.duasFrame) {
            D.duasFrame.addEventListener('load', sendScroll, { once: true });
          }
        };

        const closeDrawer = () => {
          D.drawer.classList.remove('open');
          document.body.classList.remove('drawer-open');
          if (drawerOverlay) {
            drawerOverlay.remove();
            drawerOverlay = null;
          }
        };

        const openDrawer = () => {
          D.drawer.classList.add('open');
          document.body.classList.add('drawer-open');

          if (!drawerOverlay) {
            drawerOverlay = document.createElement('div');
            drawerOverlay.id = 'drawerOverlay';
            drawerOverlay.className = 'drawer-overlay';
            drawerOverlay.addEventListener('click', e => {
              e.preventDefault();
              e.stopPropagation();
              closeDrawer();
            });
            drawerOverlay.addEventListener('touchstart', e => {
              e.preventDefault();
              e.stopPropagation();
              closeDrawer();
            }, { passive: false });
            document.body.appendChild(drawerOverlay);
          }
        };

        if (D.navLearnQuran) {
          D.navLearnQuran.addEventListener('click', () => setDuasMode(false));
        }

        if (D.navRamzanDuas) {
          D.navRamzanDuas.addEventListener('click', () => setDuasMode(true));
        }

        if (D.randomDuaCard) {
          D.randomDuaCard.addEventListener('click', openDuaFromHero);
          D.randomDuaCard.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDuaFromHero();
            }
          });
        }

        syncNavHeights();
        window.addEventListener('resize', syncNavHeights);

        const params = new URLSearchParams(window.location.search);
        if (params.get('tab') === 'duas' || window.location.hash === '#duas') {
          setDuasMode(true);
        }


        /* ------------------------------------------
          Surah / Ayah dropdown navigation
          ------------------------------------------ */
        D.surahSelect.addEventListener('change', () => {
          loadAyah(+D.surahSelect.value, 1);
        });

        D.ayahSelect.addEventListener('change', () => {
          loadAyah(currentSurah, +D.ayahSelect.value);
        });


        



      /* ==========================================================
        About Popup
        ========================================================== */
      aboutBtn
        .addEventListener('click', () => {
          closeDrawer();

          const overlay = document.createElement('div');
          overlay.classList.add('qq-overlay');
          overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
          `;

          overlay.innerHTML = `
            <div class="qq-modal" style="
              background: #fff;
              padding: 20px;
              border-radius: 12px;
              max-width: 340px;
              width: 85%;
              text-align: center;
            ">
              <h3>About Quran Quest</h3>

              <p style="
                font-size: 14px;
                color: #444;
                line-height: 1.5;
              ">
                Quran Quest treats each ayah as its own universe &mdash; a place to
                pause, listen, and let the meaning meet you where you are.
                Read gently, return often, and let every ayah leave a small
                mark on your heart.
                <br><br>
                More features coming soon, In shaa Allah &#127769;
              </p>

              <button id="closeAboutPopup" style="
                margin-top: 14px;
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                background: #0a4d68;
                color: #fff;
                cursor: pointer;
              ">
                Close
              </button>
            </div>
          `;

          document.body.appendChild(overlay);

          overlay.querySelector('#closeAboutPopup').onclick = () => {
            overlay.remove();
          };

          overlay.onclick = e => {
            if (e.target === overlay) overlay.remove();
          };
        });
        /* ------------------------------------------
          Profile drawer open / close
          ------------------------------------------ */
        menuBtn.addEventListener('click', () => {
          openDrawer();
        });

        D.closeBtn.addEventListener('click', () => {
          closeDrawer();
        });

        // Swipe-to-close drawer (mobile)
        let touchStartX = 0;

        D.drawer.addEventListener('touchstart', e => {
          touchStartX = e.changedTouches[0].pageX;
        });

        D.drawer.addEventListener('touchend', e => {
          if (e.changedTouches[0].pageX - touchStartX < 50) {
            closeDrawer();
          }
        });


        /* ------------------------------------------
          Return from game mode
          ------------------------------------------ */
        D.returnBtn.addEventListener('click', () => {
          const iframe = ring.cards?.[1]?.querySelector('iframe');
          iframe?.contentWindow?.postMessage(
            { type: 'RETURN_TO_AYAH' },
            '*'
          );
          disableGameMode();
          loadAyah(currentSurah, currentAyah);
        });

        if (D.progressInfo && D.progressTip) {
          const showTip = () => {
            const text = D.progressTip.dataset.defaultMessage || D.progressTip.textContent;
            D.progressTip.textContent = text;
            D.progressTip.classList.add('is-visible');
            clearTimeout(progressTipTimer);
            progressTipTimer = setTimeout(() => {
              D.progressTip.classList.remove('is-visible');
            }, 2600);
          };

          D.progressInfo.addEventListener('click', showTip);
          D.progressInfo.addEventListener('touchstart', showTip, { passive: true });
        }


        /* ==========================================================
          Learning Journey (Analytics Popup)
          ========================================================== */
        document
          .getElementById('learningJourneyBtn')
          .addEventListener('click', () => {
            closeDrawer();

            const raw = JSON.parse(
              localStorage.getItem('learningJourney') || '{}'
            );

            const counts = buildDailyCountsWithZeros(raw);
            const days = Object.keys(counts);

            if (!days.length) {
              alert('You haven’t read any ayahs yet 🌱');
              return;
            }

            days.sort((a, b) => b.localeCompare(a));

            /* -------- Build bars -------- */
            let barsHTML = '';
            let lastMonth = '';
            let lastYear  = '';

            const last30Days = days.slice(0, 30);
            let windowMax = 0;

            last30Days.forEach(d => {
              windowMax = Math.max(windowMax, counts[d]);
            });

            const MAX_AYAHS_CAP   = 300;
            const MAX_BAR_HEIGHT = 160;

            const effectiveMax = Math.min(
              MAX_AYAHS_CAP,
              windowMax || 1
            );

            days.forEach(day => {
              const dateObj = new Date(day);
              const count   = counts[day];

              const height = Math.min(
                (count / effectiveMax) * MAX_BAR_HEIGHT,
                MAX_BAR_HEIGHT
              );

              const month  = dateObj.toLocaleString('en-US', { month: 'short' });
              const dayNum = dateObj.getDate();
              const year   = dateObj.getFullYear();

              let monthLabel = '';
              let yearLabel  = '';

              if (month !== lastMonth) {
                monthLabel = month;
                lastMonth = month;
              }

              if (year !== lastYear) {
                yearLabel = year;
                lastYear = year;
              }

              barsHTML += `
                <div class="journeyItem">
                  <div class="journeyBarArea">
                    <div class="journeyBarWrap">
                      <div class="journeyCount">${count}</div>
                      <div class="journeyBar" style="height:${height}px"></div>
                    </div>
                  </div>

                  <div class="journeyDate">
                    <div class="jd-day">${dayNum}</div>
                    ${monthLabel ? `<div class="jd-month">${monthLabel}</div>` : ''}
                    ${yearLabel ? `<div class="jd-year">${yearLabel}</div>` : ''}
                  </div>
                </div>
              `;
            });


            /* -------- Create popup -------- */
            const overlay = document.createElement('div');
            overlay.id = 'journeyOverlay';
            overlay.classList.add('qq-overlay');

            overlay.innerHTML = `
              <div class="journeyBox">
                <div class="journeyHeader">
                  <span>Number of verses read</span>
                </div>

                <div class="journeyChart">
                  ${barsHTML}
                </div>

                <button class="journeyClose">Close</button>
              </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelector('.journeyClose').onclick = () => overlay.remove();
            overlay.onclick = e => {
              if (e.target === overlay) overlay.remove();
            };
          });


        /* ==========================================================
          Go Home Button
          ========================================================== */
        document
          .getElementById('goHomeBtn')
          .addEventListener('click', () => {
            // Already on home
            if (D.hero.style.display === 'block') return;

            const goHome = () => {
              setReaderMode(false);
              window.location.reload();
            };

            // ✅ Ayah already saved
            if (!isCurrentAyahDirty) {
              goHome();
              return;
            }

            // ❌ Unsaved → confirm
            showConfirmPopup({
              title: 'Unsaved Progress',
              message:
                'You haven’t saved this ayah yet. What would you like to do?',
              onGoHome: goHome
            });
          });
      }

/* ==========================================================
   Foreground FCM Message Handling
   ========================================================== */
      function setupForegroundMessaging() {
        onForegroundMessage(payload => {
          const { title, body } = payload.notification || {};
          console.log('🔔 FCM:', title, body);

          // TODO: Replace with in-app toast/snackbar
          showInAppToast(title, body);
        });
      }

/* ==========================================================
   Auth State Change Handler
   ========================================================== */
      async function handleAuthChange(user) {
        if (!D.ptsEl || !D.streakEl) {
          console.warn('[Auth] UI not ready yet, skipping update');
          return;
        }

        refreshAllProgress();
        console.log(
          '[Auth] Auth state changed:',
          user ? user.displayName : 'Guest'
        );

        /* ------------------------------------------
          Guest user
          ------------------------------------------ */
        if (!user) {
          D.ptsEl.textContent =
            localStorage.getItem('guestPoints') || '0';

          const flame = String.fromCodePoint(0x1F525);
          const guestHistory = JSON.parse(
            localStorage.getItem('guestStreakHistory') || '[]'
          );
          D.streakEl.textContent = `${flame}${guestHistory.length}`;

          return;
        }

        /* ------------------------------------------
          Logged-in user
          ------------------------------------------ */
        const fullName  = user.displayName || '';
        const firstName = fullName.split(' ')[0];

        // Notify iframe of login
        const activeIframe = getActiveIframe();
        if (activeIframe?.contentWindow) {
          activeIframe.contentWindow.postMessage(
            {
              type: 'userLoggedIn',
              firstName
            },
            '*'
          );
        }

        // Transfer guest stats if first login
        const snap = await getUserDoc();
        const guestPoints =
          +localStorage.getItem('guestPoints') || 0;

        const guestStreak =
          JSON.parse(
            localStorage.getItem('guestStreakHistory') || '[]'
          );

        if (
          !snap.exists() &&
          (guestPoints || guestStreak.length)
        ) {
          await saveStatsToFirestore({
            score: guestPoints,
            streakHistory: guestStreak
          });

          await persistProfile(user.displayName, user.email);

          localStorage.removeItem('guestPoints');
          localStorage.removeItem('guestStreakHistory');
        } else {
          await persistProfile(user.displayName, user.email);
        }

        // Load Firestore stats
        const data = (await getUserDoc()).data() || {};
        D.ptsEl.textContent    = data.ajrPoints || 0;
        const flame = String.fromCodePoint(0x1F525);
        D.streakEl.textContent =
          `${flame}${(data.streakHistory || []).length}`;
      }

/* ==========================================================
   Refresh Surah Progress Bars
   ========================================================== */
      async function refreshAllProgress() {
        let progressMap = {};

        if (auth.currentUser) {
          const snap = await getUserDoc();
          progressMap = snap.data()?.completedSurahs_new || {};
        } else {
          progressMap = JSON.parse(
            localStorage.getItem('completedSurahs_new') || '{}'
          );
        }
        progressMapCache = progressMap || {};
        updateSurahProgressBar(currentSurah, currentAyah, {
          allowMilestones: false
        });

        document.querySelectorAll('.surah-card').forEach(card => {
          const surahNum = +card
            .querySelector('.surah-number')
            .textContent.replace('Surah ', '');

          const total =
            surahData.find(s => s.number === surahNum)?.ayahCount || 0;

          const reached = progressMap[surahNum] || 0;

          const pct = total
            ? Math.round((reached / total) * 100)
            : 0;

          card.setAttribute('data-progress', pct);
          card.style.setProperty('--progress', `${pct}%`);
        });
      }

/* ==========================================================
   Prevent Screen Dimming (Wake Lock)
   ========================================================== */

      async function requestWakeLock() {
        try {
          if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');

            wakeLock.addEventListener('release', () => {
              wakeLock = null;
            });
          }
        } catch {
          // silently ignore
        }
      }

    // 🔁 Re-acquire wake lock when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !wakeLock) {
        requestWakeLock();
      }
    });

/* ==========================================================
   Learning Journey Normalization
   ========================================================== */
      function normalizeLearningJourney() {
        const raw = JSON.parse(
          localStorage.getItem('learningJourney') || '{}'
        );

        const today = new Date().toISOString().split('T')[0];
        const cleaned = {};

        for (const date in raw) {
          const entry = raw[date];

          // Already aggregated
          if (entry?.count && !entry.items) {
            cleaned[date] = entry;
            continue;
          }

          // Today → keep items
          if (date === today && entry?.items) {
            cleaned[date] = entry;
            continue;
          }

          // Old formats → aggregate
          if (Array.isArray(entry)) {
            cleaned[date] = { count: entry.length };
          } else if (entry?.items) {
            cleaned[date] = { count: entry.items.length };
          }
        }

        localStorage.setItem(
          'learningJourney',
          JSON.stringify(cleaned)
        );
      }

      function maybeShowSwipeHint() {
        if (swipeHintShown || localStorage.getItem(STORAGE_KEY)) return;
        if (!document.body.classList.contains('reader-mode')) return;
        setTimeout(() => showSwipeHint(), 600);
      }

      function maybeShowSaveHintForSmallSurah(surah, ayah) {
        // deprecated: sequencing now handled by queued hints
      }

      function queueWordHintAfterCurrentAyah() {
        if (localStorage.getItem('word_click_hint_shown_v1')) return;
        pendingWordHint = true;
        wordHintFromIndex = currentIndex;
        wordHintTriedIndex = null;
      }

      function queueSaveHintAfterCurrentAyah() {
        if (localStorage.getItem('save_click_hint_shown_v1')) return;
        pendingSaveHint = true;
        saveHintFromIndex = currentIndex;
        saveHintTriedIndex = null;
      }

      function maybeTriggerQueuedHints() {
        const iframe = getActiveIframe();
        if (!iframe?.contentWindow) return;

        if (pendingWordHint &&
            currentIndex !== wordHintFromIndex &&
            currentIndex !== wordHintTriedIndex &&
            !localStorage.getItem('word_click_hint_shown_v1')) {
          wordHintTriedIndex = currentIndex;
          iframe.contentWindow.postMessage(
            { type: 'TRIGGER_WORD_HINT' },
            '*'
          );
          return;
        }

        if (pendingSaveHint &&
            currentIndex !== saveHintFromIndex &&
            currentIndex !== saveHintTriedIndex &&
            !localStorage.getItem('save_click_hint_shown_v1')) {
          saveHintTriedIndex = currentIndex;
          iframe.contentWindow.postMessage(
            { type: 'TRIGGER_SAVE_HINT' },
            '*'
          );
        }
      }

      function scheduleJourneyTrack(surah, ayah) {
        if (journeyTrackTimer) {
          clearTimeout(journeyTrackTimer);
          journeyTrackTimer = null;
        }

        journeyTrackTimer = setTimeout(() => {
          trackLearningJourney(surah, ayah);
        }, 1000);
      }

      function trackLearningJourney(surah, ayah) {
        const journeyKey = 'learningJourney';
        const journey = JSON.parse(
          localStorage.getItem(journeyKey) || '{}'
        );

        const today = new Date().toISOString().split('T')[0];
        const entry = journey[today];

        if (!entry || !entry.items) {
          journey[today] = { items: [] };
        }

        const items = journey[today].items;
        const alreadyRead = items.some(
          item => item.surah === surah && item.ayah === ayah
        );

        if (!alreadyRead) {
          items.push({ surah, ayah });
          localStorage.setItem(
            journeyKey,
            JSON.stringify(journey)
          );
        }
      }

/* ==========================================================
   Build Daily Counts (fill missing days)
   ========================================================== */
      function buildDailyCountsWithZeros(raw) {
        const counts = {};
        const dates = Object.keys(raw);

        if (!dates.length) return counts;

        const today = new Date().toISOString().split('T')[0];
        const start = new Date(dates.sort()[0]);

        for (
          let d = new Date(start);
          d <= new Date(today);
          d.setDate(d.getDate() + 1)
        ) {
          const key = d.toISOString().split('T')[0];

          if (raw[key]?.count) {
            counts[key] = raw[key].count;
          } else if (raw[key]?.items) {
            counts[key] = raw[key].items.length;
          } else {
            counts[key] = 0;
          }
        }

        return counts;
      }


/* ==========================================================
   REEL-STYLE SWIPE ENGINE (IFRAME POOL, DEBUG MODE)
   ========================================================== */



      function ts() {
        return `+${(performance.now() - t0).toFixed(1)}ms`;
      }


      /* ==========================================================
        BUILD AYAH INDEX
      ========================================================== */
      function buildAyahIndex() {
        ayahList.length = 0;
        ayahIndexMap = {};

        surahData.forEach(s => {
          for (let a = 1; a <= s.ayahCount; a++) {
            const idx = ayahList.length;
            ayahList.push({ surah: s.number, ayah: a });
            ayahIndexMap[`${s.number}:${a}`] = idx;
          }
        });

        log('📘 Ayah index built:', ayahList.length, 'ayahs');
      }


      async function getAyahHTML(surah, ayah) {
        const key = `${surah}:${ayah}`;

        if (ayahHTMLCache.has(key)) {
          log('📦 HTML cache hit', key);
          return ayahHTMLCache.get(key);
        }

        const url = `/ayahs/surah_${surah}/ayah_${surah}_${ayah}.html`;

        const start = performance.now();
        const res = await fetch(url);
        const html = await res.text();
        const end = performance.now();

        log('🌐 HTML fetched', {
          key,
          bytes: html.length,
          tookMs: Math.round(end - start)
        });

        ayahHTMLCache.set(key, html);
        return html;
      }


async function sendAyahToIframe(iframe, surah, ayah) {
  console.groupCollapsed(
    '%c📤 sendAyahToIframe',
    'color:#673AB7;font-weight:bold'
  );

  if (!iframe) {
    console.warn('❌ iframe is null/undefined');
    console.groupEnd();
    return;
  }

  const key = `${surah}:${ayah}`;
  const idx = [...iframePool.entries()]
    .find(([, f]) => f === iframe)?.[0];

  /* ------------------------------------------
     🔍 GLOBAL SWIPE STATE
  ------------------------------------------ */
  console.log('🧭 Swipe state', {
    currentIndex,
    currentSurah,
    currentAyah,
    isSwiping,
    isAnimatingSwipe,
    swipeLockedUntilFrame,
    now: performance.now().toFixed(1)
  });

  /* ------------------------------------------
     🧲 Drag state
  ------------------------------------------ */
  console.log('🖐️ Drag state', {
    active: dragState.active,
    dx: dragState.dx,
    dir: dragState.dir,
    raf: dragState.raf
  });

  /* ------------------------------------------
     🧩 iframe info
  ------------------------------------------ */
  console.log('🧩 iframe info', {
    key,
    iframeIndex: idx,
    ready: iframeReadySet.has(iframe),
    src: iframe.getAttribute('src'),
    hasContentWindow: !!iframe.contentWindow
  });

  /* ------------------------------------------
     🧱 Ring transform state
  ------------------------------------------ */
  ring.cards.forEach((card, i) => {
    const style = getComputedStyle(card);
    console.log(`🪟 Card ${i}`, {
      transform: style.transform,
      transition: style.transition
    });
  });

  /* ------------------------------------------
     📦 Cache state
  ------------------------------------------ */
  const cacheHit = ayahHTMLCache.has(key);

  console.log('📦 Cache state', {
    cacheHit,
    cacheSize: ayahHTMLCache.size
  });

  /* ------------------------------------------
     🛑 iframe not ready
  ------------------------------------------ */
  if (!iframeReadySet.has(iframe)) {
    console.warn('⏳ iframe not ready → skip inject');
    console.groupEnd();
    return;
  }

  /* ------------------------------------------
     🌐 Fetch HTML
  ------------------------------------------ */
  const t0 = performance.now();
  const html = await getAyahHTML(surah, ayah);
  const t1 = performance.now();

  console.log('📨 HTML ready', {
    key,
    bytes: html.length,
    timeMs: Math.round(t1 - t0)
  });

  if (!iframe.contentWindow) {
    console.warn('❌ iframe.contentWindow missing');
    console.groupEnd();
    return;
  }

  /* ------------------------------------------
     📤 Inject
  ------------------------------------------ */
  iframe.contentWindow.postMessage(
    {
      type: 'LOAD_AYAH_HTML',
      surah,
      ayah,
      html,
    },
    '*'
  );

  console.log('✅ LOAD_AYAH_HTML posted');

  /* ------------------------------------------
     🔒 Swipe lock update
  ------------------------------------------ */
  swipeLockedUntilFrame = performance.now() + 32;

  console.log('🔒 swipeLockedUntilFrame set', swipeLockedUntilFrame);

  console.groupEnd();
}

      //swipeLockedUntilFrame = performance.now() + 32;


/* ==========================================================
   LOAD AYAH (ABSOLUTE INDEX)
========================================================== */
      function loadAyah(surah, ayah) {
        const surahNum = Number(surah);
        const ayahNum = Number(ayah);
        const idx = ayahIndexMap[`${surahNum}:${ayahNum}`];
        if (idx == null) {
          log('❌ loadAyah: invalid', surah, ayah);
          return;
        }

        log('📍 loadAyah → index', idx, `(S${surahNum}:A${ayahNum})`);

        currentIndex = idx;
        currentSurah = surahNum;
        currentAyah  = ayahNum;

        setReaderMode(true);
        if (lastMilestoneSurah !== surahNum) {
          resetMilestoneTracking();
          lastMilestoneSurah = surahNum;
        }
        if (isSmallSurah(surahNum)) {
          swipeHintQueued = false;
          wordHintQueued = false;
        }
        maybeShowSwipeHint();
        syncDropdowns(surahNum, ayahNum);

        const activeFrame = getActiveIframe();
        if (activeFrame?.contentWindow) {
          activeFrame.contentWindow.postMessage(
            {
              type: 'SET_HINT_POLICY',
              allowWordHint: !isSmallSurah(surahNum),
              allowSaveHint: true
            },
            '*'
          );
        }

        if (localStorage.getItem('swipe_hint_shown_v1') &&
            !localStorage.getItem('word_click_hint_shown_v1') &&
            !pendingWordHint) {
          queueWordHintAfterCurrentAyah();
        }

        if (localStorage.getItem('word_click_hint_shown_v1') &&
            !localStorage.getItem('save_click_hint_shown_v1') &&
            !pendingSaveHint) {
          queueSaveHintAfterCurrentAyah();
        }

        prewarmNeighbors(3);

        initRing();
        
        updateRing();
        positionRing();
        swipeWidth = D.viewer.clientWidth;
        requestAnimationFrame(() => resetCardPositions());
        updateSurahProgressBar(surahNum, ayahNum, {
          allowMilestones: false
        });
        scheduleJourneyTrack(surahNum, ayahNum);
        maybeTriggerQueuedHints();
        //maybeShowMotivation();

      }

      /* ==========================================================
        IFRAME POOL
      ========================================================== */
      function getIframeForIndex(idx) {
        if (idx < 0 || idx >= ayahList.length) return null;

        if (iframePool.has(idx)) {
          log('♻️ Reusing iframe for index', idx);
          return iframePool.get(idx);
        }

  const data = ayahList[idx];
  const iframe = document.createElement('iframe');

  // ⏱️ START TIMER HERE (per iframe)
  const loadStart = performance.now();
  iframe.src =
    `ayahs/surah_${data.surah}/ayah_${data.surah}_${data.ayah}.html`;

  iframe.style.inset = 0;
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  iframe.style.pointerEvents = 'none';
  iframe.loading = 'eager';
  iframe.fetchPriority = 'high';
  iframe.decoding = 'sync';

  iframe.onload = () => {
    const loadEnd = performance.now();

    iframeReadySet.add(iframe);

    log('🧩 iframe ready', {
      idx,
      surah: data.surah,
      ayah: data.ayah,
            tookMs: Math.round(loadEnd - loadStart)
          });

    // send settings AFTER ready
    const settings = getSettings();
    iframeSettingsVersion.set(iframe, settingsVersion);
    iframe.contentWindow?.postMessage({
      type: 'APPLY_SETTINGS',
      settings,
      version: settingsVersion
    }, '*');
  };

        iframePool.set(idx, iframe);
        log('🆕 Created (hidden) iframe for index', idx);

        return iframe;
      }



/* ==========================================================
   RING SETUP
========================================================== */
      function initRing() {
        if (ring.cards.length) {
          log('🔁 Ring already initialized');
          return;
        }

        for (let i = 0; i < 3; i++) {
          const card = document.createElement('div');
          card.className = 'ayah-card';
          card.style.willChange = 'transform';
          card.style.transform = 'translate3d(0,0,0)';
          D.viewer.appendChild(card);
          ring.cards.push(card);
        }

        log('🧩 Ring initialized with 3 cards');
      }

/* ==========================================================
   UPDATE RING (ATTACH IFRAMES)
========================================================== */
      function updateRing() {
        log('🔄 updateRing → currentIndex', currentIndex);

        const indices = [
          currentIndex - 1,
          currentIndex,
          currentIndex + 1
        ];

        indices.forEach((idx, i) => {
          const card = ring.cards[i];
          const iframe = getIframeForIndex(idx);
          if (!iframe) return;

          if (card.firstChild !== iframe) {
            card.innerHTML = '';
            card.appendChild(iframe);
          }

          // 🔑 VISIBILITY + POINTER CONTROL
          iframe.style.visibility = 'visible';
          iframe.style.pointerEvents = (i === 1) ? 'auto' : 'none';

          if (iframeReadySet.has(iframe)) {
            const applied = iframeSettingsVersion.get(iframe) || 0;
            if (applied < settingsVersion) {
              const settings = getSettings();
              iframeSettingsVersion.set(iframe, settingsVersion);
              iframe.contentWindow?.postMessage(
                { type: 'APPLY_SETTINGS', settings, version: settingsVersion },
                '*'
              );
            }
          }
        });

        pruneIframePool();

      }


/* ==========================================================
   POSITION RING
========================================================== */
      function positionRing() {
        const w = D.viewer.clientWidth;
        log('📐 positionRing width', w);

        ring.cards.forEach((card, i) => {
          card.style.transition = 'none';
          card.style.transform =
            `translate3d(${(i - 1) * w}px, 0, 0)`;
        });
      }

/* ==========================================================
   PRUNE IFRAME POOL
========================================================== */
      function pruneIframePool() {
        const keep = new Set([
          currentIndex - 3,
          currentIndex - 2,
          currentIndex - 1,
          currentIndex,
          currentIndex + 1,
          currentIndex + 2,
          currentIndex + 3
        ]);

        for (const [idx, iframe] of iframePool.entries()) {
          if (!keep.has(idx) && !prewarmedIndices.has(idx)) {
            log('🗑️ Pruning iframe index', idx);
            iframe.remove();
            iframePool.delete(idx);
          }
        }
      }




  


/* ==========================================================
   FINALIZE SWIPE
========================================================== */
     

function resetCardPositions() {
  const w = D.viewer.clientWidth;

  ring.cards[0].style.transition = 'none';
  ring.cards[1].style.transition = 'none';
  ring.cards[2].style.transition = 'none';

  ring.cards[0].style.transform = `translate3d(-${w}px,0,0)`;
  ring.cards[1].style.transform = 'translate3d(0,0,0)';
  ring.cards[2].style.transform = `translate3d(${w}px,0,0)`;

  // 🔑 force layout so next swipe starts clean
  ring.cards[1].getBoundingClientRect();
}


function finalizeSwipe(dir) {
        // 1️⃣ Rotate cards + index (VISUAL ONLY)
        if (dir === 1) {
          ring.cards.push(ring.cards.shift());
          currentIndex++;
        } else {
          ring.cards.unshift(ring.cards.pop());
          currentIndex--;
        }

        const data = ayahList[currentIndex];
        currentSurah = data.surah;
        currentAyah  = data.ayah;

        prewarmNeighbors(3);

        // 2️⃣ Snap positions immediately
        updateRing();
        positionRing();
        isSwiping = false;
        scheduleJourneyTrack(currentSurah, currentAyah);
        updateSurahProgressBar(currentSurah, currentAyah, {
          allowMilestones: true,
          fromSwipe: true
        });
        maybeTriggerQueuedHints();
        maybeShowMotivation();

        // 3️⃣ 🔑 Inject HTML AFTER animation frame settles
        requestAnimationFrame(() => {
        const iframe = ring.cards[1].querySelector('iframe');

        //warmupCardLayers();   // ✅ ADD THIS LINE

          if (!iframe) return;

          if (iframeReadySet.has(iframe)) {
            sendAyahToIframe(iframe, currentSurah, currentAyah);
          } else {
            iframe.__pendingAyah = {
              surah: currentSurah,
              ayah: currentAyah
            };
          }
        });


        // 4️⃣ Everything else is idle / background
        requestIdleCallback(() => {
          syncDropdowns(currentSurah, currentAyah);

          pruneIframePool();
          prewarmedIndices.clear();
        });

        resetCardPositions();

      }



/* ==========================================================
   HELPERS
========================================================== */


// --- disable parent swipe overlay so iframe receives all pointer events ---


      function resetPositions() {
        positionRing();

        // ensure only center iframe is interactive
        ring.cards.forEach((card, i) => {
          const iframe = card.firstChild;
          if (iframe) {
            iframe.style.pointerEvents = (i === 1) ? 'auto' : 'none';
          }
        });

        setTimeout(() => (isSwiping = false), 260);
      }


  function forwardClickToActiveIframe(e) {
    const card = ring.cards[1];
    const iframe = card?.querySelector('iframe');

    if (!iframe || !iframe.contentWindow) {
      log('⚠️ No active iframe to forward click');
      return;
    }

    const rect = iframe.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    log('🖱️ Forwarding click to iframe', { x, y });

    iframe.contentWindow.postMessage(
      {
        type: 'CLICK',
        x,
        y
      },
      '*'
    );
  }



function prewarmIframe(idx) {
  if (idx < 0 || idx >= ayahList.length) return;
  if (iframePool.has(idx)) {
    const existing = iframePool.get(idx);
    if (existing && !iframeReadySet.has(existing)) {
      existing.loading = 'eager';
      existing.fetchPriority = 'high';
      existing.decoding = 'sync';
    }
    return;
  }

  const { surah, ayah } = ayahList[idx];

  log('🔥 Prewarming iframe for index', idx);
  prewarmedIndices.add(idx);
  getAyahHTML(surah, ayah);
  getIframeForIndex(idx);
}

function prewarmNeighbors(distance = 3) {
  for (let i = 1; i <= distance; i++) {
    prewarmIframe(currentIndex + i);
    prewarmIframe(currentIndex - i);
  }
}






function canMove(dir) {
  const next = currentIndex + dir;
  const ok = next >= 0 && next < ayahList.length;
  log('🔍 canMove', dir, ok);
  return ok;
}






/* ==========================================================
   Main Initialization
   ========================================================== */
async function init() {
  bindUIActions();
  setReaderMode(false);
  ensureHomeScroll();
  window.addEventListener('pageshow', ensureHomeScroll);
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureHomeScroll();
  });
  normalizeLearningJourney();
  initSwipeHintObserver();
  setupForegroundMessaging();

  onAuthChange(handleAuthChange);

  await renderSurahOverview();
  await initStartButton();

  StreakUI.init({
    navSelector: '#streakDisplay',
    firebaseApp: firebase
  });

  refreshAllProgress();
  requestWakeLock();
}

document.addEventListener('DOMContentLoaded', init);




