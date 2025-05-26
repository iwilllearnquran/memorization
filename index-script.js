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
  signInWithGoogle,
  logout,
  onAuthChange,
  persistProfile,
  getUserDoc,
  registerForNotifications,
  onForegroundMessage,
  getLastReadFromDb,
  updateLastRead
} from '/services//_private/firestoreService.js';

import {
  addGuestPoints,
  recordGuestStreak,
  getGuestLastRead,
  setGuestLastRead
} from '/services/localStorageSession.js';

import { StreakUI } from '/ui/StreakLogicAndUI.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { fetchSurahList } from '/services/quranApi.js';

// ————— Constants & State —————
const DEFAULT_SURAH = 1;
const DEFAULT_AYAH  = 1;

let surahData    = [];
let currentSurah = DEFAULT_SURAH;
let currentAyah  = DEFAULT_AYAH;

// Cached DOM elements
const D = {};

// ————— Utility: Get Surah Name by Number —————
async function resolveSurahName(num) {
  const list = await fetchSurahList();
  const entry = list.find(s => s.number === num);
  return entry ? entry.englishName : `Surah ${num}`;
}

// ————— Initialize Start/Resume Button —————
async function initStartButton() {
  const btn = D.startBtn;
  console.log('📍 initStartButton called; auth.currentUser =', auth.currentUser);

  // 1️⃣ Fetch last-read location
  let loc = null;
  try {
    if (auth.currentUser) {
      loc = await getLastReadFromDb();
    } else {
      loc = getGuestLastRead();
    }
  } catch (err) {
    console.error('❌ initStartButton → error fetching last-read:', err);
  }
  console.log('📍 initStartButton: last-read loc =', loc);

  // 2️⃣ Wire up click depending on whether we have a saved loc
  if (loc?.surah && loc?.ayah) {
    // Resume case
    const name = await resolveSurahName(loc.surah);
    console.log(`📍 Resuming from Surah ${loc.surah} Ayah ${loc.ayah} (${name})`);
    btn.textContent = `Resume from ${name} Ayah ${loc.ayah}`;
    btn.onclick = () => {
      console.log(`📍 [Button Click] loadAyah(${loc.surah}, ${loc.ayah})`);
      // show reader UI
      D.surahContainer.style.display = 'none';
      D.hero.style.display           = 'none';
      D.viewer.style.display         = 'block';
      D.dropdowns.style.display      = 'flex';
      loadAyah(loc.surah, loc.ayah);
    };
  } else {
    // Start Learning case
    console.log('📍 No last-read found; defaulting to start learning');
    btn.textContent = 'Start Learning';
    btn.onclick = () => {
      console.log(`📍 [Button Click] loadAyah(${DEFAULT_SURAH}, ${DEFAULT_AYAH})`);
      // show reader UI
      D.surahContainer.style.display = 'none';
      D.hero.style.display           = 'none';
      D.viewer.style.display         = 'block';
      D.dropdowns.style.display      = 'flex';
      loadAyah(DEFAULT_SURAH, DEFAULT_AYAH);
    };
  }
}




// ————— Load and Display a Specific Ayah —————
async function loadAyah(s, a) {
  currentSurah = s;
  currentAyah  = a;

  // Update dropdowns
  D.surahSelect.value = s;
  D.ayahSelect.innerHTML = '';
  const totalVerses = surahData.find(x => x.number === s)?.ayahCount || 0;
  for (let i = 1; i <= totalVerses; i++) {
    D.ayahSelect.append(new Option(i, i));
  }
  D.ayahSelect.value = a;

  // Load iframe content with fade animation
  D.iframe.classList.add('fade-out');
  setTimeout(() => {
    D.iframe.src = `ayahs/surah_${s}/ayah_${s}_${a}.html`;
    D.iframe.classList.remove('fade-out');
  }, 150);

  // Update navigation arrows
  updateArrowVisibility();

  // Persist last-read position
  if (auth.currentUser) {
    await updateLastRead(s, a);
  } else {
    setGuestLastRead(s, a);
  }
}

