import { hide, show, $ }       from '/utils/domHelpers.js';
import gameSession             from '/state/gameSession.js';
import { updateStats }         from '/ui/gameStatsUI.js';
import { showGameOverPopup }   from '/ui/gameOverPopup.js';
import { VERB_DATA }           from '/verbs_data.js';

/* ── Grammar forms (all 13 Arabic pronoun slots) ──────────────────── */

const ALL_FORMS = [
  { key: 'third person masculine singular',  pronAr: 'هُوَ',       short: '3rd masc. sg.',   row: 0 },
  { key: 'third person feminine singular',   pronAr: 'هِيَ',       short: '3rd fem. sg.',    row: 1 },
  { key: 'third person masculine dual',      pronAr: 'هُمَا',      short: '3rd masc. dual',  row: 2 },
  { key: 'third person feminine dual',       pronAr: 'هُمَا',      short: '3rd fem. dual',   row: 3 },
  { key: 'third person masculine plural',    pronAr: 'هُمْ',       short: '3rd masc. pl.',   row: 4 },
  { key: 'third person feminine plural',     pronAr: 'هُنَّ',      short: '3rd fem. pl.',    row: 5 },
  { key: 'second person masculine singular', pronAr: 'أَنْتَ',     short: '2nd masc. sg.',   row: 6 },
  { key: 'second person feminine singular',  pronAr: 'أَنْتِ',     short: '2nd fem. sg.',    row: 7 },
  { key: 'second person dual',              pronAr: 'أَنْتُمَا',   short: '2nd dual',        row: 8 },
  { key: 'second person masculine plural',   pronAr: 'أَنْتُمْ',   short: '2nd masc. pl.',   row: 9 },
  { key: 'second person feminine plural',    pronAr: 'أَنْتُنَّ',  short: '2nd fem. pl.',    row: 10 },
  { key: 'first person singular',            pronAr: 'أَنَا',      short: '1st singular',    row: 11 },
  { key: 'first person plural',              pronAr: 'نَحْنُ',     short: '1st plural',      row: 12 },
];

const FORM_MAP = new Map(ALL_FORMS.map(f => [f.key, f]));

/* ── Helpers ───────────────────────────────────────────────────────── */

