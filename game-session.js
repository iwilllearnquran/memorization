// game-session.js
let currentGameScreen = "selector"; // selector | arrange | verb

window.toggleGames = function () {
  const learnSec = document.getElementById("learning-mode-content");
  const tranSec = document.getElementById("translation-section");
  const gameContainer = document.getElementById("game-mode-content");

  if (!gameContainer) {
    console.error("❌ game-mode-content not found in DOM.");
    return;
  }

  learnSec.style.display = "none";
  tranSec.style.display = "none";
  gameContainer.style.display = "block";
  
  currentGameScreen = "selector";

  // Setup lives and points
  GameSession.init('selector', false); // You can delay UI inject if needed
  GameSession.updateUI();

  // Show lives and points
  let statsBar = document.getElementById('gameStats');
  if (!statsBar) {
    statsBar = document.createElement('div');
    statsBar.id = 'gameStats';
    statsBar.style.cssText = 'text-align:center; margin:10px; font-weight:bold;';
    gameContainer.prepend(statsBar);
  }
  statsBar.innerHTML = `❤️ Lives: ${window.lives} | ⭐ Points: ${window.points}`;



  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    if (item && item.id !== 'navSettings' && item.id !== 'playToggleBtn') {
      item.style.display = 'none';
    }
  });

  let backBtn = document.getElementById('navBackBtn');
  if (!backBtn) {
    backBtn = document.createElement('div');
    backBtn.id = 'navBackBtn';
    backBtn.className = 'nav-item';
    backBtn.innerHTML = `
      <span class="material-icons-outlined">arrow_back</span>
      <span class="nav-label">Back</span>
    `;
backBtn.onclick = () => {
  if (currentGameScreen === "selector") {
    // From selector → go back to learning mode
    navItems.forEach(i => (i.style.display = ''));
    gameContainer.style.display = "none";
    toggleMode('learning');
    backBtn.remove();
  } else {
    // From inside a game → confirm before going to selector
    const confirmExit = confirm("Are you sure you want to go back?\nYour game progress will be lost.");
    if (confirmExit) {
      document.getElementById("gameSelector").style.display = "block";
      document.getElementById("arrangeGameContainer").style.display = "none";
      document.getElementById("verbMatchGame").style.display = "none";
      currentGameScreen = "selector";
    }
  }
};

    
    document.querySelector('.bottom-nav').insertBefore(backBtn, navItems[0]);
  }

  if (gameContainer.dataset.initialized === "true") return;

  console.log("🧩 Injecting game content...");

  const wordElements = Array.from(document.querySelectorAll("#learning-mode-content .word-block"));
  const correctOrder = wordElements.map(el => el.querySelector('.word-text')?.textContent.trim());

