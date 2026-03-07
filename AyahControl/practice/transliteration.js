import { log } from '../core/logger.js';

const logger = log('TRANSLIT');

/* ============================
   INIT
============================ */
export function initTransliteration() {
  logger.info('init');

  restoreInputs();
  bindInputs();
}

/* ============================
   STORAGE
============================ */
function restoreInputs() {
  document.querySelectorAll('.translit-input').forEach(input => {
    const key = input.dataset.key;
    if (!key) return;

    const saved = localStorage.getItem(key);
    if (saved !== null) input.value = saved;
  });
}

/* ============================
   INPUT HANDLING
============================ */
function bindInputs() {
  document.querySelectorAll('.translit-input').forEach(input => {
    input.removeEventListener('input', onInput);
    input.addEventListener('input', onInput);
  });
}

function onInput(e) {
  const input = e.target;
  const key = input.dataset.key;
  if (!key) return;

  localStorage.setItem(key, input.value);
  applyFeedback(input);
}

/* ============================
   FEEDBACK LOGIC
============================ */
function applyFeedback(input) {
  const normalize = s =>
    s.normalize('NFD')
     .replace(/[̀-ͯʿ]/g, '')
     .replace(/[^a-z]/gi, '')
     .toLowerCase()
     .trim();

  const expected = normalize(input.dataset.expected || '');
  const actual   = normalize(input.value || '');
  const block    = input.closest('.word-block-translit');

  if (!block) return;

  const dist = levenshtein(actual, expected);

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

/* ============================
   UTIL
============================ */
function levenshtein(a, b) {
  const dp = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1));

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
}

/* ============================
   PUBLIC ACTIONS
============================ */
export function clearAllTransliteration() {
  logger.info('clearAll');

  document.querySelectorAll('.translit-input').forEach(input => {
    const key = input.dataset.key;
    if (key) localStorage.removeItem(key);
    input.value = '';
    applyFeedback(input);
  });
}
