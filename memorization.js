import { fetchSurahList } from './services/quranApi.js';
import {
  onAuthChange,
  getMemorizationData,
  saveMemorizationData,
  getUserDoc,
  logout
} from './services/_private/firestoreService.js';

const REQUIRED_LISTENS = 20;
const ALLOW_ALL_AYAHS = true;
const STORAGE_PROGRESS = 'memo_progress_v1';
const STORAGE_LISTENS = 'memo_listens_v1';
const STORAGE_LAST_PROGRESS = 'memo_last_progress_v1';
const STORAGE_LAST_MEMORIZED = 'memo_last_memorized_v1';
const STORAGE_PRACTICE_MODE = 'memo_practice_mode_v1';
const STORAGE_VIEW_STATE = 'memo_view_state_v1';
const STORAGE_RECITE_MATCH_MODE = 'memo_recite_match_mode_v1';
const MAX_ALIGN_EXPECTED_SPAN = 5;
const MAX_ALIGN_ACTUAL_SPAN = 3;
const SPEECH_TRANSLIT_ACCEPT_SIMILARITY = 0.5;
const PEEK_DURATION_MS = 1000;
const EXPECTED_HINT_WRONG_TRIES = 3;
const QURAN_TOTAL_AYAHS = 6236;
const USE_HOST_MAIN_NAV = false;
const FIRST_MEMO_AYAH = Object.freeze({
  surah: 1,
  ayah: 1,
  arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  translation: 'In the name of Allah, the Most Gracious, the Most Merciful.'
});
const RECITE_MATCH_MODE = Object.freeze({
  WORD: 'word',
  FULL: 'full'
});
const SPEECH_TOKEN_ALIASES = {
  '\u062E\u0627\u0644\u0648': '\u0642\u0627\u0644\u0648\u0627',
  '\u062E\u0627\u0644\u0648\u0627': '\u0642\u0627\u0644\u0648\u0627'
};
const SIMILAR_SOUND_GROUPS = [
  '\u0633\u0635\u062b',
  '\u0632\u0630\u0638\u0636',
  '\u062a\u0637',
  '\u062f\u0630',
  '\u062d\u0647',
  '\u0642\u0643\u062e\u063a',
  '\u0629\u0647',
  '\u0648\u0624',
  '\u0649\u064a\u0626'
];
const SIMILAR_SOUND_MAP = (() => {
  const map = {};
  SIMILAR_SOUND_GROUPS.forEach(group => {
    const chars = Array.from(group);
    chars.forEach(ch => {
      map[ch] = map[ch] || new Set();
      chars.forEach(match => map[ch].add(match));
    });
  });
  return map;
})();

const els = {
  welcome: document.getElementById('memoWelcome'),
  welcomeBrain: document.getElementById('memoWelcomeBrain'),
  main: document.getElementById('memoMain'),
  welcomeStartBtn: document.getElementById('memoWelcomeStartBtn'),
  welcomeStartLabel: document.getElementById('memoWelcomeStartLabel'),
  homeBtn: document.getElementById('memoHomeBtn'),
  menuBtn: document.getElementById('memoMenuBtn'),
  navSpeakerBtn: document.getElementById('memoNavSpeakerBtn'),
  navPrevBtn: document.getElementById('memoNavPrevBtn'),
  navNextBtn: document.getElementById('memoNavNextBtn'),
  navSketchSurah: document.getElementById('memoNavSketchSurah'),
  navSketchAyah: document.getElementById('memoNavSketchAyah'),
  navModeHost: document.getElementById('memoNavModeHost'),
  status: document.getElementById('memoStatus'),
  surahSelect: document.getElementById('memoSurahSelect'),
  ayahSelect: document.getElementById('memoAyahSelect'),
  lockMsg: document.getElementById('memoLockMsg'),
  lockOverlay: document.getElementById('memoLockOverlay'),
  wordsWrap: document.getElementById('memoWords'),
  learnNav: document.getElementById('memoNavLearnQuran'),
  playBtn: document.getElementById('memoPlayBtn'),
  playCount: document.getElementById('memoPlayCount'),
  progressFill: document.getElementById('memoProgressFill'),
  progressText: document.getElementById('memoProgressText'),
  startBtn: document.getElementById('memoStartBtn'),
  stopBtn: document.getElementById('memoStopBtn'),
  finalText: document.getElementById('memoFinalText'),
  interimText: document.getElementById('memoInterimText'),
  feedback: document.getElementById('memoFeedback'),
  expectedHint: document.getElementById('memoExpectedHint'),
  reciteLine: document.getElementById('memoReciteLine'),
  reciteWordModeBtn: document.getElementById('memoReciteWordModeBtn'),
  reciteFullModeBtn: document.getElementById('memoReciteFullModeBtn'),
  reciteSettingsBtn: document.getElementById('memoReciteSettingsBtn'),
  reciteSettingsPanel: document.getElementById('memoReciteSettingsPanel'),
  toggleMeaning: document.getElementById('memoToggleMeaning'),
  toggleGrammar: document.getElementById('memoToggleGrammar'),
  toggleExpectedAfterWrong: document.getElementById('memoToggleExpectedAfterWrong'),
  peekBtn: document.getElementById('memoPeekBtn'),
  practiceToggle: document.getElementById('memoPracticeToggle'),
  practicePanel: document.getElementById('memoPracticePanel'),
  practiceContent: document.getElementById('memoPracticeContent'),
  modal: document.getElementById('memoCompleteModal'),
  reviseBtn: document.getElementById('memoReviseBtn'),
  nextBtn: document.getElementById('memoNextBtn'),
  navStreakCount: document.getElementById('memoNavStreakCount'),
  welcomeName: document.getElementById('memoWelcomeName'),
  welcomeSubline: document.getElementById('memoWelcomeSubline'),
  welcomeQuranProgressRing: document.getElementById('memoWelcomeQuranProgressRing'),
  welcomeProgressRing: document.getElementById('memoWelcomeProgressRing'),
  welcomeProgressPct: document.getElementById('memoWelcomeProgressPct'),
  welcomeMemorized: document.getElementById('memoWelcomeMemorized'),
  welcomeTotalAyahs: document.getElementById('memoWelcomeTotalAyahs'),
  welcomeLastWhen: document.getElementById('memoWelcomeLastWhen'),
  welcomeLastTitle: document.getElementById('memoWelcomeLastTitle'),
  welcomeLastRef: document.getElementById('memoWelcomeLastRef'),
  welcomeLastArabic: document.getElementById('memoWelcomeLastArabic'),
  welcomeLastTranslation: document.getElementById('memoWelcomeLastTranslation'),
  techniqueListenBtn: document.getElementById('memoTechniqueListenBtn'),
  techniqueReciteBtn: document.getElementById('memoTechniqueReciteBtn'),
  techniqueWriteBtn: document.getElementById('memoTechniqueWriteBtn'),
  techniqueRepeatBtn: document.getElementById('memoTechniqueRepeatBtn'),
  profileDrawer: document.getElementById('memoProfileDrawer'),
  profileDrawerBackdrop: document.getElementById('memoProfileDrawerBackdrop'),
  profileDrawerCloseBtn: document.getElementById('memoProfileDrawerCloseBtn'),
  drawerSignOutBtn: document.getElementById('memoDrawerSignOutBtn'),
  drawerName: document.getElementById('memoDrawerName'),
  drawerStreak: document.getElementById('memoDrawerStreak'),
  drawerMemorized: document.getElementById('memoDrawerMemorized')
};

let surahList = [];
let current = { surah: 1, ayah: 1 };
let unlocked = { surah: 1, ayah: 1 };
let listenCounts = {};
let audio = null;
let audioQueue = 0;
let loadAyahRequestId = 0;
let recognition = null;
let listening = false;
let keepListening = false;
let recognitionRestartTimer = 0;
let expectedWords = [];
let expectedNormalized = [];
let expectedTranslit = [];
let revealIndex = 0;
let finalTranscript = '';
let lastFinalCount = 0;
let peekTimeout = null;
let interimPreview = '';
let memoUser = null;
let memoSyncTimer = 0;
let isHydratingMemo = false;
let welcomeBrainAnimation = null;
let reciteMatchMode = RECITE_MATCH_MODE.WORD;
let fullReciteIndex = 0;
let fullReciteTokens = [];
let memoSwipeStartX = 0;
let memoSwipeStartY = 0;
let memoSwipeTracking = false;
let memoSwipeLockUntil = 0;
let memoAyahNavInFlight = false;
let memoAyahNavToken = 0;
let memoDrawerOpen = false;
let memoWelcomeRenderToken = 0;
let memoHostNavMount = null;
let memoHostNavbarHiddenState = null;
const wrongTryCounts = new Map();
const viewState = {
  meaning: true,
  grammar: false,
  expectedAfterThreeWrong: true
};
const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';
const isNativeContainer = (() => {
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
const TAB_SYSTEM_BAR_COLORS = Object.freeze({
  learn: '#0a4d68',
  memo: '#0f766e',
  duas: '#8b5e00'
});

function renderWelcomeBrainFallback() {
  if (!els.welcomeBrain) return;
  if (els.welcomeBrain.querySelector('.memo-welcome-brain-fallback')) return;
  els.welcomeBrain.innerHTML = '';
  const icon = document.createElement('span');
  icon.className = 'material-icons-outlined memo-welcome-brain-fallback';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'psychology';
  els.welcomeBrain.appendChild(icon);
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function isValidHexColor(value) {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function sendSystemBarColor(color) {
  if (!isValidHexColor(color)) return;
  try {
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'SYSTEM_BAR_COLOR', color })
      );
    }
  } catch (_) {}
}

function getSystemBarColorForHref(href) {
  const value = String(href || '').toLowerCase();
  if (value.includes('tab=duas') || value.includes('/duas')) {
    return TAB_SYSTEM_BAR_COLORS.duas;
  }
  if (value.includes('memorization')) {
    return TAB_SYSTEM_BAR_COLORS.memo;
  }
  return TAB_SYSTEM_BAR_COLORS.learn;
}

function bindBottomNavSystemBarColor() {
  sendSystemBarColor(TAB_SYSTEM_BAR_COLORS.memo);
  const navLinks = document.querySelectorAll('.bottom-nav .bottom-nav-btn[href]');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      sendSystemBarColor(getSystemBarColorForHref(link.getAttribute('href')));
    });
  });
}

function stripArabicDiacritics(text) {
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
}

function normalize(text) {
  if (!text) return '';
  let t = text.trim();
  t = stripArabicDiacritics(t);
  t = t.replace(/[\u0640]/g, '');
  t = t.replace(/[\u0625\u0623\u0622\u0671]/g, '\u0627');
  t = t.replace(/\u0649/g, '\u064A');
  // Quranic orthography variants: normalize waw+ta form and collapse final ta marbuta/heh.
  t = t.replace(/\u0648\u0629\b/g, '\u0627\u0629');
  t = t.replace(/\u0629/g, '\u0647');
  t = t.replace(/[^\w\u0600-\u06FF\s]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

function tokenize(text) {
  const t = normalize(text);
  if (!t) return [];
  return t.split(' ').map(token => SPEECH_TOKEN_ALIASES[token] || token);
}

function tokenizeRaw(text) {
  return text ? text.trim().split(/\s+/).filter(Boolean) : [];
}

function ayahKey(surah, ayah) {
  return `${surah}:${ayah}`;
}

function compareAyah(a, b) {
  if (a.surah !== b.surah) return a.surah - b.surah;
  return a.ayah - b.ayah;
}

function getAdjacentAyah(delta) {
  if (!Array.isArray(surahList) || !surahList.length) return null;
  const sign = Number(delta) < 0 ? -1 : 1;
  const currentSurah = Number(current.surah) || 1;
  const currentAyah = Number(current.ayah) || 1;
  const surahIdx = surahList.findIndex(s => Number(s.number) === currentSurah);
  if (surahIdx < 0) return null;

  const ayahCount = Number(surahList[surahIdx].ayahCount) || 0;
  if (!ayahCount) return null;

  if (sign > 0) {
    if (currentAyah < ayahCount) return { surah: currentSurah, ayah: currentAyah + 1 };
    const nextSurah = surahList[surahIdx + 1];
    return nextSurah ? { surah: Number(nextSurah.number), ayah: 1 } : null;
  }

  if (currentAyah > 1) return { surah: currentSurah, ayah: currentAyah - 1 };
  const prevSurah = surahList[surahIdx - 1];
  if (!prevSurah) return null;
  const prevAyahCount = Number(prevSurah.ayahCount) || 1;
  return { surah: Number(prevSurah.number), ayah: prevAyahCount };
}

function isValidAyahRef(surah, ayah) {
  return Number.isInteger(surah) && surah > 0 && Number.isInteger(ayah) && ayah > 0;
}

function getStoredProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_PROGRESS);
    if (!raw) return { surah: 1, ayah: 1 };
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.surah || !parsed.ayah) return { surah: 1, ayah: 1 };
    return {
      surah: Number(parsed.surah) || 1,
      ayah: Number(parsed.ayah) || 1
    };
  } catch {
    return { surah: 1, ayah: 1 };
  }
}

function setStoredProgress(next) {
  localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(next));
  if (!isHydratingMemo) scheduleMemoSync();
}

function getStoredListenCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_LISTENS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setStoredListenCounts(next) {
  localStorage.setItem(STORAGE_LISTENS, JSON.stringify(next));
  if (!isHydratingMemo) scheduleMemoSync();
}

function getStoredLastProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_PROGRESS);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getStoredLastMemorized() {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_MEMORIZED);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setStoredLastMemorized(next) {
  try {
    localStorage.setItem(STORAGE_LAST_MEMORIZED, JSON.stringify(next));
  } catch {}
  if (!isHydratingMemo) scheduleMemoSync();
}

function buildMemoPayload() {
  return {
    unlocked,
    listens: listenCounts,
    lastProgress: getStoredLastProgress(),
    lastMemorized: getStoredLastMemorized()
  };
}

function scheduleMemoSync() {
  if (!memoUser || memoUser.isAnonymous) return;
  if (memoSyncTimer) {
    window.clearTimeout(memoSyncTimer);
  }
  memoSyncTimer = window.setTimeout(async () => {
    memoSyncTimer = 0;
    try {
      await saveMemorizationData(buildMemoPayload());
    } catch (err) {
      console.warn('[MEMO] Failed to sync memorization', err);
    }
  }, 1200);
}