gameContainer.innerHTML = `
<div id="gameStats" style="
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  margin: 12px auto;
  color: #0a4d68;
  font-family: 'Roboto', sans-serif;
">
  ❤️ Lives: 10 | ⭐ Points: 0
</div>

<div id="gameSelector" style="max-width: 600px; margin: auto; padding: 16px;">
  <div style="background: #f9f9f9; border: 2px solid #0a4d68; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-family: 'Roboto', sans-serif;">
    <h3 style="margin: 0 0 8px; color: #0a4d68;">Arrange Words</h3>
    <p style="margin: 0 0 12px; direction: ltr !important;">Rearrange the words to match the correct order in the Ayah</p>
    <button onclick="startArrangeGameFromCard()" style="padding: 8px 16px; background: #0a4d68; color: white; border: none; border-radius: 6px; cursor: pointer;">Play Game</button>
  </div>

  <div style="background: #f9f9f9; border: 2px solid #0a4d68; border-radius: 8px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-family: 'Roboto', sans-serif;">
    <h3 style="margin: 0 0 8px; color: #0a4d68;">Verb Match</h3>
    <p style="margin: 0 0 12px; direction: ltr !important;">Match Arabic verbs to their English meanings</p>
    <button onclick="startVerbGameFromCard()" style="padding: 8px 16px; background: #0a4d68; color: white; border: none; border-radius: 6px; cursor: pointer;">Play Game</button>
  </div>
</div>



  <div id="arrangeGameContainer" style="display: none;">
    <div class="prompt">Arrange the words in correct order</div>
    <div class="slots" id="slotContainer"></div>
    <div class="options" id="optionsContainer"></div>
  </div>

  <div id="verbMatchGame" style="display: none;">
    <div class="prompt">Match the verb to its meaning</div>

<div style="
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 1px !important;;
  max-width: 100%;
  padding: 1px !important;;
  margin: 1px;
  box-sizing: border-box;
">
  <div id="verbOptions" style="
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
	width: 80px !important;
  "></div>

  <div id="meaningOptions" style="
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
	
  "></div>
</div>

</div>


  </div>

  <div id="gameResultPopup" style="
    display: none;
    position: fixed;
    top: 80%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    padding: 24px 32px;
    z-index: 10000;
    max-width: 90%;
    width: 320px;
    text-align: center;
    font-family: 'Roboto', sans-serif;
    direction: ltr !important;
    box-sizing: border-box;
  ">
    <div id="gameResultMessage" style="
      font-size: 20px;
      font-weight: 600;
      color: #2c7c4c;
      margin-bottom: 20px;
    ">
      Well done! You are one step closer to Jannah, Inshallah! ✨
    </div>
    <div style="
      display: flex;
      justify-content: center;
      gap: 16px;
    ">
      <button id="redoGameBtn" style="
        padding: 8px 16px;
        font-size: 14px;
        background: #e0e0e0;
        color: #333;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.3s ease;
      ">🔄 Redo</button>
    </div>
  </div>

  <svg id="glassEffect" viewBox="0 0 100 100" style="display:none; position:fixed; width:100px; height:100px; pointer-events:none; z-index:9999;">
    <circle cx="50" cy="50" r="45" stroke="rgba(0,0,0,0.5)" stroke-width="1" fill="none">
      <animate attributeName="r" from="1" to="45" dur="0.4s" fill="freeze" />
      <animate attributeName="opacity" from="1" to="0" dur="0.4s" fill="freeze" />
    </circle>
  </svg>
</div>
`;



  const optionsContainer = gameContainer.querySelector('#optionsContainer');
  const slotContainer = gameContainer.querySelector('#slotContainer');

  correctOrder.forEach(() => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slotContainer.appendChild(slot);
  });

  const shuffled = [...wordElements].sort(() => 0.5 - Math.random());
  shuffled.forEach(original => {
    const box = original.cloneNode(true);
    box.classList.add('word-box');
    box.removeAttribute('onclick');
    box.onclick = null;

    box.addEventListener('click', (e) => {
      e.stopPropagation();
      placeWord(box);
    });

    optionsContainer.appendChild(box);
  });

  gameContainer.dataset.initialized = "true";

  window.placeWord = function (box) {
    const emptySlot = [...document.querySelectorAll('.slot')].find(s => !s.dataset.word);
    if (!emptySlot) return;

    const slotIndex = [...document.querySelectorAll('.slot')].indexOf(emptySlot);
    const correctText = correctOrder[slotIndex];
    const boxText = box.querySelector('.word-text')?.textContent.trim();

    if (boxText !== correctText) {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      box.classList.add('shake');
      setTimeout(() => box.classList.remove('shake'), 400);
  
      // ❌ Deduct life
      GameSession.loseLife();
      GameSession.updateUI();

      if (window.lives <= 0) {
        GameSession.end(false);

      } else {
        showToast('❌ Incorrect!', '#c0392b');
      }
      return;
    }

    const rectFrom = box.getBoundingClientRect();
    const rectTo = emptySlot.getBoundingClientRect();

    const movingClone = box.cloneNode(true);
    movingClone.classList.add('clone');
    movingClone.style.position = 'fixed';
    movingClone.style.left = `${rectFrom.left}px`;
    movingClone.style.top = `${rectFrom.top}px`;
    movingClone.style.width = `${rectFrom.width}px`;
    movingClone.style.height = `${rectFrom.height}px`;
    movingClone.style.transition = 'transform 0.4s ease';
    document.body.appendChild(movingClone);

    box.style.visibility = 'hidden'; 
	
	  const dx = (rectTo.left + rectTo.width / 2) - (rectFrom.left + rectFrom.width / 2);
    const dy = (rectTo.top + rectTo.height / 2) - (rectFrom.top + rectFrom.height / 2);

    requestAnimationFrame(() => {
      movingClone.style.transform = `translate(${dx}px, ${dy}px)`;
    });


    setTimeout(() => {
	  // Position and show the glass burst
	  const glassEffect = document.getElementById('glassEffect');
	  glassEffect.style.left = `${rectTo.left + rectTo.width / 2 - 50}px`;
	  glassEffect.style.top = `${rectTo.top + rectTo.height / 2 - 50}px`;
	  glassEffect.style.display = 'block';
	  
	  // Restart animation by cloning (forces replay)
	  const newEffect = glassEffect.cloneNode(true);
	  glassEffect.remove();
	  document.body.appendChild(newEffect);

      movingClone.remove();
      emptySlot.textContent = boxText;
      emptySlot.dataset.word = boxText;
      emptySlot.classList.add('filled');
      box.remove();


      GameSession.updateUI();


      // ✅ Check if game is complete
      const allSlotsFilled = [...document.querySelectorAll('.slot')].every(s => s.dataset.word);
      if (allSlotsFilled) {
        GameSession.addPoints(GAME_CONFIG.fullGameBonus, '🎯 Game Complete!');
        GameSession.end(true);
        
      }
    }, 400);

    GameSession.addPoints();



  };

  // 🍞 Toast Message Function
  window.showToast = function (message, color = '#333') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: ${color};
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = 1);

    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 300);
    }, 700);
  };
  
  document.getElementById('redoGameBtn').onclick = () => {
  const backBtn = document.getElementById('navBackBtn');
  if (backBtn) backBtn.remove();
  gameContainer.dataset.initialized = "false";
  GameSession.init(currentGameScreen);
  toggleGames();

};


  


};

