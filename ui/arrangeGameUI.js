import { GAME_CONFIG }        from '/config/gameConfig.js';
import gameSession            from '/state/gameSession.js';
import { $, hide, show }      from '/utils/domHelpers.js';
import { initStats, updateStats } from '/ui/gameStatsUI.js';
import { showCompletionPopup } from '/ui/gameCompletionUI.js';
import { showGameOverPopup } from '/ui/gameOverPopup.js';



export async function startArrangeGame() {
  
  initStats('#arrangeGameContainer');
  // 1️⃣ Swap panels
  const arrangeUI = $('#arrangeGameContainer');
  if (!arrangeUI) {
    console.error('startArrangeGame: arrangeGameContainer not found');
    return;
  }
  show(arrangeUI);

  // 2️⃣ Init session
  //await gameSession.init('arrange');
  //updateStats();  // Now will show correct Firestore score


  // 3️⃣ Grab the _real_ word-blocks & derive correctOrder
  const originalBlocks = Array.from(
    document.querySelectorAll('#learning-mode-content .word-block')
  );
  const correctOrder = originalBlocks.map(block =>
    block.querySelector('.word-text').textContent.trim()
  );

  // 4️⃣ Build slots
  const slotContainer = document.getElementById('slotContainer');
  slotContainer.innerHTML = '';
  correctOrder.forEach(() => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slotContainer.appendChild(slot);
  });

  // 5️⃣ Build shuffled options by cloning the real blocks
  const optionsContainer = document.getElementById('optionsContainer');
  optionsContainer.innerHTML = '';
  const shuffled = [...originalBlocks].sort(() => 0.5 - Math.random());
  shuffled.forEach(original => {
    const box = original.cloneNode(true);
    box.classList.add('word-box');
    box.removeAttribute('onclick');
    box.onclick = null;
    box.addEventListener('click', e => {
      e.stopPropagation();
      placeWord(box, correctOrder);
    });
    optionsContainer.appendChild(box);
  });
}


// ─── Private helper ───

/**
 * Places a word tile into the next empty slot, handling correct/incorrect logic,
 * animations (clone + translate), vibrate/shake feedback, glass effect, scoring,
 * and game completion.
 *
 * @param {HTMLElement} box - The word-box element clicked.
 * @param {string[]} correctOrder - Array of the words in the correct sequence.
 */
function placeWord(box, correctOrder) {
  const slots     = Array.from(document.querySelectorAll('.slot'));
  const emptySlot = slots.find(s => !s.dataset.word);
  if (!emptySlot) return;

  const slotIndex   = slots.indexOf(emptySlot);
  const correctText = correctOrder[slotIndex];

  // 2️⃣ Extract the same .word-text you used for correctOrder
  const span       = box.querySelector('.word-text');
  const pickedText = span
    ? span.textContent.trim()
    : box.textContent.trim();

  // 4️⃣ Now the test
  if (pickedText !== correctText) {
    if (navigator.vibrate) navigator.vibrate([100,50,100]);
    box.classList.add('shake');
    setTimeout(() => box.classList.remove('shake'), 400);

    gameSession.loseLife();
    updateStats();
    if (gameSession.lives === 0) {
      gameSession.end(false);
      showGameOverPopup();
    }
    window.showToast?.('❌ Incorrect!', '#c0392b');
    return;
  }
  if (navigator.vibrate) navigator.vibrate(20);
  // 3️⃣ Correct guess: animate clone from box → slot
  const fromRect = box.getBoundingClientRect();
  const toRect   = emptySlot.getBoundingClientRect();

  const movingClone = box.cloneNode(true);
  movingClone.classList.add('clone');
  Object.assign(movingClone.style, {
    position:   'fixed',
    left:       `${fromRect.left}px`,
    top:        `${fromRect.top}px`,
    width:      `${fromRect.width}px`,
    height:     `${fromRect.height}px`,
    transition: 'transform 0.4s ease'
  });
  document.body.appendChild(movingClone);
  box.style.visibility = 'hidden';

  const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
  const dy = (toRect.top  + toRect.height / 2) - (fromRect.top  + fromRect.height / 2);

  requestAnimationFrame(() => {
    movingClone.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  // 4️⃣ After animation completes, show glass effect, cleanup, and update state
  setTimeout(() => {
    // Glass burst effect
    const glass = document.getElementById('glassEffect');
    if (glass) {
      // Position at center of slot
      glass.style.left    = `${toRect.left + toRect.width / 2 - 50}px`;
      glass.style.top     = `${toRect.top  + toRect.height / 2 - 50}px`;
      glass.style.display = 'block';

      // Force replay by cloning node
      const replay = glass.cloneNode(true);
      glass.remove();
      document.body.appendChild(replay);
    }

    // Remove clone and place text in slot
    movingClone.remove();
    box.remove();
    emptySlot.textContent     = pickedText;
    emptySlot.dataset.word    = pickedText;
    emptySlot.classList.add('filled');

    // Award points for correct guess
    gameSession.addPoints(GAME_CONFIG.correctActionPoints);
    //guestGameSession.addPoints(GAME_CONFIG.correctActionPoints)
    //updateStats();


    const slots = Array.from(document.querySelectorAll('.slot'));
    const allFilled = slots.every(s => Boolean(s.dataset.word && s.dataset.word.trim()));
  
    // 5️⃣ Check for game completion
    if (allFilled) {
      gameSession.addPoints(GAME_CONFIG.fullGameBonus); //--!resue later 
      //guestGameSession.addPoints(GAME_CONFIG.fullGameBonus)
      //updateStats();
      /**
      showCompletionPopup(
        'You have earned ' +
        (GAME_CONFIG.fullGameBonus) + ' extra Ajr points for forming a complete ayah!',
      ); **/
      gameSession.end(true);
      window.parent.postMessage({
        type: 'persistStats',
        score: gameSession.sessionScore,  // total earned this session
        recordStreak: false,                // ask them to record today’s streak too
      }, '*');
      //window.parent.postMessage({
       // type: 'streakUpdate',
      //  date: new Date().toISOString().split('T')[0]
     // }, '*');
    
    }
  }, 400);
}

