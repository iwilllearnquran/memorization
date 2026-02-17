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
    const WEEK_ID    = 'streakWeek';
    const CONF_CANVAS_ID = 'confettiCanvas';
    const MAX_FREEZES = 2;
    const FLAME = String.fromCodePoint(0x1F525);
  
    // Internal state
    let userRef = null;
    let history = [];
    let initialized = false;
    let prevLength = 0;
    let firstSnapshot = true;
    let confettiInstance = null;
    let navEl, auth, db;
    let remainingFreezes = MAX_FREEZES;
    let lastNavOpenAt = 0;
    const NAV_OPEN_DEBOUNCE_MS = 300;
  
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

      // Lock background scroll
      document.body.classList.add('modal-open');

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.classList.add('qq-overlay');
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      });

      // Popup
      const popup = document.createElement('div');
      popup.id = POPUP_ID;
      popup.classList.add('qq-modal');
      Object.assign(popup.style, {
        background: '#fff',
        borderRadius: '16px',
        width: '90%',
        maxWidth: '360px',
        padding: '24px 20px',
        position: 'relative',
        boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
        animation: 'streakPop 0.25s ease-out'
      });

      popup.innerHTML = `
        <button
          style="
            position:absolute;
            top:12px;
            right:12px;
            background:none;
            border:none;
            font-size:20px;
            cursor:pointer;
            color:#666;
          "
          aria-label="Close"
          onclick="StreakUI.close()"
        >&times;</button>

        <h2 style="text-align:center;color:#0a4d68;margin-bottom:16px;">
          Quran Reading Streak
        </h2>

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:center;
            gap:10px;
            margin-bottom:12px;
          "
        >
          <div
            id="streakLightAnim"
            style="width:130px;height:130px;flex-shrink:0;margin-right:0px;margin-left:-50px;"
          ></div>

          <div
            id="streakCount"
            style="
              font-size:2.4rem;
              font-weight:600;
              color:#2ca7d8;
              line-height:1;
              margin-left:-40px;
              margin-bottom:-50px;
            "
          >0</div>
        </div>

        <p id="${MSG_ID}"
          style="text-align:center;font-size:1rem;color:#333;margin:10px 0 0;">
        </p>

        <div id="${WEEK_ID}" style="margin-top:10px;"></div>

        <div id="${GRACE_ID}" style="text-align:center;margin-top:10px;"></div>
      `;

      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      // Load guiding light animation
      const lightContainer = document.getElementById('streakLightAnim');
      if (lightContainer && window.lottie) {
        lottie.loadAnimation({
          container: lightContainer,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '/utils/assets/streak.json'
        });
      }

      // click outside -> close
      overlay.addEventListener('click', e => {
        if (e.target === overlay) StreakUI.close();
      });
    }