function startArrangeGame() {
  document.getElementById("arrangeGameContainer").style.display = "block";
  document.getElementById("verbMatchGame").style.display = "none";
}

function startVerbGame() {
  document.getElementById("arrangeGameContainer").style.display = "none";
  document.getElementById("verbMatchGame").style.display = "flex";

  const verbOptions = document.getElementById("verbOptions");
  const meaningOptions = document.getElementById("meaningOptions");

  verbOptions.innerHTML = "";
  meaningOptions.innerHTML = "";

  const currentRank = currentSurah * 1000 + currentAyah;

  const allPairs = Object.entries(VERB_DATA).filter(([_, data]) =>
    typeof data.rank !== 'undefined' &&
    !isNaN(Number(data.rank)) &&
    Number(data.rank) <= currentRank
  );

  if (allPairs.length === 0) {
    showToast("ℹ️ No verbs found for this Ayah yet.", "#555");
    return;
  }

  const shuffle = arr => arr.sort(() => 0.5 - Math.random());

  const selectedPairs = shuffle(allPairs).slice(0, 5); // ⬅️ only 10 pairs

  let selectedVerb = null;
  let selectedMeaning = null;

  const verbs = shuffle(selectedPairs.map(([verb]) => verb));
  const meanings = shuffle(selectedPairs.map(([_, data]) => data.meaning));

  verbs.forEach(verb => {
    const el = document.createElement("div");
    el.className = "match-card";
    el.textContent = verb;
    el.dataset.verb = verb;
    el.onclick = () => {
      if (el.classList.contains("matched")) return;
      document.querySelectorAll("#verbOptions .match-card").forEach(c => c.classList.remove("selected"));
      el.classList.add("selected");
      selectedVerb = el;
      tryMatch();
    };
    verbOptions.appendChild(el);
  });

  meanings.forEach(meaning => {
    const el = document.createElement("div");
    el.className = "match-card";
    el.textContent = meaning;
    el.dataset.verb = selectedPairs.find(([verb, data]) => data.meaning === meaning)?.[0];
    el.onclick = () => {
      if (el.classList.contains("matched")) return;
      document.querySelectorAll("#meaningOptions .match-card").forEach(c => c.classList.remove("selected"));
      el.classList.add("selected");
      selectedMeaning = el;
      tryMatch();
    };
    meaningOptions.appendChild(el);
  });

  function tryMatch() {
    if (!selectedVerb || !selectedMeaning) return;

    const v = selectedVerb.dataset.verb;
    const m = selectedMeaning.dataset.verb;

    if (v === m) {
      selectedVerb.classList.add("matched");
      selectedMeaning.classList.add("matched");
      selectedVerb.classList.remove("selected");
      selectedMeaning.classList.remove("selected");
      selectedVerb.style.background = "#d4edda";
      selectedMeaning.style.background = "#d4edda";
      selectedVerb.style.borderColor = "#28a745";
      selectedMeaning.style.borderColor = "#28a745";
      showToast("✅ Correct!");

      selectedVerb = null;
      selectedMeaning = null;

      const allMatched = [...verbOptions.children].every(el => el.classList.contains("matched"));
      if (allMatched) {
        document.getElementById("gameResultMessage").textContent = "All matched! 🌟 You’re amazing!";
        document.getElementById("gameResultPopup").style.display = "block";
      }
    } else {
      selectedVerb.style.background = "#f8d7da";
      selectedMeaning.style.background = "#f8d7da";
      selectedVerb.style.borderColor = "#dc3545";
      selectedMeaning.style.borderColor = "#dc3545";
      showToast("❌ Try again");

      setTimeout(() => {
        //selectedVerb.style.background = "";
        //selectedMeaning.style.background = "";
        selectedVerb.style.borderColor = "";
        selectedMeaning.style.borderColor = "";
        selectedVerb.classList.remove("selected");
        selectedMeaning.classList.remove("selected");
        selectedVerb = null;
        selectedMeaning = null;
      }, 800);
    }
  }
}

