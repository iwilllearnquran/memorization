/*
 * StreakLogicAndUI.js
 * Manages streak popup, weekly strip, and navbar count updates.
 */

const StreakLogicAndUI = (function() {
  const OVERLAY_ID = 'streakOverlay';
  const POPUP_ID = 'streakPopup';
  const COUNT_ID = 'streakCount';
  const MSG_ID = 'streakMessage';
  const WEEK_ID = 'streakWeek';
  const CONF_CANVAS_ID = 'confettiCanvas';
  const FLAME = String.fromCodePoint(0x1F525);

  let userRef = null;
  let history = [];
  let initialized = false;
  let prevLength = 0;
  let firstSnapshot = true;
  let confettiInstance = null;
  let navEl;
  let auth;
  let db;
  let lastNavOpenAt = 0;
  const NAV_OPEN_DEBOUNCE_MS = 300;

  function createConfettiCanvas() {
    if (document.getElementById(CONF_CANVAS_ID)) return;
    if (!window.confetti || typeof window.confetti.create !== 'function') {
      confettiInstance = null;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.id = CONF_CANVAS_ID;
    Object.assign(canvas.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 10001
    });
    document.body.appendChild(canvas);
    confettiInstance = confetti.create(canvas, { resize: true, useWorker: true });
  }

  function createPopup() {
    if (document.getElementById(OVERLAY_ID)) return;

    createConfettiCanvas();

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
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

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

    overlay.addEventListener('click', e => {
      if (e.target === overlay) StreakUI.close();
    });
  }

  function renderPopup(animate, oldCount, newCount) {
    // Auto streak updates can fire before the user ever opens the streak modal.
    // Ensure overlay/popup DOM exists before attempting to render.
    createPopup();

    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const countEl = document.getElementById(COUNT_ID);
    if (!countEl) return;

    if (animate && oldCount != null) {
      let current = oldCount;
      const step = () => {
        if (current < newCount) {
          current += 1;
          countEl.textContent = String(current);
          setTimeout(step, 100);
        }
      };
      step();
    } else {
      countEl.textContent = String(newCount);
    }

    renderMessage(newCount);
    renderWeekStrip();

    document.body.classList.add('modal-open');
    overlay.style.display = 'flex';

    if (animate && confettiInstance) {
      confettiInstance({ particleCount: 120, spread: 70 });
    }
  }

  function renderMessage(streakCount) {
    const msgEl = document.getElementById(MSG_ID);
    if (!msgEl) return;

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
    const [y, m, d] = String(dateStr).split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
    return Date.UTC(y, m - 1, d);
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
    for (let i = 0; i < 7; i += 1) {
      days.push(new Date(weekStartMs + i * 86400000).toISOString().split('T')[0]);
    }
    return days;
  }

  function buildWeekData() {
    const weekDates = getWeekDatesLocal();
    const todayStr = getLocalDateStr();
    const historySet = new Set(history);

    return weekDates.map(dateStr => {
      let status = 'missed';
      if (dateStr > todayStr) {
        status = 'future';
      } else if (dateStr === todayStr && !historySet.has(dateStr)) {
        status = 'today';
      } else if (historySet.has(dateStr)) {
        status = 'kept';
      }

      return {
        dateStr,
        label: weekdayLabel(dateStr),
        status
      };
    });
  }

  function renderWeekStrip() {
    const weekEl = document.getElementById(WEEK_ID);
    if (!weekEl) return;

    const data = buildWeekData();
    const segWidth = 100 / data.length;
    const todayStr = getLocalDateStr();

    const labels = data.map(item => {
      const isToday = item.dateStr === todayStr;
      const color = isToday ? '#f08c2b' : '#9aa6b2';
      const weight = isToday ? '600' : '500';
      return `
        <div style="flex:1;text-align:center;font-size:0.72rem;color:${color};font-weight:${weight};">
          ${item.label}
        </div>
      `;
    }).join('');

    const segments = data.map((item, idx) => {
      let bg = '#d8dee6';
      let icon = '';
      let iconColor = '#344054';

      if (item.status === 'kept') {
        bg = 'linear-gradient(180deg,#ffd166,#f59f0b)';
        icon = '&#10003;';
        iconColor = '#4a2c00';
      } else if (item.status === 'today') {
        bg = '#ffffff';
      } else if (item.status === 'future') {
        bg = '#f3f5f7';
      }

      const left = idx * segWidth;
      return `
        <div style="position:absolute;left:${left}%;width:${segWidth}%;top:0;bottom:0;background:${bg};">
          ${icon ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:${iconColor};z-index:1;">${icon}</span>` : ''}
        </div>
      `;
    }).join('');

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
    if (!dateStr) return;
    if (!history.includes(dateStr)) {
      history.push(dateStr);
      localStorage.setItem('guestStreakHistory', JSON.stringify(history));
      renderPopup(true, prevLength, history.length);
      prevLength = history.length;
      updateNavStreak(history.length);
    }
  }

  const StreakUI = {
    init: function({ navSelector, firebaseApp }) {
      if (initialized) return;
      initialized = true;

      navEl = document.querySelector(navSelector);
      auth = firebaseApp.auth();
      db = firebaseApp.firestore();

      window.addEventListener('message', evt => {
        if (evt.data?.type === 'streakUpdate' && (!auth.currentUser || auth.currentUser.isAnonymous)) {
          handleGuestStreakUpdate(evt.data.date);
        }
      });

      if (!auth.currentUser || auth.currentUser.isAnonymous) {
        history = JSON.parse(localStorage.getItem('guestStreakHistory') || '[]');
        prevLength = history.length;
        updateNavStreak(history.length);
      }

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

      auth.onAuthStateChanged(user => {
        if (!user || user.isAnonymous) {
          history = JSON.parse(localStorage.getItem('guestStreakHistory') || '[]');
          prevLength = history.length;
          firstSnapshot = true;
          updateNavStreak(history.length);
          return;
        }

        userRef = db.collection('users').doc(user.uid);
        userRef.onSnapshot(doc => {
          const data = doc.data() || {};
          const newHist = data.streakHistory || [];

          if (firstSnapshot) {
            prevLength = newHist.length;
            history = newHist;
            firstSnapshot = false;
          } else if (newHist.length > prevLength) {
            renderPopup(true, prevLength, newHist.length);
            prevLength = newHist.length;
            history = newHist;
          } else {
            prevLength = newHist.length;
            history = newHist;
          }

          updateNavStreak(history.length);
        });
      });
    },

    showPopup: function(oldLength, newLength, options = {}) {
      const prev = Number.isFinite(Number(oldLength))
        ? Number(oldLength)
        : Number(prevLength || 0);
      const next = Number.isFinite(Number(newLength))
        ? Number(newLength)
        : prev;
      if (next < 0) return;

      const today = typeof options?.date === 'string' && options.date
        ? options.date
        : getLocalDateStr();

      if (next === 0) {
        history = [];
      } else if (next === 1) {
        history = [today];
      } else {
        const nextHistory = Array.isArray(history) ? [...history] : [];
        if (!nextHistory.includes(today)) {
          nextHistory.push(today);
        }
        while (nextHistory.length > next) {
          nextHistory.shift();
        }
        history = nextHistory;
      }

      prevLength = next;
      createPopup();
      renderPopup(true, prev, next);
      updateNavStreak(next);
    },

    close: function() {
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) overlay.remove();
      document.body.classList.remove('modal-open');
    }
  };

  return StreakUI;
})();

window.StreakUI = StreakLogicAndUI;
export { StreakLogicAndUI as StreakUI };
