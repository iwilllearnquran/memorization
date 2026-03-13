import { fetchSurahList } from './services/quranApi.js';
import {
  onAuthChange,
  getMemorizationData,
  saveMemorizationData,
  getUserDoc,
  logout
} from './services/_private/firestoreService.js';

const REQUIRED_LISTENS = 20;
const RANDOM_AYAH_MIN_MEMORIZED = 10;
const REVIEW_LAST5_MIN_MEMORIZED = 5;
const MISTAKE_DRILL_MIN_MEMORIZED = 10;
const ALLOW_ALL_AYAHS = true;
const STORAGE_PROGRESS = 'memo_progress_v1';
const STORAGE_LISTENS = 'memo_listens_v1';
const STORAGE_MEMORIZED_KEYS = 'memo_memorized_keys_v1';
const STORAGE_LAST_PROGRESS = 'memo_last_progress_v1';
const STORAGE_LAST_MEMORIZED = 'memo_last_memorized_v1';
const STORAGE_PRACTICE_MODE = 'memo_practice_mode_v1';
const STORAGE_VIEW_STATE = 'memo_view_state_v1';
const STORAGE_RECITE_MATCH_MODE = 'memo_recite_match_mode_v1';
const STORAGE_AUTO_NEXT = 'memo_auto_next_v1';
const STORAGE_AYAH_MISTAKES = 'memo_ayah_mistakes_v1';
const MAX_ALIGN_EXPECTED_SPAN = 5;
const MAX_ALIGN_ACTUAL_SPAN = 3;
const SPEECH_TRANSLIT_ACCEPT_SIMILARITY = 0.68;
const SPEECH_ARABIC_ACCEPT_SIMILARITY = 0.7;
const SPEECH_ARABIC_SHORT_ACCEPT_SIMILARITY = 0.64;
const SPEECH_DUPLICATE_RUN_LIMIT = 2;
const SPEECH_PREVIEW_DUPLICATE_RUN_LIMIT = 1;
const PEEK_DURATION_MS = 1000;
const EXPECTED_HINT_WRONG_TRIES = 3;
const QURAN_TOTAL_AYAHS = 6236;
const MEMO_AYAH_HTML_CACHE_MAX = 180;
const USE_HOST_MAIN_NAV = false;
const FIRST_MEMO_AYAH = Object.freeze({
  surah: 1,
  ayah: 1,
  arabic: '\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064e\u0647\u0650 \u0627\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0627\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650',
  translation: 'In the name of Allah, the Most Gracious, the Most Merciful.'
});
const RECITE_MATCH_MODE = Object.freeze({
  WORD: 'word',
  FULL: 'full'
});
const modeBar = document.createElement('div');
modeBar.style.display = 'none';
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

let expectedTokenObjects = [];

const reciteEngine = {
  epoch: 0,
  stableMatchedIndex: 0,
  candidateMatchedIndex: 0,
  lastAlignment: null,
  lastCommittedSignature: '',
  stableRepeatCount: 0,
  lastSpeechTokensSignature: ''
};

const els = {
  welcome: document.getElementById('memoWelcome'),
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
  statusText: document.getElementById('memoStatusText'),
  surahSelect: document.getElementById('memoSurahSelect'),
  ayahSelect: document.getElementById('memoAyahSelect'),
  lockMsg: document.getElementById('memoLockMsg'),
  lockOverlay: document.getElementById('memoLockOverlay'),
  wordsWrap: document.getElementById('memoWords'),
  wordOverlay: document.getElementById('memoWordOverlay'),
  learnNav: document.getElementById('memoNavLearnQuran'),
  playBtn: document.getElementById('memoPlayBtn'),
  prevAyahBtn: document.getElementById('memoPrevAyahBtn'),
  nextAyahBtn: document.getElementById('memoNextAyahBtn'),
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
  navTopStreakCount: document.getElementById('memoNavTopStreakCount'),
  welcomeTitle: document.getElementById('memoWelcomeTitle'),
  welcomeQuranProgressRing: document.getElementById('memoWelcomeQuranProgressRing'),
  welcomeProgressRing: document.getElementById('memoWelcomeProgressRing'),
  welcomeQuranPct: document.getElementById('memoWelcomeQuranPct'),
  welcomeProgressPct: document.getElementById('memoWelcomeProgressPct'),
  welcomeSurahName: document.getElementById('memoWelcomeSurahName'),
  welcomeQuranMeta: document.getElementById('memoWelcomeQuranMeta'),
  welcomeMemorized: document.getElementById('memoWelcomeMemorized'),
  welcomeWordsLearnt: document.getElementById('memoWelcomeWordsLearnt'),
  welcomeStreakDays: document.getElementById('memoStreakDays'),
  welcomeLastWhen: document.getElementById('memoWelcomeLastWhen'),
  welcomeLastTitle: document.getElementById('memoWelcomeLastTitle'),
  welcomeLastRef: document.getElementById('memoWelcomeLastRef'),
  welcomeLastArabic: document.getElementById('memoWelcomeLastArabic'),
  welcomeLastTranslation: document.getElementById('memoWelcomeLastTranslation'),
  techniqueReciteBtn: document.getElementById('memoTechniqueReciteBtn'),
  techniqueSurahListBtn: document.getElementById('memoTechniqueSurahListBtn'),
  techniqueRepeatBtn: document.getElementById('memoTechniqueRepeatBtn'),
  techniquePracticeBtn: document.getElementById('memoTechniquePracticeBtn'),
  techniqueMistakeBtn: document.getElementById('memoTechniqueMistakeBtn'),
  externalView: document.getElementById('memoExternalView'),
  externalFrame: document.getElementById('memoExternalFrame'),
  externalTitle: document.getElementById('memoExternalTitle'),
  externalCloseBtn: document.getElementById('memoExternalCloseBtn'),
  toast: document.getElementById('memoToast'),
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
let memoMemorizedAyahSet = new Set();
let memoAyahMistakeStats = {};
let memoMistakeDrillQueue = [];
let memoMistakeDrillIndex = -1;
let memoMistakeDrillAdvancing = false;
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
let reciteMatchMode = RECITE_MATCH_MODE.WORD;
let autoNextOnComplete = false;
try { autoNextOnComplete = localStorage.getItem(STORAGE_AUTO_NEXT) === '1'; } catch {}
let fullReciteIndex = 0;
let fullReciteTokens = [];
let speechCommittedTranscript = '';
let speechSessionFinals = [];
let lastFullReciteSignature = '';
let speechCaptureBlocked = false;
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
let memoHostActive = false;
let memoApplyingPopState = false;
let memoNavRestoredOnce = false;
let memoLayoutRaf = 0;
let memoToastTimer = 0;
let memoExternalViewKind = '';
let memoEnsureWordBoxesRaf = 0;
let memoUiEventsBound = false;
const memoWordsOriginalParent = els.wordsWrap?.parentElement || null;
const memoWordsOriginalNextSibling = els.wordsWrap?.nextElementSibling || null;
const wrongTryCounts = new Map();
const memoAyahHtmlCache = new Map();
const memoAyahWordCountCache = new Map();
const viewState = {
  meaning: true,
  grammar: false,
  expectedAfterThreeWrong: true
};
const isEmbedded = (() => {
  const fromQuery = new URLSearchParams(window.location.search).get('embedded') === '1';
  if (fromQuery) return true;
  try {
    if (window.parent && window.parent !== window) {
      const parentDoc = window.parent.document;
      if (parentDoc?.getElementById('mainNavbar') || parentDoc?.querySelector('.bottom-nav')) {
        return true;
      }
    }
  } catch {}
  return false;
})();
const MEMO_QUERY_PRESERVE_KEYS = Object.freeze(['embedded', 't']);
const MEMO_HISTORY_ROUTE_STATE_KEY = 'memoRoute';
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
  const navLinks = document.querySelectorAll('.memo-bottom-nav .memo-bottom-nav-btn[href]');
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

function normalizeEmbeddedRouteParam() {
  if (!isEmbedded) return;
  let parsed;
  try {
    parsed = new URL(window.location.href);
  } catch {
    return;
  }
  if (parsed.searchParams.get('embedded') === '1') return;
  parsed.searchParams.set('embedded', '1');
  try {
    const existingState =
      window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {};
    window.history.replaceState(existingState, '', `${parsed.pathname}${parsed.search}${parsed.hash || ''}`);
  } catch (_) {}
}
function getMemoRouteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const forceHome = params.get('home') === '1';
  if (!forceHome) {
    const surah = Number(params.get('surah'));
    const ayah = Number(params.get('ayah'));
    if (isValidAyahRef(surah, ayah)) {
      return { view: 'ayah', surah, ayah };
    }
  }
  return { view: 'home' };
}

function buildMemoRouteUrl(route = { view: 'home' }) {
  const params = new URLSearchParams();
  const currentParams = new URLSearchParams(window.location.search);

  MEMO_QUERY_PRESERVE_KEYS.forEach(key => {
    if (!currentParams.has(key)) return;
    params.set(key, currentParams.get(key));
  });

  if (route?.view === 'ayah' && isValidAyahRef(Number(route?.surah), Number(route?.ayah))) {
    params.set('surah', String(Number(route.surah)));
    params.set('ayah', String(Number(route.ayah)));
  } else if (route?.view === 'home') {
    params.set('home', '1');
  }

  const query = params.toString();
  const hash = window.location.hash || '';
  return `${window.location.pathname}${query ? `?${query}` : ''}${hash}`;
}