function startArrangeGameFromCard() {
  document.getElementById("gameSelector").style.display = "none";
  document.getElementById("arrangeGameContainer").style.display = "block";
  document.getElementById("verbMatchGame").style.display = "none";
  currentGameScreen = "arrange";
}

function startVerbGameFromCard() {
  document.getElementById("gameSelector").style.display = "none";
  document.getElementById("arrangeGameContainer").style.display = "none";
  document.getElementById("verbMatchGame").style.display = "flex";
  currentGameScreen = "verb";
  startVerbGame();
}


function savePointsToFirestore(pointsEarned) {
  const user = firebase.auth().currentUser;
  if (!user) return;

  const today = new Date().toISOString().split('T')[0]; // e.g., 2025-05-15
  const userRef = firebase.firestore().collection("users").doc(user.uid);

  userRef.set({
    totalPoints: firebase.firestore.FieldValue.increment(pointsEarned),
    streakHistory: firebase.firestore.FieldValue.arrayUnion(today)
  }, { merge: true })
  .then(() => console.log("✅ Points and streak updated"))
  .catch(err => console.error("❌ Firestore update error:", err));
}


// game-session.js


const GAME_CONFIG = {
  maxLives: 10,
  dailyBonusPoints: 10,
  correctActionPoints: 10,
  fullGameBonus: 20,
  wrongActionPenalty: 5
};