function getLastLearnedAyah() {
  try {
    const raw = localStorage.getItem('lastReadAyah');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const surah = Number(parsed?.surah);
    const ayah = Number(parsed?.ayah);
    if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
    return { surah, ayah };
  } catch {
    return null;
  }
}

function updateLearnNavLink() {
  if (!els.learnNav) return;
  const last = getLastLearnedAyah();
  if (!last) {
    els.learnNav.setAttribute('href', '/index.html');
    return;
  }
  els.learnNav.setAttribute('href', `/index.html?surah=${last.surah}&ayah=${last.ayah}`);
}

function enforceWelcomeLayoutCentering() {
  if (!document.body.classList.contains('memo-welcome-mode')) return;

  const shell = document.getElementById('memoShell');
  if (shell) {
    shell.style.maxWidth = '536px';
    shell.style.width = 'min(536px, calc(100% - 40px))';
    shell.style.marginLeft = 'auto';
    shell.style.marginRight = 'auto';
    shell.style.left = 'auto';
    shell.style.transform = 'none';
  }

  const centeredBlocks = document.querySelectorAll(
    '#memoWelcome .memo-home-welcome, #memoWelcome .memo-home-card'
  );
  centeredBlocks.forEach(node => {
    node.style.maxWidth = '536px';
    node.style.marginLeft = 'auto';
    node.style.marginRight = 'auto';
  });
}

function syncWelcomeViewportLock() {
  const inWelcomeMode = document.body.classList.contains('memo-welcome-mode');
  document.documentElement.classList.toggle('memo-welcome-locked', inWelcomeMode);
}

function getGuestStreakDays() {
  try {
    const raw = JSON.parse(localStorage.getItem('guestStreakHistory') || '[]');
    return Array.isArray(raw) ? raw.length : 0;
  } catch {
    return 0;
  }
}

function countMemorizedAyahs(listensMap) {
  if (!listensMap || typeof listensMap !== 'object') return 0;
  return Object.values(listensMap).reduce((sum, value) => {
    const listens = Number(value) || 0;
    return sum + (listens >= REQUIRED_LISTENS ? 1 : 0);
  }, 0);
}

function getSurahAyahCount(surahNumber) {
  const surah = Number(surahNumber) || 1;
  const info = Array.isArray(surahList)
    ? surahList.find(item => Number(item?.number) === surah)
    : null;
  return Number(info?.ayahCount) || 0;
}

function countMemorizedAyahsInSurah(listensMap, surahNumber, ayahCount) {
  if (!listensMap || typeof listensMap !== 'object') return 0;
  const surah = Number(surahNumber) || 1;
  const totalAyahs = Number(ayahCount) || 0;
  if (totalAyahs <= 0) return 0;
  let memorized = 0;
  for (let ayah = 1; ayah <= totalAyahs; ayah += 1) {
    const listens = Number(listensMap[ayahKey(surah, ayah)]) || 0;
    if (listens >= REQUIRED_LISTENS) memorized += 1;
  }
  return memorized;
}

function getDisplayName(user, fallbackName = '') {
  const explicit = String(fallbackName || '').trim();
  if (explicit) return explicit;
  const displayName = String(user?.displayName || '').trim();
  if (displayName) return displayName;
  const emailPrefix = String(user?.email || '').split('@')[0].trim();
  if (emailPrefix) return emailPrefix;
  return user?.isAnonymous ? 'Guest' : 'Friend';
}

function getFirstName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return 'Friend';
  return raw.split(/\s+/)[0] || 'Friend';
}