function writeMemoRouteToHistory(route, mode = 'replace') {
  if (mode === 'none' || memoApplyingPopState) return;

  const normalizedRoute = route?.view === 'ayah' && isValidAyahRef(Number(route?.surah), Number(route?.ayah))
    ? { view: 'ayah', surah: Number(route.surah), ayah: Number(route.ayah) }
    : { view: 'home' };

  const url = buildMemoRouteUrl(normalizedRoute);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`;
  if (mode === 'push' && url === currentUrl) return;

  const existingState =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
  const nextState = {
    ...existingState,
    [MEMO_HISTORY_ROUTE_STATE_KEY]: normalizedRoute
  };

  try {
    if (mode === 'push') {
      window.history.pushState(nextState, '', url);
    } else {
      window.history.replaceState(nextState, '', url);
    }
  } catch (_) {}
}

function syncMemoHistoryForWelcome(mode = 'replace') {
  writeMemoRouteToHistory({ view: 'home' }, mode);
}

function syncMemoHistoryForAyah(surah, ayah, mode = 'replace') {
  if (!isValidAyahRef(Number(surah), Number(ayah))) return;
  writeMemoRouteToHistory(
    {
      view: 'ayah',
      surah: Number(surah),
      ayah: Number(ayah)
    },
    mode
  );
}
function setHostMainNavbarHidden(hidden = false) {
  if (!isEmbedded) return;
  try {
    const hostDoc = window.parent?.document;
    const mainNavbar = hostDoc?.getElementById('mainNavbar');
    const progressWrap = hostDoc?.getElementById('surahProgressWrap');
    if (mainNavbar) {
      mainNavbar.classList.remove('memo-host-active');
      mainNavbar.style.display = hidden ? 'none' : '';
      if (!hidden) {
        mainNavbar.style.visibility = '';
      }
    }
    if (progressWrap) {
      progressWrap.style.display = hidden ? 'none' : '';
    }
  } catch (_) {}
}

function hydrateMemoNavIntoMain() {
  if (!USE_HOST_MAIN_NAV) return false;
  return false;
}

function restoreMemoNavFromMain() {
  if (!USE_HOST_MAIN_NAV) {
    if (memoNavRestoredOnce) {
      setHostMainNavbarHidden(false);
      return;
    }
    memoNavRestoredOnce = true;
    setHostMainNavbarHidden(false);
    const memoNavBar = document.getElementById('memoNavBar');
    if (memoNavBar) memoNavBar.style.display = '';
    document.body.classList.remove('memo-host-mounted', 'memo-nav-fallback');
    return;
  }

  setHostMainNavbarHidden(false);
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

function getStoredMemorizedAyahSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_MEMORIZED_KEYS) || '[]');
    if (!Array.isArray(raw)) return new Set();
    const keys = raw
      .map(entry => {
        const [surah, ayah] = String(entry || '').split(':').map(Number);
        if (!isValidAyahRef(surah, ayah)) return '';
        return ayahKey(surah, ayah);
      })
      .filter(Boolean);
    return new Set(keys);
  } catch {
    return new Set();
  }
}

function setStoredMemorizedAyahSet(nextSet) {
  try {
    const normalized = Array.from(nextSet || [])
      .map(key => {
        const [surah, ayah] = String(key || '').split(':').map(Number);
        if (!isValidAyahRef(surah, ayah)) return '';
        return ayahKey(surah, ayah);
      })
      .filter(Boolean)
      .sort((a, b) => {
        const [sa, aa] = a.split(':').map(Number);
        const [sb, ab] = b.split(':').map(Number);
        if (sa !== sb) return sa - sb;
        return aa - ab;
      });
    localStorage.setItem(STORAGE_MEMORIZED_KEYS, JSON.stringify(normalized));
  } catch {}
  if (!isHydratingMemo) scheduleMemoSync();
}

function normalizeAyahMistakeStats(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    const [surah, ayah] = String(key || '').split(':').map(Number);
    if (!isValidAyahRef(surah, ayah)) return;
    const countSource = typeof value === 'number' ? value : value?.count;
    const count = Math.max(0, Math.round(Number(countSource) || 0));
    if (!count) return;
    const lastMistakeAt = Math.max(0, Number(value?.lastMistakeAt) || 0);
    normalized[ayahKey(surah, ayah)] = { count, lastMistakeAt };
  });
  return normalized;
}

function getStoredAyahMistakeStats() {
  try {
    const rawMistakes = localStorage.getItem(STORAGE_AYAH_MISTAKES);
    if (!rawMistakes) return {};
    return normalizeAyahMistakeStats(JSON.parse(rawMistakes));
  } catch {
    return {};
  }
}

function setStoredAyahMistakeStats(next) {
  memoAyahMistakeStats = normalizeAyahMistakeStats(next);
  try {
    localStorage.setItem(STORAGE_AYAH_MISTAKES, JSON.stringify(memoAyahMistakeStats));
  } catch {}
  if (!isHydratingMemo) scheduleMemoSync();
}

function mergeAyahMistakeStats(primary, incoming) {
  const merged = normalizeAyahMistakeStats(primary);
  const nextEntries = normalizeAyahMistakeStats(incoming);
  Object.entries(nextEntries).forEach(([key, value]) => {
    const current = merged[key] || { count: 0, lastMistakeAt: 0 };
    merged[key] = {
      count: Math.max(Number(current.count) || 0, Number(value?.count) || 0),
      lastMistakeAt: Math.max(Number(current.lastMistakeAt) || 0, Number(value?.lastMistakeAt) || 0)
    };
  });
  return merged;
}

function recordAyahMistake(surah, ayah, amount = 1) {
  const safeSurah = Number(surah);
  const safeAyah = Number(ayah);
  const increment = Math.max(0, Math.round(Number(amount) || 0));
  if (!isValidAyahRef(safeSurah, safeAyah) || !increment) return;
  const key = ayahKey(safeSurah, safeAyah);
  const currentEntry = memoAyahMistakeStats[key] || { count: 0, lastMistakeAt: 0 };
  setStoredAyahMistakeStats({
    ...memoAyahMistakeStats,
    [key]: {
      count: (Number(currentEntry.count) || 0) + increment,
      lastMistakeAt: Date.now()
    }
  });
}

function markAyahMemorized(surah, ayah) {
  const s = Number(surah);
  const a = Number(ayah);
  if (!isValidAyahRef(s, a)) return;
  memoMemorizedAyahSet.add(ayahKey(s, a));
  setStoredMemorizedAyahSet(memoMemorizedAyahSet);
}

function mergeMemorizedAyahsFromSavedHistory() {
  const prefix = 'qq_saved_ayah_history_v1';
  let changed = false;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(raw)) continue;
      raw.forEach(entry => {
        if (String(entry?.mode || '').toLowerCase() !== 'memorization') return;
        const surah = Number(entry?.surah);
        const ayah = Number(entry?.ayah);
        if (!isValidAyahRef(surah, ayah)) return;
        const refKey = ayahKey(surah, ayah);
        if (memoMemorizedAyahSet.has(refKey)) return;
        memoMemorizedAyahSet.add(refKey);
        changed = true;
      });
    }
  } catch {
    return;
  }
  if (changed) {
    setStoredMemorizedAyahSet(memoMemorizedAyahSet);
  }
}

function getMemorizedAyahRefsForStats(listensMap = listenCounts) {
  const byKey = new Map();

  if (memoMemorizedAyahSet && memoMemorizedAyahSet.size) {
    memoMemorizedAyahSet.forEach(key => {
      const [surah, ayah] = String(key).split(':').map(Number);
      if (!isValidAyahRef(surah, ayah)) return;
      byKey.set(ayahKey(surah, ayah), { surah, ayah });
    });
  }

  if (listensMap && typeof listensMap === 'object') {
    Object.entries(listensMap).forEach(([key, value]) => {
      const listens = Number(value) || 0;
      if (listens < REQUIRED_LISTENS) return;
      const [surah, ayah] = String(key).split(':').map(Number);
      if (!isValidAyahRef(surah, ayah)) return;
      byKey.set(ayahKey(surah, ayah), { surah, ayah });
    });
  }

  return Array.from(byKey.values()).sort(compareAyah);
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
    memorizedKeys: Array.from(memoMemorizedAyahSet || []).sort((a, b) => {
      const [sa, aa] = String(a || '').split(':').map(Number);
      const [sb, ab] = String(b || '').split(':').map(Number);
      if (sa !== sb) return sa - sb;
      return aa - ab;
    }),
    lastProgress: getStoredLastProgress(),
    lastMemorized: getStoredLastMemorized(),
    ayahMistakes: memoAyahMistakeStats
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
  const links = Array.from(document.querySelectorAll('[data-memo-learn-link]'));
  if (!links.length) return;

  const last = getLastLearnedAyah();
  const href = last
    ? `/index.html?surah=${last.surah}&ayah=${last.ayah}`
    : '/index.html';

  links.forEach(link => {
    link.setAttribute('href', href);
  });
}
function enforceWelcomeLayoutCentering() {
  // Keep welcome layout CSS-driven. Clear stale inline overrides from older builds.
  const shell = document.getElementById('memoShell');
  if (shell) {
    shell.style.maxWidth = '';
    shell.style.width = '';
    shell.style.marginLeft = '';
    shell.style.marginRight = '';
    shell.style.left = '';
    shell.style.transform = '';
  }

  const centeredBlocks = document.querySelectorAll(
    '#memoWelcome .memo-home-welcome, #memoWelcome .memo-home-card'
  );
  centeredBlocks.forEach(node => {
    node.style.maxWidth = '';
    node.style.width = '';
    node.style.marginLeft = '';
    node.style.marginRight = '';
  });
}

function syncMemoBottomNavOffset() {
  let measured = 0;

  const localNav = document.querySelector('.memo-bottom-nav');
  if (localNav && !isEmbedded) {
    const localRect = localNav.getBoundingClientRect();
    measured = Math.max(0, Math.round(localRect.height || 0));
  }

  if (isEmbedded) {
    try {
      const hostNav = window.parent?.document?.querySelector('.bottom-nav');
      const frameEl = window.frameElement;
      if (hostNav && frameEl) {
        const hostRect = hostNav.getBoundingClientRect();
        const frameRect = frameEl.getBoundingClientRect();
        // Use only the actual overlap between iframe and host bottom-nav.
        // If iframe already ends above host nav, offset remains 0 (no gap).
        measured = Math.max(0, Math.round(frameRect.bottom - hostRect.top));
      }
    } catch (_) {
      measured = 0;
    }

    document.documentElement.style.setProperty('--memo-bottom-nav-offset', `${measured}px`);
    return;
  }

  if (!measured) {
    document.documentElement.style.removeProperty('--memo-bottom-nav-offset');
    return;
  }

  document.documentElement.style.setProperty('--memo-bottom-nav-offset', `${measured}px`);
}

function getMemoBottomNavOverlap(nav) {
  if (!nav) return 5;
  const navRect = nav.getBoundingClientRect();
  const buttons = Array.from(nav.querySelectorAll('.memo-bottom-nav-btn'));
  if (!buttons.length) return 5;

  let topGap = 0;
  buttons.forEach(btn => {
    const btnRect = btn.getBoundingClientRect();
    topGap = Math.max(topGap, Math.max(0, btnRect.top - navRect.top));

    const iconCandidates = btn.querySelectorAll(
      '.memo-bottom-nav-icon, .material-icons-outlined, .material-symbols-outlined, svg'
    );
    iconCandidates.forEach(icon => {
      const iconRect = icon.getBoundingClientRect();
      topGap = Math.max(topGap, Math.max(0, iconRect.top - navRect.top));
    });
  });

  const maxOverlap = Math.max(2, Math.round(navRect.height * 0.72));
  const overlap = Math.round(topGap + 2);
  return Math.min(maxOverlap, Math.max(2, overlap));
}

function enforceMemoBottomStripFlush() {
  const strip = document.getElementById('memoBottomControlStrip');
  if (!strip) return;
  // Remove legacy inline overrides so CSS remains the single source of truth.
  strip.style.left = '';
  strip.style.right = '';
  strip.style.width = '';
  strip.style.maxWidth = '';
  strip.style.transform = '';
  strip.style.margin = '';
  strip.style.borderRadius = '';
  strip.style.bottom = '';
}

function syncWelcomeViewportLock() {
  document.documentElement.classList.remove('memo-welcome-locked');
}

function scheduleMemoLayoutSync() {
  if (memoLayoutRaf) return;
  memoLayoutRaf = window.requestAnimationFrame(() => {
    memoLayoutRaf = 0;
    enforceWelcomeLayoutCentering();
    syncMemoBottomNavOffset();
    enforceMemoBottomStripFlush();
    syncWelcomeViewportLock();
    if (isEmbedded) {
      setHostMainNavbarHidden(false);
    }
  });
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
  return getMemorizedAyahRefsForStats(listensMap).length;
}

async function getAyahWordCount(surah, ayah) {
  const s = Number(surah);
  const a = Number(ayah);
  if (!isValidAyahRef(s, a)) return 0;
  const key = ayahKey(s, a);
  if (memoAyahWordCountCache.has(key)) {
    return Number(memoAyahWordCountCache.get(key)) || 0;
  }
  try {
    const { wordBlocks } = await fetchAyahContent(s, a);
    const count = Array.isArray(wordBlocks)
      ? wordBlocks.reduce((sum, block) => {
          const txt = block?.querySelector?.('.word-text')?.textContent?.trim?.() || '';
          return sum + (txt ? 1 : 0);
        }, 0)
      : 0;
    memoAyahWordCountCache.set(key, count);
    return count;
  } catch {
    memoAyahWordCountCache.set(key, 0);
    return 0;
  }
}

async function countTotalWordsLearnt(listensMap) {
  const refs = getMemorizedAyahRefsForStats(listensMap);
  if (!refs.length) return 0;

  let total = 0;
  for (const ref of refs) {
    total += await getAyahWordCount(ref.surah, ref.ayah);
  }
  return total;
}

function getSurahAyahCount(surahNumber) {
  const surah = Number(surahNumber) || 1;
  const info = Array.isArray(surahList)
    ? surahList.find(item => Number(item?.number) === surah)
    : null;
  return Number(info?.ayahCount) || 0;
}

function countMemorizedAyahsInSurah(listensMap, surahNumber, ayahCount) {
  const surah = Number(surahNumber) || 1;
  const totalAyahs = Number(ayahCount) || 0;
  if (totalAyahs <= 0) return 0;
  return getMemorizedAyahRefsForStats(listensMap).filter(ref => (
    Number(ref.surah) === surah && Number(ref.ayah) >= 1 && Number(ref.ayah) <= totalAyahs
  )).length;
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
  if (isEmbedded || !els.profileDrawer || !els.profileDrawerBackdrop) {
    memoDrawerOpen = false;
    document.body.classList.remove('memo-profile-drawer-open');
    return;
  }

  const isOpen = Boolean(open);
  memoDrawerOpen = isOpen;
  els.profileDrawer.classList.toggle('is-open', isOpen);
  els.profileDrawer.setAttribute('aria-hidden', String(!isOpen));
  if (isOpen) {
    els.profileDrawerBackdrop.removeAttribute('hidden');
  } else {
    els.profileDrawerBackdrop.setAttribute('hidden', '');
  }
  document.body.classList.toggle('memo-profile-drawer-open', isOpen);
}

function isValidStoredAyahRef(ref) {
  return isValidAyahRef(Number(ref?.surah), Number(ref?.ayah));
}

function normalizeStoredAyahRef(ref) {
  if (!isValidStoredAyahRef(ref)) return null;
  return {
    surah: Number(ref.surah),
    ayah: Number(ref.ayah)
  };
}

function isMemoProgressComplete(progress, options = {}) {
  const progressRef = normalizeStoredAyahRef(progress);
  if (!progressRef) return false;

  const key = ayahKey(progressRef.surah, progressRef.ayah);
  const listensMap = options.listensMap && typeof options.listensMap === 'object'
    ? options.listensMap
    : listenCounts;
  const listenCount = Number(listensMap?.[key]) || 0;
  if (listenCount >= REQUIRED_LISTENS) return true;

  const memorizedKeys = options.memorizedKeys;
  if (memorizedKeys instanceof Set && memorizedKeys.has(key)) return true;
  if (Array.isArray(memorizedKeys) && memorizedKeys.includes(key)) return true;
  if (memoMemorizedAyahSet instanceof Set && memoMemorizedAyahSet.has(key)) return true;

  const lastMemorizedRef = normalizeStoredAyahRef(options.lastMemorized ?? getStoredLastMemorized());
  if (
    lastMemorizedRef &&
    lastMemorizedRef.surah === progressRef.surah &&
    lastMemorizedRef.ayah === progressRef.ayah
  ) {
    return true;
  }

  return (Number(progress?.percent) || 0) >= 100;
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
  const fallbackSurah = Number(current?.surah) || Number(unlocked?.surah) || 1;
  let effectiveListens = (listenCounts && typeof listenCounts === 'object')
    ? { ...listenCounts }
    : {};
  let effectiveMemoState = {
    unlocked: normalizeStoredAyahRef(unlocked) || getStoredProgress(),
    listens: effectiveListens,
    memorizedKeys: Array.from(memoMemorizedAyahSet || []),
    lastProgress: getStoredLastProgress(),
    lastMemorized: getStoredLastMemorized(),
    ayahMistakes: memoAyahMistakeStats
  };
  const inferredLast = resolveBestLastMemorizedRef(effectiveListens);
  const initialResumeTarget = getMemoResumeTarget({
    lastProgress: effectiveMemoState.lastProgress,
    unlockedRef: effectiveMemoState.unlocked,
    lastMemorized: effectiveMemoState.lastMemorized,
    listensMap: effectiveListens,
    memorizedKeys: effectiveMemoState.memorizedKeys
  });

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
    activeSurah: fallbackSurah,
    surahAyahCount: getSurahAyahCount(fallbackSurah),
    surahMemorizedAyahs: 0,
    totalWordsLearnt: 0,
    resumeSurah: Number(initialResumeTarget?.surah) || FIRST_MEMO_AYAH.surah,
    resumeAyah: Number(initialResumeTarget?.ayah) || FIRST_MEMO_AYAH.ayah,
    canResume: Boolean(isValidStoredAyahRef(effectiveMemoState.lastProgress) || Boolean(inferredLast?.isMemorized))
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
        effectiveMemoState = mergeMemorizationState(effectiveMemoState, memoData || null);
        effectiveListens = effectiveMemoState.listens || effectiveListens;
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
  const progressSurah = snapshot.hasMemorizedAyah && isValidAyahRef(snapshot.lastSurah, snapshot.lastAyah)
    ? Number(snapshot.lastSurah)
    : fallbackSurah;
  snapshot.activeSurah = progressSurah;
  snapshot.surahAyahCount = getSurahAyahCount(progressSurah);
  snapshot.surahMemorizedAyahs = countMemorizedAyahsInSurah(
    effectiveListens,
    progressSurah,
    snapshot.surahAyahCount
  );
  snapshot.totalWordsLearnt = await countTotalWordsLearnt(effectiveListens);

  const quranRatio = snapshot.totalAyahs > 0
    ? (snapshot.memorizedAyahs / snapshot.totalAyahs)
    : 0;
  const surahRatio = snapshot.surahAyahCount > 0
    ? (snapshot.surahMemorizedAyahs / snapshot.surahAyahCount)
    : 0;
  snapshot.quranProgressPct = clamp(Number((quranRatio * 100).toFixed(3)), 0, 100);
  snapshot.surahProgressPct = clamp(Number((surahRatio * 100).toFixed(3)), 0, 100);

  const resumeTarget = getMemoResumeTarget({
    lastProgress: effectiveMemoState.lastProgress,
    unlockedRef: effectiveMemoState.unlocked,
    lastMemorized: effectiveMemoState.lastMemorized,
    listensMap: effectiveListens,
    memorizedKeys: effectiveMemoState.memorizedKeys
  });
  snapshot.resumeSurah = Number(resumeTarget?.surah) || snapshot.resumeSurah || FIRST_MEMO_AYAH.surah;
  snapshot.resumeAyah = Number(resumeTarget?.ayah) || snapshot.resumeAyah || FIRST_MEMO_AYAH.ayah;
  snapshot.canResume = Boolean(
    isValidStoredAyahRef(effectiveMemoState.lastProgress) ||
    snapshot.hasMemorizedAyah ||
    Number(snapshot.resumeSurah) !== FIRST_MEMO_AYAH.surah ||
    Number(snapshot.resumeAyah) !== FIRST_MEMO_AYAH.ayah
  );

  return snapshot;
}

function applyWelcomeSnapshot(snapshot) {
  if (!snapshot) return;
  const hasMemorized = Boolean(snapshot.hasMemorizedAyah) && isValidAyahRef(snapshot.lastSurah, snapshot.lastAyah);
  const startSurahName = getSurahDisplayName(FIRST_MEMO_AYAH.surah);
  const activeSurahName = getSurahDisplayName(snapshot.activeSurah || FIRST_MEMO_AYAH.surah);
  if (els.welcomeTitle) {
    els.welcomeTitle.textContent = `Assalamu Alaikum, ${snapshot.firstName || 'Friend'}`;
  }
  if (els.navTopStreakCount) {
    els.navTopStreakCount.textContent = String(snapshot.streakDays || 0);
  }
  if (els.navStreakCount) {
    els.navStreakCount.textContent = String(snapshot.streakDays || 0);
  }
  if (els.welcomeMemorized) {
    els.welcomeMemorized.textContent = String(snapshot.memorizedAyahs || 0);
  }
  if (els.welcomeWordsLearnt) {
    els.welcomeWordsLearnt.textContent = String(snapshot.totalWordsLearnt || 0);
  }
  if (els.welcomeStreakDays) {
    els.welcomeStreakDays.textContent = String(snapshot.streakDays || 0);
  }
  if (els.welcomeProgressPct) {
    els.welcomeProgressPct.textContent = formatProgressPctLabel(snapshot.surahProgressPct);
  }
  if (els.welcomeQuranPct) {
    els.welcomeQuranPct.textContent = formatProgressPctLabel(snapshot.quranProgressPct);
  }
  if (els.welcomeSurahName) {
    els.welcomeSurahName.textContent = activeSurahName;
  }
  if (els.welcomeQuranMeta) {
    const memorizedCount = Number(snapshot.memorizedAyahs || 0).toLocaleString('en-US');
    const totalCount = Number(snapshot.totalAyahs || QURAN_TOTAL_AYAHS).toLocaleString('en-US');
    els.welcomeQuranMeta.textContent = memorizedCount +  ' ayahs memorized';
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
    const resumeSurah = Number(snapshot.resumeSurah) || FIRST_MEMO_AYAH.surah;
    const resumeAyah = Number(snapshot.resumeAyah) || FIRST_MEMO_AYAH.ayah;
    els.welcomeStartLabel.textContent = snapshot.canResume
      ? `Resume from Surah ${resumeSurah}:${resumeAyah}`
      : 'Start Memorizing';
  }
  if (els.welcomeStartBtn) {
    const resumeSurah = Number(snapshot.resumeSurah) || FIRST_MEMO_AYAH.surah;
    const resumeAyah = Number(snapshot.resumeAyah) || FIRST_MEMO_AYAH.ayah;
    els.welcomeStartBtn.title = snapshot.canResume
      ? `Resume memorizing from Surah ${resumeSurah}:${resumeAyah}`
      : 'Start memorizing from the beginning';
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
  if (!isValidAyahRef(previewSurah, previewAyah)) {
    refreshQuickActionAvailability();
    return;
  }
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
  refreshQuickActionAvailability();
}


function getMemorizedAyahRefs(listensMap = listenCounts) {
  return getMemorizedAyahRefsForStats(listensMap);
}

function getFirstGlobalAyahRefs(limit = RANDOM_AYAH_MIN_MEMORIZED) {
  const count = Math.max(0, Number(limit) || 0);
  if (!count || !Array.isArray(surahList) || !surahList.length) return [];

  const refs = [];
  const ordered = [...surahList].sort((a, b) => Number(a?.number) - Number(b?.number));
  for (const item of ordered) {
    const surah = Number(item?.number);
    const ayahCount = Number(item?.ayahCount) || 0;
    if (!Number.isInteger(surah) || surah <= 0 || ayahCount <= 0) continue;
    for (let ayah = 1; ayah <= ayahCount; ayah += 1) {
      refs.push({ surah, ayah });
      if (refs.length >= count) {
        return refs;
      }
    }
  }
  return refs;
}

function hasMemorizedFirstNAyahs(limit = RANDOM_AYAH_MIN_MEMORIZED, listensMap = listenCounts) {
  const firstRefs = getFirstGlobalAyahRefs(limit);
  if (firstRefs.length < Number(limit)) return false;
  const memorizedSet = new Set(getMemorizedAyahRefsForStats(listensMap).map(ref => ayahKey(ref.surah, ref.ayah)));
  return firstRefs.every(ref => memorizedSet.has(ayahKey(ref.surah, ref.ayah)));
}

function pickRandomAyahRef(refs) {
  if (!Array.isArray(refs) || !refs.length) return null;
  const idx = Math.floor(Math.random() * refs.length);
  return refs[idx] || refs[0] || null;
}

function getCanUseMistakeDrill(memorizedRefs = getMemorizedAyahRefs()) {
  return Array.isArray(memorizedRefs) && memorizedRefs.length >= MISTAKE_DRILL_MIN_MEMORIZED;
}

function getMistakeDrillAyahRefs(memorizedRefs = getMemorizedAyahRefs()) {
  const memorizedKeys = new Set((memorizedRefs || []).map(ref => ayahKey(ref.surah, ref.ayah)));
  return Object.entries(memoAyahMistakeStats)
    .map(([key, value]) => {
      const [surah, ayah] = String(key).split(':').map(Number);
      const count = Number(value?.count) || 0;
      if (!isValidAyahRef(surah, ayah) || !count) return null;
      return {
        key: ayahKey(surah, ayah),
        surah,
        ayah,
        count,
        lastMistakeAt: Number(value?.lastMistakeAt) || 0
      };
    })
    .filter(entry => entry && memorizedKeys.has(entry.key))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastMistakeAt !== a.lastMistakeAt) return b.lastMistakeAt - a.lastMistakeAt;
      return compareAyah(a, b);
    });
}

function showMemoToast(message, duration = 2200) {
  const text = String(message || '').trim();
  if (!text) return;
  if (!els.toast) {
    console.info('[MEMO]', text);
    return;
  }
  if (memoToastTimer) {
    window.clearTimeout(memoToastTimer);
    memoToastTimer = 0;
  }
  els.toast.textContent = text;
  els.toast.hidden = false;
  memoToastTimer = window.setTimeout(() => {
    memoToastTimer = 0;
    if (!els.toast) return;
    els.toast.hidden = true;
    els.toast.textContent = '';
  }, Math.max(1000, Number(duration) || 0));
}

function setQuickActionState(button, enabled) {
  if (!button) return;
  const isEnabled = Boolean(enabled);
  button.classList.toggle('is-disabled', !isEnabled);
  button.setAttribute('aria-disabled', String(!isEnabled));
}

function refreshQuickActionAvailability() {
  const memorizedRefs = getMemorizedAyahRefs();
  const canUseRandomAyah = memorizedRefs.length > 0 && hasMemorizedFirstNAyahs(RANDOM_AYAH_MIN_MEMORIZED);
  const canUseReviewLast5 = memorizedRefs.length >= REVIEW_LAST5_MIN_MEMORIZED;
  const canUseMistakeDrill = getCanUseMistakeDrill(memorizedRefs);
  setQuickActionState(els.techniqueReciteBtn, canUseRandomAyah);
  setQuickActionState(els.techniqueRepeatBtn, canUseReviewLast5);
  setQuickActionState(els.techniqueMistakeBtn, canUseMistakeDrill);
}

function clearMistakeDrillSession() {
  memoMistakeDrillQueue = [];
  memoMistakeDrillIndex = -1;
  memoMistakeDrillAdvancing = false;
}

function isMistakeDrillActive() {
  return memoMistakeDrillIndex >= 0 && memoMistakeDrillIndex < memoMistakeDrillQueue.length;
}

function getMistakeDrillCurrentEntry() {
  return isMistakeDrillActive() ? memoMistakeDrillQueue[memoMistakeDrillIndex] : null;
}

function playMistakeDrillCurrentAyah() {
  if (!audio) return;
  const currentEntry = getMistakeDrillCurrentEntry();
  if (!currentEntry) return;
  const repeatCount = clamp(Number(els.playCount?.value || 1), 1, 50);
  playAudio(repeatCount);
}

function openMistakeDrillAyah(index, historyMode = 'push') {
  const target = memoMistakeDrillQueue[index];
  if (!target) {
    clearMistakeDrillSession();
    return Promise.resolve(false);
  }
  memoMistakeDrillIndex = index;
  return goMemo(
    { view: 'ayah', surah: target.surah, ayah: target.ayah },
    { historyMode, source: 'mistake-drill' }
  ).then(ok => {
    if (!ok) {
      clearMistakeDrillSession();
      return false;
    }
    playMistakeDrillCurrentAyah();
    return true;
  });
}

function advanceMistakeDrill(reason = 'manual') {
  if (!isMistakeDrillActive() || memoMistakeDrillAdvancing) return;
  const nextIndex = memoMistakeDrillIndex + 1;
  if (nextIndex >= memoMistakeDrillQueue.length) {
    const completedCount = memoMistakeDrillQueue.length;
    clearMistakeDrillSession();
    if (completedCount === 1) {
      showMemoToast('Mistake drill finished.');
    } else {
      showMemoToast('Mistake drill finished: ' + completedCount + ' ayahs reviewed.');
    }
    return;
  }
  memoMistakeDrillAdvancing = true;
  if (reason === 'complete') {
    showFeedback('Mistake drill - next ayah', false);
  }
  void openMistakeDrillAyah(nextIndex, 'push').finally(() => {
    memoMistakeDrillAdvancing = false;
  });
}

function startMistakeDrill() {
  const memorizedRefs = getMemorizedAyahRefs();
  if (!getCanUseMistakeDrill(memorizedRefs)) {
    showMemoToast('Memorize at least ' + MISTAKE_DRILL_MIN_MEMORIZED + ' ayahs to enable this.');
    return;
  }
  const queue = getMistakeDrillAyahRefs(memorizedRefs);
  if (!queue.length) {
    showMemoToast('No mistake drill ayahs yet. Ayahs with repeated mistakes will appear here.');
    return;
  }
  memoMistakeDrillQueue = queue;
  memoMistakeDrillIndex = -1;
  memoMistakeDrillAdvancing = false;
  if (queue.length === 1) {
    showMemoToast('Mistake drill started.');
  } else {
    showMemoToast('Mistake drill started: ' + queue.length + ' ayahs queued.');
  }
  void openMistakeDrillAyah(0, 'push');
}

function buildMemoChildUrl(pathname) {
  const url = new URL(pathname, window.location.href);
  if (isEmbedded) {
    url.searchParams.set('embedded', '1');
  }
  url.searchParams.set('t', String(Date.now()));
  return url.toString();
}

function openMemoExternalView(kind, { title, url } = {}) {
  if (!els.externalView || !els.externalFrame) return;
  memoExternalViewKind = String(kind || '').trim().toLowerCase();
  document.body.classList.remove('memo-external-practice');
  if (memoExternalViewKind === 'practice') {
    document.body.classList.add('memo-external-practice');
  }
  if (els.externalTitle) {
    els.externalTitle.textContent = String(title || '').trim() || 'External view';
  }
  els.externalFrame.src = String(url || 'about:blank');
  document.body.classList.add('memo-external-open');
  els.externalView.classList.remove('is-hidden');
  els.externalView.setAttribute('aria-hidden', 'false');
  scheduleMemoLayoutSync();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
}

function closeMemoExternalView({ clearFrame = true } = {}) {
  if (!els.externalView) return;
  els.externalView.classList.add('is-hidden');
  els.externalView.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('memo-external-open', 'memo-external-practice');
  memoExternalViewKind = '';
  if (clearFrame && els.externalFrame) {
    try {
      els.externalFrame.src = 'about:blank';
    } catch (_) {}
  }
  scheduleMemoLayoutSync();
}

function openMemoSurahListView() {
  openMemoExternalView('surah-list', {
    title: 'Surah list',
    url: buildMemoChildUrl('./surah-list.html')
  });
}

function openMemoPracticeView() {
  openMemoExternalView('practice', {
    title: 'Practice',
    url: buildMemoChildUrl('./memorization-practice.html')
  });
}

function forwardSurahListActionToHost(action, surah, ayah) {
  const targetAction = String(action || 'learn').toLowerCase();
  const targetSurah = Number(surah) || 1;
  const targetAyah = Math.max(1, Number(ayah) || 1);
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage(
        {
          type: 'SURAH_LIST_ACTION',
          action: targetAction,
          surah: targetSurah,
          ayah: targetAyah
        },
        window.location.origin === 'null' ? '*' : window.location.origin
      );
      return;
    } catch (_) {}
  }
  const next = new URL('./index.html', window.location.href);
  next.searchParams.set('surah', String(targetSurah));
  next.searchParams.set('ayah', String(targetAyah));
  next.searchParams.set('action', targetAction);
  window.location.href = next.toString();
}

function handleMemoNestedSurahListAction(payload = {}) {
  const actionRaw = String(payload.action || '').trim().toLowerCase();
  const action = ['learn', 'recite', 'listen', 'memorize'].includes(actionRaw)
    ? actionRaw
    : 'learn';
  const surah = Number(payload.surah);
  const ayah = Math.max(1, Number(payload.ayah) || 1);
  if (!Number.isFinite(surah) || surah < 1) return;

  closeMemoExternalView();
  if (action === 'memorize') {
    void goMemo({ view: 'ayah', surah, ayah }, { historyMode: 'push' });
    return;
  }
  forwardSurahListActionToHost(action, surah, ayah);
}
function setMemoMode(mode) {
  const isWelcome = mode === 'welcome';
  document.body.classList.remove('memo-welcome-mode', 'memo-sketch-mode');
  document.body.classList.add(isWelcome ? 'memo-welcome-mode' : 'memo-sketch-mode');
  if (!isWelcome) {
    document.documentElement.classList.remove('memo-welcome-locked');
  }
  syncWelcomeViewportLock();
}
function stopAllMemoActivity() {
  stopListening();
  stopAudioPlayback();
  clearPeekTimer();
  clearRecognitionRestartTimer();
  keepListening = false;
  listening = false;
  audioQueue = 0;
}

function setModeWelcome({ historyMode = 'none' } = {}) {
  document.body.classList.remove('memo-external-open', 'memo-external-practice');
  setMemoProfileDrawerOpen(false);
  stopAllMemoActivity();
  setHostMainNavbarHidden(false);
  restoreMemoNavFromMain();

  if (els.main) {
    els.main.classList.add('is-hidden');
    els.main.setAttribute('aria-hidden', 'true');
  }
  if (els.welcome) {
    els.welcome.classList.remove('is-hidden');
    els.welcome.setAttribute('aria-hidden', 'false');
    els.welcome.scrollTop = 0;
  }

  setMemoMode('welcome');
  syncMemoSketchTopNavLayout();
  syncMemoMenuButtonMode();
  applyReciteMatchModeUI();
  syncPlaybackControlState();
  if (historyMode !== 'none') syncMemoHistoryForWelcome(historyMode);
  scheduleMemoLayoutSync();
  refreshWelcomeDashboard();

  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
}

function notifyParentMemoNavigationReadyStable(surah, ayah) {
  const targetSurah = Number(surah) || Number(current?.surah) || 1;
  const targetAyah = Number(ayah) || Number(current?.ayah) || 1;
  const ping = () => {
    notifyParentMemoNavigationReady(targetSurah, targetAyah);
  };
  ping();
  if (!isEmbedded) return;
  window.requestAnimationFrame(ping);
  window.setTimeout(ping, 90);
}
function setModeSketch() {
  closeMemoExternalView();
  setMemoProfileDrawerOpen(false);

  if (els.welcome) {
    els.welcome.classList.add('is-hidden');
    els.welcome.setAttribute('aria-hidden', 'true');
  }
  if (els.main) {
    els.main.classList.remove('is-hidden');
    els.main.setAttribute('aria-hidden', 'false');
  }

  setMemoMode('sketch');
  syncMemoSketchTopNavLayout();
  setHostMainNavbarHidden(false);

  if (USE_HOST_MAIN_NAV) {
    hydrateMemoNavIntoMain();
  } else {
    const memoNavBar = document.getElementById('memoNavBar');
    document.body.classList.remove('memo-host-mounted', 'memo-nav-fallback');
    if (memoNavBar) memoNavBar.style.display = '';
  }

  syncMemoMenuButtonMode();
  applyReciteMatchModeUI();
  syncPlaybackControlState();
  scheduleMemoLayoutSync();
  scheduleEnsureMemoWordBoxesRendered();
  if (isEmbedded) {
    notifyParentMemoNavigationReadyStable(current.surah, current.ayah);
  }

  window.requestAnimationFrame(() => {
    if (isEmbedded) setHostMainNavbarHidden(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
}

function openMemorizationWorkspace() {
  setModeSketch();
}

function openMemorizationWelcome(options = {}) {
  setModeWelcome(options);
}

function resetMemoAyahRuntimeState() {
  showModal(false);
  stopAllMemoActivity();
  setMemoListeningUI(false);
  wrongTryCounts.clear();
  resetTranscript();
  resetFullReciteState();
  setExpectedHintText('');
  showFeedback('');

  if (els.peekBtn) {
    els.peekBtn.classList.remove('is-active');
    els.peekBtn.setAttribute('aria-pressed', 'false');
  }
  if (els.reciteSettingsPanel) {
    els.reciteSettingsPanel.classList.add('is-hidden');
  }
  setPracticeOpen(false);

  if (els.lockOverlay) {
    els.lockOverlay.classList.remove('is-visible');
    els.lockOverlay.setAttribute('aria-hidden', 'true');
  }
  if (els.wordOverlay) {
    els.wordOverlay.classList.remove('is-locked');
  }
}

function resolveMemoAyahTarget(surah, ayah) {
  const nextSurah = Number(surah);
  const nextAyah = Number(ayah);
  if (!isValidAyahRef(nextSurah, nextAyah)) return null;
  if (isLockedAyah(nextSurah, nextAyah)) {
    return { ...unlocked };
  }
  return { surah: nextSurah, ayah: nextAyah };
}

async function enterMemoAyah(surah, ayah, options = {}) {
  const historyMode = options.historyMode || 'none';
  const target = resolveMemoAyahTarget(surah, ayah);
  if (!target) return false;

  const enteringFromWelcome = document.body.classList.contains('memo-welcome-mode');

  // 1-2) Mode switch first so measurements happen only with visible workspace.
  setModeSketch();

  // Always start fresh ayah entry in word-by-word mode when coming from memo home.
  if (enteringFromWelcome && reciteMatchMode !== RECITE_MATCH_MODE.WORD) {
    reciteMatchMode = RECITE_MATCH_MODE.WORD;
    resetFullReciteState();
    applyReciteMatchModeUI();
  }

  // 3) Reset transient workspace state to prevent leakage from previous route/ayah.
  resetMemoAyahRuntimeState();

  // 4-5) Set reference and selector state before loading.
  current = { ...target };
  buildAyahOptions(target.surah);
  updateAyahSelectors();

  // 6) Load ayah content with no direct history writes.
  const loaded = await loadAyah(target.surah, target.ayah, { historyMode: 'none' });

  // 7-8) Post-render layout + nav consistency pass.
  window.requestAnimationFrame(() => {
    if (isEmbedded) setHostMainNavbarHidden(false);
    scheduleMemoLayoutSync();
  });
  applyReciteMatchModeUI();
  scheduleEnsureMemoWordBoxesRendered();
  updateSketchNavMeta();
  if (isEmbedded) {
    notifyParentMemoNavigationReadyStable(target.surah, target.ayah);
  }

  // 9) History sync from one authoritative entry path only.
  if (loaded && historyMode !== 'none') {
    syncMemoHistoryForAyah(target.surah, target.ayah, historyMode);
  }
  return Boolean(loaded);
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

function syncMemoSketchTopNavLayout() {
  // Keep nav visibility CSS-driven to avoid inline style conflicts between modes.
  const titleWrap = document.querySelector('.memo-nav-title-wrap');
  const streakPill = document.getElementById('memoNavStreakPill');
  const navModeHost = els.navModeHost;
  const navMeta = document.querySelector('.memo-nav-sketch-meta');
  const navSelects = document.querySelector('.memo-nav-selects');

  [titleWrap, streakPill, navModeHost, navMeta, navSelects].forEach(node => {
    if (node) node.style.display = '';
  });
}
function updateSketchNavMeta() {
  const currentSurah = Number(current?.surah) || 1;
  const currentAyah = Number(current?.ayah) || 1;
  const surahInfo = Array.isArray(surahList)
    ? surahList.find(s => Number(s?.number) === currentSurah)
    : null;

  if (els.navSketchSurah) {
    if (surahInfo?.englishName) {
      els.navSketchSurah.textContent = `Surah ${currentSurah}: ${surahInfo.englishName}`;
    } else {
      els.navSketchSurah.textContent = `Surah ${currentSurah}`;
    }
  }
  if (els.navSketchAyah) {
    els.navSketchAyah.textContent = `Ayah ${currentAyah}`;
  }

  const prev = getAdjacentAyah(-1);
  const next = getAdjacentAyah(1);
  if (els.navPrevBtn) els.navPrevBtn.disabled = !prev;
  if (els.navNextBtn) els.navNextBtn.disabled = !next;
  if (els.prevAyahBtn) els.prevAyahBtn.disabled = !prev;
  if (els.nextAyahBtn) els.nextAyahBtn.disabled = !next;
}

function mergeMemorizationState(localData, remoteData) {
  const merged = {
    unlocked: localData.unlocked || { surah: 1, ayah: 1 },
    listens: { ...(localData.listens || {}) },
    memorizedKeys: new Set(Array.from(localData.memorizedKeys || [])),
    lastProgress: localData.lastProgress || null,
    lastMemorized: localData.lastMemorized || null,
    ayahMistakes: normalizeAyahMistakeStats(localData.ayahMistakes)
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

  if (Array.isArray(remoteData?.memorizedKeys)) {
    remoteData.memorizedKeys.forEach(key => {
      const [surah, ayah] = String(key || '').split(':').map(Number);
      if (!isValidAyahRef(surah, ayah)) return;
      merged.memorizedKeys.add(ayahKey(surah, ayah));
    });
  }

  if (remoteData?.lastProgress) {
    const incoming = remoteData.lastProgress;
    const currentLastProgress = merged.lastProgress;
    if (!currentLastProgress || (incoming?.timestamp || 0) > (currentLastProgress?.timestamp || 0)) {
      merged.lastProgress = incoming;
    }
  }

  if (remoteData?.lastMemorized) {
    const incoming = remoteData.lastMemorized;
    const currentLastMemorized = merged.lastMemorized;
    if (!currentLastMemorized || (incoming?.timestamp || 0) > (currentLastMemorized?.timestamp || 0)) {
      merged.lastMemorized = incoming;
    }
  }

  merged.ayahMistakes = mergeAyahMistakeStats(merged.ayahMistakes, remoteData?.ayahMistakes);
  merged.memorizedKeys = Array.from(merged.memorizedKeys).sort(compareAyahKeyFromString);

  return merged;
}

function compareAyahKeyFromString(a, b) {
  const [sa, aa] = String(a || '').split(':').map(Number);
  const [sb, ab] = String(b || '').split(':').map(Number);
  if (sa !== sb) return sa - sb;
  return aa - ab;
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
      memorizedKeys: Array.from(getStoredMemorizedAyahSet()),
      lastProgress: getStoredLastProgress(),
      lastMemorized: getStoredLastMemorized(),
      ayahMistakes: getStoredAyahMistakeStats()
    };
    const merged = mergeMemorizationState(localMemo, remoteMemo);

    unlocked = merged.unlocked || unlocked;
    listenCounts = merged.listens || listenCounts;
    memoMemorizedAyahSet = new Set(Array.from(merged.memorizedKeys || []));
    memoAyahMistakeStats = mergeAyahMistakeStats(memoAyahMistakeStats, merged.ayahMistakes);
    setStoredProgress(unlocked);
    setStoredListenCounts(listenCounts);
    setStoredMemorizedAyahSet(memoMemorizedAyahSet);
    setStoredAyahMistakeStats(memoAyahMistakeStats);
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

function isPracticeOpen() {
  return Boolean(els.practicePanel?.classList.contains('is-open'));
}

function syncSpeechControlState() {
  if (!els.startBtn) return;
  const locked = isCurrentAyahLocked();
  const disabledForPractice = isPracticeOpen();
  const canToggleListening = !speechCaptureBlocked && (listening || keepListening || !locked);
  els.startBtn.disabled = disabledForPractice || !canToggleListening;
  els.startBtn.classList.toggle('is-muted', disabledForPractice);
  els.startBtn.setAttribute('aria-disabled', String(els.startBtn.disabled));
}

function setPracticeOpen(isOpen) {
  if (!els.practicePanel || !els.practiceToggle) return;

  const active = Boolean(isOpen);

  document.body.classList.toggle('memo-practice-open', active);

  els.practicePanel.classList.toggle('is-open', active);
  els.practicePanel.setAttribute('aria-hidden', String(!active));

  els.practiceToggle.classList.toggle('is-open', active);
  els.practiceToggle.setAttribute('aria-expanded', String(active));
  els.practiceToggle.setAttribute(
    'aria-label',
    active ? 'Return to recitation' : 'Practice writing'
  );

  const icon = els.practiceToggle.querySelector('.material-icons-outlined');
  if (icon) {
    icon.textContent = active ? 'record_voice_over' : 'edit';
  }

  const srLabel = els.practiceToggle.querySelector('.memo-sr-only');
  if (srLabel) {
    srLabel.textContent = active ? 'Return to recitation' : 'Practice writing';
  }

  // Hide word/ayah recitation area while practice is open
  if (els.wordsWrap) {
    els.wordsWrap.hidden = active;
    els.wordsWrap.setAttribute('aria-hidden', String(active));
  }

  // If you have a larger ayah panel wrapper, hide it too
  const ayahPanel = document.querySelector('.memo-ayah-panel');
  if (ayahPanel) {
    ayahPanel.classList.toggle('is-hidden', active);
    ayahPanel.setAttribute('aria-hidden', String(active));
  }

  if (active) {
    if (keepListening || listening) {
      stopListening();
    }

    if (els.reciteSettingsPanel) {
      els.reciteSettingsPanel.classList.add('is-hidden');
    }

    updateSpokenPreview('');
  }

  syncSpeechControlState();
  scheduleMemoLayoutSync();

  if (active) {
    window.requestAnimationFrame(() => {
      if (els.main) els.main.scrollTop = 0;
      if (els.practicePanel) els.practicePanel.scrollTop = 0;
      if (els.practiceContent) els.practiceContent.scrollTop = 0;

      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

      const target = els.practiceContent?.querySelector(
        '.translit-input, [contenteditable="true"]'
      );
      if (target && document.body.classList.contains('memo-practice-open')) {
        target.focus();
      }
    });
  }
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
  const label = String(text || '').trim();
  if (els.statusText) {
    els.statusText.textContent = label || 'Idle';
  } else {
    els.status.textContent = label || 'Idle';
  }
  els.status.classList.toggle('is-error', Boolean(isError));
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
  syncSpeechControlState();
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
  recordAyahMistake(current.surah, current.ayah, 1);
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
    els.reciteLine.textContent = '';
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
  lastFullReciteSignature = '';
  reciteEngine.stableMatchedIndex = 0;
  reciteEngine.candidateMatchedIndex = 0;
  reciteEngine.lastAlignment = null;
  reciteEngine.lastCommittedSignature = '';
  reciteEngine.stableRepeatCount = 0;
  reciteEngine.lastSpeechTokensSignature = '';
  renderFullReciteLine();
}

function setMemoReciteModeClass(fullMode) {
  const isFullMode = Boolean(fullMode);
  document.body.classList.toggle('memo-full-mode', isFullMode);
  document.body.classList.toggle('memo-word-mode', !isFullMode);
}

function mountWordsToOverlay(shouldOverlay) {
  if (!els.wordsWrap || !els.wordOverlay) return;
  const useOverlay = Boolean(shouldOverlay);
  const currentlyInOverlay = els.wordsWrap.parentElement === els.wordOverlay;

  if (useOverlay) {
    if (!currentlyInOverlay) {
      els.wordOverlay.appendChild(els.wordsWrap);
    }
  } else if (currentlyInOverlay) {
    const restoreParent = memoWordsOriginalParent || els.main || document.body;
    if (
      memoWordsOriginalNextSibling &&
      memoWordsOriginalNextSibling.parentElement === restoreParent
    ) {
      restoreParent.insertBefore(els.wordsWrap, memoWordsOriginalNextSibling);
    } else {
      restoreParent.appendChild(els.wordsWrap);
    }
  }

  els.wordOverlay.classList.toggle('is-active', useOverlay);
  els.wordOverlay.setAttribute('aria-hidden', String(!useOverlay));
}

function hasMemoWordBoxesRendered() {
  return Boolean(
    els.wordsWrap?.querySelector('.memo-word-grid .memo-word, .memo-word-grid .word-block')
  );
}
async function ensureMemoWordBoxesRendered() {
  if (isFullAyahReciteMode()) return;
  if (hasMemoWordBoxesRendered()) return;
  if (!isValidAyahRef(Number(current?.surah), Number(current?.ayah))) return;
  const loaded = await loadAyah(current.surah, current.ayah, { historyMode: 'none' });
  if (!loaded) return;
  applyReciteMatchModeUI();
  scheduleMemoLayoutSync();
}
function scheduleEnsureMemoWordBoxesRendered() {
  if (memoEnsureWordBoxesRaf) return;
  memoEnsureWordBoxesRaf = window.requestAnimationFrame(() => {
    memoEnsureWordBoxesRaf = 0;
    void ensureMemoWordBoxesRendered();
  });
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
      (expected && (normalizedToken === expected || isSpeechArabicMatch(expected, normalizedToken))) ||
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
  setMemoReciteModeClass(fullMode);
  updateToggleButton(els.reciteWordModeBtn, !fullMode);
  updateToggleButton(els.reciteFullModeBtn, fullMode);

  if (els.expectedHint) {
    els.expectedHint.classList.toggle('is-hidden', fullMode || !viewState.expectedAfterThreeWrong);
  }
  mountWordsToOverlay(false);
  if (els.wordsWrap) {
    els.wordsWrap.classList.toggle('is-hidden', fullMode);
    els.wordsWrap.style.display = fullMode ? 'none' : '';
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

  const practiceWordsMode = els.practiceContent?.querySelector('.memo-practice-mode-words');
const practiceParagraphMode = els.practiceContent?.querySelector('.memo-practice-mode-paragraph');

if (practiceWordsMode) {
  practiceWordsMode.classList.toggle('is-active', !fullMode);
}
if (practiceParagraphMode) {
  practiceParagraphMode.classList.toggle('is-active', fullMode);
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

  if (nextMode === RECITE_MATCH_MODE.WORD) {
    scheduleEnsureMemoWordBoxesRendered();
  }
}

function resetTranscript() {
  finalTranscript = '';
  speechCommittedTranscript = '';
  speechSessionFinals = [];
  lastFullReciteSignature = '';
  lastFinalCount = 0;
  interimPreview = '';
  if (els.finalText) els.finalText.textContent = '--';
  if (els.interimText) els.interimText.textContent = '--';
  showFeedback('');
  setLastMatchedWord('');
  updateExpectedWord();
  resetAlignmentEngine();
  if (isFullAyahReciteMode()) {
    resetFullReciteState();
  }
}


function resetAlignmentEngine() {
  reciteEngine.epoch = 0;
  reciteEngine.stableMatchedIndex = 0;
  reciteEngine.candidateMatchedIndex = 0;
  reciteEngine.lastAlignment = null;
  reciteEngine.lastCommittedSignature = '';
  reciteEngine.stableRepeatCount = 0;
  reciteEngine.lastSpeechTokensSignature = '';
}

function updateListenUI() {
  const count = Math.max(0, Number(listenCounts[ayahKey(current.surah, current.ayah)]) || 0);
  const pct = clamp((count / REQUIRED_LISTENS) * 100, 0, 100);
  if (els.progressFill) {
    els.progressFill.style.width = `${pct}%`;
  }
  if (els.progressText) {
    els.progressText.textContent = `${count} / ${REQUIRED_LISTENS}`;
  }
}

function setLockedState(isLocked) {
  const locked = ALLOW_ALL_AYAHS ? false : isLocked;
  if (els.lockOverlay) {
    els.lockOverlay.classList.toggle('is-visible', locked);
  }
  if (els.wordOverlay) {
    els.wordOverlay.classList.toggle('is-locked', locked);
  }
  if (els.lockMsg) {
    els.lockMsg.textContent = locked ? 'This ayah is locked until you complete the previous one.' : '';
  }
  if (els.playCount) {
    els.playCount.disabled = locked;
  }
  syncSpeechControlState();
  if (els.peekBtn) {
    els.peekBtn.disabled = locked;
  }
  if (els.stopBtn) {
    els.stopBtn.disabled = true;
  }
  syncPlaybackControlState();
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
  if (node.classList.contains('hidden-word')) {
    spoken.textContent = '';
    return;
  }
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
    els.reciteLine.textContent = preview || '--';
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

function setMemoAyahHtmlCacheEntry(key, html) {
  if (!key || typeof html !== 'string') return;
  if (memoAyahHtmlCache.has(key)) {
    memoAyahHtmlCache.delete(key);
  }
  memoAyahHtmlCache.set(key, html);
  while (memoAyahHtmlCache.size > MEMO_AYAH_HTML_CACHE_MAX) {
    const oldestKey = memoAyahHtmlCache.keys().next().value;
    if (!oldestKey) break;
    memoAyahHtmlCache.delete(oldestKey);
  }
}

function parseMemoAyahContent(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const learning = doc.querySelector('#learning-mode-content');
  if (!learning) {
    throw new Error('Ayah layout not found.');
  }
  let wordBlocks = Array.from(learning.querySelectorAll('.word-block'));
  if (!wordBlocks.length) {
    const fallbackText = String(
      doc.querySelector('#reciting-mode-content')?.textContent || learning.textContent || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const fallbackWords = fallbackText.match(/[\u0600-\u06FF]+/g) || [];
    wordBlocks = fallbackWords.map(word => {
      const block = doc.createElement('span');
      block.className = 'word-block';
      const text = doc.createElement('span');
      text.className = 'word-text';
      text.textContent = word;
      const metadata = doc.createElement('span');
      metadata.className = 'metadata';
      block.appendChild(text);
      block.appendChild(metadata);
      return block;
    });
  }
  if (!wordBlocks.length) {
    throw new Error('No words found for this ayah.');
  }
  const practiceBox = doc.querySelector('#transliteration-box');
  const practiceBlocks = practiceBox
    ? Array.from(practiceBox.querySelectorAll('.word-block-translit'))
    : [];
  return { wordBlocks, practiceBlocks };
}

async function fetchAyahContent(surah, ayah) {
  const safeSurah = Number(surah);
  const safeAyah = Number(ayah);
  if (!Number.isFinite(safeSurah) || !Number.isFinite(safeAyah)) {
    throw new Error('Invalid ayah');
  }

  const cacheKey = `${safeSurah}:${safeAyah}`;
  const cachedHtml = memoAyahHtmlCache.get(cacheKey);
  if (typeof cachedHtml === 'string' && cachedHtml) {
    return parseMemoAyahContent(cachedHtml);
  }

  const path = `ayahs/surah_${safeSurah}/ayah_${safeSurah}_${safeAyah}.html`;
  const candidates = [path, `/${path}`];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: 'force-cache' });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const parsed = parseMemoAyahContent(html);
      setMemoAyahHtmlCacheEntry(cacheKey, html);
      return parsed;
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

function buildExpectedTokenObjects() {
  return expectedWords.map((word, idx) => ({
    index: idx,
    original: word,
    normalizedArabic: normalize(word).replace(/\s+/g, ''),
    normalizedTranslit: normalizeTranslit(expectedTranslit[idx] || '')
  }));
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
  expectedTokenObjects = buildExpectedTokenObjects();
  els.wordsWrap.appendChild(wordsContainer);
}


function buildSpeechTokenObjects(rawTokens) {
  return Array.from(rawTokens || [])
    .map((raw, idx) => ({
      index: idx,
      raw: String(raw || '').trim(),
      normalizedArabic: normalize(raw).replace(/\s+/g, ''),
      normalizedTranslit: normalizeTranslit(raw),
      phoneticTranslit: normalizeTranslitPhonetic(raw)
    }))
    .filter(token => token.raw);
}


function getTokenMatchScore(expectedToken, speechToken) {
  if (!expectedToken || !speechToken) return { matched: false, score: Number.NEGATIVE_INFINITY, type: 'none' };

  const expectedArabic = expectedToken.normalizedArabic;
  const speechArabic = speechToken.normalizedArabic;
  const expectedTranslitNorm = expectedToken.normalizedTranslit;
  const speechRaw = speechToken.raw;

  if (expectedArabic && speechArabic && expectedArabic === speechArabic) {
    return { matched: true, score: 3.2, type: 'exact-arabic' };
  }

  if (expectedArabic && speechArabic && isSpeechArabicMatch(expectedArabic, speechArabic)) {
    return { matched: true, score: 2.35, type: 'fuzzy-arabic' };
  }

  if (expectedTranslitNorm && speechRaw && isTranslitSpeechMatch(expectedTranslitNorm, speechRaw)) {
    return { matched: true, score: 2.0, type: 'translit' };
  }

  return { matched: false, score: -1.25, type: 'none' };
}


function alignSpeechTokensToExpected(expectedTokens, speechTokens) {
  const eLen = expectedTokens.length;
  const sLen = speechTokens.length;

  const dp = Array.from({ length: eLen + 1 }, () =>
    Array(sLen + 1).fill(Number.NEGATIVE_INFINITY)
  );
  const back = Array.from({ length: eLen + 1 }, () =>
    Array(sLen + 1).fill(null)
  );

  dp[0][0] = 0;

  for (let i = 0; i <= eLen; i += 1) {
    for (let j = 0; j <= sLen; j += 1) {
      const base = dp[i][j];
      if (!Number.isFinite(base)) continue;

      if (i < eLen && j < sLen) {
        const match = getTokenMatchScore(expectedTokens[i], speechTokens[j]);
        const nextScore = base + match.score;
        if (nextScore > dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = nextScore;
          back[i + 1][j + 1] = {
            type: 'match',
            fromI: i,
            fromJ: j,
            matchType: match.type,
            matched: match.matched
          };
        }
      }

      if (i < eLen) {
        const nextScore = base - 0.82;
        if (nextScore > dp[i + 1][j]) {
          dp[i + 1][j] = nextScore;
          back[i + 1][j] = {
            type: 'skip-expected',
            fromI: i,
            fromJ: j
          };
        }
      }

      if (j < sLen) {
        const nextScore = base - 0.58;
        if (nextScore > dp[i][j + 1]) {
          dp[i][j + 1] = nextScore;
          back[i][j + 1] = {
            type: 'skip-spoken',
            fromI: i,
            fromJ: j
          };
        }
      }
    }
  }

  let bestI = 0;
  let bestJ = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i <= eLen; i += 1) {
    for (let j = 0; j <= sLen; j += 1) {
      if (dp[i][j] > bestScore) {
        bestScore = dp[i][j];
        bestI = i;
        bestJ = j;
      }
    }
  }

  const steps = [];
  let i = bestI;
  let j = bestJ;

  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (!step) break;
    steps.push({ ...step, toI: i, toJ: j });
    i = step.fromI;
    j = step.fromJ;
  }
  steps.reverse();

  const matchedPairs = [];
  for (const step of steps) {
    if (step.type === 'match' && step.matched) {
      matchedPairs.push({
        expectedIdx: step.toI - 1,
        spokenIdx: step.toJ - 1,
        matchType: step.matchType
      });
    }
  }

  return {
    score: bestScore,
    matchedPairs,
    stableMatchedIndex: computeStablePrefixFromPairs(matchedPairs),
    candidateMatchedIndex: computeCandidateIndexFromPairs(matchedPairs)
  };
}


function computeStablePrefixFromPairs(matchedPairs) {
  const matched = new Set((matchedPairs || []).map(p => p.expectedIdx));
  let idx = 0;
  while (matched.has(idx)) idx += 1;
  return idx;
}

function computeCandidateIndexFromPairs(matchedPairs) {
  if (!matchedPairs?.length) return 0;
  return Math.max(...matchedPairs.map(p => p.expectedIdx)) + 1;
}


function applyRevealFromAlignment(alignment, speechTokens) {
  if (!alignment) return;

  const nextStable = clamp(alignment.stableMatchedIndex || 0, 0, expectedWords.length);
  if (nextStable <= revealIndex) return;

  const pairByExpected = new Map();
  (alignment.matchedPairs || []).forEach(pair => {
    if (!pairByExpected.has(pair.expectedIdx)) {
      pairByExpected.set(pair.expectedIdx, pair);
    }
  });

  for (let idx = revealIndex; idx < nextStable; idx += 1) {
    const pair = pairByExpected.get(idx);
    const spokenText = pair ? speechTokens[pair.spokenIdx]?.raw || '' : '';
    if (spokenText) {
      setSpokenText(idx, spokenText);
    }
    revealWord(idx);
  }

  revealIndex = nextStable;
  updateExpectedWord();
  setLastProgressSnapshot();
  updateSpokenPreview('');

  if (revealIndex >= expectedWords.length) {
    completeAyah();
  }
}


function commitAlignment(alignment, speechTokens) {
  if (!alignment) return;

  reciteEngine.candidateMatchedIndex = Math.max(
    reciteEngine.candidateMatchedIndex,
    alignment.candidateMatchedIndex || 0
  );

  // Never regress stableMatchedIndex
  const stableIndex = Math.max(
    alignment.stableMatchedIndex || 0,
    reciteEngine.stableMatchedIndex
  );
  const signature = `${stableIndex}|${(alignment.matchedPairs || [])
    .map(p => `${p.expectedIdx}:${p.spokenIdx}:${p.matchType}`)
    .join(',')}`;

  if (signature === reciteEngine.lastCommittedSignature) {
    reciteEngine.stableRepeatCount += 1;
  } else {
    reciteEngine.lastCommittedSignature = signature;
    reciteEngine.stableRepeatCount = 1;
  }

  // Commit when stable index advances and alignment is confirmed stable
  // Accept on first alignment if all expected words are matched (completion)
  const isCompletion = stableIndex >= expectedWords.length;
  const hasExactMajority = (alignment.matchedPairs || []).filter(
    p => p.matchType === 'exact-arabic'
  ).length >= Math.floor(stableIndex * 0.5);
  const shouldCommit =
    stableIndex > revealIndex &&
    (reciteEngine.stableRepeatCount >= 2 || isCompletion || (stableIndex === revealIndex + 1 && hasExactMajority));

  reciteEngine.lastAlignment = alignment;

  if (shouldCommit) {
    reciteEngine.stableMatchedIndex = stableIndex;
    if (isFullAyahReciteMode()) {
      // In full ayah mode, update revealIndex and check for completion
      if (stableIndex > revealIndex) {
        const pairByExpected = new Map();
        (alignment.matchedPairs || []).forEach(pair => {
          if (!pairByExpected.has(pair.expectedIdx)) {
            pairByExpected.set(pair.expectedIdx, pair);
          }
        });
        for (let idx = revealIndex; idx < stableIndex; idx += 1) {
          const pair = pairByExpected.get(idx);
          const spokenText = pair ? speechTokens[pair.spokenIdx]?.raw || '' : '';
          if (spokenText) setSpokenText(idx, spokenText);
          revealWord(idx);
        }
        revealIndex = stableIndex;
        updateExpectedWord();
        setLastProgressSnapshot();
      }
      if (revealIndex >= expectedWords.length) {
        showFeedback('Ayah complete.', false);
        completeAyah();
      }
    } else {
      applyRevealFromAlignment(alignment, speechTokens);
    }
  }
}

function recomputeSpeechAlignment(finalText, interimText = '') {
  const liveTokensRaw = buildFullReciteLiveTokens(finalText, interimText);
  const speechTokens = buildSpeechTokenObjects(liveTokensRaw);
  if (!speechTokens.length || !expectedTokenObjects.length) return;

  const signature = speechTokens.map(t => getSpeechTokenSignature(t.raw)).join('|');
  if (signature && signature === reciteEngine.lastSpeechTokensSignature) {
    return;
  }
  reciteEngine.lastSpeechTokensSignature = signature;

  const alignment = alignSpeechTokensToExpected(expectedTokenObjects, speechTokens);
  commitAlignment(alignment, speechTokens);

  if (isFullAyahReciteMode()) {
    renderFullReciteFromAlignment(alignment, speechTokens);
  } else {
    renderWordPreviewFromAlignment(alignment, speechTokens);
  }
}

function renderFullReciteFromAlignment(alignment, speechTokens) {
  if (!els.reciteLine) return;

  // Map expected indices to their alignment pair for match-type info
  const matchedExpected = new Map();
  (alignment?.matchedPairs || []).forEach(pair => {
    if (!matchedExpected.has(pair.expectedIdx)) {
      matchedExpected.set(pair.expectedIdx, pair);
    }
  });

  // Never show fewer revealed words than already committed
  const committedStable = reciteEngine.stableMatchedIndex;
  const alignmentStable = alignment?.stableMatchedIndex || 0;
  const effectiveStable = Math.max(committedStable, alignmentStable);
  const candidateIdx = Math.max(
    reciteEngine.candidateMatchedIndex,
    alignment?.candidateMatchedIndex || 0,
    effectiveStable
  );

  // Build token list from expected ayah words with progressive status
  fullReciteTokens = expectedWords.map((word, idx) => {
    if (idx < effectiveStable) {
      // Stably matched — permanently revealed
      const pair = matchedExpected.get(idx);
      const isFuzzy = pair && pair.matchType !== 'exact-arabic';
      return { text: word, status: isFuzzy ? 'fuzzy' : 'correct' };
    }
    if (matchedExpected.has(idx)) {
      // Matched in current alignment but not yet committed stable
      return { text: word, status: 'candidate' };
    }
    if (idx < candidateIdx) {
      // Between stable and candidate — skipped/pending
      return { text: word, status: 'pending' };
    }
    // Future words not yet reached
    return { text: word, status: 'pending' };
  });

  fullReciteIndex = effectiveStable;
  renderFullReciteLine();
}

function renderWordPreviewFromAlignment(alignment, speechTokens) {
  if (isFullAyahReciteMode()) return;
  if (!alignment?.matchedPairs?.length) {
    updateSpokenPreview('');
    return;
  }

  const nextPair = alignment.matchedPairs.find(pair => pair.expectedIdx === revealIndex);
  if (!nextPair) {
    updateSpokenPreview('');
    return;
  }

  updateSpokenPreview(speechTokens[nextPair.spokenIdx]?.raw || '');
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
    .replace(/ah\b/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/ei/g, 'i')
    .replace(/ey/g, 'i')
    .replace(/ii+/g, 'i')
    .replace(/iy/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/uu+/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/ow/g, 'u')
    .replace(/aw/g, 'u')
    .replace(/kh/g, 'x')
    .replace(/gh/g, 'g')
    .replace(/sh/g, 's')
    .replace(/ch/g, 's')
    .replace(/th/g, 't')
    .replace(/dh/g, 'z')
    .replace(/zh/g, 'z')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/q/g, 'k')
    .replace(/c/g, 'k')
    .replace(/j/g, 'g')
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

function getArabicSpeechSimilarity(expected, candidate) {
  if (!expected || !candidate) return 0;
  const maxLen = Math.max(expected.length, candidate.length, 1);
  const strict = 1 - levenshtein(expected, candidate) / maxLen;
  const phonetic = 1 - phoneticLevenshtein(expected, candidate) / maxLen;
  return Math.max(strict, phonetic * 0.995);
}

function isSpeechArabicMatch(expected, candidate) {
  if (!expected || !candidate) return false;
  const similarity = getArabicSpeechSimilarity(expected, candidate);
  return similarity >= SPEECH_ARABIC_ACCEPT_SIMILARITY || (expected.length <= 4 && similarity >= SPEECH_ARABIC_SHORT_ACCEPT_SIMILARITY);
}

function getSpeechTokenSignature(rawToken) {
  const arabicNorm = normalize(rawToken).replace(/\s+/g, '');
  if (arabicNorm) return `ar:${arabicNorm}`;
  const phoneticNorm = normalizeTranslitPhonetic(rawToken);
  if (phoneticNorm) return `tr:${phoneticNorm}`;
  const translitNorm = normalizeTranslit(rawToken);
  return translitNorm ? `tr:${translitNorm}` : '';
}

function dedupeSpeechTokens(rawTokens, maxRun = SPEECH_DUPLICATE_RUN_LIMIT) {
  const deduped = [];
  let prevSignature = '';
  let runCount = 0;
  for (const rawToken of Array.from(rawTokens || [])) {
    const cleaned = String(rawToken || '').trim();
    if (!cleaned) continue;
    const signature = getSpeechTokenSignature(cleaned);
    if (!signature) continue;
    if (signature === prevSignature) {
      runCount += 1;
      if (runCount > maxRun) continue;
    } else {
      prevSignature = signature;
      runCount = 1;
    }
    deduped.push(cleaned);
  }
  return deduped;
}

function mergeSpeechTranscriptParts(...parts) {
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSessionFinalTranscript() {
  return speechSessionFinals
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function commitRecognitionSessionTranscript() {
  const sessionTranscript = getSessionFinalTranscript();
  if (!sessionTranscript) return;
  speechCommittedTranscript = mergeSpeechTranscriptParts(speechCommittedTranscript, sessionTranscript);
  speechSessionFinals = [];
  finalTranscript = speechCommittedTranscript;
}

function buildFullReciteLiveTokens(finalText, interimText = '') {
  const stableTokens = dedupeSpeechTokens(tokenizeRaw(finalText), SPEECH_DUPLICATE_RUN_LIMIT);
  if (!isFullAyahReciteMode()) {
    return stableTokens;
  }
  let previewTokens = dedupeSpeechTokens(tokenizeRaw(interimText), SPEECH_PREVIEW_DUPLICATE_RUN_LIMIT);
  if (stableTokens.length && previewTokens.length) {
    const stableTailSignature = getSpeechTokenSignature(stableTokens[stableTokens.length - 1]);
    while (previewTokens.length && getSpeechTokenSignature(previewTokens[0]) === stableTailSignature) {
      previewTokens.shift();
    }
  }
  return dedupeSpeechTokens(stableTokens.concat(previewTokens), SPEECH_DUPLICATE_RUN_LIMIT);
}

function scoreRecognitionTranscriptCandidate(rawTranscript, expectedIndex = revealIndex) {
  const transcript = String(rawTranscript || '').trim();
  if (!transcript) return Number.NEGATIVE_INFINITY;
  const expectedArabic = expectedNormalized[expectedIndex] || '';
  const expectedTranslitNorm = expectedTranslit[expectedIndex] || '';
  if (!expectedArabic && !expectedTranslitNorm) return 0;

  const rawTokens = tokenizeRaw(transcript);
  if (!rawTokens.length) return Number.NEGATIVE_INFINITY;

  let bestScore = 0;
  const maxSpan = Math.min(3, rawTokens.length);
  for (let span = 1; span <= maxSpan; span += 1) {
    const rawCandidate = rawTokens.slice(0, span).join(' ');
    const candidateArabic = normalize(rawCandidate).replace(/\s+/g, '');
    const candidateTranslit = normalizeTranslit(rawCandidate);
    if (expectedArabic && candidateArabic) {
      bestScore = Math.max(bestScore, getArabicSpeechSimilarity(expectedArabic, candidateArabic));
    }
    if (expectedTranslitNorm && candidateTranslit) {
      bestScore = Math.max(bestScore, translitSimilarity(candidateTranslit, expectedTranslitNorm));
    }
  }
  return bestScore;
}

function pickBestRecognitionTranscript(result, expectedIndex = revealIndex) {
  if (!result || !result.length) return '';
  let bestTranscript = '';
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < result.length; i += 1) {
    const option = result[i];
    const transcript = String(option?.transcript || '').trim();
    if (!transcript) continue;
    const confidence = Number(option?.confidence) || 0;
    const score = scoreRecognitionTranscriptCandidate(transcript, expectedIndex) + confidence * 0.08;
    if (score > bestScore) {
      bestScore = score;
      bestTranscript = transcript;
    }
  }
  return bestTranscript || String(result[0]?.transcript || '').trim();
}

function updateTranslitFeedback(input) {
  const block = input.closest('.word-block-translit');
  if (!block) return;
  const expected = normalizeTranslit(input.dataset.expected || '');
  const actual = normalizeTranslit(input.value || '');
  const similarity = translitSimilarity(actual, expected);
  const status = actual ? classifyTranslitSimilarity(similarity) : '';

  block.style.borderColor = 'gray';
  block.classList.remove('confetti');

  if (!actual) {
    block.style.backgroundColor = '#ffffff';
    return;
  }

  if (status === 'correct') {
    block.style.backgroundColor = '#d4edda';
    block.style.borderColor = '#28a745';
    block.classList.add('confetti');
  } else if (status === 'fuzzy') {
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
  

  const wordsMode = document.createElement('div');
  wordsMode.className = 'memo-practice-mode memo-practice-mode-words';
  const wordGrid = document.createElement('div');
  wordGrid.className = 'memo-practice-word-grid';
  wordsMode.appendChild(wordGrid);

  practiceBlocks.forEach(block => {
    const clone = block.cloneNode(true);
    clone.removeAttribute('onclick');
    clone.removeAttribute('style');
    clone.classList.add('memo-practice-word-card');
    clone.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    clone.querySelectorAll('details').forEach(detail => {
      detail.open = false;
    });

    const input = clone.querySelector('.translit-input');
    if (input) {
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
    }

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

function handleAudioEnded() {
  if (!audioQueue) {
    syncPlaybackControlState();
    return;
  }

  updateListenCount(1);
  audioQueue = Math.max(0, audioQueue - 1);

  if (audioQueue > 0 && audio) {
    audio.currentTime = 0;
    syncPlaybackControlState();
    audio.play().catch(() => {
      audioQueue = 0;
      syncPlaybackControlState();
    });
    return;
  }

  audioQueue = 0;
  syncPlaybackControlState();
  advanceMistakeDrill('playback');
}

async function loadAyah(surah, ayah) {
  const requestId = ++loadAyahRequestId;
  stopAllMemoActivity();

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
    if (requestId !== loadAyahRequestId) return false;
    if (current.surah !== target.surah || current.ayah !== target.ayah) return false;

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
    audio = new Audio(getAudioUrl(target.surah, target.ayah));
    audioQueue = 0;
    audio.addEventListener('ended', handleAudioEnded);
    syncPlaybackControlState();
    scheduleMemoLayoutSync();
    return true;
  } catch (err) {
    if (requestId !== loadAyahRequestId) return false;
    setStatus('Failed', true);
    expectedWords = [];
    expectedNormalized = [];
    expectedTranslit = [];
    revealIndex = 0;
    if (els.wordsWrap) {
      els.wordsWrap.innerHTML = '';
    }
    updateExpectedWord();
    syncPlaybackControlState();
    const message = err && err.message ? err.message : 'Could not load ayah';
    showFeedback(message, true);
    return false;
  }
}

function getAudioUrl(surah, ayah) {
  const safeSurah = String(Number(surah) || 1).padStart(3, '0');
  const safeAyah = String(Number(ayah) || 1).padStart(3, '0');
  return `https://verses.quran.com/Alafasy/mp3/${safeSurah}${safeAyah}.mp3`;
}