const GameSession = {
  score: 0,
  lives: GAME_CONFIG.maxLives,
  gameName: '',
  hasEarnedToday: false,
  initialized: false,
  playedToday: false,

  init(gameType = 'arrange', showUI = true) {
    this.score = 0;
    this.lives = GAME_CONFIG.maxLives;
    this.gameName = gameType;
    this.initialized = true;

    if (showUI) this.injectUI();
    this.updateUI();
    console.log(`🎮 Started game: ${gameType}`);

    if (!this.hasEarnedToday && this.isFirstCorrectToday()) {
      this.addPoints(GAME_CONFIG.dailyBonusPoints, '🌟 Daily Bonus!');
      this.hasEarnedToday = true;
    }
  },

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.updateUI();
    if (this.lives <= 0) {
      this.end(false);
    }
  },

  addPoints(points = GAME_CONFIG.correctActionPoints, label = '') {
    this.score += points;
    this.updateUI();
    if (label && window.showToast) window.showToast(`${label} +${points} points`);
  },

  updateUI() {
    const livesEl = document.getElementById("livesCount");
    const scoreEl = document.getElementById("scoreCount");
    if (livesEl) livesEl.textContent = this.lives;
    if (scoreEl) scoreEl.textContent = this.score;
  
    // ✅ Sync global vars for legacy UI
    window.lives = this.lives;
    window.points = this.score;
  
    // ✅ Update main stats bar too
    const statsBar = document.getElementById('gameStats');
    if (statsBar) {
      statsBar.innerHTML = `❤️ Lives: ${this.lives} | ⭐ Points: ${this.score}`;
    }

    savePointsToFirestore()
  }
  ,

  injectUI() {
    let div = document.getElementById("livesTracker");
    if (!div) {
      div = document.createElement("div");
      div.id = "livesTracker";
      div.style.cssText = `
        position: fixed;
        top: 12px;
        right: 12px;
        background: white;
        border: 2px solid #0a4d68;
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 14px;
        font-weight: bold;
        color: #0a4d68;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        z-index: 9999;
      `;
      document.body.appendChild(div);
    }
    div.innerHTML = `❤️ Lives: <span id="livesCount">${this.lives}</span> | ⭐ Score: <span id="scoreCount">${this.score}</span>`;
  },

  isFirstCorrectToday() {
    const today = new Date().toISOString().split("T")[0];
    const streak = JSON.parse(localStorage.getItem("localStreak") || "[]");
    return !streak.includes(today);
  },

  logLocalStreak() {
    const today = new Date().toISOString().split("T")[0];
    let streak = JSON.parse(localStorage.getItem("localStreak") || "[]");
    if (!streak.includes(today)) {
      streak.push(today);
      localStorage.setItem("localStreak", JSON.stringify(streak));
    }
  },

  end(success = true) {
    this.initialized = false;
    this.logLocalStreak();

    const message = success
      ? `🎉 Great job! You earned ${this.score} Ajr Points!`
      : `😓 Game Over. You earned ${this.score} Ajr Points.`;

    window.showToast?.(message, success ? '#2c7c4c' : '#c0392b');
    this.saveToFirestore();

    setTimeout(() => {
      const popup = document.getElementById("gameResultPopup");
      const msg = document.getElementById("gameResultMessage");
      if (msg) msg.textContent = message;
      if (popup) popup.style.display = "block";
    }, 600);
  },

  saveToFirestore() {
    const user = firebase.auth().currentUser;
    if (!user) {
      console.warn("⚠️ No user signed in – cannot save score");
      return;
    }
    if (this.score <= 0) {
      console.warn("⚠️ Score is zero or negative – skipping save");
      return;
    }
  
    const today = new Date().toISOString().split("T")[0];
    const db = firebase.firestore();
    const userRef = db.collection("users").doc(user.uid);
  
    const payload = {
      ajrPoints: firebase.firestore.FieldValue.increment(this.score),
      streakHistory: firebase.firestore.FieldValue.arrayUnion(today)
    };
    console.log("📤 Firestore payload:", payload);
  
    userRef.set(payload, { merge: true })
      .then(() => console.log("✅ Score & streak updated for", user.uid))
      .catch(err => console.error("❌ Firestore update error:", err));
  }
  
  
};

// Arrange Game Trigger
function handleCorrectWordPlacement() {
  GameSession.addPoints();
}
function handleIncorrectWordPlacement() {
  GameSession.loseLife();
}
function completeArrangeGame() {
  GameSession.addPoints(GAME_CONFIG.fullGameBonus, '🎯 Game Complete!');
  GameSession.end(true);
}

// Verb Game Trigger
function handleCorrectVerbMatch() {
  GameSession.addPoints();
  // check game complete separately in your verb game logic
}
function handleIncorrectVerbMatch() {
  GameSession.loseLife();
}

// New Game Placeholder Example
function startNewGameX() {
  GameSession.init('newGameX');
  // then build your game logic using addPoints, loseLife, end()
}

// Game Init Calls (examples)
// GameSession.init('arrange');
// GameSession.init('verb');