// ————— Render Surah Overview Grid & Dropdown —————
async function renderSurahOverview() {
  const chapters = await fetchSurahList();
  surahData = chapters;

  chapters.forEach(s => {
    // Dropdown option
    const opt = new Option(`${s.number}. ${s.englishName}`, s.number);
    D.surahSelect.append(opt);

  // Card element
  const card = document.createElement('div');
  card.className = 'surah-card';
  card.innerHTML = `
  <div class="surah-header">
    <span class="surah-number">Surah ${s.number}</span>
    <span class="surah-ayah-count">(${s.ayahCount} verses)</span>
  </div>
  <div class="surah-title">
    <span class="surah-english">${s.englishName}</span>
    <span class="surah-arabic">${s.arabicName}</span>
  </div>
  <div class="progress-bar">
    <div class="progress-fill" style="width:0%"></div>
    <div class="progress-label"><small>0% completed</small></div>
  </div>`;



    // Click handler: hide overview, show reader
    card.addEventListener('click', () => {
      D.surahContainer.style.display   = 'none';
      D.hero.style.display             = 'none';
      D.viewer.style.display           = 'block';
      D.dropdowns.style.display        = 'flex';
      loadAyah(s.number, 1);
    });

    D.surahContainer.append(card);
  });

  refreshAllProgress();
}

// ————— Update Navigation Arrow Visibility —————
function updateArrowVisibility() {
  const idx = surahData.findIndex(s => s.number === currentSurah);
  const max = surahData[idx]?.ayahCount || 0;
  D.prevArrow.style.display = (idx === 0 && currentAyah === 1) ? 'none' : 'block';
  D.nextArrow.style.display = (idx === surahData.length - 1 && currentAyah === max)
    ? 'none' : 'block';
}

// ————— Window-Level Navigation Shortcut —————
window.navigateAyah = dir => {
  const idx = surahData.findIndex(s => s.number === currentSurah);
  let ns = currentSurah;
  let na = currentAyah + dir;
  if (na < 1) {
    ns = surahData[idx - 1]?.number;
    na = surahData[idx - 1]?.ayahCount;
  } else if (na > (surahData[idx]?.ayahCount || 0)) {
    ns = surahData[idx + 1]?.number;
    na = 1;
  }
  if (ns && na) loadAyah(ns, na);
};

// ————— Game-Mode Toggle Helpers —————
function enableGameMode() {
  document.body.classList.add('game-mode');
  D.surahSelect.disabled = true;
  D.ayahSelect.disabled  = true;
  D.returnBtn.style.display = 'block';
}
function disableGameMode() {
  document.body.classList.remove('game-mode');
  D.surahSelect.disabled = false;
  D.ayahSelect.disabled  = false;
  D.returnBtn.style.display = 'none';
}

// ————— Iframe Message Listener (for game events) —————
window.addEventListener('message', async e => {
  const data = e.data || {};
  switch (data.type) {
    case 'gamesReady':
      enableGameMode();
      break;
    case 'gameExited':
      disableGameMode();
      break;
    case 'loginRequest':
      D.loginBtn.click();
      break;
    case 'persistStats': {
      const { score, recordStreak: shouldStreak } = data;
      if (!auth.currentUser) {
        addGuestPoints(score);
        if (shouldStreak) recordGuestStreak();
      } else {
        await addPointsToFirestore(score);
        if (shouldStreak) {
          const { oldLength, newLength, updated } = await recordStreak();
          D.iframe.contentWindow.postMessage({
            type: 'streakRecorded', oldLength, newLength, updated
          }, '*');
        }
      }
      break;
    }
  }
});

// ————— Bind UI Event Handlers —————
function bindUIActions() {
  // Cache DOM elements
  D.surahContainer = document.getElementById('surahContainer');
  D.hero           = document.getElementById('hero');
  D.viewer         = document.getElementById('viewer');
  D.dropdowns      = document.querySelector('.dropdowns');
  D.surahSelect    = document.getElementById('surahSelect');
  D.ayahSelect     = document.getElementById('ayahSelect');
  D.iframe         = document.getElementById('ayahViewer');
  D.prevArrow      = document.querySelector('.prev');
  D.nextArrow      = document.querySelector('.next');
  D.loginBtn       = document.getElementById('loginBtn');
  D.returnBtn      = document.getElementById('returnToAyah');
  D.startBtn       = document.getElementById('startLearningBtn');
  D.nameEl         = document.getElementById('userName');
  D.ptsEl         = document.getElementById('ajrPoints');
  D.streakEl       = document.getElementById('streakDisplay');
  D.closeBtn       = document.getElementById('drawerCloseBtn');
  D.drawer         = document.getElementById('profileDrawer');
  D.logoutBtn      = document.getElementById('logoutBtn');


  // Surah/Ayah dropdown change
  D.surahSelect.addEventListener('change', () => loadAyah(+D.surahSelect.value, 1));
  D.ayahSelect.addEventListener('change', () => loadAyah(currentSurah, +D.ayahSelect.value));

  // Drawer open/close
  D.loginBtn.addEventListener('click', () => {
  if (auth.currentUser) {
    // user is logged in → open/close profile drawer
    D.drawer.classList.toggle('open');
  } else {
    // not logged in → kick off the login flow
    signInWithGoogle();
  }
});
  D.closeBtn.addEventListener('click', () => D.drawer.classList.remove('open'));
  D.logoutBtn.addEventListener('click', () => { logout(); D.drawer.classList.remove('open'); });

  // Swipe to close drawer
  let touchStartX = 0;
  D.drawer.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].pageX; });
  D.drawer.addEventListener('touchend', e => {
    if (e.changedTouches[0].pageX - touchStartX < 50) D.drawer.classList.remove('open');
  });

  // Return from game
  D.returnBtn.addEventListener('click', () => {
    disableGameMode();
    loadAyah(currentSurah, currentAyah);
  });
}