function formatProgressPctLabel(value) {
  const pct = clamp(Number(value) || 0, 0, 100);
  if (pct === 0 || pct === 100) return `${Math.round(pct)}%`;
  if (pct < 1) return `${pct.toFixed(1)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

function getSurahDisplayName(surahNumber) {
  const number = Number(surahNumber) || 1;
  const match = Array.isArray(surahList)
    ? surahList.find(item => Number(item?.number) === number)
    : null;
  if (!match) return `Surah ${number}`;
  return String(match.englishName || match.arabicName || `Surah ${number}`);
}

function formatLastWhen(timestampMs) {
  const ts = Number(timestampMs) || 0;
  if (!ts) return 'Today';
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return 'Today';

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startToday - startDate) / 86400000);
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  });
}

function setMemoProfileDrawerOpen(open) {
  const isOpen = Boolean(open);
  memoDrawerOpen = isOpen;
  if (els.profileDrawer) {
    els.profileDrawer.classList.toggle('is-open', isOpen);
    els.profileDrawer.setAttribute('aria-hidden', String(!isOpen));
  }
  if (els.profileDrawerBackdrop) {
    if (isOpen) {
      els.profileDrawerBackdrop.removeAttribute('hidden');
    } else {
      els.profileDrawerBackdrop.setAttribute('hidden', '');
    }
  }
  document.body.classList.toggle('memo-profile-drawer-open', isOpen);
}

function isValidStoredAyahRef(ref) {
  return isValidAyahRef(Number(ref?.surah), Number(ref?.ayah));
}

function getPreviousAyahRefFrom(surahRef, ayahRef) {
  const surah = Number(surahRef);
  const ayah = Number(ayahRef);
  if (!isValidAyahRef(surah, ayah)) return null;
  if (!Array.isArray(surahList) || !surahList.length) return null;

  if (ayah > 1) return { surah, ayah: ayah - 1 };
  const idx = surahList.findIndex(item => Number(item?.number) === surah);
  if (idx <= 0) return null;
  const prevSurah = surahList[idx - 1];
  const prevSurahNum = Number(prevSurah?.number);
  const prevAyahCount = Number(prevSurah?.ayahCount);
  if (!isValidAyahRef(prevSurahNum, prevAyahCount)) return null;
  return { surah: prevSurahNum, ayah: prevAyahCount };
}

function resolveBestLastMemorizedRef(listensMap) {
  const storedMem = getStoredLastMemorized();
  if (isValidStoredAyahRef(storedMem)) {
    return {
      surah: Number(storedMem.surah),
      ayah: Number(storedMem.ayah),
      timestamp: Number(storedMem.timestamp) || 0,
      isMemorized: true
    };
  }

  const progress = getStoredLastProgress();
  if (isValidStoredAyahRef(progress)) {
    const progressKey = ayahKey(Number(progress.surah), Number(progress.ayah));
    const listenCount = Number(listensMap?.[progressKey]) || 0;
    if (listenCount >= REQUIRED_LISTENS || (Number(progress.percent) || 0) >= 100) {
      return {
        surah: Number(progress.surah),
        ayah: Number(progress.ayah),
        timestamp: Number(progress.timestamp) || 0,
        isMemorized: true
      };
    }
  }

  const unlockedRef = getStoredProgress();
  const completedRefs = Object.entries(listensMap || {})
    .filter(([, value]) => (Number(value) || 0) >= REQUIRED_LISTENS)
    .map(([key]) => {
      const [s, a] = String(key).split(':').map(Number);
      return isValidAyahRef(s, a) ? { surah: s, ayah: a } : null;
    })
    .filter(Boolean);
  if (completedRefs.length) {
    completedRefs.sort(compareAyah);
    const latest = completedRefs[completedRefs.length - 1];
    return { surah: latest.surah, ayah: latest.ayah, timestamp: 0, isMemorized: true };
  }

  if (isValidStoredAyahRef(unlockedRef)) {
    const prev = getPreviousAyahRefFrom(unlockedRef.surah, unlockedRef.ayah);
    if (prev) {
      const key = ayahKey(prev.surah, prev.ayah);
      const listens = Number(listensMap?.[key]) || 0;
      if (listens >= REQUIRED_LISTENS) {
        return { surah: prev.surah, ayah: prev.ayah, timestamp: 0, isMemorized: true };
      }
    }
  }

  return {
    surah: Number(unlockedRef?.surah) || 1,
    ayah: Number(unlockedRef?.ayah) || 1,
    timestamp: 0,
    isMemorized: false
  };
}

function truncateToWordLimit(text, maxWords = 8) {
  const raw = String(text || '').trim();
  if (!raw) return '--';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return raw;
  return `${words.slice(0, maxWords).join(' ')} ...`;
}

async function fetchWelcomeLastAyahText(surah, ayah) {
  const targetSurah = Number(surah) || 1;
  const targetAyah = Number(ayah) || 1;
  try {
    const { wordBlocks } = await fetchAyahContent(targetSurah, targetAyah);
    const arabic = wordBlocks
      .map(block => block.querySelector('.word-text')?.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ');
    const translation = wordBlocks
      .map(block => (
        block.querySelector('.metadata .translation.toggle-translation')?.textContent?.trim() ||
        block.querySelector('.metadata .translation')?.textContent?.trim() ||
        ''
      ))
      .filter(Boolean)
      .join(' ');
    return {
      arabic: arabic || '--',
      translation: translation || '--'
    };
  } catch {
    return { arabic: '--', translation: '--' };
  }
}

async function getWelcomeSnapshot() {
  const activeSurah = Number(current?.surah) || Number(unlocked?.surah) || 1;
  const effectiveListens = (listenCounts && typeof listenCounts === 'object')
    ? { ...listenCounts }
    : {};
  const inferredLast = resolveBestLastMemorizedRef(effectiveListens);

  const snapshot = {
    fullName: 'Friend',
    firstName: 'Friend',
    streakDays: getGuestStreakDays(),
    memorizedAyahs: countMemorizedAyahs(effectiveListens),
    totalAyahs: QURAN_TOTAL_AYAHS,
    lastSurah: Number(inferredLast?.surah) || 1,
    lastAyah: Number(inferredLast?.ayah) || 1,
    lastTimestamp: Number(inferredLast?.timestamp) || 0,
    hasMemorizedAyah: Boolean(inferredLast?.isMemorized),
    activeSurah,
    surahAyahCount: getSurahAyahCount(activeSurah),
    surahMemorizedAyahs: 0
  };
  snapshot.surahMemorizedAyahs = countMemorizedAyahsInSurah(
    effectiveListens,
    snapshot.activeSurah,
    snapshot.surahAyahCount
  );

  if (memoUser && !memoUser.isAnonymous) {
    snapshot.fullName = getDisplayName(memoUser);
    snapshot.firstName = getFirstName(snapshot.fullName);
    try {
      const snap = await getUserDoc(memoUser);
      if (snap?.exists()) {
        const data = snap.data() || {};
        snapshot.fullName = getDisplayName(memoUser, data.name);
        snapshot.firstName = getFirstName(snapshot.fullName);
        if (Array.isArray(data.streakHistory)) {
          snapshot.streakDays = data.streakHistory.length;
        }
        const memoData = data.memorization;
        if (memoData?.listens && typeof memoData.listens === 'object') {
          Object.entries(memoData.listens).forEach(([key, value]) => {
            const remoteCount = Number(value) || 0;
            const localCount = Number(effectiveListens[key]) || 0;
            effectiveListens[key] = Math.max(localCount, remoteCount);
          });
        }
        const remoteLastMem = memoData?.lastMemorized;
        const remoteLast = isValidStoredAyahRef(remoteLastMem)
          ? remoteLastMem
          : memoData?.lastProgress;
        const remoteLastTs = Number(remoteLast?.timestamp) || 0;
        const remoteLastKey = isValidStoredAyahRef(remoteLast)
          ? ayahKey(Number(remoteLast.surah), Number(remoteLast.ayah))
          : '';
        const remoteListensForLast = Number(effectiveListens?.[remoteLastKey]) || 0;
        const remoteLooksMemorized =
          remoteListensForLast >= REQUIRED_LISTENS ||
          (Number(remoteLast?.percent) || 0) >= 100;
        if (
          isValidStoredAyahRef(remoteLast) &&
          remoteLooksMemorized &&
          remoteLastTs >= snapshot.lastTimestamp
        ) {
          snapshot.lastSurah = Number(remoteLast.surah);
          snapshot.lastAyah = Number(remoteLast.ayah);
          snapshot.lastTimestamp = remoteLastTs;
          snapshot.hasMemorizedAyah = true;
        }
      }
    } catch (err) {
      console.warn('[MEMO] Failed to load welcome profile snapshot', err);
    }
  } else {
    snapshot.fullName = 'Guest';
    snapshot.firstName = 'Guest';
  }

  snapshot.memorizedAyahs = countMemorizedAyahs(effectiveListens);
  snapshot.hasMemorizedAyah = snapshot.hasMemorizedAyah || snapshot.memorizedAyahs > 0;
  snapshot.surahAyahCount = getSurahAyahCount(snapshot.activeSurah);
  snapshot.surahMemorizedAyahs = countMemorizedAyahsInSurah(
    effectiveListens,
    snapshot.activeSurah,
    snapshot.surahAyahCount
  );

  const quranRatio = snapshot.totalAyahs > 0
    ? (snapshot.memorizedAyahs / snapshot.totalAyahs)
    : 0;
  const surahRatio = snapshot.surahAyahCount > 0
    ? (snapshot.surahMemorizedAyahs / snapshot.surahAyahCount)
    : 0;
  snapshot.quranProgressPct = clamp(Number((quranRatio * 100).toFixed(3)), 0, 100);
  snapshot.surahProgressPct = clamp(Number((surahRatio * 100).toFixed(3)), 0, 100);

  return snapshot;
}

function applyWelcomeSnapshot(snapshot) {
  if (!snapshot) return;
  const hasMemorized = Boolean(snapshot.hasMemorizedAyah) && isValidAyahRef(snapshot.lastSurah, snapshot.lastAyah);
  const startSurahName = getSurahDisplayName(FIRST_MEMO_AYAH.surah);

  if (els.welcomeName) {
    els.welcomeName.textContent = snapshot.firstName || 'Friend';
  }
  if (els.navStreakCount) {
    els.navStreakCount.textContent = String(snapshot.streakDays || 0);
  }
  if (els.welcomeMemorized) {
    els.welcomeMemorized.textContent = String(snapshot.memorizedAyahs || 0);
  }
  if (els.welcomeTotalAyahs) {
    els.welcomeTotalAyahs.textContent = String(snapshot.surahAyahCount || 0);
  }
  if (els.welcomeProgressPct) {
    els.welcomeProgressPct.textContent = formatProgressPctLabel(snapshot.surahProgressPct);
  }
  if (els.welcomeLastTitle) {
    els.welcomeLastTitle.textContent = hasMemorized ? 'Last Ayah' : 'Begin your memorization journey';
  }
  if (els.welcomeLastWhen) {
    els.welcomeLastWhen.textContent = hasMemorized ? formatLastWhen(snapshot.lastTimestamp) : '';
    els.welcomeLastWhen.style.display = hasMemorized ? '' : 'none';
  }
  if (els.welcomeLastRef) {
    if (hasMemorized) {
      const surahName = getSurahDisplayName(snapshot.lastSurah);
      els.welcomeLastRef.textContent = `Surah ${snapshot.lastSurah}: ${surahName} - Ayah ${snapshot.lastAyah}`;
    } else {
      els.welcomeLastRef.textContent = `Surah ${FIRST_MEMO_AYAH.surah}: ${startSurahName} - Ayah ${FIRST_MEMO_AYAH.ayah}`;
    }
  }
  if (els.welcomeLastArabic) {
    if (!hasMemorized) {
      els.welcomeLastArabic.textContent = truncateToWordLimit(FIRST_MEMO_AYAH.arabic, 8);
    }
    els.welcomeLastArabic.style.display = '';
  }
  if (els.welcomeLastTranslation) {
    if (!hasMemorized) {
      els.welcomeLastTranslation.textContent = truncateToWordLimit(FIRST_MEMO_AYAH.translation, 8);
    }
    els.welcomeLastTranslation.style.display = '';
  }
  if (els.welcomeStartLabel) {
    els.welcomeStartLabel.textContent = hasMemorized
      ? `Resume from Surah ${snapshot.lastSurah}:${snapshot.lastAyah}`
      : 'Start Memorizing';
  }
  if (els.drawerName) {
    els.drawerName.textContent = snapshot.fullName || 'Guest';
  }
  if (els.drawerStreak) {
    els.drawerStreak.textContent = String(snapshot.streakDays || 0);
  }
  if (els.drawerMemorized) {
    els.drawerMemorized.textContent = String(snapshot.memorizedAyahs || 0);
  }

  const setProgressRing = (ringEl, pctValue) => {
    if (!ringEl) return;
    const radius = Number(ringEl.getAttribute('r')) || 68;
    const circumference = 2 * Math.PI * radius;
    const pct = clamp(Number(pctValue) || 0, 0, 100);
    const offset = circumference * (1 - pct / 100);
    ringEl.style.strokeDasharray = String(circumference);
    ringEl.style.strokeDashoffset = String(offset);
  };
  setProgressRing(els.welcomeQuranProgressRing, snapshot.quranProgressPct);
  setProgressRing(els.welcomeProgressRing, snapshot.surahProgressPct);
}

async function refreshWelcomeDashboard() {
  const renderToken = ++memoWelcomeRenderToken;
  const snapshot = await getWelcomeSnapshot();
  if (renderToken !== memoWelcomeRenderToken) return;
  applyWelcomeSnapshot(snapshot);

  const hasMemorized = Boolean(snapshot.hasMemorizedAyah) && isValidAyahRef(snapshot.lastSurah, snapshot.lastAyah);
  const previewSurah = hasMemorized ? snapshot.lastSurah : FIRST_MEMO_AYAH.surah;
  const previewAyah = hasMemorized ? snapshot.lastAyah : FIRST_MEMO_AYAH.ayah;
  if (!isValidAyahRef(previewSurah, previewAyah)) return;
  const preview = await fetchWelcomeLastAyahText(previewSurah, previewAyah);
  if (renderToken !== memoWelcomeRenderToken) return;
  const previewArabic = preview.arabic && preview.arabic !== '--'
    ? preview.arabic
    : FIRST_MEMO_AYAH.arabic;
  const previewTranslation = preview.translation && preview.translation !== '--'
    ? preview.translation
    : FIRST_MEMO_AYAH.translation;
  if (els.welcomeLastArabic) {
    els.welcomeLastArabic.textContent = truncateToWordLimit(previewArabic, 8);
  }
  if (els.welcomeLastTranslation) {
    els.welcomeLastTranslation.textContent = truncateToWordLimit(previewTranslation, 8);
  }
}

function openMemorizationWorkspace() {
  setMemoProfileDrawerOpen(false);
  if (els.welcome) {
    els.welcome.classList.add('is-hidden');
    els.welcome.setAttribute('aria-hidden', 'true');
  }
  if (els.main) {
    els.main.classList.remove('is-hidden');
    els.main.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.remove('memo-welcome-mode');
  document.body.classList.add('memo-sketch-mode');
  syncWelcomeViewportLock();
  setHostMainNavbarHidden(true);
  if (USE_HOST_MAIN_NAV) {
    hydrateMemoNavIntoMain();
  } else {
    const memoNavBar = document.getElementById('memoNavBar');
    document.body.classList.remove('memo-host-mounted');
    document.body.classList.remove('memo-nav-fallback');
    if (memoNavBar) memoNavBar.style.display = '';
  }
  syncMemoMenuButtonMode();
  updateSketchNavMeta();
}

function openMemorizationWelcome() {
  setMemoProfileDrawerOpen(false);
  stopListening();
  setHostMainNavbarHidden(false);
  restoreMemoNavFromMain();
  if (els.main) {
    els.main.classList.add('is-hidden');
    els.main.setAttribute('aria-hidden', 'true');
  }
  if (els.welcome) {
    els.welcome.classList.remove('is-hidden');
    els.welcome.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.remove('memo-sketch-mode');
  document.body.classList.add('memo-welcome-mode');
  syncWelcomeViewportLock();
  syncMemoMenuButtonMode();
  enforceWelcomeLayoutCentering();
  refreshWelcomeDashboard();
}

function syncMemoMenuButtonMode() {
  const icon = els.menuBtn?.querySelector('.material-icons-outlined');
  if (!els.menuBtn || !icon) return;
  if (document.body.classList.contains('memo-sketch-mode')) {
    icon.textContent = 'close';
    els.menuBtn.setAttribute('aria-label', 'Back to memorization home');
    return;
  }
  icon.textContent = 'menu';
  els.menuBtn.setAttribute('aria-label', 'Menu');
}

function updateSketchNavMeta() {
  const currentSurah = Number(current?.surah) || 1;
  const currentAyah = Number(current?.ayah) || 1;
  const surahInfo = Array.isArray(surahList)
    ? surahList.find(s => Number(s?.number) === currentSurah)
    : null;

  if (els.navSketchSurah) {
    const name = String(surahInfo?.englishName || `Surah ${currentSurah}`);
    els.navSketchSurah.textContent = `Surah ${name}`;
  }
  if (els.navSketchAyah) {
    els.navSketchAyah.textContent = `Ayah ${currentAyah}`;
  }

  const prev = getAdjacentAyah(-1);
  const next = getAdjacentAyah(1);
  if (els.navPrevBtn) els.navPrevBtn.disabled = !prev;
  if (els.navNextBtn) els.navNextBtn.disabled = !next;
}

function mergeMemorizationState(localData, remoteData) {
  const merged = {
    unlocked: localData.unlocked || { surah: 1, ayah: 1 },
    listens: { ...(localData.listens || {}) },
    lastProgress: localData.lastProgress || null,
    lastMemorized: localData.lastMemorized || null
  };

  if (remoteData?.unlocked) {
    merged.unlocked =
      compareAyah(remoteData.unlocked, merged.unlocked) > 0
        ? remoteData.unlocked
        : merged.unlocked;
  }

  if (remoteData?.listens) {
    Object.entries(remoteData.listens).forEach(([key, value]) => {
      const next = Number(value) || 0;
      const prev = Number(merged.listens[key]) || 0;
      if (next > prev) {
        merged.listens[key] = next;
      }
    });
  }

  if (remoteData?.lastProgress) {
    const incoming = remoteData.lastProgress;
    const current = merged.lastProgress;
    if (!current || (incoming?.timestamp || 0) > (current?.timestamp || 0)) {
      merged.lastProgress = incoming;
    }
  }

  if (remoteData?.lastMemorized) {
    const incoming = remoteData.lastMemorized;
    const current = merged.lastMemorized;
    if (!current || (incoming?.timestamp || 0) > (current?.timestamp || 0)) {
      merged.lastMemorized = incoming;
    }
  }

  return merged;
}

async function hydrateMemorizationFromDb() {
  if (!memoUser || memoUser.isAnonymous) return;
  try {
    isHydratingMemo = true;
    const remoteMemo = await getMemorizationData();
    if (!remoteMemo) {
      isHydratingMemo = false;
      return;
    }

    const localMemo = {
      unlocked: getStoredProgress(),
      listens: getStoredListenCounts(),
      lastProgress: getStoredLastProgress(),
      lastMemorized: getStoredLastMemorized()
    };
    const merged = mergeMemorizationState(localMemo, remoteMemo);

    unlocked = merged.unlocked || unlocked;
    listenCounts = merged.listens || listenCounts;
    setStoredProgress(unlocked);
    setStoredListenCounts(listenCounts);
    if (merged.lastProgress) {
      localStorage.setItem(STORAGE_LAST_PROGRESS, JSON.stringify(merged.lastProgress));
    }
    if (merged.lastMemorized) {
      localStorage.setItem(STORAGE_LAST_MEMORIZED, JSON.stringify(merged.lastMemorized));
    }
    buildSurahOptions();
    buildAyahOptions(current.surah);
    updateListenUI();
  } catch (err) {
    console.warn('[MEMO] Failed to hydrate memorization', err);
  } finally {
    isHydratingMemo = false;
    scheduleMemoSync();
    refreshWelcomeDashboard();
  }
}

function setPracticeOpen(isOpen) {
  if (!els.practicePanel || !els.practiceToggle) return;
  els.practicePanel.classList.toggle('is-open', isOpen);
  els.practicePanel.setAttribute('aria-hidden', String(!isOpen));
  els.practiceToggle.classList.toggle('is-open', isOpen);
  els.practiceToggle.setAttribute('aria-expanded', String(isOpen));
}

function setLastProgressSnapshot() {
  const total = expectedWords.length;
  const percent = total ? Math.round((revealIndex / total) * 100) : 0;
  const payload = {
    surah: current.surah,
    ayah: current.ayah,
    revealed: revealIndex,
    total,
    percent,
    timestamp: Date.now()
  };
  localStorage.setItem(STORAGE_LAST_PROGRESS, JSON.stringify(payload));
  if (!isHydratingMemo) scheduleMemoSync();
}

function shouldUpdateProgressSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_PROGRESS);
    if (!raw) return revealIndex > 0;
    const parsed = JSON.parse(raw);
    return Number(parsed?.surah) === current.surah && Number(parsed?.ayah) === current.ayah;
  } catch {
    return revealIndex > 0;
  }
}

function setStatus(text, isError = false) {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.style.background = isError ? '#fdeaea' : '#e9eef3';
  els.status.style.color = isError ? '#b33a3a' : '#6b7a86';
}

function updateToggleButton(btn, isOn) {
  if (!btn) return;
  btn.classList.toggle('is-on', isOn);
  btn.classList.toggle('is-off', !isOn);
  btn.setAttribute('aria-pressed', String(isOn));
}

function applyViewState() {
  const root = document.documentElement;
  root.classList.toggle('hide-word-translation', !viewState.meaning);
  root.classList.toggle('hide-grammar', !viewState.grammar);
  updateToggleButton(els.toggleMeaning, viewState.meaning);
  updateToggleButton(els.toggleGrammar, viewState.grammar);
  updateToggleButton(els.toggleExpectedAfterWrong, viewState.expectedAfterThreeWrong);
  try {
    localStorage.setItem(STORAGE_VIEW_STATE, JSON.stringify(viewState));
  } catch {}
  updateExpectedWord();
}

function setMemoListeningUI(isListeningNow) {
  const active = Boolean(isListeningNow);
  document.body.classList.toggle('memo-listening', active);
  if (!els.startBtn) return;
  const icon = els.startBtn.querySelector('.material-icons-outlined');
  if (icon) {
    icon.textContent = active ? 'stop_circle' : 'mic';
  }
  els.startBtn.setAttribute('aria-label', active ? 'Stop recitation' : 'Start recitation');
}

function showFeedback(text, isError = false) {
  els.feedback.textContent = text || '';
  els.feedback.style.color = isError ? '#b33a3a' : '#2b8a5a';
}

function setLastMatchedWord(word) {
  void word;
}

function setExpectedHintText(text) {
  if (!els.expectedHint) return;
  const msg = String(text || '').trim();
  els.expectedHint.textContent = msg;
  els.expectedHint.classList.toggle('is-hidden', msg.length === 0);
}

function clearWrongTriesForIndex(idx) {
  wrongTryCounts.delete(Number(idx));
}

function registerWrongTryForCurrentWord() {
  if (revealIndex >= expectedWords.length) return;
  const idx = Number(revealIndex);
  const prev = wrongTryCounts.get(idx) || 0;
  wrongTryCounts.set(idx, prev + 1);
  updateExpectedWord();
}

function updateExpectedWord() {
  if (!els.expectedHint) return;
  if (!viewState.expectedAfterThreeWrong || isFullAyahReciteMode()) {
    setExpectedHintText('');
    return;
  }
  if (!expectedWords.length || revealIndex >= expectedWords.length) {
    setExpectedHintText('');
    return;
  }
  const tries = wrongTryCounts.get(Number(revealIndex)) || 0;
  if (tries < EXPECTED_HINT_WRONG_TRIES) {
    setExpectedHintText('');
    return;
  }
  setExpectedHintText(`Expected: ${expectedWords[revealIndex]}`);
}

function hasCompleteSpeechTranslitReference() {
  return (
    expectedTranslit.length === expectedWords.length &&
    expectedTranslit.length > 0 &&
    expectedTranslit.every(Boolean)
  );
}

function isFullAyahReciteMode() {
  return reciteMatchMode === RECITE_MATCH_MODE.FULL;
}

function renderFullReciteLine() {
  if (!els.reciteLine) return;
  if (!fullReciteTokens.length) {
    els.reciteLine.classList.add('is-empty');
    els.reciteLine.textContent = 'Speak full ayah...';
    return;
  }

  const tokens = fullReciteTokens.map((token, idx) => ({
    key: `spoken-${idx}`,
    text: token.text,
    status: token.status
  }));

  const frag = document.createDocumentFragment();
  tokens.forEach((token, idx) => {
    const chip = document.createElement('span');
    chip.className = `memo-recite-token is-${token.status}`;
    chip.textContent = token.text;
    frag.appendChild(chip);
    if (idx < tokens.length - 1) {
      frag.appendChild(document.createTextNode(' '));
    }
  });

  els.reciteLine.classList.remove('is-empty');
  els.reciteLine.innerHTML = '';
  els.reciteLine.appendChild(frag);
}

function resetFullReciteState() {
  fullReciteIndex = 0;
  fullReciteTokens = [];
  renderFullReciteLine();
}

function rebuildFullReciteFromTokens(rawTokens) {
  const nextTokens = [];
  let idx = 0;
  for (let i = 0; i < rawTokens.length; i += 1) {
    const rawToken = rawTokens[i];
    const normalizedToken = normalize(rawToken).replace(/\s+/g, '');
    if (!normalizedToken) continue;

    const expected = expectedNormalized[idx] || '';
    const expectedTranslitNorm = expectedTranslit[idx] || '';
    const matches =
      (expected && (normalizedToken === expected || isFuzzyMatch(expected, normalizedToken))) ||
      isTranslitSpeechMatch(expectedTranslitNorm, rawToken);

    if (matches) {
      nextTokens.push({
        text: expectedWords[idx],
        status: 'correct'
      });
      idx += 1;
      continue;
    }

    // Wrong word: mark red and proceed forward to keep sequence moving.
    nextTokens.push({
      text: rawToken,
      status: 'wrong'
    });
    idx += 1;

    if (idx >= expectedWords.length) {
      break;
    }
  }

  fullReciteTokens = nextTokens;
  fullReciteIndex = idx;
  renderFullReciteLine();
  if (fullReciteIndex >= expectedWords.length) {
    showFeedback('Ayah complete.', false);
    stopListening();
  }
}

function applyReciteMatchModeUI() {
  const fullMode = isFullAyahReciteMode();
  updateToggleButton(els.reciteWordModeBtn, !fullMode);
  updateToggleButton(els.reciteFullModeBtn, fullMode);

  if (els.expectedHint) {
    els.expectedHint.classList.toggle('is-hidden', fullMode || !viewState.expectedAfterThreeWrong);
  }
  if (els.wordsWrap) {
    els.wordsWrap.classList.remove('is-hidden');
  }
  if (els.reciteLine) {
    els.reciteLine.classList.toggle('is-visible', fullMode);
  }
  if (els.peekBtn) {
    const locked = isLockedAyah(current.surah, current.ayah);
    els.peekBtn.disabled = locked;
  }

  if (fullMode) {
    renderFullReciteLine();
  } else if (els.reciteLine) {
    els.reciteLine.classList.add('is-empty');
    els.reciteLine.textContent = '';
  }
}

function setReciteMatchMode(mode, options = {}) {
  const nextMode = mode === RECITE_MATCH_MODE.FULL
    ? RECITE_MATCH_MODE.FULL
    : RECITE_MATCH_MODE.WORD;
  const persist = options.persist !== false;
  reciteMatchMode = nextMode;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_RECITE_MATCH_MODE, nextMode);
    } catch {}
  }
  resetFullReciteState();
  applyReciteMatchModeUI();
}

function resetTranscript() {
  finalTranscript = '';
  lastFinalCount = 0;
  interimPreview = '';
  if (els.finalText) els.finalText.textContent = '--';
  if (els.interimText) els.interimText.textContent = '--';
  showFeedback('');
  setLastMatchedWord('');
  updateExpectedWord();
  if (isFullAyahReciteMode()) {
    resetFullReciteState();
  }
}

function updateListenUI() {
  const count = Math.max(0, Number(listenCounts[ayahKey(current.surah, current.ayah)]) || 0);
  const pct = clamp((count / REQUIRED_LISTENS) * 100, 0, 100);
  if (els.progressFill) {
    els.progressFill.style.width = `${pct}%`;
  }
  if (els.progressText) {
    els.progressText.textContent = `Listens: ${count} / ${REQUIRED_LISTENS}`;
  }
}

function setLockedState(isLocked) {
  const locked = ALLOW_ALL_AYAHS ? false : isLocked;
  els.lockOverlay.classList.toggle('is-visible', locked);
  els.lockMsg.textContent = locked ? 'This ayah is locked until you complete the previous one.' : '';
  els.playBtn.disabled = locked;
  els.playCount.disabled = locked;
  els.startBtn.disabled = locked || listening || keepListening;
  if (els.peekBtn) els.peekBtn.disabled = locked;
  els.stopBtn.disabled = true;
}

function clearPeekTimer() {
  if (peekTimeout) {
    window.clearTimeout(peekTimeout);
    peekTimeout = null;
  }
}

function clearRecognitionRestartTimer() {
  if (recognitionRestartTimer) {
    window.clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = 0;
  }
}

function scheduleRecognitionRestart(delay = 260) {
  clearRecognitionRestartTimer();
  if (!keepListening || !recognition) return;
  recognitionRestartTimer = window.setTimeout(() => {
    recognitionRestartTimer = 0;
    if (!keepListening || !recognition || listening) return;
    try {
      recognition.start();
    } catch (err) {
      const name = err && err.name ? String(err.name) : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        keepListening = false;
        els.startBtn.disabled = true;
        els.stopBtn.disabled = true;
        setStatus('Mic blocked', true);
        return;
      }
      if (keepListening) {
        scheduleRecognitionRestart(500);
      }
    }
  }, delay);
}

function resetReveals() {
  clearPeekTimer();
  revealIndex = 0;
  wrongTryCounts.clear();
  expectedWords.forEach((_, idx) => {
    const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
    if (node) {
      node.classList.remove('revealed');
      node.classList.add('hidden-word');
      node.classList.remove('is-wrong', 'is-correct');
      const spoken = node.querySelector('.memo-spoken');
      if (spoken) spoken.textContent = '';
    }
  });
  resetTranscript();
  if (shouldUpdateProgressSnapshot()) {
    setLastProgressSnapshot();
  }
}

function revealWord(idx) {
  const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
  if (!node) return;
  node.classList.remove('hidden-word');
  node.classList.add('revealed');
  node.classList.remove('is-wrong');
  node.classList.add('is-correct');
  clearWrongTriesForIndex(idx);
  setLastMatchedWord(expectedWords[idx]);
}

function setSpokenText(idx, text) {
  const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
  if (!node) return;
  const spoken = node.querySelector('.memo-spoken');
  if (spoken) spoken.textContent = text || '';
}

function updateSpokenPreview(text) {
  if (isFullAyahReciteMode()) {
    renderFullReciteLine();
    return;
  }
  const node = els.wordsWrap.querySelector(`[data-index="${revealIndex}"]`);
  if (!node) return;
  const spoken = node.querySelector('.memo-spoken');
  if (!spoken) return;
  spoken.textContent = text || '';
}

function flashWrong(idx) {
  const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
  if (!node) return;
  node.classList.remove('is-correct');
  node.classList.add('is-wrong');
  window.setTimeout(() => {
    node.classList.remove('is-wrong');
  }, 700);
}

function peekWords() {
  stopListening();
  clearPeekTimer();

  if (isFullAyahReciteMode()) {
    if (!els.reciteLine) return;
    const preview = expectedWords.length ? expectedWords.join(' ') : '';
    const wasEmpty = els.reciteLine.classList.contains('is-empty');
    const prevHtml = els.reciteLine.innerHTML;
    els.peekBtn?.classList.add('is-active');
    els.peekBtn?.setAttribute('aria-pressed', 'true');
    els.reciteLine.classList.remove('is-empty');
    els.reciteLine.textContent = preview || '—';
    peekTimeout = window.setTimeout(() => {
      if (wasEmpty) {
        els.reciteLine.classList.add('is-empty');
      }
      els.reciteLine.innerHTML = prevHtml;
      els.peekBtn?.classList.remove('is-active');
      els.peekBtn?.setAttribute('aria-pressed', 'false');
    }, PEEK_DURATION_MS);
    return;
  }

  els.peekBtn?.classList.add('is-active');
  els.peekBtn?.setAttribute('aria-pressed', 'true');
  expectedWords.forEach((_, idx) => {
    const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
    if (node) {
      node.classList.remove('hidden-word', 'is-wrong', 'is-correct');
      node.classList.add('revealed');
    }
  });
  peekTimeout = window.setTimeout(() => {
    resetReveals();
    els.peekBtn?.classList.remove('is-active');
    els.peekBtn?.setAttribute('aria-pressed', 'false');
  }, PEEK_DURATION_MS);
}

async function fetchAyahContent(surah, ayah) {
  const safeSurah = Number(surah);
  const safeAyah = Number(ayah);
  if (!Number.isFinite(safeSurah) || !Number.isFinite(safeAyah)) {
    throw new Error('Invalid ayah');
  }
  const path = `ayahs/surah_${safeSurah}/ayah_${safeSurah}_${safeAyah}.html`;
  const candidates = [path, `/${path}`];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: 'no-store' });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const learning = doc.querySelector('#learning-mode-content');
      if (!learning) {
        lastError = new Error('Ayah layout not found.');
        continue;
      }
      const wordBlocks = Array.from(learning.querySelectorAll('.word-block'));
      if (!wordBlocks.length) {
        lastError = new Error('No words found for this ayah.');
        continue;
      }
      const practiceBox = doc.querySelector('#transliteration-box');
      const practiceBlocks = practiceBox
        ? Array.from(practiceBox.querySelectorAll('.word-block-translit'))
        : [];
      return { wordBlocks, practiceBlocks };
    } catch (err) {
      lastError = err;
    }
  }
  if (window.location.protocol === 'file:') {
    throw new Error('Open this page with a local web server to load ayah files.');
  }
  throw lastError || new Error('Could not load ayah');
}

function extractExpectedTranslit(practiceBlocks) {
  if (!Array.isArray(practiceBlocks) || !practiceBlocks.length) return [];
  return practiceBlocks.map(block => {
    const input = block?.querySelector('.translit-input');
    return normalizeTranslit((input?.dataset.expected || '').trim());
  });
}

function renderWords(wordBlocks, translitWords = []) {
  els.wordsWrap.innerHTML = '';
  expectedWords = [];

  const wordsContainer = document.createElement('div');
  wordsContainer.className = 'memo-word-grid';
  let index = 0;
  wordBlocks.forEach(block => {
    const clone = block.cloneNode(true);
    clone.removeAttribute('onclick');
    clone.querySelectorAll('.root-tag').forEach(el => el.remove());
    if (!clone.querySelector('.memo-spoken')) {
      const spoken = document.createElement('span');
      spoken.className = 'memo-spoken';
      clone.appendChild(spoken);
    }
    const textEl = clone.querySelector('.word-text');
    if (!textEl) return;
    const word = textEl.textContent.trim();
    if (!word) return;
    clone.classList.add('memo-word', 'hidden-word');
    clone.dataset.index = String(index);
    expectedWords.push(word);
    wordsContainer.appendChild(clone);
    index += 1;
  });

  expectedNormalized = expectedWords.map(normalize);
  expectedTranslit = expectedWords.map((_, idx) => normalizeTranslit(translitWords[idx] || ''));
  els.wordsWrap.appendChild(wordsContainer);
}

function normalizeTranslit(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u02BF/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
    .trim();
}

function tokenizeTranslitSentence(str) {
  return (str || '')
    .split(/\s+/)
    .map(token => normalizeTranslit(token))
    .filter(Boolean);
}

function splitRawTokens(str) {
  return (str || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function normalizeTranslitPhonetic(str) {
  return normalizeTranslit(str)
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/ii+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/uu+/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/ow/g, 'u')
    .replace(/kh/g, 'x')
    .replace(/gh/g, 'g')
    .replace(/sh/g, 's')
    .replace(/ch/g, 's')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/ph/g, 'f')
    .replace(/q/g, 'k')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'f')
    .replace(/w/g, 'u')
    .replace(/y/g, 'i')
    .replace(/h/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

function translitSimilarity(actualNorm, expectedNorm) {
  if (!actualNorm || !expectedNorm) return 0;
  const maxLen = Math.max(actualNorm.length, expectedNorm.length, 1);
  const strict = 1 - levenshtein(actualNorm, expectedNorm) / maxLen;

  const actualPhonetic = normalizeTranslitPhonetic(actualNorm);
  const expectedPhonetic = normalizeTranslitPhonetic(expectedNorm);
  const phonLen = Math.max(actualPhonetic.length, expectedPhonetic.length, 1);
  const phonetic = 1 - levenshtein(actualPhonetic, expectedPhonetic) / phonLen;

  return Math.max(strict, phonetic * 0.98);
}

function classifyTranslitSimilarity(similarity, expectedSpan = 1, actualSpan = 1) {
  if (similarity >= 0.9) return 'correct';
  if (expectedSpan !== actualSpan && similarity >= 0.86) return 'correct';
  if (similarity >= 0.68) return 'fuzzy';
  return 'wrong';
}

function weightedCreditFromStatus(status) {
  if (status === 'correct') return 1;
  if (status === 'fuzzy') return 0.72;
  return 0;
}

function alignTranslitTokens(expectedTokens, actualTokens) {
  const eLen = expectedTokens.length;
  const aLen = actualTokens.length;

  const dp = Array.from({ length: eLen + 1 }, () => Array(aLen + 1).fill(Number.NEGATIVE_INFINITY));
  const back = Array.from({ length: eLen + 1 }, () => Array(aLen + 1).fill(null));
  dp[0][0] = 0;

  for (let i = 0; i <= eLen; i += 1) {
    for (let j = 0; j <= aLen; j += 1) {
      const base = dp[i][j];
      if (!Number.isFinite(base)) continue;

      for (let eSpan = 1; eSpan <= MAX_ALIGN_EXPECTED_SPAN && i + eSpan <= eLen; eSpan += 1) {
        for (let aSpan = 1; aSpan <= MAX_ALIGN_ACTUAL_SPAN && j + aSpan <= aLen; aSpan += 1) {
          const expectedSeg = expectedTokens.slice(i, i + eSpan).join('');
          const actualSeg = actualTokens.slice(j, j + aSpan).join('');
          const similarity = translitSimilarity(actualSeg, expectedSeg);
          const status = classifyTranslitSimilarity(similarity, eSpan, aSpan);
          let edgeScore = similarity;
          if (status === 'wrong') edgeScore -= 0.28;
          if (eSpan !== aSpan) edgeScore -= 0.04;

          const nextScore = base + edgeScore;
          if (nextScore > dp[i + eSpan][j + aSpan]) {
            dp[i + eSpan][j + aSpan] = nextScore;
            back[i + eSpan][j + aSpan] = {
              type: 'match',
              fromI: i,
              fromJ: j,
              eSpan,
              aSpan,
              similarity,
              status
            };
          }
        }
      }

      if (i < eLen) {
        const nextScore = base - 0.72;
        if (nextScore > dp[i + 1][j]) {
          dp[i + 1][j] = nextScore;
          back[i + 1][j] = {
            type: 'missing',
            fromI: i,
            fromJ: j
          };
        }
      }

      if (j < aLen) {
        const nextScore = base - 0.55;
        if (nextScore > dp[i][j + 1]) {
          dp[i][j + 1] = nextScore;
          back[i][j + 1] = {
            type: 'extra',
            fromI: i,
            fromJ: j
          };
        }
      }
    }
  }

  const expectedFeedback = expectedTokens.map(expectedNorm => ({
    status: 'missing',
    expectedNorm,
    typedNorm: '',
    similarity: 0,
    expectedSpan: 1,
    actualSpan: 0
  }));
  const actualStatuses = actualTokens.map(() => 'extra');

  let i = eLen;
  let j = aLen;
  const steps = [];
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (!step) break;
    steps.push(step);
    i = step.fromI;
    j = step.fromJ;
  }
  steps.reverse();

  steps.forEach(step => {
    if (step.type === 'match') {
      const typedNorm = actualTokens.slice(step.fromJ, step.fromJ + step.aSpan).join(' ');
      const expectedNorm = expectedTokens.slice(step.fromI, step.fromI + step.eSpan).join(' ');
      for (let e = 0; e < step.eSpan; e += 1) {
        expectedFeedback[step.fromI + e] = {
          status: step.status,
          expectedNorm: expectedTokens[step.fromI + e],
          typedNorm,
          similarity: step.similarity,
          expectedSpan: step.eSpan,
          actualSpan: step.aSpan
        };
      }
      for (let a = 0; a < step.aSpan; a += 1) {
        actualStatuses[step.fromJ + a] = step.status;
      }
      return;
    }

    if (step.type === 'missing') {
      expectedFeedback[step.fromI] = {
        status: 'missing',
        expectedNorm: expectedTokens[step.fromI],
        typedNorm: '',
        similarity: 0,
        expectedSpan: 1,
        actualSpan: 0
      };
      return;
    }

    if (step.type === 'extra') {
      actualStatuses[step.fromJ] = 'extra';
    }
  });

  const matchedUnits = expectedFeedback.reduce(
    (sum, item) => sum + weightedCreditFromStatus(item.status),
    0
  );
  const matchedExact = expectedFeedback.filter(item => item.status === 'correct').length;
  const missingCount = expectedFeedback.filter(item => item.status === 'missing').length;
  const wrongCount = expectedFeedback.filter(item => item.status === 'wrong').length;
  const fuzzyCount = expectedFeedback.filter(item => item.status === 'fuzzy').length;
  const extraCount = actualStatuses.filter(status => status === 'extra').length;
  const totalExpected = Math.max(1, eLen);
  const baseScore = (matchedUnits / totalExpected) * 100;
  const penalty = missingCount * 8 + wrongCount * 6 + extraCount * 4;
  const score = clamp(Math.round(baseScore - penalty), 0, 100);

  return {
    expectedFeedback,
    actualStatuses,
    matchedUnits,
    matchedExact,
    missingCount,
    wrongCount,
    fuzzyCount,
    extraCount,
    score
  };
}

function isSimilarSoundChar(a, b) {
  if (a === b) return true;
  const set = SIMILAR_SOUND_MAP[a];
  return Boolean(set && set.has(b));
}

function phoneticLevenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = isSimilarSoundChar(a[i - 1], b[j - 1]) ? 0.35 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + substitutionCost
      );
    }
  }
  return dp[a.length][b.length];
}

function updateTranslitFeedback(input) {
  const block = input.closest('.word-block-translit');
  if (!block) return;
  const expected = normalizeTranslit(input.dataset.expected || '');
  const actual = normalizeTranslit(input.value || '');
  const dist = levenshtein(actual, expected);

  block.style.borderColor = 'gray';
  block.classList.remove('confetti');

  if (!actual) {
    block.style.backgroundColor = '#ffffff';
    return;
  }

  if (dist === 0) {
    block.style.backgroundColor = '#d4edda';
    block.style.borderColor = '#28a745';
    block.classList.add('confetti');
  } else if (dist <= 2) {
    block.style.backgroundColor = '#fff3cd';
    block.style.borderColor = '#ffc107';
  } else {
    block.style.backgroundColor = '#f8d7da';
    block.style.borderColor = '#dc3545';
  }
}

function initPracticeInputs(container) {
  const inputs = Array.from(container.querySelectorAll('.translit-input'));
  inputs.forEach(input => {
    const key = input.dataset.key;
    if (key) {
      const saved = localStorage.getItem(key);
      if (saved !== null) input.value = saved;
    }
    input.addEventListener('input', () => {
      if (key) {
        localStorage.setItem(key, input.value);
      }
      updateTranslitFeedback(input);
    });
    updateTranslitFeedback(input);
  });
}

function renderPractice(practiceBlocks) {
  if (!els.practiceContent) return;
  els.practiceContent.innerHTML = '';
  if (!practiceBlocks || !practiceBlocks.length) {
    els.practiceContent.textContent = 'Practice writing not available for this ayah.';
    return;
  }

  const expectedRows = practiceBlocks
    .map((block, idx) => {
      const input = block.querySelector('.translit-input');
      if (!input) return null;
      const expectedRaw = (input.dataset.expected || '').trim();
      const expectedNorm = normalizeTranslit(expectedRaw);
      if (!expectedNorm) return null;
      const meaning = (block.querySelector('.translation')?.textContent || '').trim() || `Word ${idx + 1}`;
      return {
        position: idx + 1,
        expectedRaw,
        expectedNorm,
        meaning
      };
    })
    .filter(Boolean);

  const modeBar = document.createElement('div');
  modeBar.className = 'memo-practice-mode-toggle';

  const wordsModeBtn = document.createElement('button');
  wordsModeBtn.type = 'button';
  wordsModeBtn.className = 'memo-practice-mode-btn';
  wordsModeBtn.textContent = 'Word Inputs';

  const paragraphModeBtn = document.createElement('button');
  paragraphModeBtn.type = 'button';
  paragraphModeBtn.className = 'memo-practice-mode-btn';
  paragraphModeBtn.textContent = 'Full Ayah';

  modeBar.appendChild(wordsModeBtn);
  modeBar.appendChild(paragraphModeBtn);
  els.practiceContent.appendChild(modeBar);

  const wordsMode = document.createElement('div');
  wordsMode.className = 'memo-practice-mode memo-practice-mode-words';
  const wordGrid = document.createElement('div');
  wordGrid.className = 'memo-practice-word-grid';
  wordsMode.appendChild(wordGrid);

  practiceBlocks.forEach(block => {
    const clone = block.cloneNode(true);
    clone.removeAttribute('onclick');
    clone.removeAttribute('style');
    clone.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    wordGrid.appendChild(clone);
  });
  els.practiceContent.appendChild(wordsMode);
  initPracticeInputs(wordGrid);

  const paragraphMode = document.createElement('div');
  paragraphMode.className = 'memo-practice-mode memo-practice-mode-paragraph';

  const paragraphBox = document.createElement('div');
  paragraphBox.className = 'memo-paragraph-box';

  const paragraphInput = document.createElement('div');
  paragraphInput.className = 'memo-paragraph-input is-empty';
  paragraphInput.setAttribute('contenteditable', 'true');
  paragraphInput.setAttribute('role', 'textbox');
  paragraphInput.setAttribute('aria-multiline', 'true');
  paragraphInput.setAttribute('data-placeholder', 'Type full ayah transliteration here...');
  paragraphInput.setAttribute('spellcheck', 'false');
  paragraphInput.setAttribute('autocapitalize', 'off');
  paragraphInput.setAttribute('autocomplete', 'off');
  paragraphInput.setAttribute('autocorrect', 'off');
  paragraphBox.appendChild(paragraphInput);

  const paragraphActions = document.createElement('div');
  paragraphActions.className = 'memo-paragraph-actions';
  const validateBtn = document.createElement('button');
  validateBtn.type = 'button';
  validateBtn.className = 'memo-validate-btn';
  validateBtn.textContent = 'Validate';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'memo-validate-btn memo-validate-btn-muted';
  clearBtn.textContent = 'Clear';
  const detailToggleBtn = document.createElement('button');
  detailToggleBtn.type = 'button';
  detailToggleBtn.className = 'memo-validate-btn memo-validate-btn-muted';
  detailToggleBtn.textContent = 'Show Detailed Feedback';
  detailToggleBtn.disabled = true;
  paragraphActions.appendChild(validateBtn);
  paragraphActions.appendChild(clearBtn);
  paragraphActions.appendChild(detailToggleBtn);

  const paragraphSummary = document.createElement('div');
  paragraphSummary.className = 'memo-validate-summary';
  paragraphSummary.textContent = 'Type the full ayah and validate. Feedback will check each word in order.';

  const paragraphList = document.createElement('div');
  paragraphList.className = 'memo-validate-list is-collapsed';

  paragraphMode.appendChild(paragraphBox);
  paragraphMode.appendChild(paragraphActions);
  paragraphMode.appendChild(paragraphSummary);
  paragraphMode.appendChild(paragraphList);
  els.practiceContent.appendChild(paragraphMode);

  const paragraphKey = `memo-translit-paragraph-${current.surah}-${current.ayah}`;
  const getParagraphText = () =>
    (paragraphInput.innerText || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r/g, '');
  const syncParagraphPlaceholder = () => {
    paragraphInput.classList.toggle('is-empty', !getParagraphText().trim());
  };
  const setParagraphText = text => {
    paragraphInput.textContent = text || '';
    paragraphInput.dataset.marked = '0';
    syncParagraphPlaceholder();
  };
  const clearParagraphMarkup = () => {
    if (paragraphInput.dataset.marked !== '1') return;
    const plain = getParagraphText();
    paragraphInput.textContent = plain;
    paragraphInput.dataset.marked = '0';
    syncParagraphPlaceholder();
  };
  const renderInlineWordColors = (rawText, statuses) => {
    const parts = (rawText || '').match(/\s+|\S+/g) || [];
    let tokenIndex = 0;
    const frag = document.createDocumentFragment();
    parts.forEach(part => {
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        return;
      }
      const chip = document.createElement('span');
      chip.className = `memo-inline-word is-${statuses[tokenIndex] || 'extra'}`;
      chip.textContent = part;
      frag.appendChild(chip);
      tokenIndex += 1;
    });
    paragraphInput.innerHTML = '';
    paragraphInput.appendChild(frag);
    paragraphInput.dataset.marked = '1';
    syncParagraphPlaceholder();
  };

  const savedParagraph = localStorage.getItem(paragraphKey);
  if (savedParagraph !== null) {
    setParagraphText(savedParagraph);
  } else {
    syncParagraphPlaceholder();
  }

  paragraphInput.addEventListener('beforeinput', () => {
    clearParagraphMarkup();
  });
  paragraphInput.addEventListener('input', () => {
    paragraphInput.dataset.marked = '0';
    syncParagraphPlaceholder();
    localStorage.setItem(paragraphKey, getParagraphText());
  });

  clearBtn.addEventListener('click', () => {
    setParagraphText('');
    localStorage.removeItem(paragraphKey);
    paragraphSummary.textContent = 'Cleared. Type again and validate.';
    paragraphList.innerHTML = '';
    paragraphList.classList.add('is-collapsed');
    detailToggleBtn.textContent = 'Show Detailed Feedback';
    detailToggleBtn.disabled = true;
    paragraphInput.focus();
  });

  validateBtn.addEventListener('click', () => {
    const paragraphRaw = getParagraphText();
    const actualRawTokens = splitRawTokens(paragraphRaw);
    const actualTokens = actualRawTokens.map(token => normalizeTranslit(token)).filter(Boolean);
    const totalExpected = expectedRows.length;
    paragraphList.innerHTML = '';

    if (!totalExpected) {
      renderInlineWordColors(paragraphRaw, actualRawTokens.map(() => 'wrong'));
      paragraphSummary.textContent = 'No expected words found for this ayah.';
      detailToggleBtn.disabled = true;
      return;
    }

    const aligned = alignTranslitTokens(
      expectedRows.map(row => row.expectedNorm),
      actualTokens
    );

    expectedRows.forEach((row, idx) => {
      const feedback = aligned.expectedFeedback[idx] || {
        status: 'missing',
        typedNorm: '',
        expectedSpan: 1,
        actualSpan: 0
      };

      const line = document.createElement('div');
      line.className = `memo-validate-item is-${feedback.status}`;

      const left = document.createElement('span');
      left.className = 'memo-validate-pos';
      left.textContent = `${row.position}.`;

      const center = document.createElement('span');
      center.className = 'memo-validate-main';
      const typedValue = feedback.typedNorm || '--';
      const combineHint =
        feedback.expectedSpan > 1 || feedback.actualSpan > 1 ? ' (sound/combined match)' : '';
      center.textContent = `Typed: ${typedValue} | Expected: ${row.expectedNorm}${combineHint}`;

      const right = document.createElement('span');
      right.className = 'memo-validate-status';
      if (feedback.status === 'correct') right.textContent = 'OK';
      else if (feedback.status === 'fuzzy') right.textContent = 'Close';
      else if (feedback.status === 'missing') right.textContent = 'Missing';
      else right.textContent = 'Fix';

      line.appendChild(left);
      line.appendChild(center);
      line.appendChild(right);
      paragraphList.appendChild(line);
    });

    if (aligned.extraCount > 0) {
      const extraLine = document.createElement('div');
      extraLine.className = 'memo-validate-extra';
      extraLine.textContent = `Extra words: ${aligned.extraCount}. Keep only ayah words in order.`;
      paragraphList.appendChild(extraLine);
    }

    const typedStatuses = actualRawTokens.map((_, idx) => aligned.actualStatuses[idx] || 'extra');
    renderInlineWordColors(paragraphRaw, typedStatuses);

    const percent = Math.round((aligned.matchedUnits / totalExpected) * 100);
    const score = aligned.score;
    const perfect =
      aligned.missingCount === 0 &&
      aligned.wrongCount === 0 &&
      aligned.extraCount === 0 &&
      aligned.fuzzyCount === 0;
    paragraphSummary.textContent = perfect
      ? `Score: ${score}/100. Perfect order + sound match.`
      : `Score: ${score}/100. Sound-aware placement match: ${aligned.matchedExact}/${totalExpected} exact, ${aligned.fuzzyCount} close (${percent}%).`;

    detailToggleBtn.disabled = false;
    detailToggleBtn.textContent = 'Show Detailed Feedback';
    paragraphList.classList.add('is-collapsed');
  });

  detailToggleBtn.addEventListener('click', () => {
    const hidden = paragraphList.classList.toggle('is-collapsed');
    detailToggleBtn.textContent = hidden ? 'Show Detailed Feedback' : 'Hide Detailed Feedback';
  });

  function setPracticeMode(mode) {
    const isWords = mode !== 'paragraph';
    wordsMode.classList.toggle('is-active', isWords);
    paragraphMode.classList.toggle('is-active', !isWords);
    wordsModeBtn.classList.toggle('is-active', isWords);
    paragraphModeBtn.classList.toggle('is-active', !isWords);
    wordsModeBtn.setAttribute('aria-pressed', String(isWords));
    paragraphModeBtn.setAttribute('aria-pressed', String(!isWords));
    localStorage.setItem(STORAGE_PRACTICE_MODE, isWords ? 'words' : 'paragraph');
  }

  wordsModeBtn.addEventListener('click', () => setPracticeMode('words'));
  paragraphModeBtn.addEventListener('click', () => setPracticeMode('paragraph'));

  const preferredMode = localStorage.getItem(STORAGE_PRACTICE_MODE);
  setPracticeMode(preferredMode === 'paragraph' ? 'paragraph' : 'words');
}

function updateAyahSelectors() {
  const surahOpt = els.surahSelect.querySelector(`option[value="${current.surah}"]`);
  if (surahOpt) surahOpt.selected = true;
  buildAyahOptions(current.surah);
  const ayahOpt = els.ayahSelect.querySelector(`option[value="${current.ayah}"]`);
  if (ayahOpt) ayahOpt.selected = true;
  updateSketchNavMeta();
}

function buildSurahOptions() {
  els.surahSelect.innerHTML = '';
  surahList.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.number;
    opt.textContent = `${s.number}. ${s.englishName}`;
    if (!ALLOW_ALL_AYAHS && compareAyah({ surah: s.number, ayah: 1 }, unlocked) > 0) {
      opt.disabled = true;
    }
    els.surahSelect.appendChild(opt);
  });
}

function buildAyahOptions(surahNum) {
  const surahInfo = surahList.find(s => s.number === Number(surahNum));
  const ayahCount = surahInfo ? surahInfo.ayahCount : 0;
  els.ayahSelect.innerHTML = '';
  for (let i = 1; i <= ayahCount; i += 1) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Ayah ${i}`;
    if (!ALLOW_ALL_AYAHS) {
      const isBeyond = compareAyah({ surah: Number(surahNum), ayah: i }, unlocked) > 0;
      if (isBeyond) opt.disabled = true;
    }
    els.ayahSelect.appendChild(opt);
  }
}

