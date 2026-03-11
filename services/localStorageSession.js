// services/localStorageSession.js

/**
 * Keys used for storing guest data in localStorage
 */
const POINTS_KEY = 'guestPoints';
const STREAK_KEY = 'guestStreakHistory';

function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDaysUTC(aStr, bStr) {
  const [ay, am, ad] = aStr.split('-').map(Number);
  const [by, bm, bd] = bStr.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((a - b) / 86400000);
}

/**
 * Ensure the guest session storage is initialized.
 * - Sets points to 0 if unset
 * - Sets streak history to [] if unset
 */
export function initGuestSession() {
  if (!localStorage.getItem(POINTS_KEY)) {
    localStorage.setItem(POINTS_KEY, '0');
  }
  if (!localStorage.getItem(STREAK_KEY)) {
    localStorage.setItem(STREAK_KEY, JSON.stringify([]));
  }
}

/**
 * Increment the guest's stored points by the given delta.
 * @param {number} pointsDelta - points to add
 * @returns {number} updated points total
 */
export function addGuestPoints(pointsDelta) {
  initGuestSession();
  const delta = Number(pointsDelta) || 0;
  const current = parseInt(localStorage.getItem(POINTS_KEY), 10) || 0;
  const updated = current + delta;
  localStorage.setItem(POINTS_KEY, String(updated));
  return updated;
}

/**
 * Record today's date in the guest's streak history.
 * - If the last recorded date is yesterday, append today.
 * - Otherwise, reset history to only today.
 * If today's date is already recorded, do nothing.
 * @returns {{ updated: boolean, oldLength: number, newLength: number }}
 */
export function recordGuestStreak() {
  initGuestSession();
  const today = getLocalDateStr();
  const history = JSON.parse(localStorage.getItem(STREAK_KEY)) || [];
  const oldLength = history.length;

  if (history[oldLength - 1] === today) {
    return { updated: false, oldLength, newLength: oldLength, today };
  }

  let newHistory;
  if (oldLength > 0) {
    const lastDate = history[oldLength - 1];
    const diffDays = diffDaysUTC(today, lastDate);
    if (diffDays === 1) {
      newHistory = [...history, today];
    } else {
      newHistory = [today];
    }
  } else {
    newHistory = [today];
  }

  localStorage.setItem(STREAK_KEY, JSON.stringify(newHistory));
  return {
    updated: true,
    oldLength,
    newLength: newHistory.length,
    today
  };
}

/**
 * Retrieve the current guest points and streak length.
 * @returns {{ points: number, streakLength: number, streakHistory: string[] }}
 */
export function getGuestStats() {
  initGuestSession();
  const points = parseInt(localStorage.getItem(POINTS_KEY), 10) || 0;
  const history = JSON.parse(localStorage.getItem(STREAK_KEY)) || [];
  return { points, streakLength: history.length, streakHistory: history };
}

const LAST_READ_KEY = 'quranQuestLastRead';

/**
 * Save last-read Surah/Ayah for guests
 * @param {number} surah 
 * @param {number} ayah 
 */
export function setGuestLastRead(surah, ayah) {
  localStorage.setItem(
    LAST_READ_KEY,
    JSON.stringify({
      surah,
      ayah,
      savedAt: new Date().toISOString()
    })
  );
}


/**
 * Retrieve last-read Surah/Ayah for guests
 * @returns {{surah:number, ayah:number}|null}
 */
export function getGuestLastRead() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_READ_KEY));
    const surah = Number(parsed?.surah);
    const ayah = Number(parsed?.ayah);
    if (!Number.isFinite(surah) || !Number.isFinite(ayah) || surah <= 0 || ayah <= 0) {
      return null;
    }
    return {
      surah,
      ayah,
      savedAt: parsed?.savedAt || null
    };
  } catch {
    return null;
  }
}