function updateAyahSelectors() {
  if (!els.surahSelect || !els.ayahSelect) {
    updateSketchNavMeta();
    return;
  }
  const surahOpt = els.surahSelect.querySelector(`option[value="${current.surah}"]`);
  if (surahOpt) surahOpt.selected = true;
  buildAyahOptions(current.surah);
  const ayahOpt = els.ayahSelect.querySelector(`option[value="${current.ayah}"]`);
  if (ayahOpt) ayahOpt.selected = true;
  updateSketchNavMeta();
}

function buildSurahOptions() {
  if (!els.surahSelect) return;
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
  if (!els.ayahSelect) return;
  const surahInfo = surahList.find(s => Number(s.number) === Number(surahNum));
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
  const surahInfo = surahList.find(s => Number(s.number) === Number(current.surah));
  if (!surahInfo) return null;
  if (current.ayah < surahInfo.ayahCount) {
    return { surah: current.surah, ayah: current.ayah + 1 };
  }
  const nextSurah = surahList.find(s => Number(s.number) === Number(current.surah) + 1);
  if (!nextSurah) return null;
  return { surah: Number(nextSurah.number), ayah: 1 };
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
      const isArabicMatch = candidate === expected || isSpeechArabicMatch(expected, candidate);
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
  const wasListening = keepListening || listening;
  stopListening();
  updateExpectedWord();
  const memorizedSurah = Number(current.surah) || 1;
  const memorizedAyah = Number(current.ayah) || 1;
  markAyahMemorized(memorizedSurah, memorizedAyah);
  setStoredLastMemorized({
    surah: memorizedSurah,
    ayah: memorizedAyah,
    timestamp: Date.now()
  });
  notifyParentMemoAyahMemorized(memorizedSurah, memorizedAyah);
  unlockNextAyah();
  buildSurahOptions();
  buildAyahOptions(current.surah);
  refreshWelcomeDashboard();

  if (isMistakeDrillActive()) {
    advanceMistakeDrill('complete');
    return;
  }

  if (autoNextOnComplete) {
    const next = getNextAyah();
    if (next) {
      showFeedback('Ayah complete - next ayah', false);
      goMemo({ view: 'ayah', surah: next.surah, ayah: next.ayah }, { historyMode: 'push' }).then(() => {
        if (wasListening) startListening();
      });
      return;
    }
  }
  showModal(true);
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speechCaptureBlocked = true;
    setStatus('Speech not supported', true);
    syncSpeechControlState();
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  rec.lang = 'ar-SA';

  rec.onstart = () => {
    listening = true;
    speechCaptureBlocked = false;
    clearRecognitionRestartTimer();
    speechSessionFinals = [];
    setStatus('Listening');
    els.stopBtn.disabled = false;
    setMemoListeningUI(true);
  };

  rec.onend = () => {
    listening = false;
    commitRecognitionSessionTranscript();
    els.stopBtn.disabled = true;
    if (keepListening) {
      setStatus('Reconnecting');
      scheduleRecognitionRestart();
      handleSpeechRestartBoundary(); 
      return;
    }
    setStatus('Idle');
    setMemoListeningUI(false);
    updateListenUI();
  };

  rec.onerror = evt => {
    setStatus('Error', true);
    showFeedback(evt.error || 'Speech error', true);
    if (evt.error === 'not-allowed' || evt.error === 'service-not-allowed') {
      keepListening = false;
      speechCaptureBlocked = true;
      clearRecognitionRestartTimer();
      els.stopBtn.disabled = true;
      setStatus('Mic blocked', true);
      showFeedback('Microphone permission denied', true);
      setMemoListeningUI(false);
      return;
    }
    if (keepListening) {
      handleSpeechRestartBoundary();  
      scheduleRecognitionRestart(420);
    }
  };

  rec.onresult = evt => {
    const interimParts = [];
    for (let i = evt.resultIndex; i < evt.results.length; i += 1) {
      const res = evt.results[i];
      const expectedIndexBase = isFullAyahReciteMode()
        ? Math.max(reciteEngine.stableMatchedIndex, fullReciteIndex)
        : revealIndex;
      const expectedIndex = expectedWords.length
        ? Math.min(expectedWords.length - 1, Math.max(0, expectedIndexBase + (i - evt.resultIndex)))
        : 0;
      const transcript = pickBestRecognitionTranscript(res, expectedIndex);
      if (!transcript) continue;
      if (res.isFinal) {
        speechSessionFinals[i] = transcript;
      } else {
        interimParts.push(transcript);
      }
    }

    finalTranscript = mergeSpeechTranscriptParts(speechCommittedTranscript, getSessionFinalTranscript());
    const interim = interimParts.join(' ').replace(/\s+/g, ' ').trim();

    if (els.finalText) {
      els.finalText.textContent = finalTranscript || '--';
    }
    if (els.interimText) {
      els.interimText.textContent = interim || '--';
    }

    interimPreview = interim;
    recomputeSpeechAlignment(finalTranscript, interim);
    const previewTokens = dedupeSpeechTokens(tokenizeRaw(interimPreview), SPEECH_PREVIEW_DUPLICATE_RUN_LIMIT);
    updateSpokenPreview(previewTokens.slice(-2).join(' '));

    if (isFullAyahReciteMode()) {
      // Full ayah rendering is handled by recomputeSpeechAlignment above
      // via renderFullReciteFromAlignment — no separate token rebuild needed.
      return;
    }

    const finalRawTokens = dedupeSpeechTokens(tokenizeRaw(finalTranscript), SPEECH_DUPLICATE_RUN_LIMIT);
    const stableTranscript = finalRawTokens.join(' ');
    const tokens = tokenize(stableTranscript);
    const rawTokens = finalRawTokens;
    if (tokens.length < lastFinalCount) {
      lastFinalCount = tokens.length;
    }
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
    syncRevealFromTranslitTranscript(stableTranscript);
  };

  return rec;
}