function renderPopup(animate, oldCount, newCount) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  const countEl = document.getElementById(COUNT_ID);
  const graceEl = document.getElementById(GRACE_ID);

  if (animate && oldCount != null) {
    let current = oldCount;
    const step = () => {
      if (current < newCount) {
        current++;
        countEl.textContent = current;
        setTimeout(step, 100);
      }
    };
    step();
  } else {
    countEl.textContent = newCount;
  }

  renderMessage(newCount);
  renderProgress();
  if (graceEl) {
    renderFreezes();
  }
  renderWeekStrip();

  overlay.style.display = 'flex';

  if (animate && confettiInstance) {
    confettiInstance({ particleCount: 120, spread: 70 });
  }
}

  
function closePopup() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();

  // Restore scroll
   document.body.classList.remove('modal-open');
}


    // Builds motivational message based on streak
  function renderMessage(streakCount) {
    const msgEl = document.getElementById(MSG_ID);
    let message;

    if (streakCount === 0) {
      message = 'Read today to start your streak.';
    } else if (streakCount === 1) {
      message = 'Great start - keep going!';
    } else {
      message = 'You are making great progress!';
    }

    msgEl.textContent = message;
  }

  function renderFreezes() {
    const graceEl = document.getElementById(GRACE_ID);
    if (!graceEl) return;

    const available = Math.max(0, Math.min(MAX_FREEZES, Number(remainingFreezes) || 0));
    const icons = Array.from({ length: MAX_FREEZES }, (_, idx) => {
      const active = idx < available;
      const color = active ? '#5aa9ff' : '#c6d2de';
      const bg = active ? 'rgba(90,169,255,0.18)' : 'rgba(198,210,222,0.2)';
      const border = active ? 'rgba(90,169,255,0.5)' : 'rgba(198,210,222,0.5)';
      return `
        <span style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:20px;
          height:20px;
          border-radius:6px;
          background:${bg};
          border:1px solid ${border};
          color:${color};
          font-size:0.8rem;
        ">&#10052;</span>
      `;
    }).join('');

    const hint = remainingFreezes < MAX_FREEZES
      ? `Earn 1 after 5-day streak (max ${MAX_FREEZES})`
      : '';

    graceEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
        <span style="font-size:0.7rem;letter-spacing:0.08em;color:#8b97a3;text-transform:uppercase;">Freezes</span>
        ${icons}
      </div>
      ${hint ? `<div style="margin-top:4px;font-size:0.7rem;color:#a0acb8;">${hint}</div>` : ''}
    `;
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

    function getLocalNowParts() {
      const now = new Date();
      return {
        y: now.getFullYear(),
        m: now.getMonth(),
        d: now.getDate(),
        dow: now.getDay()
      };
    }

    function getLocalDateStr() {
      const p = getLocalNowParts();
      const mm = String(p.m + 1).padStart(2, '0');
      const dd = String(p.d).padStart(2, '0');
      return `${p.y}-${mm}-${dd}`;
    }

    function dateStrToUTCms(dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    }

    function addDaysStr(dateStr, delta) {
      const ms = dateStrToUTCms(dateStr) + delta * 86400000;
      return new Date(ms).toISOString().split('T')[0];
    }

    function weekdayLabel(dateStr) {
      const ms = dateStrToUTCms(dateStr);
      const short = new Date(ms).toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: 'UTC'
      });
      return short.slice(0, 2);
    }

    function getWeekDatesLocal() {
      const p = getLocalNowParts();
      const weekStartMs = Date.UTC(p.y, p.m, p.d - p.dow);
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push(new Date(weekStartMs + i * 86400000).toISOString().split('T')[0]);
      }
      return days;
    }

    function buildWeekData() {
      const weekDates = getWeekDatesLocal();
      const todayStr = getLocalDateStr();
      const historySet = new Set(history);
      let freezesToMark = Math.max(0, MAX_FREEZES - remainingFreezes);
      let streakAlive = true;
      const statusMap = {};

      for (let i = weekDates.length - 1; i >= 0; i--) {
        const dateStr = weekDates[i];
        if (dateStr > todayStr) {
          statusMap[dateStr] = 'future';
          continue;
        }
        if (dateStr === todayStr && !historySet.has(dateStr)) {
          statusMap[dateStr] = 'today';
          continue;
        }
        if (historySet.has(dateStr)) {
          statusMap[dateStr] = 'kept';
        } else if (streakAlive && freezesToMark > 0) {
          statusMap[dateStr] = 'frozen';
          freezesToMark -= 1;
        } else {
          statusMap[dateStr] = 'missed';
          streakAlive = false;
        }
      }

      return weekDates.map(dateStr => ({
        dateStr,
        label: weekdayLabel(dateStr),
        status: statusMap[dateStr] || 'missed'
      }));
    }

    function renderWeekStrip() {
      const weekEl = document.getElementById(WEEK_ID);
      if (!weekEl) return;

      const data = buildWeekData();
      const segWidth = 100 / data.length;
      const todayStr = getLocalDateStr();

      const labels = data.map(item => {
        const isToday = item.dateStr === todayStr;
        const color = isToday ? "#f08c2b" : "#9aa6b2";
        const weight = isToday ? "600" : "500";
        return `
        <div style="flex:1;text-align:center;font-size:0.72rem;color:${color};font-weight:${weight};">
          ${item.label}
        </div>
      `;
      }).join("");

      const segments = data.map((item, idx) => {
        let bg = "#d8dee6";
        let icon = "";
        let iconColor = "#344054";
        let overlay = "";

        if (item.status === "kept") {
          bg = "linear-gradient(180deg,#ffd166,#f59f0b)";
          icon = "&#10003;";
          iconColor = "#4a2c00";
        } else if (item.status === "frozen") {
          bg = "linear-gradient(180deg,#ffd166,#f59f0b)";
          icon = "&#10052;";
          iconColor = "#1f4ea8";
          overlay = "<span style=\"position:absolute;inset:0;background:linear-gradient(135deg,rgba(150,210,255,0.45),rgba(150,210,255,0.05));z-index:0;\"></span>";
        } else if (item.status === "today") {
          bg = "#ffffff";
        } else if (item.status === "future") {
          bg = "#f3f5f7";
        }

        const left = idx * segWidth;
        return `
          <div style="position:absolute;left:${left}%;width:${segWidth}%;top:0;bottom:0;background:${bg};">
            ${overlay}
            ${icon ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:${iconColor};z-index:1;">${icon}</span>` : ""}
          </div>
        `;
      }).join("");

      weekEl.innerHTML = `
        <div style="display:flex;gap:0;align-items:center;justify-content:space-between;margin-bottom:6px;">
          ${labels}
        </div>
        <div style="position:relative;height:18px;border-radius:999px;background:#edf0f4;border:1px solid #e1e6eb;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">
          ${segments}
        </div>
      `;
    }
    function updateNavStreak(count) {
      if (!navEl) return;
      navEl.textContent = `${FLAME}${count}`;
    }

    function handleGuestStreakUpdate(dateStr) {
      if (!history.includes(dateStr)) {
        history.push(dateStr);
        localStorage.setItem('guestStreakHistory', JSON.stringify(history));
        renderPopup(true, prevLength, history.length);
        prevLength = history.length;
        updateNavStreak(history.length);

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
            if (typeof evt.data.freezes === 'number') {
              remainingFreezes = evt.data.freezes;
            }
            handleGuestStreakUpdate(evt.data.date);
          }
        });

        createPopup();

        // ——— Guest init ———
        if (!auth.currentUser) {
          history    = JSON.parse(localStorage.getItem('guestStreakHistory') || '[]');
          prevLength = history.length;
          remainingFreezes = parseInt(localStorage.getItem('guestStreakFreezes') || '0', 10);
          updateNavStreak(history.length);
        }

        // Navbar click → open popup (no animation)
        if (navEl) {
          navEl.addEventListener('click', () => {
            const overlay = document.getElementById(OVERLAY_ID);
            const alreadyOpen = overlay && overlay.style.display === 'flex';
            const now = performance.now();
            if (alreadyOpen || now - lastNavOpenAt < NAV_OPEN_DEBOUNCE_MS) return;
            lastNavOpenAt = now;
            createPopup();
            renderPopup(false, null, history.length);
          });
        }

        // ——— Auth + Firestore snapshot ———
        auth.onAuthStateChanged(user => {
          if (!user) return;

          userRef = db.collection('users').doc(user.uid);

          userRef.onSnapshot(doc => {
            const data    = doc.data() || {};
            const newHist = data.streakHistory || [];

            if (firstSnapshot) {
              prevLength    = newHist.length;
              history       = newHist;
              remainingFreezes = Number.isFinite(data.streakFreezes) ? data.streakFreezes : remainingFreezes;
              firstSnapshot = false;
            } else if (newHist.length > prevLength) {
              renderPopup(true, prevLength, newHist.length);
              prevLength = newHist.length;
              history    = newHist;
              remainingFreezes = Number.isFinite(data.streakFreezes) ? data.streakFreezes : remainingFreezes;
            } else {
              prevLength = newHist.length;
              history    = newHist;
              remainingFreezes = Number.isFinite(data.streakFreezes) ? data.streakFreezes : remainingFreezes;
            }

            updateNavStreak(history.length);
          });
        });
      },

      // ✅ PUBLIC popup trigger (what SAVE_PROGRESS should call)
      showPopup: function(oldLength, newLength) {
        console.log('[StreakUI] showPopup called', { oldLength, newLength });
        createPopup();
        renderPopup(true, oldLength, newLength);
        updateNavStreak(newLength);
      },

      close: function() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.remove();
        document.body.classList.remove('modal-open');
      }
    };

   return StreakUI;
})();

// Expose globally & as module export
window.StreakUI = StreakLogicAndUI;
export { StreakLogicAndUI as StreakUI };
