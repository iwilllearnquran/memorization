import { GAME_CONFIG }           from '/config/gameConfig.js';
import { hide, show, $ }         from '/utils/domHelpers.js';
import gameSession               from '/state/gameSession.js';
import { VERB_DATA }             from '../verbs_data.js'; 
import { updateStats }from '/ui/gameStatsUI.js'; 
import { showCompletionPopup }   from '/ui/gameCompletionUI.js';
import { showGameOverPopup }     from '/ui/gameOverPopup.js';

const importantStyles = {
  display:            'grid',
  'grid-auto-rows':   'minmax(0, 1fr)',
  gap:                '8px',
  'justify-content':  'stretch',
  'align-content':    'stretch',
  'align-items':      'stretch',
  'margin-top':       '0',
  width:              '100%',
  height:             '100%',
  overflow:           'hidden',
};

function applyImportant(el, styles) {
  Object.entries(styles).forEach(([prop, val]) => {
    el.style.setProperty(prop, val, 'important');
  });
}

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
export async function startVerbGame() {
  hide($('#arrangeGameContainer'));
  show($('#verbGameContainer'));


  // ✅ Ensure session starts with correct lives & score
  //await gameSession.init('verb', { reset: false });
  updateStats();


  verbOptions    = document.getElementById('verbOptions');
  meaningOptions = document.getElementById('meaningOptions');

  [verbOptions, meaningOptions].forEach(el => applyImportant(el, importantStyles));

  _addControls();
  renderVerbSet();
}

function getRoundPairCount() {
  return 10;
}

function renderVerbSet() {
  // 1️⃣ Clear any existing cards & reset animation flag
  verbOptions.innerHTML    = '';
  meaningOptions.innerHTML = '';
  isAnimating = false;

  // 2️⃣ Build the pool of eligible verb→meaning data
  const rank     = window.currentSurah * 1000 + window.currentAyah;
  const allPairs = Object.entries(VERB_DATA)
    .filter(([, d]) => !isNaN(d.rank) && d.rank <= rank);

  // 3️⃣ Shuffle helper
  const shuffle = arr => arr.sort(() => 0.5 - Math.random());

  // 4️⃣ Pick 12 pairs and give each a unique ID
  const selectedPairs = shuffle(allPairs)
    .slice(0, getRoundPairCount())
    .map(([verb, data], idx) => ({
      id:      idx.toString(),   // unique even if data.meaning duplicates
      verb,
      meaning: data.meaning
    }));

  // 5️⃣ State for current selection
  let selVerb    = null;
  let selMeaning = null;

  // 6️⃣ Matching logic
  async function tryMatch() {
    if (!selVerb || !selMeaning) return;
    // ✅ Correct match when IDs align
    if (selVerb.dataset.id === selMeaning.dataset.id) {
      [selVerb, selMeaning].forEach(el => {
        el.classList.add('matched');
        el.classList.remove('selected');
        el.style.pointerEvents = 'none';
      });
      gameSession.addPoints();
      updateStats();
      window.showToast('Correct!');
      selVerb = selMeaning = null;

      // enable “More” / “End” once all matched
      const allDone = [...verbOptions.children].every(
        c => c.classList.contains('matched')
      );
      if (allDone) {
        document.getElementById('verbNextBtn')?.classList.replace(
          'disabled-control','active-control'
        );
        document.getElementById('verbEndBtn')?.classList.replace(
          'disabled-control','active-control'
        );
      }

    } else {
      // ❌ Wrong: flash red then clear
      isAnimating = true;
      [selVerb, selMeaning].forEach(el => {
        el.classList.add('wrong');
        el.style.pointerEvents = 'none';
      });
      gameSession.loseLife();
      updateStats();
      if (gameSession.lives === 0) {
        gameSession.end(false);
        showGameOverPopup();

      }
      window.showToast('Try again', '#c0392b');

      setTimeout(() => {
        [selVerb, selMeaning].forEach(el => {
          el.classList.remove('wrong', 'selected');
          el.style.pointerEvents = '';
        });
        selVerb = selMeaning = null;
        isAnimating = false;
      }, 400);  // red flash only 100 ms
    }
  }

  // 7️⃣ Render the verb cards
  shuffle(selectedPairs).forEach(pair => {
    const card = document.createElement('div');
    card.className   = 'match-card';
    card.textContent = pair.verb;
    card.dataset.id  = pair.id;
    card.addEventListener('click', () => {
      vibrate([30]);
      if (isAnimating || card.classList.contains('matched')) return;
      verbOptions.querySelectorAll('.match-card')
        .forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selVerb = card;
      tryMatch();
    });
    verbOptions.appendChild(card);
  });

  // 8️⃣ Render the meaning cards
  shuffle(selectedPairs).forEach(pair => {
    const card = document.createElement('div');
    card.className   = 'match-card';
    card.textContent = pair.meaning;
    card.dataset.id  = pair.id;
    card.addEventListener('click', () => {
      if (isAnimating || card.classList.contains('matched')) return;
      meaningOptions.querySelectorAll('.match-card')
        .forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selMeaning = card;
      tryMatch();
    });
    meaningOptions.appendChild(card);
  });
}


function _addControls() {
  document.getElementById('verbControls')?.remove();

  const ctr = document.createElement('div');
  ctr.id = 'verbControls';
  Object.assign(ctr.style, {
    position: 'relative'
  });

  ctr.innerHTML = `
    <button id="verbNextBtn" class="game-play-btn-verbs disabled-control">Next Round</button>
    <button id="verbEndBtn"  class="game-play-btn-verbs disabled-control secondary">Finish</button>
    <button
      id="verbReturnBtn"
      class="game-play-btn-verbs secondary return-ayah-btn"
      data-action="return-ayah"
      type="button"
    >
      Return to Ayah
    </button>
  `;

    // after
    const gameContainer = document.getElementById('verbGameContainer');
    if (gameContainer) {
      gameContainer.appendChild(ctr);
    } else {
      document.body.appendChild(ctr);
    }
  


  const next = document.getElementById('verbNextBtn');
  const end  = document.getElementById('verbEndBtn');

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
    renderVerbSet();
  });

  
  end.addEventListener('click', async () => {
    vibrate([20, 30, 20]);
    if (end.classList.contains('disabled-control')) {
      remindFinish();
      return;
    } 
    /**
    if (auth.currentUser) {
      // ——— Real user popup ———
      showCompletionPopup(
        `🎉 You’ve earned <strong>${gameSession.sessionScore}</strong> Ajr points!`
      );
    } else {
      // ——— Guest popup & localStorage save ———
      showCompletionPopup(
        `🎉 You’ve earned <strong>${gameSession.sessionScore}</strong> Ajr points!  
         Your progress is saved locally and will sync once you log in.`
      );
    }**/
    await gameSession.end(true);
   // window.parent.postMessage({
   //   type: 'streakUpdate',
   //   date: new Date().toISOString().split('T')[0]
   // }, '*');
  

  });

  

}