function handleSpeechRestartBoundary() {
  reciteEngine.epoch += 1;
  reciteEngine.lastSpeechTokensSignature = '';
  reciteEngine.lastCommittedSignature = '';
  reciteEngine.stableRepeatCount = 0;
}

function startListening() {
  if (isPracticeOpen()) {
    showFeedback('Close practice mode to use speech recitation.', true);
    syncSpeechControlState();
    return;
  }
  if (!recognition) recognition = initRecognition();
  if (!recognition) return;
  if (keepListening || listening) {
    stopListening();
    return;
  }
  keepListening = true;
  clearRecognitionRestartTimer();
  resetTranscript();
  handleSpeechRestartBoundary();  
  setStatus('Starting');
  
  syncSpeechControlState();
  try {
    recognition.start();
  } catch (err) {
    const name = err && err.name ? String(err.name) : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      keepListening = false;
      speechCaptureBlocked = true;
      els.stopBtn.disabled = true;
      syncSpeechControlState();
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
  refreshQuickActionAvailability();
  if (document.body.classList.contains('memo-welcome-mode')) {
    refreshWelcomeDashboard();
  }
}

function isCurrentAyahLocked() {
  return ALLOW_ALL_AYAHS ? false : isLockedAyah(current.surah, current.ayah);
}

function syncPlaybackControlState() {
  const hasAudioQueue = audioQueue > 0;
  const locked = isCurrentAyahLocked();
  const playIcon = els.playBtn?.querySelector('.material-icons-outlined');

  if (els.playBtn) {
    els.playBtn.disabled = locked || !audio;
    els.playBtn.classList.toggle('is-active', hasAudioQueue);
    els.playBtn.setAttribute('aria-label', hasAudioQueue ? 'Stop playback' : 'Play ayah');
  }
  if (playIcon) {
    playIcon.textContent = hasAudioQueue ? 'stop' : 'play_arrow';
  }
  if (els.navSpeakerBtn) {
    els.navSpeakerBtn.disabled = locked || hasAudioQueue || !audio;
  }
  if (els.playCount) {
    els.playCount.disabled = locked || hasAudioQueue;
  }
}

function stopAudioPlayback() {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  audioQueue = 0;
  syncPlaybackControlState();
}

function playAudio(times) {
  if (!audio || isCurrentAyahLocked()) return;
  if (audioQueue > 0) return;
  const count = clamp(times, 1, 50);
  audioQueue = count;
  audio.currentTime = 0;
  syncPlaybackControlState();
  audio.play().catch(() => {
    audioQueue = 0;
    syncPlaybackControlState();
  });
}

function animateMemoAyahTransition(direction = 1, phase = 'out') {
  const root = els.main || els.wordsWrap?.closest('.memo-panel') || null;
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
    easing: phase === 'out' ? 'cubic-bezier(0.4, 0, 1, 1)' : 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'both'
  });
  return animation.finished
    .catch(() => undefined)
    .finally(() => {
      root.style.transform = '';
      root.style.opacity = '';
    });
}

