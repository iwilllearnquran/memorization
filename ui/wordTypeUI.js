import { hide, show, $ }       from '/utils/domHelpers.js';
import gameSession             from '/state/gameSession.js';
import { updateStats }         from '/ui/gameStatsUI.js';
import { showGameOverPopup }   from '/ui/gameOverPopup.js';

/* ── Category mapping ─────────────────────────────────────────────── */

const CATEGORIES = [
  { key: 'verb',     labelAr: 'فعل',  labelEn: 'Verb',     color: '#1a5fb4' },
  { key: 'noun',     labelAr: 'اسم',  labelEn: 'Noun',     color: '#0f766e' },
  { key: 'harf',     labelAr: 'حرف',  labelEn: 'Particle', color: '#8b2252' },
];

const COLOR_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));

/**
 * Derive primary category from tags_joined + count_of_verb.
 * Priority: verb > particle/harf > noun (default).
 */
function classifyWord(tags, countOfVerb) {
  const t = (tags || '').toLowerCase();
  if (countOfVerb > 0 || t.includes('verb')) return 'verb';
  if (
    /\bpreposition\b/.test(t) ||
    /\bconj\b/.test(t) ||
    /\bpart\b/.test(t) ||
    /\bneg\b/.test(t) ||
    /\bacc\b/.test(t) ||
    /\bres\b/.test(t) ||
    /\bvoc\b/.test(t) ||
    /\bcond\b/.test(t) ||
    /\binterrog\b/.test(t)
  ) return 'harf';
  return 'noun';   // noun, proper noun, adjective, pronoun, etc.
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function vibrate(pattern = [50]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function extractWords() {
  const blocks = document.querySelectorAll('#learning-mode-content .word-block');
  const words = [];
  blocks.forEach(block => {
    try {
      const data = JSON.parse(block.dataset.popup || '{}');
      const arabic = data.Word || block.querySelector('.word-text')?.textContent?.trim();
      if (!arabic) return;
      const tags = data.tags_joined || '';
      const countOfVerb = parseFloat(data.count_of_verb) || 0;
      const translation = block.querySelector('.toggle-translation')?.textContent?.trim() || '';
      words.push({
        arabic,
        translation,
        category: classifyWord(tags, countOfVerb),
        tags,
      });
    } catch (_) { /* skip malformed */ }
  });
  return words;
}

/* ── State ─────────────────────────────────────────────────────────── */

let wordEls = [];
let selectedIdx = null;
let isAnimating = false;
let totalWords = 0;
let classifiedCount = 0;

/* ── Entry point ───────────────────────────────────────────────────── */

export function startWordTypeGame() {
  hide($('#arrangeGameContainer'));
  hide($('#verbGameContainer'));
  show($('#wordTypeGameContainer'));

  updateStats();

  selectedIdx = null;
  isAnimating = false;
  classifiedCount = 0;

  const container = document.getElementById('wordTypeGameContainer');
  if (!container) return;

  const words = extractWords();
  totalWords = words.length;

  if (totalWords === 0) {
    container.innerHTML = '<p style="text-align:center;padding:24px;color:#666;">No words found for this ayah.</p>';
    return;
  }

  renderWordTypeGame(container, words);
}

/* ── Rendering ─────────────────────────────────────────────────────── */

function renderWordTypeGame(container, words) {
  container.innerHTML = '';

  // Instruction
  const instr = document.createElement('p');
  instr.className = 'wt-instruction';
  instr.textContent = 'Tap a word, then choose its type';
  container.appendChild(instr);

  // Word cloud
  const cloud = document.createElement('div');
  cloud.className = 'wt-cloud';
  wordEls = [];
  words.forEach((w, i) => {
    const el = document.createElement('span');
    el.className = 'wt-word';
    el.textContent = w.arabic;
    el.dataset.idx = i;
    el.addEventListener('click', () => selectWord(i));
    cloud.appendChild(el);
    wordEls.push(el);
  });
  container.appendChild(cloud);

  // Translation hint (shown when word selected)
  const hint = document.createElement('div');
  hint.id = 'wtHint';
  hint.className = 'wt-hint';
  container.appendChild(hint);

  // Category buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'wt-btn-row';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'wt-cat-btn';
    btn.dataset.cat = cat.key;
    btn.style.setProperty('--cat-color', cat.color);
    btn.innerHTML = `<span class="wt-cat-ar">${cat.labelAr}</span><span class="wt-cat-en">${cat.labelEn}</span>`;
    btn.addEventListener('click', () => handleClassify(cat.key, words));
    btnRow.appendChild(btn);
  });
  container.appendChild(btnRow);

  // Controls
  const ctr = document.createElement('div');
  ctr.id = 'wordTypeControls';
  ctr.className = 'wt-controls';
  ctr.innerHTML = `
    <button id="wtReturnBtn"
      class="game-play-btn-verbs secondary return-ayah-btn"
      data-action="return-ayah" type="button">
      Return to Ayah
    </button>
  `;
  container.appendChild(ctr);
}

/* ── Interaction ───────────────────────────────────────────────────── */

function selectWord(idx) {
  if (isAnimating) return;
  const el = wordEls[idx];
  if (!el || el.classList.contains('wt-correct')) return;

  wordEls.forEach(w => w.classList.remove('wt-selected'));
  el.classList.add('wt-selected');
  selectedIdx = idx;

  // Show translation hint
  const hint = document.getElementById('wtHint');
  const blocks = document.querySelectorAll('#learning-mode-content .word-block');
  const block = blocks[idx];
  if (hint && block) {
    const trans = block.querySelector('.toggle-translation')?.textContent?.trim();
    hint.textContent = trans || '';
    hint.style.opacity = trans ? '1' : '0';
  }
}

function handleClassify(chosenKey, words) {
  if (isAnimating || selectedIdx === null) return;
  const word = words[selectedIdx];
  const el = wordEls[selectedIdx];
  if (!word || !el) return;

  vibrate([30]);

  if (chosenKey === word.category) {
    // Correct
    el.classList.remove('wt-selected');
    el.classList.add('wt-correct');
    el.style.borderColor = COLOR_MAP[word.category];
    el.style.backgroundColor = COLOR_MAP[word.category] + '18';
    gameSession.addPoints();
    updateStats();
    window.showToast?.('Correct!');
    classifiedCount++;
    selectedIdx = null;
    const hint = document.getElementById('wtHint');
    if (hint) hint.style.opacity = '0';

    if (classifiedCount >= totalWords) {
      gameSession.end(true);
    }
  } else {
    // Wrong
    isAnimating = true;
    el.classList.add('wt-wrong');
    gameSession.loseLife();
    updateStats();

    if (gameSession.lives === 0) {
      gameSession.end(false);
      showGameOverPopup();
      return;
    }

    window.showToast?.('Try again', '#c0392b');
    setTimeout(() => {
      el.classList.remove('wt-wrong');
      isAnimating = false;
    }, 400);
  }
}