function isLockedAyah(surah, ayah) {
  if (ALLOW_ALL_AYAHS) return false;
  return compareAyah({ surah, ayah }, unlocked) > 0;
}

function getNextAyah() {
  const surahInfo = surahList.find(s => s.number === current.surah);
  if (!surahInfo) return null;
  if (current.ayah < surahInfo.ayahCount) {
    return { surah: current.surah, ayah: current.ayah + 1 };
  }
  const nextSurah = surahList.find(s => s.number === current.surah + 1);
  if (!nextSurah) return null;
  return { surah: nextSurah.number, ayah: 1 };
}

function unlockNextAyah() {
  const next = getNextAyah();
  if (!next) return;
  if (compareAyah(next, unlocked) > 0) {
    unlocked = next;
    setStoredProgress(unlocked);
  }
}

function showModal(show) {
  els.modal.classList.toggle('hidden', !show);
}

function isFuzzyMatch(expected, candidate) {
  if (!expected || !candidate) return false;
  if (expected === candidate) return true;
  const strictDistance = levenshtein(expected, candidate);
  const strictAllowed = Math.max(1, Math.floor(expected.length * 0.25));
  if (strictDistance <= strictAllowed) return true;

  const phoneticDistance = phoneticLevenshtein(expected, candidate);
  const phoneticAllowed = Math.max(1, expected.length * 0.35);
  return phoneticDistance <= phoneticAllowed;
}