async function goMemo(route, opts = {}) {
  const {
    historyMode = 'replace',
    animated = false,
    direction = 1,
    notify = true,
    source = 'default'
  } = opts;

  if (source !== 'mistake-drill' && memoMistakeDrillQueue.length) {
    clearMistakeDrillSession();
  }

  if (!route || route.view === 'home') {
    setModeWelcome({ historyMode });
    if (notify) notifyParentMemoNavigationReady(current.surah, current.ayah);
    return true;
  }

  const surah = Number(route.surah);
  const ayah = Number(route.ayah);
  if (!isValidAyahRef(surah, ayah)) return false;

  if (animated) {
    await animateMemoAyahTransition(direction, 'out');
  }

  const ok = await enterMemoAyah(surah, ayah, { historyMode });
  if (ok && animated) {
    await animateMemoAyahTransition(direction, 'in');
  }
  if (ok && notify) notifyParentMemoNavigationReady(current.surah, current.ayah);
  return ok;
}

function applyMemoRouteFromUrlNavigation() {
  goMemo(getMemoRouteFromUrl(), { historyMode: 'none', notify: false });
}

function notifyParentMemoNavigationReady(surah, ayah) {
  const view = document.body.classList.contains('memo-sketch-mode') ? 'ayah' : 'home';
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'MEMO_NAVIGATION_READY', surah, ayah, view },
        window.location.origin === 'null' ? '*' : window.location.origin
      );
    }
  } catch (_) {}
}

