/*
 * StreakLogicAndUI.js
 * Manages streak popup, motivational message, progress bar, and animation.
 * Requires Firebase JS SDK (app, auth, firestore) and a confetti library (e.g., canvas-confetti).
 */

const StreakLogicAndUI = (function() {
    // DOM element IDs
    const OVERLAY_ID = 'streakOverlay';
    const POPUP_ID   = 'streakPopup';
    const COUNT_ID   = 'streakCount';
    const MSG_ID     = 'streakMessage';
    const PROG_INNER = 'weeklyProgress';
    const GRACE_ID   = 'graceCount';
    const CONF_CANVAS_ID = 'confettiCanvas';
  
    // Internal state
    let userRef = null;
    let history = [];
    let initialized = false;
    let prevLength = 0;
    let firstSnapshot = true;
    let confettiInstance = null;
    let navEl, auth, db;
  
    // Inject confetti canvas behind popup
    function createConfettiCanvas() {
      if (document.getElementById(CONF_CANVAS_ID)) return;
      const canvas = document.createElement('canvas');
      canvas.id = CONF_CANVAS_ID;
      Object.assign(canvas.style, {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 10001
      });
      document.body.appendChild(canvas);
      confettiInstance = confetti.create(canvas, { resize: true, useWorker: true });
    }
  
    // Injects the popup markup into the document
    function createPopup() {
      if (document.getElementById(OVERLAY_ID)) return;
      // Confetti canvas
      createConfettiCanvas();
      // Overlay
      const overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      Object.assign(overlay.style, {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', display: 'none',
        justifyContent: 'center', alignItems: 'center', zIndex: 10000
      });
      // Popup container
      const popup = document.createElement('div');
      popup.id = POPUP_ID;
      Object.assign(popup.style, {
        background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '400px',
        padding: '24px', position: 'relative', zIndex: 10002
      });
      popup.innerHTML = `
        <button style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;" onclick="StreakUI.close()">✕</button>
        <h2 style="text-align:center;color:#0a4d68;margin-bottom:16px;">Quran Streak</h2>
        <div id="${COUNT_ID}" style="font-size:3rem;text-align:center;color:#2ca7d8;margin-bottom:8px;">🔥0</div>
        <p id="${MSG_ID}" style="text-align:center;font-size:1rem;color:#333;margin-bottom:16px;"></p>

      `;
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
    }
  
    // Renders popup UI; if 'animate' is true, runs count-up and confetti
    function renderPopup(animate, oldCount, newCount) {
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) return;
      const countEl = document.getElementById(COUNT_ID);
      if (animate && oldCount != null) {
        let current = oldCount;
        const step = () => {
          if (current < newCount) {
            current++;
            countEl.textContent = `🔥${current}`;
            setTimeout(step, 100);
          }
        };
        step();
      } else {
        countEl.textContent = `🔥${newCount}`;
      }
      renderMessage(newCount);
      renderProgress();
      overlay.style.display = 'flex';
      if (animate && confettiInstance) {
        confettiInstance({ particleCount: 100, spread: 70 });
      }
    }
  

    // Builds motivational message based on streak
  function renderMessage(streakCount) {
    const msgEl = document.getElementById(MSG_ID);
    let message;

    if (streakCount === 0) {
      message = 'Begin your daily Quran journey today.';
    } else if (streakCount === 1) {
      message = 'This is day 1 of your Quran journey.';
    } else {
      message = `You are on ${streakCount} days journey of faith and dedication.`;
    }

    msgEl.textContent = message;
  }

  
    // Updates weekly progress bar
    function renderProgress() {
      const today = new Date();
      const lastWeekCount = history.filter(dateStr => {
        const diff = (today - new Date(dateStr)) / (1000 * 60 * 60 * 24);
        return diff < 7;
      }).length;
      const pct = (lastWeekCount / 7) * 100;
    }


    function handleGuestStreakUpdate(dateStr) {
      if (!history.includes(dateStr)) {
        history.push(dateStr);
        localStorage.setItem('guestStreakHistory', JSON.stringify(history));
        renderPopup(true, prevLength, history.length);
        prevLength = history.length;
        if (navEl) navEl.textContent = `🔥${history.length}`;
      }
    }


  
    // Public API
    const StreakUI = {
      init: function({ navSelector, firebaseApp }) {
        if (initialized) return;
        initialized = true;
  
        navEl = document.querySelector(navSelector);
        auth  = firebaseApp.auth();
        db    = firebaseApp.firestore();

        window.addEventListener('message', evt => {
          if (evt.data?.type === 'streakUpdate' && !auth.currentUser) {
            handleGuestStreakUpdate(evt.data.date);
          }
        });
  
        createPopup();
  
        // ——— Guest init: load from localStorage & paint nav count ———
        if (!auth.currentUser) {
          history    = JSON.parse(localStorage.getItem('guestStreakHistory') || '[]');
          prevLength = history.length;
          if (navEl) navEl.textContent = `🔥${history.length}`;
        }
  
        // Click on navbar opens popup without animation
        if (navEl) {
          navEl.addEventListener('click', () => {
            renderPopup(false, null, history.length);
          });
        }
  
        // ——— Auth + Firestore path for real users ———
        auth.onAuthStateChanged(user => {
          if (!user) return; 
          userRef = db.collection('users').doc(user.uid);
  
          userRef.onSnapshot(doc => {
            const data   = doc.data() || {};
            const newHist = data.streakHistory || [];
  
            if (firstSnapshot) {
              prevLength    = newHist.length;
              history       = newHist;
              firstSnapshot = false;
            } else if (newHist.length > prevLength) {
              // popped a new day onto the streak!
              renderPopup(true, prevLength, newHist.length);
              prevLength = newHist.length;
              history    = newHist;
            } else {
              // no growth, just update local state
              prevLength = newHist.length;
              history    = newHist;
            }
  
            // repaint nav
            if (navEl) navEl.textContent = `🔥${history.length}`;
          });
        });
      },
  
      close: function() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.style.display = 'none';
      }
    };
  
    return StreakUI;
  })();
  
  // Expose globally & as module export
  window.StreakUI = StreakLogicAndUI;
  export { StreakLogicAndUI as StreakUI };