function isTranslitSpeechMatch(expectedNorm, rawCandidate) {
  if (!expectedNorm || !rawCandidate) return false;
  const candidateNorm = normalizeTranslit(rawCandidate);
  if (!candidateNorm) return false;
  const similarity = translitSimilarity(candidateNorm, expectedNorm);
  return similarity >= SPEECH_TRANSLIT_ACCEPT_SIMILARITY;
}

function processTokens(tokens, rawTokens) {
  const before = revealIndex;
  let consumed = 0;
  let skippedNoise = 0;
  let i = 0;
  while (i < tokens.length && revealIndex < expectedNormalized.length) {
    const expected = expectedNormalized[revealIndex].replace(/\s+/g, '');
    const expectedNormTranslit = expectedTranslit[revealIndex] || '';
    let matched = false;
    for (let n = 1; n <= 4 && i + n <= tokens.length; n += 1) {
      const candidate = tokens.slice(i, i + n).join('');
      const rawCandidate = rawTokens ? rawTokens.slice(i, i + n).join(' ') : tokens.slice(i, i + n).join(' ');
      const isArabicMatch = candidate === expected || isFuzzyMatch(expected, candidate);
      const isTranslitMatch = isTranslitSpeechMatch(expectedNormTranslit, rawCandidate);
      if (isArabicMatch || isTranslitMatch) {
        setSpokenText(revealIndex, rawCandidate);
        revealWord(revealIndex);
        revealIndex += 1;
        updateExpectedWord();
        showFeedback('Correct');
        i += n;
        consumed = i;
        skippedNoise = 0;
        matched = true;
        break;
      }
    }
    if (!matched) {
      flashWrong(revealIndex);
      skippedNoise += 1;
      if (skippedNoise <= 1) {
        i += 1;
        consumed = i;
        continue;
      }
      registerWrongTryForCurrentWord();
      showFeedback('Try again', true);
      break;
    }
  }

  if (revealIndex >= expectedNormalized.length) {
    completeAyah();
  }
  if (revealIndex !== before) {
    setLastProgressSnapshot();
  }
  return consumed;
}