// ————— Foreground FCM Message Handling —————
function setupForegroundMessaging() {
  onForegroundMessage(payload => {
    const { title, body } = payload.notification || {};
    console.log('🔔 FCM:', title, body);
    // TODO: Replace with in-app toast/snackbar
    showInAppToast(title, body);
  });
}

// ————— Auth State Change Handler —————
async function handleAuthChange(user) {
  refreshAllProgress();
  console.log('🔐 Auth state changed:', user ? user.displayName : 'Guest');




  if (!user) {
    // Guest UI
    D.nameEl.textContent = 'Guest User';
    D.ptsEl.textContent = localStorage.getItem('guestPoints') || '0';
    D.streakEl.textContent = `🔥${JSON.parse(localStorage.getItem('guestStreakHistory')||'[]').length}`;
    D.loginBtn.textContent = 'Login';
    return;
  }

      // Notify iframe of login state
    const fullName = user.displayName || '';
    const firstName = fullName.split(' ')[0];

    // Example: send it to the iframe on login
    if (D.iframe?.contentWindow) {
      D.iframe.contentWindow.postMessage({
        type:      'userLoggedIn',
        firstName
      }, '*');
    }

  // Real user logged in
  D.nameEl.textContent = user.displayName;
  D.loginBtn.textContent = '👤';

  // Transfer guest stats if new user
  const snap = await getUserDoc();
  const pointsLocal = +localStorage.getItem('guestPoints') || 0;
  const streakLocal = JSON.parse(localStorage.getItem('guestStreakHistory')||'[]');
  if (!snap.exists() && (pointsLocal||streakLocal.length)) {
    await saveStatsToFirestore({ score: pointsLocal, streakHistory: streakLocal });
    await persistProfile(user.displayName, user.email);
    localStorage.removeItem('guestPoints');
    localStorage.removeItem('guestStreakHistory');
  } else {
    await persistProfile(user.displayName, user.email);
  }

  // Load Firestore stats
  const data = (await getUserDoc()).data() || {};
  D.ptsEl.textContent    = data.ajrPoints || 0;
  D.streakEl.textContent = `🔥${(data.streakHistory||[]).length}`;
}

// ————— Progress Bar Refresh for Surah Cards —————
async function refreshAllProgress() {
  let completed = [];
  if (auth.currentUser) {
    const snap = await getUserDoc();
    completed = (snap.data().completedAyahs) || [];
  } else {
    completed = JSON.parse(localStorage.getItem('completedAyahs') || '[]');
  }

  document.querySelectorAll('.surah-card').forEach(card => {
    const num = +card.querySelector('.surah-number').textContent.replace('Surah ', '');
    const total = surahData.find(s => s.number === num)?.ayahCount || 0;
    const done  = completed.filter(x => x.surah === num).length;
    const pct   = total ? Math.round((done/total)*100) : 0;
    card.querySelector('.progress-fill').style.width = `${pct}%`;
    card.querySelector('.progress-label small').textContent = `${pct}% completed`;
  });
}

// ————— Prevent Screen Dim (Wake Lock) —————
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}

// ————— Main Initialization —————
async function init() {
  cacheDOM: bindUIActions();
  setupForegroundMessaging();
  onAuthChange(handleAuthChange);
  await renderSurahOverview();
  await initStartButton();
  StreakUI.init({ navSelector:'#streakDisplay', firebaseApp:firebase });
  refreshAllProgress();
  requestWakeLock();
}

document.addEventListener('DOMContentLoaded', init);