function notifyParentMemoAyahMemorized(surah, ayah) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'MEMO_AYAH_MEMORIZED', surah, ayah },
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
      'select, option, input, textarea, [contenteditable="true"], .memo-practice-panel, .memo-word-controls, .memo-sketch-toolbar-block, .memo-transparent-strip, .memo-nav-bar, .memo-bottom-nav'
    )
  );
}

function bindMemoSwipeNavigation() {
  const swipeRoot = document.body;
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
    goMemo({ view: 'ayah', surah: next.surah, ayah: next.ayah }, {
      historyMode: 'push',
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

function getMemoResumeTarget(options = {}) {
  const lastProgress = options.lastProgress ?? getStoredLastProgress();
  const progressRef = normalizeStoredAyahRef(lastProgress);
  const lastMemorized = options.lastMemorized ?? getStoredLastMemorized();
  const lastMemorizedRef = normalizeStoredAyahRef(lastMemorized);
  const progressTimestamp = Number(lastProgress?.timestamp) || 0;
  const lastMemorizedTimestamp = Number(lastMemorized?.timestamp) || 0;
  const progressIsComplete = progressRef && isMemoProgressComplete(lastProgress, options);
  const progressIsStale = Boolean(
    progressRef &&
    lastMemorizedRef &&
    compareAyah(lastMemorizedRef, progressRef) >= 0 &&
    lastMemorizedTimestamp >= progressTimestamp
  );

  if (progressRef && !progressIsComplete && !progressIsStale) {
    return progressRef;
  }

  const unlockedRef = normalizeStoredAyahRef(options.unlockedRef ?? unlocked) || getStoredProgress();
  if (isValidStoredAyahRef(unlockedRef)) {
    return {
      surah: Number(unlockedRef.surah),
      ayah: Number(unlockedRef.ayah)
    };
  }

  if (progressRef) {
    return progressRef;
  }

  return { ...FIRST_MEMO_AYAH };
}

function bindMemoUiEvents() {
  if (memoUiEventsBound) return;
  memoUiEventsBound = true;

  if (els.homeBtn) {
    els.homeBtn.addEventListener('click', event => {
      event.preventDefault();
      void goMemo({ view: 'home' }, { historyMode: 'push', notify: true });
    });
  }

  if (els.menuBtn) {
    els.menuBtn.addEventListener('click', event => {
      event.preventDefault();
      if (document.body.classList.contains('memo-sketch-mode')) {
        void goMemo({ view: 'home' }, { historyMode: 'push', notify: true });
        return;
      }
      setMemoProfileDrawerOpen(true);
    });
  }

  if (els.profileDrawerBackdrop) {
    els.profileDrawerBackdrop.addEventListener('click', () => {
      setMemoProfileDrawerOpen(false);
    });
  }

  if (els.profileDrawerCloseBtn) {
    els.profileDrawerCloseBtn.addEventListener('click', () => {
      setMemoProfileDrawerOpen(false);
    });
  }

  if (els.drawerSignOutBtn) {
    els.drawerSignOutBtn.addEventListener('click', async () => {
      try {
        await logout();
      } catch (err) {
        console.warn('[MEMO] Logout failed', err);
      } finally {
        setMemoProfileDrawerOpen(false);
        void goMemo({ view: 'home' }, { historyMode: 'replace', notify: true });
      }
    });
  }

  if (els.welcomeStartBtn) {
    els.welcomeStartBtn.addEventListener('click', async () => {
      const target = getMemoResumeTarget();
      await goMemo(
        { view: 'ayah', surah: target.surah, ayah: target.ayah },
        { historyMode: 'push', notify: true }
      );
    });
  }

  if (els.techniquePracticeBtn) {
    els.techniquePracticeBtn.addEventListener('click', () => {
      openMemoPracticeView();
    });
  }

  if (els.techniqueMistakeBtn) {
    els.techniqueMistakeBtn.addEventListener('click', () => {
      startMistakeDrill();
    });
  }

  if (els.techniqueSurahListBtn) {
    els.techniqueSurahListBtn.addEventListener('click', () => {
      openMemoSurahListView();
    });
  }

  if (els.techniqueReciteBtn) {
    els.techniqueReciteBtn.addEventListener('click', () => {
      const memorizedRefs = getMemorizedAyahRefs();
      const canUseRandomAyah = memorizedRefs.length > 0 && hasMemorizedFirstNAyahs(RANDOM_AYAH_MIN_MEMORIZED);
      if (!canUseRandomAyah) {
        showMemoToast(`Memorize the first ${RANDOM_AYAH_MIN_MEMORIZED} ayahs to enable this.`);
        return;
      }
      const target = pickRandomAyahRef(memorizedRefs);
      if (!target) {
        showMemoToast('No memorized ayah available yet.');
        return;
      }
      void goMemo({ view: 'ayah', surah: target.surah, ayah: target.ayah }, { historyMode: 'push' });
    });
  }

  if (els.techniqueRepeatBtn) {
    els.techniqueRepeatBtn.addEventListener('click', () => {
      const memorizedRefs = getMemorizedAyahRefs();
      if (memorizedRefs.length < REVIEW_LAST5_MIN_MEMORIZED) {
        showMemoToast(`Memorize at least ${REVIEW_LAST5_MIN_MEMORIZED} ayahs to enable this.`);
        return;
      }
      const reviewPool = memorizedRefs.slice(-REVIEW_LAST5_MIN_MEMORIZED);
      const target = pickRandomAyahRef(reviewPool) || reviewPool[reviewPool.length - 1];
      if (!target) {
        showMemoToast('No review ayah available yet.');
        return;
      }
      void goMemo({ view: 'ayah', surah: target.surah, ayah: target.ayah }, { historyMode: 'push' });
    });
  }

  if (els.externalCloseBtn) {
    els.externalCloseBtn.addEventListener('click', () => {
      closeMemoExternalView();
    });
  }

  if (els.surahSelect) {
    els.surahSelect.addEventListener('change', () => {
      const surah = Number(els.surahSelect.value);
      if (!Number.isFinite(surah)) return;
      buildAyahOptions(surah);
      const ayah = Number(els.ayahSelect?.value) || 1;
      void goMemo({ view: 'ayah', surah, ayah }, { historyMode: 'push' });
    });
  }

  if (els.ayahSelect) {
    els.ayahSelect.addEventListener('change', () => {
      const surah = Number(els.surahSelect?.value) || Number(current?.surah) || 1;
      const ayah = Number(els.ayahSelect.value);
      if (!Number.isFinite(ayah)) return;
      void goMemo({ view: 'ayah', surah, ayah }, { historyMode: 'push' });
    });
  }
}

async function init() {
  normalizeEmbeddedRouteParam();

  const appSettings = getStoredAppSettings();
  applyMemoTheme(appSettings.darkMode === true);
  applyMemoTypography(appSettings);

  unlocked = getStoredProgress();
  listenCounts = getStoredListenCounts();
  memoMemorizedAyahSet = getStoredMemorizedAyahSet();
  memoAyahMistakeStats = getStoredAyahMistakeStats();
  mergeMemorizedAyahsFromSavedHistory();

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
  bindMemoUiEvents();

  surahList = await fetchSurahList();
  if (!Array.isArray(surahList) || !surahList.length) {
    setStatus('No data', true);
    if (els.welcomeStartBtn) {
      els.welcomeStartBtn.disabled = true;
    }
    refreshQuickActionAvailability();
    scheduleMemoLayoutSync();
    return;
  }

  current = getMemoResumeTarget();
  buildSurahOptions();
  buildAyahOptions(current.surah);
  updateAyahSelectors();
  refreshQuickActionAvailability();

  const initialRoute = getMemoRouteFromUrl();
  await goMemo(initialRoute, { historyMode: 'replace', notify: true });
  await refreshWelcomeDashboard();
  bindMemoSwipeNavigation();
  scheduleMemoLayoutSync();
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

if (els.reciteWordModeBtn) {
  els.reciteWordModeBtn.addEventListener('click', () => {
    setReciteMatchMode(RECITE_MATCH_MODE.WORD);
  });
}

if (els.reciteFullModeBtn) {
  els.reciteFullModeBtn.addEventListener('click', () => {
    setReciteMatchMode(RECITE_MATCH_MODE.FULL);
  });
}

if (els.playBtn) {
  els.playBtn.addEventListener('click', () => {
    if (audioQueue > 0) {
      stopAudioPlayback();
      return;
    }
    const times = Number(els.playCount?.value || 1);
    playAudio(times);
  });
}

if (els.navSpeakerBtn) {
  els.navSpeakerBtn.addEventListener('click', () => {
    playAudio(1);
  });
}

if (els.navPrevBtn) {
  els.navPrevBtn.addEventListener('click', () => {
    const prev = getAdjacentAyah(-1);
    if (!prev) return;
    goMemo({ view: 'ayah', surah: prev.surah, ayah: prev.ayah }, { historyMode: 'push', animated: true, direction: -1 });
  });
}

if (els.navNextBtn) {
  els.navNextBtn.addEventListener('click', () => {
    const next = getAdjacentAyah(1);
    if (!next) return;
    goMemo({ view: 'ayah', surah: next.surah, ayah: next.ayah }, { historyMode: 'push', animated: true, direction: 1 });
  });
}

if (els.prevAyahBtn) {
  els.prevAyahBtn.addEventListener('click', () => {
    const prev = getAdjacentAyah(-1);
    if (!prev) return;
    goMemo({ view: 'ayah', surah: prev.surah, ayah: prev.ayah }, { historyMode: 'push', animated: true, direction: -1 });
  });
}

if (els.nextAyahBtn) {
  els.nextAyahBtn.addEventListener('click', () => {
    const next = getAdjacentAyah(1);
    if (!next) return;
    goMemo({ view: 'ayah', surah: next.surah, ayah: next.ayah }, { historyMode: 'push', animated: true, direction: 1 });
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
    goMemo({ view: 'ayah', surah: next.surah, ayah: next.ayah }, { historyMode: 'push' });
  }
});

const autoNextToggle = document.getElementById('memoAutoNextToggle');
if (autoNextToggle) {
  autoNextToggle.checked = autoNextOnComplete;
  autoNextToggle.addEventListener('change', () => {
    autoNextOnComplete = autoNextToggle.checked;
    try { localStorage.setItem(STORAGE_AUTO_NEXT, autoNextOnComplete ? '1' : '0'); } catch {}
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && memoDrawerOpen) {
    setMemoProfileDrawerOpen(false);
  }
});

window.addEventListener('pagehide', () => {
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

updateLearnNavLink();
if (isEmbedded) {
  document.body.classList.add('embedded');
}

if (els.main && !els.main.classList.contains('is-hidden')) {
  setMemoMode('sketch');
} else {
  setMemoMode('welcome');
}
syncMemoMenuButtonMode();
syncMemoSketchTopNavLayout();
scheduleMemoLayoutSync();
window.addEventListener('resize', scheduleMemoLayoutSync);
window.addEventListener('pageshow', scheduleMemoLayoutSync);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopListening();
    return;
  }
  scheduleMemoLayoutSync();
});
window.addEventListener('popstate', () => {
  if (memoApplyingPopState) return;
  memoApplyingPopState = true;
  try {
    applyMemoRouteFromUrlNavigation();
  } finally {
    memoApplyingPopState = false;
  }
});
enableNativeInteractionGuard();
bindBottomNavSystemBarColor();
window.addEventListener('message', event => {
  const source = event?.source || null;
  const fromParent = Boolean(source && source === window.parent);
  const fromExternalFrame = Boolean(source && source === els.externalFrame?.contentWindow);
  if (source && !fromParent && !fromExternalFrame) return;

  const data = event?.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SURAH_LIST_ACTION' && fromExternalFrame) {
    handleMemoNestedSurahListAction(data);
    return;
  }

  if (data.type === 'MEMO_PRACTICE_GO_HOME' && fromExternalFrame) {
    closeMemoExternalView();
    goMemo({ view: 'home' }, { historyMode: 'replace', notify: true });
    return;
  }

  if (data.type === 'MEMO_PRACTICE_FINISH' && fromExternalFrame) {
    showMemoToast('Practice finished.');
    return;
  }

  if (data.type === 'APPLY_THEME') {
    applyMemoTheme(data.darkMode === true);
    return;
  }
  if (data.type === 'APPLY_SETTINGS') {
    applyMemoTypography(data.settings || {});
    return;
  }
  if (data.type === 'OPEN_MEMO_SETTINGS') {
    if (!document.body.classList.contains('memo-sketch-mode')) return;
    if (!els.reciteSettingsPanel) return;
    els.reciteSettingsPanel.classList.toggle('is-hidden');
    scheduleMemoLayoutSync();
    return;
  }
  if (data.type === 'MEMO_HOST_DEACTIVATE') {
    if (!USE_HOST_MAIN_NAV) return;
    memoHostActive = false;
    setMemoProfileDrawerOpen(false);
    setHostMainNavbarHidden(false);
    restoreMemoNavFromMain();
    scheduleMemoLayoutSync();
    return;
  }
  if (data.type === 'MEMO_HOST_ACTIVATE') {
    if (USE_HOST_MAIN_NAV) {
      memoHostActive = true;
      setHostMainNavbarHidden(false);
      scheduleMemoLayoutSync();
    }
    notifyParentMemoNavigationReady(current.surah, current.ayah);
    return;
  }

  if (data.type === 'NAVIGATE_MEMO_HOME') {
    goMemo({ view: 'home' }, { historyMode: 'none', notify: true });
    return;
  }

  if (data.type === 'NAVIGATE_MEMO_AYAH') {
    const surah = Number(data.surah);
    const ayah = Number(data.ayah);
    if (!isValidAyahRef(surah, ayah)) return;
    goMemo({ view: 'ayah', surah, ayah }, { historyMode: 'none' });
  }
});
onAuthChange(user => {
  memoUser = user;
  refreshWelcomeDashboard();
  if (user && !user.isAnonymous) {
    hydrateMemorizationFromDb();
  }
});
init().catch(err => {
  console.error('[MEMO] Init failed', err);
  setStatus('Failed', true);
  if (els.welcomeStartBtn) {
    els.welcomeStartBtn.disabled = true;
  }
  showMemoToast('Memorization failed to initialize.');
});