function syncRevealFromTranslitTranscript(transcript) {
  if (!hasCompleteSpeechTranslitReference()) return false;
  if (revealIndex >= expectedWords.length) return false;

  const actualRawTokens = splitRawTokens(transcript);
  if (!actualRawTokens.length) return false;
  const actualTokens = actualRawTokens.map(token => normalizeTranslit(token)).filter(Boolean);
  if (!actualTokens.length) return false;

  const aligned = alignTranslitTokens(expectedTranslit, actualTokens);
  if (!aligned || !Array.isArray(aligned.expectedFeedback)) return false;

  let moved = false;
  while (revealIndex < expectedWords.length) {
    const feedback = aligned.expectedFeedback[revealIndex];
    if (!feedback) break;
    const similarity = Number(feedback.similarity) || 0;
    const acceptable =
      feedback.status === 'correct' ||
      feedback.status === 'fuzzy' ||
      (similarity >= SPEECH_TRANSLIT_ACCEPT_SIMILARITY && Boolean(feedback.typedNorm));
    if (!acceptable) break;

    const spokenValue = (feedback.typedNorm || '').trim();
    if (spokenValue) {
      setSpokenText(revealIndex, spokenValue);
    }
    revealWord(revealIndex);
    revealIndex += 1;
    updateExpectedWord();
    moved = true;
  }

  if (moved) {
    showFeedback('Correct');
    setLastProgressSnapshot();
    updateSpokenPreview('');
    if (revealIndex >= expectedNormalized.length) {
      completeAyah();
    }
  }
  return moved;
}

function completeAyah() {
  stopListening();
  updateExpectedWord();
  setStoredLastMemorized({
    surah: Number(current.surah) || 1,
    ayah: Number(current.ayah) || 1,
    timestamp: Date.now()
  });
  unlockNextAyah();
  showModal(true);
  buildSurahOptions();
  buildAyahOptions(current.surah);
  refreshWelcomeDashboard();
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus('Speech not supported', true);
    els.startBtn.disabled = true;
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = 'ar-SA';

  rec.onstart = () => {
    listening = true;
    clearRecognitionRestartTimer();
    setStatus('Listening');
    els.startBtn.disabled = false;
    els.stopBtn.disabled = false;
    setMemoListeningUI(true);
  };

  rec.onend = () => {
    listening = false;
    els.stopBtn.disabled = true;
    if (keepListening) {
      setStatus('Reconnecting');
      scheduleRecognitionRestart();
      return;
    }
    setStatus('Idle');
    els.startBtn.disabled = isLockedAyah(current.surah, current.ayah);
    setMemoListeningUI(false);
    updateListenUI();
  };

  rec.onerror = evt => {
    setStatus('Error', true);
    showFeedback(evt.error || 'Speech error', true);
    if (evt.error === 'not-allowed' || evt.error === 'service-not-allowed') {
      keepListening = false;
      clearRecognitionRestartTimer();
      els.startBtn.disabled = true;
      els.stopBtn.disabled = true;
      setMemoListeningUI(false);
      return;
    }
    if (keepListening) {
      scheduleRecognitionRestart(420);
    }
  };

  rec.onresult = evt => {
    let interim = '';
    for (let i = evt.resultIndex; i < evt.results.length; i += 1) {
      const res = evt.results[i];
      if (res.isFinal) {
        finalTranscript += `${res[0].transcript} `;
      } else {
        interim += `${res[0].transcript} `;
      }
    }
    if (els.finalText) {
      els.finalText.textContent = finalTranscript.trim() || '--';
    }
    if (els.interimText) {
      els.interimText.textContent = interim.trim() || '--';
    }
    interimPreview = interim.trim();
    const previewTokens = tokenizeRaw(interimPreview);
    updateSpokenPreview(previewTokens.slice(-2).join(' '));

    if (isFullAyahReciteMode()) {
      const liveText = `${finalTranscript} ${interim}`.trim();
      const liveTokens = tokenizeRaw(liveText);
      rebuildFullReciteFromTokens(liveTokens);
      return;
    }

    const tokens = tokenize(finalTranscript);
    const rawTokens = tokenizeRaw(finalTranscript);
    if (tokens.length > lastFinalCount) {
      const nextTokens = tokens.slice(lastFinalCount);
      const nextRawTokens = rawTokens.slice(lastFinalCount);
      const hasArabicChars = /[\u0600-\u06FF]/.test(nextTokens.join(''));

      if (hasArabicChars || !hasCompleteSpeechTranslitReference()) {
        const consumed = processTokens(nextTokens, nextRawTokens);
        lastFinalCount += consumed;
        updateSpokenPreview('');
      } else {
        lastFinalCount = tokens.length;
      }
    }
    syncRevealFromTranslitTranscript(finalTranscript);
  };

  return rec;
}

function startListening() {
  if (!recognition) recognition = initRecognition();
  if (!recognition) return;
  if (keepListening || listening) {
    stopListening();
    return;
  }
  keepListening = true;
  clearRecognitionRestartTimer();
  resetTranscript();
  setStatus('Starting');
  els.startBtn.disabled = true;
  try {
    recognition.start();
  } catch (err) {
    const name = err && err.name ? String(err.name) : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      keepListening = false;
      els.startBtn.disabled = true;
      els.stopBtn.disabled = true;
      setStatus('Mic blocked', true);
      showFeedback('Microphone permission denied', true);
      return;
    }
    scheduleRecognitionRestart(320);
  }
}

function stopListening() {
  keepListening = false;
  clearRecognitionRestartTimer();
  if (recognition && listening) {
    recognition.stop();
    return;
  }
  els.startBtn.disabled = isLockedAyah(current.surah, current.ayah);
  els.stopBtn.disabled = true;
  setMemoListeningUI(false);
  setStatus('Idle');
}

function updateListenCount(delta) {
  const key = ayahKey(current.surah, current.ayah);
  const currentCount = Number(listenCounts[key]) || 0;
  const change = Number(delta) || 0;
  listenCounts[key] = Math.max(0, currentCount + change);
  setStoredListenCounts(listenCounts);
  updateListenUI();
  if (document.body.classList.contains('memo-welcome-mode')) {
    refreshWelcomeDashboard();
  }
}

function playAudio(times) {
  if (!audio) return;
  if (audioQueue > 0) return;
  const count = clamp(times, 1, 50);
  audioQueue = count;
  els.playBtn.disabled = true;
  if (els.navSpeakerBtn) els.navSpeakerBtn.disabled = true;
  audio.currentTime = 0;
  audio.play().catch(() => {
    els.playBtn.disabled = false;
    if (els.navSpeakerBtn) els.navSpeakerBtn.disabled = false;
    audioQueue = 0;
  });
}

function getMemoTransitionRoot() {
  return els.main || els.wordsWrap?.closest('.memo-panel') || null;
}

function animateMemoAyahTransition(direction = 1, phase = 'out') {
  const root = getMemoTransitionRoot();
  if (!root || typeof root.animate !== 'function') return Promise.resolve();
  const dir = Number(direction) < 0 ? -1 : 1;
  const distance = Math.max(18, Math.min(44, Math.round((window.innerWidth || 360) * 0.06)));
  const outX = dir > 0 ? -distance : distance;
  const inFromX = -outX * 0.65;
  const keyframes = phase === 'out'
    ? [
        { transform: 'translateX(0px)', opacity: 1 },
        { transform: `translateX(${outX}px)`, opacity: 0.28 }
      ]
    : [
        { transform: `translateX(${inFromX}px)`, opacity: 0.28 },
        { transform: 'translateX(0px)', opacity: 1 }
      ];
  const animation = root.animate(keyframes, {
    duration: phase === 'out' ? 130 : 170,
    easing: phase === 'out' ? 'cubic-bezier(0.42, 0, 1, 1)' : 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    fill: 'forwards'
  });
  return animation.finished
    .catch(() => undefined)
    .then(() => {
      animation.cancel();
    });
}

