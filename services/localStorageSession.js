// services/localStorageSession.js

/**
 * Keys used for storing guest data in localStorage
 */
const POINTS_KEY = 'guestPoints';
const STREAK_KEY = 'guestStreakHistory';

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
  const current = parseInt(localStorage.getItem(POINTS_KEY), 10) || 0;
  const updated = current + pointsDelta;
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
  const today = new Date().toISOString().split('T')[0];
  const history = JSON.parse(localStorage.getItem(STREAK_KEY)) || [];
  const oldLength = history.length;

  if (history[oldLength - 1] === today) {
    return { updated: false, oldLength, newLength: oldLength };
  }

  let newHistory;
  if (oldLength > 0) {
    const lastDate = history[oldLength - 1];
    const diffDays = Math.round((new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      newHistory = [...history, today];
    } else {
      newHistory = [today];
    }
  } else {
    newHistory = [today];
  }

  localStorage.setItem(STREAK_KEY, JSON.stringify(newHistory));
  return { updated: true, oldLength, newLength: newHistory.length };
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
    JSON.stringify({ surah, ayah, at: Date.now() })
  );
}

/**
 * Retrieve last-read Surah/Ayah for guests
 * @returns {{surah:number, ayah:number}|null}
 */
export function getGuestLastRead() {
  const json = localStorage.getItem(LAST_READ_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    localStorage.removeItem(LAST_READ_KEY);
    return null;
  }
}
