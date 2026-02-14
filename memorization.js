import { fetchSurahList } from './services/quranApi.js';
import {
  onAuthChange,
  getMemorizationData,
  saveMemorizationData
} from './services/_private/firestoreService.js';

const REQUIRED_LISTENS = 20;
const ALLOW_ALL_AYAHS = true;
const STORAGE_PROGRESS = 'memo_progress_v1';
const STORAGE_LISTENS = 'memo_listens_v1';
const STORAGE_LAST_PROGRESS = 'memo_last_progress_v1';
const STORAGE_PRACTICE_MODE = 'memo_practice_mode_v1';
const MAX_ALIGN_EXPECTED_SPAN = 5;
const MAX_ALIGN_ACTUAL_SPAN = 3;
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
  welcomeJourneyBtn: document.getElementById('memoWelcomeJourneyBtn'),
  welcomeResumeBtn: document.getElementById('memoWelcomeResumeBtn'),
  homeBtn: document.getElementById('memoHomeBtn'),
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
  lastWord: document.getElementById('memoLastWord'),
  expectedWord: document.getElementById('memoExpectedWord'),
  toggleMeaning: document.getElementById('memoToggleMeaning'),
  toggleGrammar: document.getElementById('memoToggleGrammar'),
  peekBtn: document.getElementById('memoPeekBtn'),
  practiceToggle: document.getElementById('memoPracticeToggle'),
  practicePanel: document.getElementById('memoPracticePanel'),
  practiceContent: document.getElementById('memoPracticeContent'),
  modal: document.getElementById('memoCompleteModal'),
  reviseBtn: document.getElementById('memoReviseBtn'),
  nextBtn: document.getElementById('memoNextBtn')
};

let surahList = [];
let current = { surah: 1, ayah: 1 };
let unlocked = { surah: 1, ayah: 1 };
let listenCounts = {};
let audio = null;
let audioQueue = 0;
let recognition = null;
let listening = false;
let keepListening = false;
let recognitionRestartTimer = 0;
let expectedWords = [];
let expectedNormalized = [];
let revealIndex = 0;
let finalTranscript = '';
let lastFinalCount = 0;
let peekTimeout = null;
let interimPreview = '';
let memoUser = null;
let memoSyncTimer = 0;
let isHydratingMemo = false;
let welcomeBrainAnimation = null;
const viewState = {
  meaning: true,
  grammar: false
};
const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';
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
  // Quranic orthography variants: "صلوة" -> "صلاة", then collapse final ta marbuta/heh.
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