function vibrate(pattern = [50]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractVerbs() {
  const blocks = document.querySelectorAll('#learning-mode-content .word-block');
  const verbs = [];
  const seen = new Set();
  blocks.forEach(block => {
    try {
      const data = JSON.parse(block.dataset.popup || '{}');
      const countOfVerb = parseFloat(data.count_of_verb) || 0;
      const grammar = (data['Main Verb Grammar'] || '').trim().toLowerCase();
      const root = (data.root_from_gpt || '').trim();
      const word = (data.Word || '').trim();
      if (countOfVerb > 0 && grammar && root && word && FORM_MAP.has(grammar) && !seen.has(word)) {
        seen.add(word);
        verbs.push({
          word,
          grammar,
          root,
          meaning: (data['Meaning Of Verb'] || '').trim(),
          form: (data.VERB_FORM || '').trim(),
        });
      }
    } catch (_) { /* skip malformed */ }
  });
  return verbs;
}

/* ── Option generators ─────────────────────────────────────────────── */

function grammarOptions(correctKey) {
  const correct = FORM_MAP.get(correctKey);
  if (!correct) return shuffle(ALL_FORMS).slice(0, 4);
  const wrong = shuffle(ALL_FORMS.filter(f => f.key !== correctKey)).slice(0, 3);
  return shuffle([correct, ...wrong]);
}

function rootOptions(correctRoot) {
  const pool = new Set(Object.keys(VERB_DATA));
  pool.delete(correctRoot);
  const wrong = shuffle([...pool]).slice(0, 3);
  return shuffle([
    { text: correctRoot, correct: true },
    ...wrong.map(r => ({ text: r, correct: false })),
  ]);
}

/* ── State ─────────────────────────────────────────────────────────── */

let verbs = [];
let verbIdx = 0;
let phase = 'grammar'; // 'grammar' | 'root'
let isAnimating = false;

/* ── Entry point ───────────────────────────────────────────────────── */

export function startVerbFormGame() {
  hide($('#arrangeGameContainer'));
  hide($('#verbGameContainer'));
  hide($('#wordTypeGameContainer'));
  show($('#verbFormGameContainer'));

  updateStats();
  isAnimating = false;
  phase = 'grammar';
  verbIdx = 0;

  const container = document.getElementById('verbFormGameContainer');
  if (!container) return;

  verbs = extractVerbs();
  if (verbs.length === 0) {
    container.innerHTML =
      '<p class="vf-empty">No verbs with grammar data found for this ayah.</p>';
    return;
  }

  renderQuestion(container);
}

/* ── Rendering ─────────────────────────────────────────────────────── */

function renderQuestion(container) {
  container.innerHTML = '';
  const verb = verbs[verbIdx];
  if (!verb) return;

  /* ---- progress track ---- */
  const track = document.createElement('div');
  track.className = 'vf-track';
  const totalSteps = verbs.length * 2;
  const doneSteps  = verbIdx * 2 + (phase === 'root' ? 1 : 0);
  const bar = document.createElement('div');
  bar.className = 'vf-track-fill';
  bar.style.width = `${(doneSteps / totalSteps) * 100}%`;
  const label = document.createElement('span');
  label.className = 'vf-track-label';
  label.textContent = `${verbIdx + 1} / ${verbs.length}`;
  track.append(bar, label);
  container.appendChild(track);

  /* ---- verb showcase card ---- */
  const card = document.createElement('div');
  card.className = 'vf-card';

  const formPill = document.createElement('span');
  formPill.className = 'vf-pill';
  formPill.textContent = verb.form && verb.form !== 'Unknown' ? verb.form : '';
  if (!formPill.textContent) formPill.style.display = 'none';

  const arabic = document.createElement('div');
  arabic.className = 'vf-arabic';
  arabic.textContent = verb.word;

  const meaning = document.createElement('div');
  meaning.className = 'vf-meaning';
  meaning.textContent = verb.meaning || '';

  card.append(formPill, arabic, meaning);

  // In root phase, show the grammar answer badge
  if (phase === 'root') {
    const badge = document.createElement('div');
    badge.className = 'vf-badge-correct';
    const f = FORM_MAP.get(verb.grammar);
    badge.innerHTML = `<span class="vf-badge-icon">✓</span> ${f ? f.pronAr + ' — ' + f.short : verb.grammar}`;
    card.appendChild(badge);
  }

  container.appendChild(card);

  /* ---- question ---- */
  const qWrap = document.createElement('div');
  qWrap.className = 'vf-question';
  if (phase === 'grammar') {
    qWrap.innerHTML =
      '<span class="vf-q-icon">🔍</span> Identify the grammatical person';
  } else {
    qWrap.innerHTML =
      '<span class="vf-q-icon">📖</span> Select the root form <span class="vf-q-sub">(هُوَ — 3rd masc. sg. past)</span>';
  }
  container.appendChild(qWrap);

  /* ---- options grid ---- */
  const grid = document.createElement('div');
  grid.className = 'vf-grid';

  if (phase === 'grammar') {
    const opts = grammarOptions(verb.grammar);
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'vf-opt';
      btn.innerHTML =
        `<span class="vf-opt-pronoun">${opt.pronAr}</span>` +
        `<span class="vf-opt-label">${opt.short}</span>`;
      btn.addEventListener('click', () => handlePick(btn, opt.key === verb.grammar, container));
      grid.appendChild(btn);
    });
  } else {
    grid.classList.add('vf-grid-root');
    const opts = rootOptions(verb.root);
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'vf-opt vf-opt-root';
      const rootMeaning = VERB_DATA[opt.text]?.meaning || '';
      btn.innerHTML =
        `<span class="vf-opt-pronoun">${opt.text}</span>` +
        (rootMeaning ? `<span class="vf-opt-hint">${rootMeaning}</span>` : '');
      btn.addEventListener('click', () => handlePick(btn, opt.correct, container));
      grid.appendChild(btn);
    });
  }
  container.appendChild(grid);

  /* ---- controls ---- */
  const ctr = document.createElement('div');
  ctr.className = 'vf-controls';
  ctr.innerHTML = `
    <button class="game-play-btn-verbs secondary return-ayah-btn"
      data-action="return-ayah" type="button">
      Return to Ayah
    </button>
  `;
  container.appendChild(ctr);

  // Animate card entrance
  requestAnimationFrame(() => card.classList.add('vf-card-enter'));
}

/* ── Answer handling ───────────────────────────────────────────────── */

function handlePick(btn, isCorrect, container) {
  if (isAnimating) return;
  isAnimating = true;
  vibrate([30]);

  // Disable all option buttons
  container.querySelectorAll('.vf-opt').forEach(b => { b.disabled = true; });

  if (isCorrect) {
    btn.classList.add('vf-opt-correct');
    gameSession.addPoints();
    updateStats();

    setTimeout(() => {
      isAnimating = false;
      if (phase === 'grammar') {
        phase = 'root';
        renderQuestion(container);
      } else {
        verbIdx++;
        phase = 'grammar';
        if (verbIdx >= verbs.length) {
          gameSession.end(true);
        } else {
          renderQuestion(container);
        }
      }
    }, 700);
  } else {
    btn.classList.add('vf-opt-wrong');
    gameSession.loseLife();
    updateStats();

    if (gameSession.lives === 0) {
      gameSession.end(false);
      showGameOverPopup();
      return;
    }

    // Re-enable all except the wrong one
    setTimeout(() => {
      btn.classList.remove('vf-opt-wrong');
      btn.disabled = true;  // keep the wrong choice disabled
      container.querySelectorAll('.vf-opt:not([disabled])').forEach(b => { b.disabled = false; });
      // Re-enable the others that weren't tried
      container.querySelectorAll('.vf-opt').forEach(b => {
        if (!b.classList.contains('vf-opt-wrong') && b !== btn) b.disabled = false;
      });
      isAnimating = false;
    }, 450);
  }
}
