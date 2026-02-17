const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const langSelect = document.getElementById('langSelect');
const modeSelect = document.getElementById('modeSelect');
const wordsInput = document.getElementById('wordsInput');
const applyWordsBtn = document.getElementById('applyWords');
const clearWordsBtn = document.getElementById('clearWords');
const wordsWrap = document.getElementById('wordsWrap');
const statusBadge = document.getElementById('statusBadge');
const finalText = document.getElementById('finalText');
const interimText = document.getElementById('interimText');
const feedback = document.getElementById('feedback');
const simulateInput = document.getElementById('simulateInput');
const simulateBtn = document.getElementById('simulateBtn');

let expectedWords = [];
let expectedNormalized = [];
let revealed = new Set();
let pointer = 0;
let recognition = null;
let listening = false;
let finalTranscript = '';
let lastFinalCount = 0;

function stripArabicDiacritics(text) {
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
}

function normalize(text) {
  if (!text) return '';
  let t = text.trim();
  t = stripArabicDiacritics(t);
  t = t.replace(/[^\w\u0600-\u06FF\s]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

function tokenize(text) {
  const t = normalize(text);
  return t ? t.split(' ') : [];
}

function renderWords() {
  wordsWrap.innerHTML = '';
  expectedWords.forEach((word, idx) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = word;
    span.dataset.index = idx.toString();
    if (revealed.has(idx)) {
      span.classList.add('revealed');
    }
    wordsWrap.appendChild(span);
  });
}

function revealIndex(idx) {
  if (revealed.has(idx)) return;
  revealed.add(idx);
  const node = wordsWrap.querySelector(`[data-index="${idx}"]`);
  if (node) node.classList.add('revealed');
}

function setStatus(state, isError = false) {
  statusBadge.textContent = state;
  statusBadge.classList.toggle('listening', state === 'Listening');
  statusBadge.classList.toggle('error', isError);
}

function clearFeedback() {
  feedback.textContent = '';
}

function showFeedback(text, isBad = false) {
  feedback.textContent = text;
  feedback.style.color = isBad ? '#b33a3a' : '#2b8a5a';
}

function resetSession() {
  revealed.clear();
  pointer = 0;
  finalTranscript = '';
  lastFinalCount = 0;
  finalText.textContent = '—';
  interimText.textContent = '—';
  clearFeedback();
  renderWords();
}

function loadWords() {
  const raw = wordsInput.value.trim();
  expectedWords = raw ? raw.split(/\s+/) : [];
  expectedNormalized = expectedWords.map(normalize);
  resetSession();
}

function handleToken(token, isFinal) {
  if (!token) return;

  if (modeSelect.value === 'loose') {
    const idx = expectedNormalized.findIndex(
      (w, i) => w === token && !revealed.has(i)
    );
    if (idx !== -1) {
      revealIndex(idx);
      showFeedback('Matched: ' + expectedWords[idx], false);
      return;
    }
    if (isFinal) showFeedback('Not expected: ' + token, true);
    return;
  }

  if (pointer < expectedNormalized.length && token === expectedNormalized[pointer]) {
    revealIndex(pointer);
    pointer += 1;
    showFeedback('Correct', false);
    return;
  }

  if (isFinal) {
    const expected = expectedWords[pointer] || '—';
    showFeedback(`Expected "${expected}", heard "${token}"`, true);
  }
}

function processFinalTranscript() {
  const tokens = tokenize(finalTranscript);
  for (let i = lastFinalCount; i < tokens.length; i += 1) {
    handleToken(tokens[i], true);
  }
  lastFinalCount = tokens.length;
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus('Unsupported', true);
    startBtn.disabled = true;
    stopBtn.disabled = true;
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = langSelect.value;

  rec.onstart = () => {
    listening = true;
    setStatus('Listening');
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  rec.onend = () => {
    listening = false;
    setStatus('Idle');
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };

  rec.onerror = (evt) => {
    setStatus('Error', true);
    showFeedback(evt.error || 'Speech error', true);
  };

  rec.onresult = (evt) => {
    let interim = '';
    for (let i = evt.resultIndex; i < evt.results.length; i += 1) {
      const res = evt.results[i];
      if (res.isFinal) {
        finalTranscript += res[0].transcript + ' ';
      } else {
        interim += res[0].transcript + ' ';
      }
    }
    finalText.textContent = finalTranscript.trim() || '—';
    interimText.textContent = interim.trim() || '—';
    processFinalTranscript();
  };

  return rec;
}

startBtn.addEventListener('click', () => {
  if (!recognition) recognition = initRecognition();
  if (!recognition) return;
  recognition.lang = langSelect.value;
  clearFeedback();
  recognition.start();
});

stopBtn.addEventListener('click', () => {
  if (recognition && listening) recognition.stop();
});

resetBtn.addEventListener('click', () => {
  resetSession();
});

applyWordsBtn.addEventListener('click', loadWords);
clearWordsBtn.addEventListener('click', () => {
  wordsInput.value = '';
  loadWords();
});

simulateBtn.addEventListener('click', () => {
  const text = simulateInput.value.trim();
  if (!text) return;
  const tokens = tokenize(text);
  tokens.forEach(tok => handleToken(tok, true));
});

langSelect.addEventListener('change', () => {
  if (listening && recognition) {
    recognition.stop();
  }
});

// init
loadWords();
