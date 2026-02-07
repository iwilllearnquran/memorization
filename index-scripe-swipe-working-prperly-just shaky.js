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
  onForegroundMessage,
  getLastReadFromDb,
  updateLastRead,
  addPointsToFirestore} from '/services//_private/firestoreService.js';

import {
  addGuestPoints,
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
let pendingSwipeFrame = null;
let pendingSwipeData = null;




let surahData    = [];
let currentSurah = DEFAULT_SURAH;
let currentAyah  = DEFAULT_AYAH;
let isGameMode = false;
let isCurrentAyahDirty = false;
let pendingSwipeDone = false;
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



/* ==========================================================
   Broadcasting and Saving settings
========================================================== */

const DEFAULT_SETTINGS = {
  showWordTranslation: true,
  showRoot: true,
  showGrammar: true,
  panelLang: 'en',
  audioLang: 'ar',
  speed: '1',
  repeat: '1'
};

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

        broadcastSettings(next);
      }

      function broadcastSettings(settings) {
        console.log('📡 Broadcasting settings');

        iframePool.forEach((iframe) => {
          if (!iframeReadySet.has(iframe)) {
            console.log('⏳ iframe not ready, skipping broadcast');
            return;
          }

          iframe.contentWindow?.postMessage(
            { type: 'APPLY_SETTINGS', settings },
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
            disableParentSwipe();


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

/* ==========================================================
   Resolve Next / Previous Ayah
   ========================================================== */
      function getNextAyah(dir) {


        const currentIndex = surahData.findIndex(
          s => s.number === currentSurah
        );

        if (currentIndex === -1) {
          return {};
        }


        /* ------------------------------------------
          Start with simple forward/backward move
          ------------------------------------------ */
        let surah = currentSurah;
        let ayah  = currentAyah + dir;

        const maxAyahs =
          surahData[currentIndex]?.ayahCount || 0;


        /* ------------------------------------------
          Handle Surah boundaries
          ------------------------------------------ */
        if (ayah < 1) {
          // Move to previous Surah (last Ayah)
          surah = surahData[currentIndex - 1]?.number;
          ayah  = surahData[currentIndex - 1]?.ayahCount;

        } else if (ayah > maxAyahs) {
          // Move to next Surah (first Ayah)
          surah = surahData[currentIndex + 1]?.number;
          ayah  = 1;
        }



        return surah ? { surah, ayah } : {};
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
   Swipe Hint (One-Time)
   ========================================================== */

      if (!iframe) {
        console.warn('[SwipeHint] ayahViewer iframe not found');
      }

/* ==========================================================
   Show Swipe User Guide
   ========================================================== */
      function showSwipeHint() {
        if (swipeHintShown) {
          console.log('[SwipeHint] Already shown, skipping');
          return;
        }

        swipeHintShown = true;

        const overlay   = document.getElementById('swipeHint');
        const container = document.getElementById('swipeLottie');

        if (!overlay || !container || !window.lottie) {
          console.warn('[SwipeHint] Missing overlay / lottie');
          return;
        }

        console.log('[SwipeHint] Showing swipe animation');

        overlay.classList.remove('hidden');


        /* ------------------------------------------
          Load Lottie animation
          ------------------------------------------ */
        const MAX_LOOPS = 2;
        let loopCount = 0;

        const anim = lottie.loadAnimation({
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


        /* ------------------------------------------
          Hide logic
          ------------------------------------------ */
        const hide = reason => {
          console.log('[SwipeHint] Hiding swipe hint:', reason);

          overlay.classList.add('hidden');
          anim.destroy();

          localStorage.setItem('swipe_hint_shown_v1', '1');

          // 🔔 Notify same-page listeners
          window.dispatchEvent(
            new CustomEvent('swipeHintFinished')
          );
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

        if (D.gestureLayer) {
          D.gestureLayer.style.pointerEvents = 'none';
        }
      }

      function disableGameMode() {
        isGameMode = false;

        document.body.classList.remove('game-mode');

        D.surahSelect.disabled = false;
        D.ayahSelect.disabled  = false;
        D.returnBtn.style.display = 'none';

        if (D.gestureLayer) {
          D.gestureLayer.style.pointerEvents = 'auto';
        }
      }



      function applyDragFrame() {
  dragState.raf = 0;

  if (!dragState.active) return;

  const { dx, dir } = dragState;
  const w = swipeWidth || (swipeWidth = D.viewer.clientWidth);

  const center = ring.cards[1];
  const side   = dir === 1 ? ring.cards[2] : ring.cards[0];

  // 🔒 snap to device pixels (kills micro jitter)
  const snappedDx = Math.round(dx);

  center.style.transform =
    `translate3d(${snappedDx}px,0,0)`;

  side.style.transform =
    `translate3d(${snappedDx + dir * w}px,0,0)`;
}



function warmupCardLayers() {
  ring.cards.forEach(card => {
    card.style.willChange = 'transform';

    // force GPU promotion
    card.style.transform = 'translate3d(0,0,0)';
  });

  // force composite flush
  ring.cards[1].getBoundingClientRect();
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


case 'IFRAME_READY': {
  const { surah, ayah } = data;

  console.log('📖 IFRAME READY →', surah, ayah);

  if (surah && ayah) {
    currentSurah = surah;
    currentAyah  = ayah;
    syncDropdowns(surah, ayah);
  }

  // 🔑 SEND SETTINGS TO THIS IFRAME
  const settings = getSettings();

  console.log('📤 Sending settings to iframe', settings);

  e.source.postMessage(
    {
      type: 'APPLY_SETTINGS',
      settings
    },
    '*'
  );

  break;
}


    /* ------------------------------------------*/
    case 'WORD_DETAILS_OPENED':
        D.gestureLayer.style.pointerEvents = 'none';
      break;

    case 'WORD_DETAILS_CLOSED':
        D.gestureLayer.style.pointerEvents = 'auto';

      break;


    /* ------------------------------------------
       Setting panel opened/closed
       ------------------------------------------ */
    case 'SETTINGS_OPENED':
      D.gestureLayer.style.pointerEvents = 'none';
      break;

    case 'SETTINGS_CLOSED':
      D.gestureLayer.style.pointerEvents = 'auto';
      break;


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
      D.loginBtn.click();
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

case 'SCROLL_START':
  if (D.gestureLayer) D.gestureLayer.style.pointerEvents = 'none';
  break;
case 'SCROLL_END':
  if (D.gestureLayer) D.gestureLayer.style.pointerEvents = 'auto';
  break;

  case 'VERTICAL_INTENT':
  if (D.gestureLayer) {
    D.gestureLayer.style.pointerEvents = 'none';
    // re-enable after small timeout unless SCROLL_START arrives
    clearTimeout(window.__gestureRestoreTimeout);
    window.__gestureRestoreTimeout = setTimeout(() => {
      if (D.gestureLayer) D.gestureLayer.style.pointerEvents = 'auto';
    }, 350);
  }
  break;

case 'SWIPE_COMMIT': {
  const { dir } = data;

  // 🧹 STOP live drag immediately
  dragState.active = false;
  dragState.dx = 0;
  dragState.dir = 0;

  if (dragState.raf) {
    cancelAnimationFrame(dragState.raf);
    dragState.raf = 0;
  }

  const w = swipeWidth || (swipeWidth = D.viewer.clientWidth);

  // ❌ Cannot move → bounce back
  if (!canMove(dir)) {
    window.postMessage({ type: 'SWIPE_CANCEL' }, '*');
    return;
  }

  isAnimatingSwipe = true;

  const center = ring.cards[1];
  const side   = dir === 1 ? ring.cards[2] : ring.cards[0];

  const DURATION = 320;
  const EASING   = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

  center.style.transition = `transform ${DURATION}ms ${EASING}`;
  side.style.transition   = `transform ${DURATION}ms ${EASING}`;

  center.style.transform =
    `translate3d(${-dir * w}px,0,0)`;

  side.style.transform =
    `translate3d(0,0,0)`;

  center.addEventListener(
    'transitionend',
    () => {
      isAnimatingSwipe = false;
      swipeLockedUntilFrame = performance.now() + 32; // allow settle
      finalizeSwipe(dir);
    },
    { once: true }
  );


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

  if (dragState.raf) {
    cancelAnimationFrame(dragState.raf);
    dragState.raf = 0;
  }

  const w = swipeWidth || (swipeWidth = D.viewer.clientWidth);

  const center = ring.cards[1];
  const left   = ring.cards[0];
  const right  = ring.cards[2];

  const DURATION = 260;
  const EASING   = 'cubic-bezier(0.18, 0.89, 0.32, 1.15)';

  [center, left, right].forEach(el => {
    el.style.transition = `transform ${DURATION}ms ${EASING}`;
  });

  center.style.transform = 'translate3d(0,0,0)';
  left.style.transform   = `translate3d(-${w}px,0,0)`;
  right.style.transform  = `translate3d(${w}px,0,0)`;

  break;
  
}



case 'PRACTICE_MODE': {
      if (data.active) {
        console.log('[GESTURE] Practice ON → disabling gesture layer');
          D.gestureLayer.style.pointerEvents = 'none';
      } else {
        console.log('[GESTURE] Practice OFF → enabling gesture layer');
        D.gestureLayer.style.pointerEvents = 'auto';
      }
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
            const today = new Date()
              .toISOString()
              .split('T')[0];

            window.postMessage(
              {
                type: 'streakUpdate',
                date: today
              },
              '*'
            );
          } else {
            console.log(
              '⏭️ [SAVE_PROGRESS] recordStreak=false → skipping guest streak'
            );
          }
        }

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
        if (D.surahSelect) {
          D.surahSelect.value = surah;
        }

        if (!D.ayahSelect) return;

        D.ayahSelect.innerHTML = '';

        const totalAyahs =
          surahData.find(x => x.number === surah)?.ayahCount || 0;

        for (let i = 1; i <= totalAyahs; i++) {
          D.ayahSelect.append(new Option(i, i));
        }

        D.ayahSelect.value = ayah;
      }

/* ==========================================================
   Confirm Exit Popup
   ========================================================== */
      function showConfirmPopup({ title, message, onGoHome }) {
        const overlay = document.createElement('div');
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
          <div style="
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
          D.iframe?.contentWindow?.postMessage(
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


        const menuBtn = document.getElementById('menuBtn');


        /* ------------------------------------------
          Surah / Ayah dropdown navigation
          ------------------------------------------ */
        D.surahSelect.addEventListener('change', () => {
          loadAyah(+D.surahSelect.value, 1);
        });

        D.ayahSelect.addEventListener('change', () => {
          loadAyah(currentSurah, +D.ayahSelect.value);
        });


        /* ------------------------------------------
          Reels-style swipe (attach ONCE)
          ------------------------------------------ */
        D.gestureLayer = document.getElementById('gestureLayer');

        if (D.gestureLayer) {
        // ensure correct default behaviour
        D.gestureLayer.style.touchAction = D.gestureLayer.style.touchAction || 'pan-y';
        D.gestureLayer.style.pointerEvents = D.gestureLayer.style.pointerEvents || 'auto';
        bindSwipe(); // <--- bind the swipe listeners now that gestureLayer exists
      } else {
        console.warn('[Swipe] gestureLayer not found');
      }
        



      /* ==========================================================
        About Popup
        ========================================================== */
      aboutBtn
        .addEventListener('click', () => {
          D.drawer.classList.remove('open');

          const overlay = document.createElement('div');
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
            <div style="
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
                Quran Quest is a calm, distraction-free way to learn the Quran
                through interaction, reflection, and consistency.
                <br><br>
                More features coming soon, In shaa Allah 🌙
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
          D.drawer.classList.add('open');
        });

        D.closeBtn.addEventListener('click', () => {
          D.drawer.classList.remove('open');
        });

        // Swipe-to-close drawer (mobile)
        let touchStartX = 0;

        D.drawer.addEventListener('touchstart', e => {
          touchStartX = e.changedTouches[0].pageX;
        });

        D.drawer.addEventListener('touchend', e => {
          if (e.changedTouches[0].pageX - touchStartX < 50) {
            D.drawer.classList.remove('open');
          }
        });


        /* ------------------------------------------
          Return from game mode
          ------------------------------------------ */
        D.returnBtn.addEventListener('click', () => {
          disableGameMode();
          loadAyah(currentSurah, currentAyah);
        });


        /* ==========================================================
          Learning Journey (Analytics Popup)
          ========================================================== */
        document
          .getElementById('learningJourneyBtn')
          .addEventListener('click', () => {
            D.drawer.classList.remove('open');

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

          if (!D.ptsEl || !D.streakEl || !D.loginBtn) {
          console.warn('[Auth] UI not ready yet, skipping update');
          return;
        }
        refreshAllProgress();
        console.log(
          '🔐 Auth state changed:',
          user ? user.displayName : 'Guest'
        );

        /* ------------------------------------------
          Guest user
          ------------------------------------------ */
        if (!user) {
          D.ptsEl.textContent =
            localStorage.getItem('guestPoints') || '0';

          D.streakEl.textContent =
            `🔥${
              JSON.parse(
                localStorage.getItem('guestStreakHistory') || '[]'
              ).length
            }`;

          D.loginBtn.textContent = 'Login';
          return;
        }


        /* ------------------------------------------
          Logged-in user
          ------------------------------------------ */
        const fullName  = user.displayName || '';
        const firstName = fullName.split(' ')[0];

        // Notify iframe of login
        if (D.iframe?.contentWindow) {
          D.iframe.contentWindow.postMessage(
            {
              type: 'userLoggedIn',
              firstName
            },
            '*'
          );
        }

        D.loginBtn.textContent = '👤';

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
        D.streakEl.textContent =
          `🔥${(data.streakHistory || []).length}`;
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
   Load and Display a Specific Ayah
   ========================================================== 
async function loadAyah(surah, ayah) {
  baseSurah = surah;
  baseAyah  = ayah;
  logicalOffset = 0;

  currentSurah = surah;
  currentAyah  = ayah;
  isCurrentAyahDirty = true;


  /* ------------------------------------------
     Update dropdowns
     ------------------------------------------ 
  D.surahSelect.value = surah;
  D.ayahSelect.innerHTML = '';

  const totalVerses =
    surahData.find(x => x.number === surah)?.ayahCount || 0;

  for (let i = 1; i <= totalVerses; i++) {
    D.ayahSelect.append(new Option(i, i));
  }

  D.ayahSelect.value = ayah;




  /* ------------------------------------------
     Load iframe content (with fade animation)
     ------------------------------------------ 
  //D.iframe.classList.add('fade-out');

  // Attach onload BEFORE setting src
  const iframe = getCurrentIframe();
  if (iframe) {
    iframe.onload = () => {
      if (!pendingSwipeDone) return;

      iframe.contentWindow?.postMessage(
        { type: 'SWIPE_HINT_DONE' },
        '*'
      );

      pendingSwipeDone = false;
    };
  }


  /* ------------------------------------------
     Persist last-read position
     ------------------------------------------ 
  if (auth.currentUser) {
    await updateLastRead(surah, ayah);
  } else {
    setGuestLastRead(surah, ayah);
  }


  /* ------------------------------------------
     📘 Track learning journey (guest + user)
     ------------------------------------------ 
  const journeyKey = 'learningJourney';
  const journey = JSON.parse(
    localStorage.getItem(journeyKey) || '{}'
  );

  const today = new Date().toISOString().split('T')[0];
  journey[today] = journey[today] || { items: [] };

  const alreadyRead = journey[today].items.some(
    item => item.surah === surah && item.ayah === ayah
  );

  if (!alreadyRead) {
    journey[today].items.push({ surah, ayah });
    localStorage.setItem(
      journeyKey,
      JSON.stringify(journey)
    );
  }


  /* ------------------------------------------
     🔮 Preload next/previous ayah for instant swipe
     ------------------------------------------ 
  ensureSideFrames();

  
}/* ==========================================================
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
        const idx = ayahIndexMap[`${surah}:${ayah}`];
        if (idx == null) {
          log('❌ loadAyah: invalid', surah, ayah);
          return;
        }

        log('📍 loadAyah → index', idx, `(S${surah}:A${ayah})`);

        currentIndex = idx;
        currentSurah = surah;
        currentAyah  = ayah;

        syncDropdowns(surah, ayah);

        initRing();
        
        updateRing();
        positionRing();
        //resetCardPositions();   // <-- ADD THIS
        //warmupCardLayers();

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
          iframe.contentWindow?.postMessage({
            type: 'APPLY_SETTINGS',
            settings: getSettings()
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
   POINTER EVENTS
========================================================== */
function onPointerDown(e) {
  if (isGameMode || isSwiping) return;

  isSwiping = true;
  swipeCommitted = false;

  startX = e.clientX;
  startY = e.clientY;
  deltaX = 0;
  swipeDir = 0;
  startTime = performance.now();

  prewarmIframe(currentIndex + 1);
  prewarmIframe(currentIndex - 1);
}



      function notifyIframeVerticalIntent() {
        const iframe = ring.cards[1]?.querySelector('iframe');
        if (!iframe || !iframe.contentWindow) return;

        iframe.contentWindow.postMessage(
          { type: 'VERTICAL_INTENT' },
          '*'
        );
      }

      function restoreGestureLayer() {
          D.gestureLayer.style.pointerEvents = 'auto'
      }

function onPointerMove(e) {
  if (!isSwiping) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  // Decide direction once
  if (!swipeDir) {
    // Vertical intent
    // inside onPointerMove (parent)
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      log('⬇️ Vertical intent → yield to iframe');

      // 1) disable parent overlay so browser/iframe receives pointer events
      D.gestureLayer.style.pointerEvents = 'none';

      // 2) notify iframe (optional — iframe may already detect scroll, but it's helpful)
      notifyIframeVerticalIntent();
      isSwiping = false;

      // 3) cancel swipe processing but DO NOT immediately re-enable the gesture layer.
      cancelSwipe();

      // 4) fallback: if iframe doesn't start scrolling within 300ms, restore overlay.
      clearTimeout(window.__gestureRestoreTimeout);
      window.__gestureRestoreTimeout = setTimeout(() => {
        if (D.gestureLayer) D.gestureLayer.style.pointerEvents = 'auto';
      }, 300);

      return;
    }


    // Horizontal intent
    if (Math.abs(dx) > 8) {
      swipeDir = dx < 0 ? 1 : -1;
      prewarmIframe(currentIndex + swipeDir);
    }
  }

  if (!swipeDir) return;

  // Horizontal swipe handling
  deltaX = dx;
  const w = D.viewer.clientWidth;

  ring.cards[1].style.transition = 'none';
  ring.cards[1].style.transform =
    `translate3d(${dx}px,0,0)`;

  const side = swipeDir === 1 ? ring.cards[2] : ring.cards[0];
  side.style.transition = 'none';
  side.style.transform =
    `translate3d(${dx + swipeDir * w}px,0,0)`;
}



      function onPointerUp(e) {
        log('Ponter up');
        restoreGestureLayer();
        if (!isSwiping || swipeCommitted) return;

        const elapsed = performance.now() - startTime;
        const velocity = Math.abs(deltaX) / elapsed;
        const w = D.viewer.clientWidth;

        const commit =
          Math.abs(deltaX) > w * 0.15 || velocity > 0.8;

        log(
          '🧮 pointerup',
          { deltaX, elapsed, velocity, commit }
        );

        // 🟢 NOT A SWIPE → FORWARD CLICK
        if (!commit) {
          log('🖱️ Treating as click');
          forwardClickToActiveIframe(e);
          resetPositions();
          return;
        }

        // 🔵 SWIPE PATH (unchanged)
        const side = swipeDir === 1 ? ring.cards[2] : ring.cards[0];

        ring.cards[1].style.transition = 'transform 260ms ease';
        side.style.transition = 'transform 260ms ease';

        if (canMove(swipeDir)) {
          log('✅ Swipe commit', swipeDir);

          ring.cards[1].style.transform =
            `translate3d(${-swipeDir * w}px,0,0)`;
          side.style.transform = 'translate3d(0,0,0)';

          setTimeout(() => finalizeSwipe(swipeDir), 260);
        } else {
          resetPositions();
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

        // 2️⃣ Snap positions immediately
        updateRing();
        positionRing();
        isSwiping = false;

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

          for (let i = 1; i <= 3; i++) {
            prewarmIframe(currentIndex + i);
            prewarmIframe(currentIndex - i);
          }

          pruneIframePool();
          prewarmedIndices.clear();
        });

        resetCardPositions();

      }



/* ==========================================================
   HELPERS
========================================================== */


// --- disable parent swipe overlay so iframe receives all pointer events ---
function disableParentSwipe() {
  if (!D || !D.gestureLayer) return;
  try {
    // Ensure parent overlay is inert (iframe gets the events)
    D.gestureLayer.style.pointerEvents = 'none';
    D.gestureLayer.style.touchAction = 'auto'; // let iframe handle pan-y inside itself

    // remove parent swipe listeners (safe even if not bound)
    D.gestureLayer.removeEventListener('pointerdown', onPointerDown);
    D.gestureLayer.removeEventListener('pointermove', onPointerMove);
    D.gestureLayer.removeEventListener('pointerup', onPointerUp);
    D.gestureLayer.removeEventListener('pointercancel', cancelSwipe);

    // keep ring card iframe pointer-events correct
    ring.cards.forEach((card, i) => {
      const iframe = card?.querySelector('iframe');
      if (iframe) iframe.style.pointerEvents = (i === 1) ? 'auto' : 'none';
    });

    console.log('[SWIPE] Parent swipe disabled — iframe will handle gestures');
  } catch (err) {
    console.warn('[SWIPE] disableParentSwipe error', err);
  }
}

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
  if (iframePool.has(idx)) return;

  const { surah, ayah } = ayahList[idx];

  log('🔥 Prewarming iframe for index', idx);
  prewarmedIndices.add(idx);
  getAyahHTML(surah, ayah);
  getIframeForIndex(idx);
}



function cancelSwipe() {
  console.groupCollapsed(
    '%c↩️ cancelSwipe',
    'color:#E91E63;font-weight:bold'
  );

  console.log('🧭 Swipe state BEFORE', {
    isSwiping,
    swipeCommitted,
    swipeDir,
    deltaX,
    currentIndex,
    currentSurah,
    currentAyah,
    isAnimatingSwipe,
    swipeLockedUntilFrame,
    now: performance.now().toFixed(1)
  });

  console.log('🖐️ Drag state BEFORE', {
    active: dragState?.active,
    dx: dragState?.dx,
    dir: dragState?.dir,
    raf: dragState?.raf
  });

  if (!isSwiping) {
    console.warn('cancelSwipe ignored → not swiping');
    console.groupEnd();
    return;
  }

  /* ------------------------------------------
     🧹 Reset swipe flags
  ------------------------------------------ */
  swipeCommitted = true;
  isSwiping = false;
  swipeDir = 0;
  deltaX = 0;

  console.log('🧹 Swipe flags reset', {
    swipeCommitted,
    isSwiping,
    swipeDir,
    deltaX
  });

  /* ------------------------------------------
     🔄 Reposition ring
  ------------------------------------------ */
  positionRing();

  /* ------------------------------------------
     🧱 Card transform state AFTER reset
  ------------------------------------------ */
  ring.cards.forEach((card, i) => {
    const style = getComputedStyle(card);

    console.log(`🪟 Card ${i}`, {
      transform: style.transform,
      transition: style.transition
    });
  });

  /* ------------------------------------------
     🖐️ Drag state AFTER
  ------------------------------------------ */
  console.log('🖐️ Drag state AFTER', {
    active: dragState?.active,
    dx: dragState?.dx,
    dir: dragState?.dir,
    raf: dragState?.raf
  });

  console.groupEnd();
}


function canMove(dir) {
  const next = currentIndex + dir;
  const ok = next >= 0 && next < ayahList.length;
  log('🔍 canMove', dir, ok);
  return ok;
}

/* ==========================================================
   BIND SWIPE
========================================================== */
function bindSwipe() {
  log('🧲 Binding swipe listeners');

  D.gestureLayer.addEventListener('pointerdown', onPointerDown);
  D.gestureLayer.addEventListener('pointermove', onPointerMove);
  D.gestureLayer.addEventListener('pointerup', onPointerUp);
  D.gestureLayer.addEventListener('pointercancel', cancelSwipe);

  // diagnostic: see what gestureLayer actually receives
D.gestureLayer.style.touchAction = D.gestureLayer.style.touchAction || 'pan-y';
D.gestureLayer.addEventListener('pointerdown', e => {
  console.log('[DIAG parent] pointerdown', e.type, e.clientX, e.clientY, 'defaultPrevented=', e.defaultPrevented);
}, { passive: true });
D.gestureLayer.addEventListener('pointermove', e => {
  console.log('[DIAG parent] pointermove', e.type, e.clientX, e.clientY, 'defaultPrevented=', e.defaultPrevented);
}, { passive: true });
D.gestureLayer.addEventListener('pointerup', e => {
  console.log('[DIAG parent] pointerup', e.type);
}, { passive: true });

}


/* ==========================================================
   Main Initialization
   ========================================================== */
async function init() {
  normalizeLearningJourney();
  bindUIActions();
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