async function navigateMemoAyah(surah, ayah, options = {}) {
  const nextSurah = Number(surah);
  const nextAyah = Number(ayah);
  if (!isValidAyahRef(nextSurah, nextAyah)) return;
  const animated = options.animated === true;
  const direction = Number(options.direction) < 0 ? -1 : 1;
  if (memoAyahNavInFlight) return;

  memoAyahNavInFlight = true;
  const navToken = ++memoAyahNavToken;
  try {
    if (animated) {
      await animateMemoAyahTransition(direction, 'out');
      if (navToken !== memoAyahNavToken) return;
    }
    await loadAyah(nextSurah, nextAyah);
    if (animated && navToken === memoAyahNavToken) {
      await animateMemoAyahTransition(direction, 'in');
    }
  } finally {
    if (navToken === memoAyahNavToken) {
      memoAyahNavInFlight = false;
    }
  }
}

function handleAudioEnded() {
  if (audioQueue <= 0) return;
  updateListenCount(1);
  audioQueue -= 1;
  if (audioQueue > 0) {
    audio.currentTime = 0;
    audio.play();
  } else {
    els.playBtn.disabled = false;
    if (els.navSpeakerBtn) els.navSpeakerBtn.disabled = false;
  }
}

async function loadAyah(surah, ayah) {
  const requestId = ++loadAyahRequestId;
  stopListening();
  clearPeekTimer();
  const nextSurah = Number(surah);
  const nextAyah = Number(ayah);
  const target = isValidAyahRef(nextSurah, nextAyah)
    ? { surah: nextSurah, ayah: nextAyah }
    : { ...unlocked };
  current = { ...target };
  updateAyahSelectors();
  setStatus('Loading');
  resetTranscript();

  const locked = isLockedAyah(target.surah, target.ayah);
  setLockedState(locked);

  try {
    const { wordBlocks, practiceBlocks } = await fetchAyahContent(target.surah, target.ayah);
    if (requestId !== loadAyahRequestId) return;
    if (current.surah !== target.surah || current.ayah !== target.ayah) return;

    const translitWords = extractExpectedTranslit(practiceBlocks);
    renderWords(wordBlocks, translitWords);
    renderPractice(practiceBlocks);
    resetReveals();
    setStatus('Idle');
    const key = ayahKey(target.surah, target.ayah);
    if (!listenCounts[key]) listenCounts[key] = 0;
    updateListenUI();
    if (audio) {
      audio.pause();
      audio.removeEventListener('ended', handleAudioEnded);
    }
    audioQueue = 0;
    els.playBtn.disabled = false;
    if (els.navSpeakerBtn) els.navSpeakerBtn.disabled = false;
    audio = new Audio(getAudioUrl(target.surah, target.ayah));
    audio.addEventListener('ended', handleAudioEnded);
  } catch (err) {
    if (requestId !== loadAyahRequestId) return;
    setStatus('Failed', true);
    expectedWords = [];
    expectedNormalized = [];
    expectedTranslit = [];
    revealIndex = 0;
    els.wordsWrap.innerHTML = '';
    updateExpectedWord();
    const message = err && err.message ? err.message : 'Could not load ayah';
    showFeedback(message, true);
  }
}

function getAudioUrl(surah, ayah) {
  const s = String(surah).padStart(3, '0');
  const a = String(ayah).padStart(3, '0');
  return `https://verses.quran.com/Alafasy/mp3/${s}${a}.mp3`;
}

function setFromURL() {
  const params = new URLSearchParams(window.location.search);
  const surahParam = params.get('surah');
  const ayahParam = params.get('ayah');
  if (!surahParam || !ayahParam) return null;
  const surah = Number(surahParam);
  const ayah = Number(ayahParam);
  if (isValidAyahRef(surah, ayah)) return { surah, ayah };
  return null;
}

function initWelcomeBrainAnimation() {
  if (!els.welcomeBrain || welcomeBrainAnimation) return;
  if (typeof window.lottie === 'undefined') {
    renderWelcomeBrainFallback();
    return;
  }

  const candidates = [
    new URL('./assets/brain-animation.json', window.location.href).href,
    '/assets/brain-animation.json',
    '/utils/assets/brain-animation.json',
    '/brain-animation.json'
  ];

  const tryLoad = index => {
    if (index >= candidates.length) {
      renderWelcomeBrainFallback();
      return;
    }
    const path = candidates[index];
    let localAnimation = null;
    try {
      localAnimation = window.lottie.loadAnimation({
        container: els.welcomeBrain,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet'
        }
      });
    } catch (err) {
      console.warn('[MEMO] Failed to start brain lottie load', err);
      tryLoad(index + 1);
      return;
    }

    const onReady = () => {
      welcomeBrainAnimation = localAnimation;
      localAnimation.removeEventListener?.('data_ready', onReady);
      localAnimation.removeEventListener?.('data_failed', onFail);
    };
    const onFail = () => {
      localAnimation.removeEventListener?.('data_ready', onReady);
      localAnimation.removeEventListener?.('data_failed', onFail);
      localAnimation.destroy?.();
      tryLoad(index + 1);
    };

    localAnimation.addEventListener?.('data_ready', onReady);
    localAnimation.addEventListener?.('data_failed', onFail);
  };

  try {
    tryLoad(0);
  } catch (err) {
    console.warn('[MEMO] Failed to load brain lottie', err);
    renderWelcomeBrainFallback();
  }
}

async function init() {
  const appSettings = getStoredAppSettings();
  applyMemoTheme(appSettings.darkMode === true);
  unlocked = getStoredProgress();
  listenCounts = getStoredListenCounts();
  try {
    const rawView = localStorage.getItem(STORAGE_VIEW_STATE);
    if (rawView) {
      const parsed = JSON.parse(rawView);
      if (parsed && typeof parsed === 'object') {
        viewState.meaning = parsed.meaning !== false;
        viewState.grammar = Boolean(parsed.grammar);
        viewState.expectedAfterThreeWrong = parsed.expectedAfterThreeWrong !== false;
      }
    }
  } catch {}
  try {
    const storedMode = localStorage.getItem(STORAGE_RECITE_MATCH_MODE);
    reciteMatchMode = storedMode === RECITE_MATCH_MODE.FULL
      ? RECITE_MATCH_MODE.FULL
      : RECITE_MATCH_MODE.WORD;
  } catch {
    reciteMatchMode = RECITE_MATCH_MODE.WORD;
  }
  applyReciteMatchModeUI();
  applyViewState();
  surahList = await fetchSurahList();
  if (!surahList.length) {
    setStatus('No data', true);
    els.lockMsg.textContent = 'Unable to load surah list.';
    return;
  }

  buildSurahOptions();

  const fromUrl = setFromURL();
  if (fromUrl && !isLockedAyah(fromUrl.surah, fromUrl.ayah)) {
    current = fromUrl;
    openMemorizationWorkspace();
  } else if (fromUrl && isLockedAyah(fromUrl.surah, fromUrl.ayah)) {
    current = unlocked;
    openMemorizationWorkspace();
  } else {
    current = unlocked;
  }

  buildAyahOptions(current.surah);
  await loadAyah(current.surah, current.ayah);
  await refreshWelcomeDashboard();
  if (fromUrl) {
    notifyParentMemoNavigationReady(current.surah, current.ayah);
  }
  bindMemoSwipeNavigation();
}

function hydrateMemoNavIntoMain() {
  const memoNavBar = document.getElementById('memoNavBar');
  const memoNavInner = memoNavBar?.querySelector('.memo-nav-inner');
  const memoSketchHead = els.menuBtn?.closest('.memo-nav-sketch-head') || memoNavBar?.querySelector('.memo-nav-sketch-head');
  const memoModeHost = els.navModeHost;
  if (!memoNavBar || !memoNavInner || !memoSketchHead || !memoModeHost) return;
  memoNavBar.style.display = 'none';

  const ensureHostStyles = hostDoc => {
    if (!hostDoc) return;
    if (hostDoc.getElementById('memoHostNavStyles')) return;
    const style = hostDoc.createElement('style');
    style.id = 'memoHostNavStyles';
    style.textContent = `
#mainNavbar.memo-host-active {
  height: auto !important;
  min-height: 0 !important;
  display: block !important;
  padding: calc(var(--safe-top, 0px) + 20px) 0 6px !important;
}
#mainNavbar.memo-host-active .navbar-left,
#mainNavbar.memo-host-active .navbar-center,
#mainNavbar.memo-host-active .navbar-right,
#mainNavbar.memo-host-active .dropdowns,
#mainNavbar.memo-host-active .recite-surah-tabs-wrap,
#mainNavbar.memo-host-active #gameStatsNav,
#mainNavbar.memo-host-active #returnToAyah,
#mainNavbar.memo-host-active #learnSettingsBtn,
#mainNavbar.memo-host-active #reciteHomeBtn,
#mainNavbar.memo-host-active #streakDisplay {
  display: none !important;
}
#mainNavbar.memo-host-active #memoHostSketchPanel {
  width: 100%;
  margin-left: 0;
  padding: 0 8px;
  box-sizing: border-box;
  display: grid;
  gap: 6px;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-head {
  display: grid !important;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-meta {
  display: grid !important;
  min-width: 0;
  color: #ffffff;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-surah {
  font-size: 12px;
  line-height: 1.1;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-ayah {
  margin-top: 3px;
  font-size: 22px;
  line-height: 1;
  font-weight: 800;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-actions {
  display: inline-flex !important;
  align-items: center;
  gap: 5px;
}
#mainNavbar.memo-host-active #memoHostSketchPanel #memoMenuBtn,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoHomeBtn,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavSpeakerBtn,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavPrevBtn,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavNextBtn {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: 0;
  border: none;
  background: transparent;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}
#mainNavbar.memo-host-active #memoHostSketchPanel #memoMenuBtn .material-icons-outlined,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoHomeBtn .material-icons-outlined,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavSpeakerBtn .material-icons-outlined,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavPrevBtn .material-icons-outlined,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavNextBtn .material-icons-outlined {
  font-size: 20px;
}
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavPrevBtn:disabled,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavNextBtn:disabled,
#mainNavbar.memo-host-active #memoHostSketchPanel #memoNavSpeakerBtn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-mode-host {
  display: block !important;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-sketch-mode-row {
  display: flex !important;
  margin: 20px 20px 10px 20px;
  border-radius: 12px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.2);
  gap: 6px;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-sketch-mode-row .memo-toggle {
  min-width: 0;
  flex: 1;
  border-radius: 10px;
  padding: 10px 8px;
  font-size: 15px;
  font-weight: 700;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  background: transparent;
}
#mainNavbar.memo-host-active #memoHostSketchPanel .memo-sketch-mode-row .memo-toggle.is-on {
  color: #0f7c54;
  background: #eef7f3;
}
#mainNavbar.memo-host-active + #surahProgressWrap {
  display: none !important;
}
@media (max-width: 520px) {
  #mainNavbar.memo-host-active #memoHostSketchPanel {
    padding: 0 5px;
    gap: 5px;
  }
  #mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-head {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 8px;
  }
  #mainNavbar.memo-host-active #memoHostSketchPanel #memoMenuBtn,
  #mainNavbar.memo-host-active #memoHostSketchPanel #memoHomeBtn,
  #mainNavbar.memo-host-active #memoHostSketchPanel #memoNavSpeakerBtn,
  #mainNavbar.memo-host-active #memoHostSketchPanel #memoNavPrevBtn,
  #mainNavbar.memo-host-active #memoHostSketchPanel #memoNavNextBtn {
    width: 28px;
    height: 28px;
    min-width: 28px;
  }
  #mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-surah {
    font-size: 11px;
  }
  #mainNavbar.memo-host-active #memoHostSketchPanel .memo-nav-sketch-ayah {
    font-size: 19px;
  }
  #mainNavbar.memo-host-active #memoHostSketchPanel .memo-sketch-mode-row .memo-toggle {
    font-size: 14px;
    padding: 9px 7px;
  }
}
`;
    hostDoc.head?.appendChild(style);
  };

  const attach = () => {
    const host = resolveMemoHostNavbar();
    if (!host) return false;
    const { hostDoc, mainNavbar } = host;
    const left = mainNavbar?.querySelector('.navbar-left');
    const center = mainNavbar?.querySelector('.navbar-center');
    const right = mainNavbar?.querySelector('.navbar-right');
    if (!left || !center || !right) return false;

    ensureHostStyles(hostDoc);
    let panel = hostDoc.getElementById('memoHostSketchPanel');
    if (!panel) {
      panel = hostDoc.createElement('div');
      panel.id = 'memoHostSketchPanel';
    }
    if (!mainNavbar.contains(panel)) {
      mainNavbar.appendChild(panel);
    }
    mainNavbar.classList.add('memo-host-active');

    if (!panel.contains(memoSketchHead)) {
      panel.appendChild(memoSketchHead);
    }
    if (!panel.contains(memoModeHost)) {
      panel.appendChild(memoModeHost);
    }

    memoHostNavMount = { hostDoc, mainNavbar };
    document.body.classList.add('memo-host-mounted');
    memoNavBar.style.display = 'none';
    document.body.classList.remove('memo-nav-fallback');
    return true;
  };

  if (attach()) return;

  // Retry briefly while host app finishes booting. Show fallback only if never attached.
  let attempts = 0;
  const maxAttempts = 40;
  const retryAttach = () => {
    if (attach()) return;
    attempts += 1;
    if (attempts < maxAttempts) {
      window.setTimeout(retryAttach, 120);
      return;
    }
    restoreMemoNavFromMain();
    memoNavBar.style.display = 'block';
    document.body.classList.add('memo-nav-fallback');
  };
  window.setTimeout(retryAttach, 60);
}

function resolveMemoHostNavbar() {
  const localNavbar = document.getElementById('mainNavbar');
  if (localNavbar) {
    return { hostDoc: document, mainNavbar: localNavbar };
  }
  try {
    if (window.parent && window.parent !== window) {
      const parentDoc = window.parent.document;
      const parentNavbar = parentDoc?.getElementById('mainNavbar');
      if (parentNavbar) {
        return { hostDoc: parentDoc, mainNavbar: parentNavbar };
      }
    }
  } catch (_) {}
  return null;
}

