// gameSession.js (in src/state/ for example)

// 1️⃣ Load Firebase from its ESM CDN bundles
import { initializeApp }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }               from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// 2️⃣ Initialize once at top
// 🔑 exactly the same config you use in index.html
const firebaseConfig = {
  apiKey: "AIzaSyBuOs0LRjbcqvJULZlWkUqYdrfmGIJm88w",
  authDomain: "myquranquest786.firebaseapp.com",
  projectId: "myquranquest786",
  storageBucket: "myquranquest786.appspot.com",
  messagingSenderId: "970275375391",
  appId: "1:970275375391:web:d1cac99878334834cb482a",
  measurementId: "G-KL3ZNNX844"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(err => console.error("Persistence error:", err));
}

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// 3️⃣ Internal modules via relative paths
import { GAME_CONFIG }            from '/config/gameConfig.js';
import { saveScore }              from '/services/firestoreService.js';
import { isFirstCorrectToday,
         logToday }               from '/services/localStreakService.js';
import { debounce }               from '/utils/debounce.js';



class GameSession {
  constructor() {
    this.score   = 0;
    this.lives   = GAME_CONFIG.maxLives;
    this.type    = '';
    this._persistDebounced = debounce(() => this._persist(), 1000);
  }

  init(type) {
    this.score = 0;
    this.lives = GAME_CONFIG.maxLives;
    this.type  = type;
    if (isFirstCorrectToday()) {
      this.addPoints(GAME_CONFIG.dailyBonusPoints);
      logToday();
    }
  }

  addPoints(n = GAME_CONFIG.correctActionPoints) {
    this.score += n;
    this._persistDebounced();
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    if (this.lives === 0) this.end(false);
  }

  async _persist() {
    const user = firebase.auth().currentUser;
    if (!user || this.score <= 0) return;
    try {
      await saveScore(user.uid, this.score);
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  }

  end(success = true) {
    // ... your end logic (toasts, popup) ...
    logToday();
    this._persist();
  }
}

export default new GameSession();