function buildMemoPayload() {
  return {
    unlocked,
    listens: listenCounts,
    lastProgress: getStoredLastProgress()
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

function openMemorizationWorkspace() {
  if (els.welcome) {
    els.welcome.classList.add('is-hidden');
    els.welcome.setAttribute('aria-hidden', 'true');
  }
  if (els.main) {
    els.main.classList.remove('is-hidden');
    els.main.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.remove('memo-welcome-mode');
}

function mergeMemorizationState(localData, remoteData) {
  const merged = {
    unlocked: localData.unlocked || { surah: 1, ayah: 1 },
    listens: { ...(localData.listens || {}) },
    lastProgress: localData.lastProgress || null
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
      lastProgress: getStoredLastProgress()
    };
    const merged = mergeMemorizationState(localMemo, remoteMemo);

    unlocked = merged.unlocked || unlocked;
    listenCounts = merged.listens || listenCounts;
    setStoredProgress(unlocked);
    setStoredListenCounts(listenCounts);
    if (merged.lastProgress) {
      localStorage.setItem(STORAGE_LAST_PROGRESS, JSON.stringify(merged.lastProgress));
    }
    buildSurahOptions();
    buildAyahOptions(current.surah);
    updateListenUI();
  } catch (err) {
    console.warn('[MEMO] Failed to hydrate memorization', err);
  } finally {
    isHydratingMemo = false;
    scheduleMemoSync();
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
  btn.classList.toggle('is-off', !isOn);
  btn.setAttribute('aria-pressed', String(isOn));
}

function applyViewState() {
  const root = document.documentElement;
  root.classList.toggle('hide-word-translation', !viewState.meaning);
  root.classList.toggle('hide-grammar', !viewState.grammar);
  updateToggleButton(els.toggleMeaning, viewState.meaning);
  updateToggleButton(els.toggleGrammar, viewState.grammar);
}

function showFeedback(text, isError = false) {
  els.feedback.textContent = text || '';
  els.feedback.style.color = isError ? '#b33a3a' : '#2b8a5a';
}

function setLastMatchedWord(word) {
  if (!els.lastWord) return;
  const label = word ? `Last matched: ${word}` : 'Last matched: --';
  els.lastWord.textContent = label;
}

function updateExpectedWord() {
  if (!els.expectedWord) return;
  if (!expectedWords.length) {
    els.expectedWord.textContent = 'Expected: --';
    return;
  }
  if (revealIndex >= expectedWords.length) {
    els.expectedWord.textContent = 'Expected: Completed';
    return;
  }
  els.expectedWord.textContent = `Expected: ${expectedWords[revealIndex]}`;
}

function resetTranscript() {
  finalTranscript = '';
  lastFinalCount = 0;
  if (els.finalText) els.finalText.textContent = '—';
  if (els.interimText) els.interimText.textContent = '—';
  showFeedback('');
  setLastMatchedWord('');
  updateExpectedWord();
}

function updateListenUI() {
  const count = listenCounts[ayahKey(current.surah, current.ayah)] || 0;
  const pct = Math.min(100, Math.round((count / REQUIRED_LISTENS) * 100));
  els.progressFill.style.width = `${pct}%`;
  els.progressText.textContent = `Listens: ${count} / ${REQUIRED_LISTENS}`;
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
  setLastMatchedWord(expectedWords[idx]);
}

function setSpokenText(idx, text) {
  const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
  if (!node) return;
  const spoken = node.querySelector('.memo-spoken');
  if (spoken) spoken.textContent = text || '';
}

function updateSpokenPreview(text) {
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
  expectedWords.forEach((_, idx) => {
    const node = els.wordsWrap.querySelector(`[data-index="${idx}"]`);
    if (node) {
      node.classList.remove('hidden-word', 'is-wrong', 'is-correct');
      node.classList.add('revealed');
    }
  });
  peekTimeout = window.setTimeout(() => {
    resetReveals();
  }, 1000);
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

function renderWords(wordBlocks) {
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

function processTokens(tokens, rawTokens) {
  const before = revealIndex;
  let consumed = 0;
  let skippedNoise = 0;
  let i = 0;
  while (i < tokens.length && revealIndex < expectedNormalized.length) {
    const expected = expectedNormalized[revealIndex].replace(/\s+/g, '');
    let matched = false;
    for (let n = 1; n <= 3 && i + n <= tokens.length; n += 1) {
      const candidate = tokens.slice(i, i + n).join('');
      if (candidate === expected || isFuzzyMatch(expected, candidate)) {
        const rawCandidate = rawTokens ? rawTokens.slice(i, i + n).join(' ') : tokens.slice(i, i + n).join(' ');
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

function completeAyah() {
  stopListening();
  updateExpectedWord();
  unlockNextAyah();
  showModal(true);
  buildSurahOptions();
  buildAyahOptions(current.surah);
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
    els.startBtn.disabled = true;
    els.stopBtn.disabled = false;
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
      els.finalText.textContent = finalTranscript.trim() || '—';
    }
    if (els.interimText) {
      els.interimText.textContent = interim.trim() || '—';
    }
    interimPreview = interim.trim();
    const previewTokens = tokenizeRaw(interimPreview);
    updateSpokenPreview(previewTokens.slice(-2).join(' '));

    const tokens = tokenize(finalTranscript);
    const rawTokens = tokenizeRaw(finalTranscript);
    if (tokens.length > lastFinalCount) {
      const consumed = processTokens(tokens.slice(lastFinalCount), rawTokens.slice(lastFinalCount));
      lastFinalCount += consumed;
      updateSpokenPreview('');
    }
  };

  return rec;
}

function startListening() {
  if (!recognition) recognition = initRecognition();
  if (!recognition) return;
  if (keepListening || listening) return;
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
  setStatus('Idle');
}

function updateListenCount(delta) {
  const key = ayahKey(current.surah, current.ayah);
  const currentCount = listenCounts[key] || 0;
  listenCounts[key] = currentCount + delta;
  setStoredListenCounts(listenCounts);
  updateListenUI();
}

function playAudio(times) {
  if (!audio) return;
  if (audioQueue > 0) return;
  const count = clamp(times, 1, 50);
  audioQueue = count;
  els.playBtn.disabled = true;
  audio.currentTime = 0;
  audio.play().catch(() => {
    els.playBtn.disabled = false;
    audioQueue = 0;
  });
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
  }
}

async function loadAyah(surah, ayah) {
  stopListening();
  clearPeekTimer();
  const nextSurah = Number(surah);
  const nextAyah = Number(ayah);
  if (!isValidAyahRef(nextSurah, nextAyah)) {
    current = { ...unlocked };
  } else {
    current = { surah: nextSurah, ayah: nextAyah };
  }
  updateAyahSelectors();
  setStatus('Loading');
  resetTranscript();

  const locked = isLockedAyah(current.surah, current.ayah);
  setLockedState(locked);

  try {
    const { wordBlocks, practiceBlocks } = await fetchAyahContent(current.surah, current.ayah);
    renderWords(wordBlocks);
    renderPractice(practiceBlocks);
    resetReveals();
    setStatus('Idle');
    const key = ayahKey(current.surah, current.ayah);
    if (!listenCounts[key]) listenCounts[key] = 0;
    updateListenUI();
    if (audio) {
      audio.pause();
      audio.removeEventListener('ended', handleAudioEnded);
    }
    audioQueue = 0;
    els.playBtn.disabled = false;
    audio = new Audio(getAudioUrl(current.surah, current.ayah));
    audio.addEventListener('ended', handleAudioEnded);
  } catch (err) {
    setStatus('Failed', true);
    expectedWords = [];
    expectedNormalized = [];
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
  if (!els.welcomeBrain || typeof window.lottie === 'undefined' || welcomeBrainAnimation) return;
  try {
    const animationPath = new URL('./assets/brain-animation.json', window.location.href).href;
    welcomeBrainAnimation = window.lottie.loadAnimation({
      container: els.welcomeBrain,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: animationPath,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet'
      }
    });
  } catch (err) {
    console.warn('[MEMO] Failed to load brain lottie', err);
  }
}

async function init() {
  unlocked = getStoredProgress();
  listenCounts = getStoredListenCounts();
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
  } else if (fromUrl && isLockedAyah(fromUrl.surah, fromUrl.ayah)) {
    current = unlocked;
  } else {
    current = unlocked;
  }

  buildAyahOptions(current.surah);
  await loadAyah(current.surah, current.ayah);
}

if (els.homeBtn) {
  els.homeBtn.addEventListener('click', e => {
    if (isEmbedded) {
      e.preventDefault();
      parent.postMessage({ type: 'EXIT_MEMO' }, window.location.origin === 'null' ? '*' : window.location.origin);
      return;
    }
    window.location.href = '/index.html';
  });
}

if (els.welcomeStartBtn) {
  els.welcomeStartBtn.addEventListener('click', () => {
    openMemorizationWorkspace();
  });
}

if (els.welcomeResumeBtn) {
  els.welcomeResumeBtn.addEventListener('click', () => {
    openMemorizationWorkspace();
    if (els.playBtn) {
      els.playBtn.focus();
    }
  });
}

if (els.welcomeJourneyBtn) {
  els.welcomeJourneyBtn.addEventListener('click', () => {
    if (isEmbedded) {
      parent.postMessage(
        { type: 'EXIT_MEMO' },
        window.location.origin === 'null' ? '*' : window.location.origin
      );
      return;
    }
    const target = els.learnNav?.getAttribute('href') || '/index.html';
    window.location.href = target;
  });
}

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

els.startBtn.addEventListener('click', startListening);
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

if (els.peekBtn) {
  els.peekBtn.addEventListener('click', () => {
    peekWords();
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
initWelcomeBrainAnimation();
if (els.welcome && !els.welcome.classList.contains('is-hidden')) {
  document.body.classList.add('memo-welcome-mode');
}
if (isEmbedded) {
  document.body.classList.add('embedded');
}
bindBottomNavSystemBarColor();
onAuthChange(user => {
  memoUser = user;
  if (user && !user.isAnonymous) {
    hydrateMemorizationFromDb();
  }
});
init();
