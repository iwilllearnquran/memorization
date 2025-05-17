// ui/verbMatchUI.js
import { GAME_CONFIG }           from '/config/gameConfig.js';
import { hide, show, $ }         from '/utils/domHelpers.js';
import gameSession               from '/state/gameSession.js';
import { VERB_DATA }             from '../verbs_data.js'; 
import { initStats, updateStats }from '/ui/gameStatsUI.js'; 
import { showCompletionPopup }   from '/ui/gameCompletionUI.js';
import { showGameOverPopup }     from '/ui/gameOverPopup.js';



const importantStyles = {
  display:         'flex',
  'flex-wrap':     'wrap',
  gap:             '12px',
  'justify-content':'center',
  'align-items':   'center',
  'margin-top':    '8px',
};

function applyImportant(el, styles) {
  Object.entries(styles).forEach(([prop, val]) => {
    el.style.setProperty(prop, val, 'important');
  });
}


// ── vibration helper ────────────────────────────────────────────
function vibrate(pattern = [50]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

const pathMatch = window.location.pathname.match(/ayah_(\d+)_(\d+)/);
window.currentSurah = pathMatch ? parseInt(pathMatch[1], 10) : 1;
window.currentAyah  = pathMatch ? parseInt(pathMatch[2], 10) : 1;

let verbOptions, meaningOptions;
let isAnimating = false;

/**
 * Entry point
 */
export function startVerbGame() {
  initStats('#verbGameContainer');
  console.log(`🔍 VerbGame → S${window.currentSurah}, A${window.currentAyah}`);
  
  hide($('#arrangeGameContainer'));
  show($('#verbGameContainer'));
  
  // start (or resume) session without resetting lives/score on Next
  gameSession.init('verb', /* showUI = */ false);
  updateStats();

  // grab containers once
  verbOptions    = document.getElementById('verbOptions');
  meaningOptions = document.getElementById('meaningOptions');

  // center grids
  [verbOptions, meaningOptions].forEach(el => {
    applyImportant(el, importantStyles);
  });

  // inject controls
  _addControls();

  // render first set
  renderVerbSet();
}

/** Picks 5 random pairs up to current Ayah and renders cards */
function renderVerbSet() {
  // clear old cards & reset selection state
  [verbOptions, meaningOptions].forEach(el => {
    el.innerHTML = '';
  });
  isAnimating = false;

  const rank = window.currentSurah * 1000 + window.currentAyah;
  const allPairs = Object.entries(VERB_DATA).filter(([,d]) => !isNaN(d.rank) && d.rank <= rank);
  const shuffle = arr => arr.sort(() => 0.5 - Math.random());
  const selected = shuffle(allPairs).slice(0,5);
  console.log('🎯 [VerbGame] selectedPairs:', selected);

  let selVerb = null, selMeaning = null;

  // render verbs
  shuffle(selected.map(([v]) => v)).forEach(verb => {
    const card = document.createElement('div');
    card.className    = 'match-card';
    card.textContent  = verb;
    card.dataset.verb = verb;
    card.addEventListener('click', () => {
      vibrate([30]);                           // short buzz on tap
      if (isAnimating || card.classList.contains('matched')) return;
      verbOptions.querySelectorAll('.match-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selVerb = card;
      tryMatch();
    });
    verbOptions.appendChild(card);
  });

  // render meanings
  shuffle(selected.map(([,d]) => d.meaning)).forEach(meaning => {
    const card = document.createElement('div');
    card.className    = 'match-card';
    card.textContent  = meaning;
    card.dataset.verb = selected.find(([v,d]) => d.meaning === meaning)[0];
    card.addEventListener('click', () => {
      if (isAnimating || card.classList.contains('matched')) return;
      meaningOptions.querySelectorAll('.match-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selMeaning = card;
      tryMatch();
    });
    meaningOptions.appendChild(card);
  });

  // attempt a match when both are selected
  async function tryMatch() {
    if (!selVerb || !selMeaning) return;
  
    if (selVerb.dataset.verb === selMeaning.dataset.verb) {
      // ✅ correct!
      [selVerb, selMeaning].forEach(el => {
        el.classList.add('matched');
        el.classList.remove('selected');
        el.style.pointerEvents = 'none';       // disable further clicks
      });
      gameSession.addPoints();
      updateStats();
      window.showToast('✅ Correct!');
  
      // reset your selection state **immediately**
      selVerb    = null;
      selMeaning = null;
  
      // if everything is matched → enable Next/End
      const done = [...verbOptions.children]
        .every(c => c.classList.contains('matched'));
        if (done) {
          const nextBtn = document.getElementById('verbNextBtn');
          const endBtn  = document.getElementById('verbEndBtn');
        
          nextBtn.classList.remove('disabled-control');
          endBtn.classList.remove( 'disabled-control' );
          nextBtn.style.opacity = endBtn.style.opacity = '1';

        
          // make them prominent again
          nextBtn.style.opacity = '1';
          endBtn.style.opacity  = '1';
        
          // (optional) add an “active” class for extra styling
          nextBtn.classList.add('active-control');
          endBtn.classList.add('active-control');
        }
        
  
    } else {
      // ❌ wrong: same as before
      isAnimating = true;
      [selVerb, selMeaning].forEach(el => el.classList.add('wrong'));
      gameSession.loseLife();
      updateStats();
      if (gameSession.lives === 0) {
        showGameOverPopup();
      }
      window.showToast('❌ Try again', '#c0392b');
  
      setTimeout(() => {
        [selVerb, selMeaning].forEach(el => el.classList.remove('wrong','selected'));
        // clear after the “shake”
        selVerb = selMeaning = null;
        isAnimating = false;
      }, 800);
    }
  }
 
}

/** Injects and wires up Next/End buttons */
function _addControls() {
  // remove existing
  document.getElementById('verbControls')?.remove();

  const ctr = document.createElement('div');
  ctr.id = 'verbControls';
  Object.assign(ctr.style, {
    display:        'flex',
    justifyContent: 'center',
    gap:            '16px',
    marginTop:      '24px'
  });
  ctr.innerHTML = `
  <button id="verbNextBtn" class="game-play-btn disabled-control">More</button>
  <button id="verbEndBtn"  class="game-play-btn disabled-control">End</button>
`;

  const panel = document.getElementById('verbGameContainer');
  show(panel);
  panel.appendChild(ctr);

  const next = document.getElementById('verbNextBtn');
  const end  = document.getElementById('verbEndBtn');

  // Generic “please finish current game” toast
  function remindFinish() {
    const toast = document.createElement('div');
    toast.textContent = 'Please match all cards before proceeding.';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #444;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      opacity: 0;
      transition: opacity .3s ease;
      z-index: 10000;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = 1);
    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }

  next.addEventListener('click', () => {
    vibrate([20, 30, 20]);     
    if (next.classList.contains('disabled-control')) {
      remindFinish();
      return;
    }
    // once you enable it:
    next.classList.remove('disabled-control');
    end.classList.remove( 'disabled-control' );
    renderVerbSet();
  });
  
  end.addEventListener('click', () => {
    vibrate([20, 30, 20]);
    if (end.classList.contains('disabled-control')) {
      remindFinish();
      return;
    }
    showCompletionPopup(`You’ve earned ${gameSession.score} points!`);
  });
  
}