function setHostMainNavbarHidden(hidden) {
  const host = resolveMemoHostNavbar();
  if (!host?.mainNavbar) return;

  const { hostDoc, mainNavbar } = host;
  const progressWrap = hostDoc?.getElementById('surahProgressWrap') || null;

  if (hidden) {
    if (!memoHostNavbarHiddenState || memoHostNavbarHiddenState.navbar !== mainNavbar) {
      memoHostNavbarHiddenState = {
        navbar: mainNavbar,
        navbarDisplay: mainNavbar.style.display,
        progress: progressWrap,
        progressDisplay: progressWrap ? progressWrap.style.display : ''
      };
    }
    mainNavbar.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'none';
    return;
  }

  if (memoHostNavbarHiddenState && memoHostNavbarHiddenState.navbar === mainNavbar) {
    mainNavbar.style.display = memoHostNavbarHiddenState.navbarDisplay || '';
    if (memoHostNavbarHiddenState.progress) {
      memoHostNavbarHiddenState.progress.style.display = memoHostNavbarHiddenState.progressDisplay || '';
    }
    memoHostNavbarHiddenState = null;
    return;
  }

  mainNavbar.style.display = '';
  if (progressWrap) progressWrap.style.display = '';
}

function restoreMemoNavFromMain() {
  if (!USE_HOST_MAIN_NAV) {
    setHostMainNavbarHidden(false);
    const memoNavBar = document.getElementById('memoNavBar');
    if (memoNavBar) memoNavBar.style.display = '';
    document.body.classList.remove('memo-host-mounted');
    document.body.classList.remove('memo-nav-fallback');
    return;
  }

  const memoNavBar = document.getElementById('memoNavBar');
  const memoNavInner = memoNavBar?.querySelector('.memo-nav-inner');
  const memoSketchHead = els.menuBtn?.closest('.memo-nav-sketch-head') || memoNavBar?.querySelector('.memo-nav-sketch-head');
  const memoModeHost = els.navModeHost;

  if (memoNavInner) {
    if (memoSketchHead && memoSketchHead.parentElement !== memoNavInner) {
      memoNavInner.insertBefore(memoSketchHead, memoNavInner.firstChild || null);
    }
    if (memoModeHost && memoModeHost.parentElement !== memoNavInner) {
      memoNavInner.appendChild(memoModeHost);
    }
  }

  const host = memoHostNavMount || resolveMemoHostNavbar();
  if (host?.mainNavbar) {
    host.mainNavbar.classList.remove('memo-host-active');
  }
  const panel = host?.hostDoc?.getElementById('memoHostSketchPanel');
  if (panel) panel.remove();
  const hostStyles = host?.hostDoc?.getElementById('memoHostNavStyles');
  if (hostStyles) hostStyles.remove();
  memoHostNavMount = null;
  setHostMainNavbarHidden(false);
  document.body.classList.remove('memo-host-mounted');
  if (memoNavBar) memoNavBar.style.display = '';
  document.body.classList.remove('memo-nav-fallback');
}

// Ensure old host-mounted nav artifacts are removed on script load.
restoreMemoNavFromMain();

const handleMemoHomeOrExit = e => {
  restoreMemoNavFromMain();
  if (isEmbedded) {
    e.preventDefault();
    parent.postMessage({ type: 'EXIT_MEMO' }, window.location.origin === 'null' ? '*' : window.location.origin);
    return;
  }
  window.location.href = '/index.html';
};

const handleMemoMenuOpen = e => {
  if (e) e.preventDefault();
  if (document.body.classList.contains('memo-sketch-mode')) {
    openMemorizationWelcome();
    return;
  }
  setMemoProfileDrawerOpen(true);
};

const handleMemoDrawerClose = () => {
  setMemoProfileDrawerOpen(false);
};

const handleMemoSignOut = async () => {
  try {
    await logout();
  } catch (err) {
    console.warn('[MEMO] Logout failed', err);
  } finally {
    restoreMemoNavFromMain();
    setMemoProfileDrawerOpen(false);
    window.location.href = '/index.html';
  }
};

if (els.homeBtn) {
  els.homeBtn.addEventListener('click', handleMemoHomeOrExit);
}

if (els.menuBtn) {
  els.menuBtn.addEventListener('click', handleMemoMenuOpen);
}

if (els.profileDrawerBackdrop) {
  els.profileDrawerBackdrop.addEventListener('click', handleMemoDrawerClose);
}

if (els.profileDrawerCloseBtn) {
  els.profileDrawerCloseBtn.addEventListener('click', handleMemoDrawerClose);
}

if (els.drawerSignOutBtn) {
  els.drawerSignOutBtn.addEventListener('click', handleMemoSignOut);
}

if (els.welcomeStartBtn) {
  els.welcomeStartBtn.addEventListener('click', () => {
    openMemorizationWorkspace();
  });
}

[
  els.techniqueListenBtn,
  els.techniqueReciteBtn,
  els.techniqueWriteBtn,
  els.techniqueRepeatBtn
].filter(Boolean).forEach(btn => {
  btn.setAttribute('aria-disabled', 'true');
  btn.addEventListener('click', event => {
    event.preventDefault();
  });
});

els.surahSelect.addEventListener('change', () => {
  const surah = Number(els.surahSelect.value);
  if (!Number.isFinite(surah)) return;
  buildAyahOptions(surah);
  const firstAyah = Number(els.ayahSelect.value) || 1;
  loadAyah(surah, firstAyah);
});

els.ayahSelect.addEventListener('change', () => {
  const ayah = Number(els.ayahSelect.value);
  if (!Number.isFinite(ayah)) return;
  loadAyah(Number(els.surahSelect.value), ayah);
});

els.playBtn.addEventListener('click', () => {
  const times = Number(els.playCount.value || 1);
  playAudio(times);
});

if (els.navSpeakerBtn) {
  els.navSpeakerBtn.addEventListener('click', () => {
    playAudio(1);
  });
}

if (els.navPrevBtn) {
  els.navPrevBtn.addEventListener('click', () => {
    const prev = getAdjacentAyah(-1);
    if (!prev) return;
    buildAyahOptions(prev.surah);
    navigateMemoAyah(prev.surah, prev.ayah, { animated: true, direction: -1 });
  });
}

if (els.navNextBtn) {
  els.navNextBtn.addEventListener('click', () => {
    const next = getAdjacentAyah(1);
    if (!next) return;
    buildAyahOptions(next.surah);
    navigateMemoAyah(next.surah, next.ayah, { animated: true, direction: 1 });
  });
}

if (els.reciteWordModeBtn) {
  els.reciteWordModeBtn.addEventListener('click', () => {
    setReciteMatchMode(RECITE_MATCH_MODE.WORD);
  });
}

function notifyParentMemoNavigationReady(surah, ayah) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'MEMO_NAVIGATION_READY', surah, ayah },
        window.location.origin === 'null' ? '*' : window.location.origin
      );
    }
  } catch (_) {}
}

function getStoredAppSettings() {
  try {
    return JSON.parse(localStorage.getItem('qq_settings') || '{}') || {};
  } catch {
    return {};
  }
}

function applyMemoTheme(isDark) {
  const enabled = Boolean(isDark);
  document.documentElement.classList.toggle('dark-mode', enabled);
  document.body.classList.toggle('dark-mode', enabled);
}

function sanitizeTypographySettings(raw = {}) {
  const arabicFont = raw.arabicFont === 'UthmanicHafs' ? 'UthmanicHafs' : 'CustomArabic';
  const parsedSize = Number.parseFloat(raw.arabicSize);
  const arabicSize = Number.isFinite(parsedSize)
    ? Math.min(56, Math.max(16, parsedSize))
    : 22;
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

function applyMemoTypography(rawSettings = {}) {
  const settings = sanitizeTypographySettings(rawSettings);
  const html = document.documentElement;
  html.setAttribute('data-arabic-font', settings.arabicFont);
  html.style.setProperty('--qq-arabic-font-family', `'${settings.arabicFont}'`);
  html.style.setProperty('--qq-arabic-size', `${settings.arabicSize}px`);
  html.style.setProperty('--qq-arabic-weight', String(settings.arabicWeight));
  html.style.setProperty('--qq-arabic-style', settings.arabicItalic ? 'italic' : 'normal');
  html.style.setProperty('--qq-english-scale', String(settings.englishScale / 100));
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('input, textarea, [contenteditable="true"], .allow-text-select')
  );
}

function shouldIgnoreMemoSwipeTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'select, option, input, textarea, [contenteditable="true"], .memo-practice-panel, .memo-word-controls, .memo-sketch-toolbar-block, .memo-transparent-strip, .memo-nav-bar, .bottom-nav'
    )
  );
}

function bindMemoSwipeNavigation() {
  const swipeRoot = els.main || document.body;
  if (!swipeRoot || swipeRoot.dataset.memoSwipeBound === '1') return;
  swipeRoot.dataset.memoSwipeBound = '1';

  const handleStart = (target, clientX, clientY) => {
    if (Date.now() < memoSwipeLockUntil) return;
    if (shouldIgnoreMemoSwipeTarget(target)) return;
    memoSwipeStartX = clientX;
    memoSwipeStartY = clientY;
    memoSwipeTracking = true;
  };

  const handleEnd = (clientX, clientY) => {
    if (!memoSwipeTracking) return;
    memoSwipeTracking = false;
    if (Date.now() < memoSwipeLockUntil) return;
    const dx = clientX - memoSwipeStartX;
    const dy = clientY - memoSwipeStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 40 || absDx <= absDy * 1.2) return;

    const next = getAdjacentAyah(dx < 0 ? 1 : -1);
    if (!next) return;
    memoSwipeLockUntil = Date.now() + 280;
    buildAyahOptions(next.surah);
    navigateMemoAyah(next.surah, next.ayah, {
      animated: true,
      direction: dx < 0 ? 1 : -1
    });
  };

  swipeRoot.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    handleStart(event.target, touch.clientX, touch.clientY);
  }, { passive: true });

  swipeRoot.addEventListener('touchend', event => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    handleEnd(touch.clientX, touch.clientY);
  }, { passive: true });

  swipeRoot.addEventListener('touchcancel', () => {
    memoSwipeTracking = false;
  }, { passive: true });

  swipeRoot.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    handleStart(event.target, event.clientX, event.clientY);
  }, { passive: true });

  swipeRoot.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch') return;
    handleEnd(event.clientX, event.clientY);
  }, { passive: true });

  swipeRoot.addEventListener('pointercancel', () => {
    memoSwipeTracking = false;
  }, { passive: true });
}

function enableNativeInteractionGuard() {
  if (!isNativeContainer) return;

  document.documentElement.classList.add('native-app-embedded');
  document.body.classList.add('native-app-embedded');

  const blockIfNotEditable = event => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', blockIfNotEditable, { capture: true });
  document.addEventListener('selectstart', blockIfNotEditable, { capture: true });
}

if (els.reciteFullModeBtn) {
  els.reciteFullModeBtn.addEventListener('click', () => {
    setReciteMatchMode(RECITE_MATCH_MODE.FULL);
  });
}

els.startBtn.addEventListener('click', () => {
  if (keepListening || listening) {
    stopListening();
    return;
  }
  startListening();
});
els.stopBtn.addEventListener('click', stopListening);

els.reviseBtn.addEventListener('click', () => {
  showModal(false);
  resetReveals();
});

els.nextBtn.addEventListener('click', () => {
  showModal(false);
  const next = getNextAyah();
  if (next) {
    loadAyah(next.surah, next.ayah);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopListening();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && memoDrawerOpen) {
    setMemoProfileDrawerOpen(false);
  }
});

window.addEventListener('pagehide', () => {
  restoreMemoNavFromMain();
});

window.addEventListener('beforeunload', () => {
  restoreMemoNavFromMain();
});

if (els.toggleMeaning) {
  els.toggleMeaning.addEventListener('click', () => {
    viewState.meaning = !viewState.meaning;
    applyViewState();
  });
}

if (els.toggleGrammar) {
  els.toggleGrammar.addEventListener('click', () => {
    viewState.grammar = !viewState.grammar;
    applyViewState();
  });
}

if (els.toggleExpectedAfterWrong) {
  els.toggleExpectedAfterWrong.addEventListener('click', () => {
    viewState.expectedAfterThreeWrong = !viewState.expectedAfterThreeWrong;
    applyViewState();
  });
}

if (els.peekBtn) {
  els.peekBtn.addEventListener('click', () => {
    peekWords();
  });
}

if (els.reciteSettingsBtn) {
  els.reciteSettingsBtn.addEventListener('click', () => {
    if (!els.reciteSettingsPanel) return;
    els.reciteSettingsPanel.classList.toggle('is-hidden');
  });
}

if (els.practiceToggle) {
  els.practiceToggle.addEventListener('click', () => {
    const isOpen = els.practicePanel?.classList.contains('is-open');
    setPracticeOpen(!isOpen);
  });
}

applyViewState();
updateLearnNavLink();
const initialAppSettings = getStoredAppSettings();
applyMemoTheme(initialAppSettings.darkMode === true);
applyMemoTypography(initialAppSettings);
initWelcomeBrainAnimation();
if (els.welcome && !els.welcome.classList.contains('is-hidden')) {
  document.body.classList.add('memo-welcome-mode');
  syncWelcomeViewportLock();
  enforceWelcomeLayoutCentering();
} else {
  syncWelcomeViewportLock();
}
syncMemoMenuButtonMode();
if (isEmbedded) {
  document.body.classList.add('embedded');
}
window.addEventListener('resize', enforceWelcomeLayoutCentering);
enableNativeInteractionGuard();
bindBottomNavSystemBarColor();
window.addEventListener('message', event => {
  if (event?.source && event.source !== window.parent) return;
  const data = event?.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'APPLY_THEME') {
    applyMemoTheme(data.darkMode === true);
    return;
  }
  if (data.type === 'APPLY_SETTINGS') {
    applyMemoTypography(data.settings || {});
    return;
  }

  if (data.type === 'NAVIGATE_MEMO_AYAH') {
    const surah = Number(data.surah);
    const ayah = Number(data.ayah);
    if (!isValidAyahRef(surah, ayah)) return;
    openMemorizationWorkspace();
    if (current.surah === surah && current.ayah === ayah) {
      notifyParentMemoNavigationReady(surah, ayah);
      return;
    }
    current = { surah, ayah };
    buildAyahOptions(surah);
    loadAyah(surah, ayah).finally(() => {
      notifyParentMemoNavigationReady(surah, ayah);
    });
  }
});
onAuthChange(user => {
  memoUser = user;
  refreshWelcomeDashboard();
  if (user && !user.isAnonymous) {
    hydrateMemorizationFromDb();
  }
});
init();


