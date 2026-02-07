// services/localStorageSession.js

/**
 * Keys used for storing guest data in localStorage
 */
const POINTS_KEY = 'guestPoints';
const STREAK_KEY = 'guestStreakHistory';
const STREAK_FREEZE_KEY = 'guestStreakFreezes';
const DEFAULT_STREAK_FREEZES = 2;

function getISTDateStr() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 330 * 60000;
  return new Date(istMs).toISOString().split('T')[0];
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
  if (!localStorage.getItem(STREAK_FREEZE_KEY)) {
    localStorage.setItem(STREAK_FREEZE_KEY, String(DEFAULT_STREAK_FREEZES));
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
  const today = getISTDateStr();
  const history = JSON.parse(localStorage.getItem(STREAK_KEY)) || [];
  const oldLength = history.length;
  const freezes = parseInt(localStorage.getItem(STREAK_FREEZE_KEY), 10) || 0;

  if (history[oldLength - 1] === today) {
    return { updated: false, oldLength, newLength: oldLength, today, freezes };
  }

  let newHistory;
  let newFreezes = freezes;
  if (oldLength > 0) {
    const lastDate = history[oldLength - 1];
    const diffDays = diffDaysUTC(today, lastDate);
    if (diffDays === 1) {
      newHistory = [...history, today];
    } else if (diffDays > 1 && freezes > 0) {
      newHistory = [...history, today];
      newFreezes = freezes - 1;
    } else {
      newHistory = [today];
    }
  } else {
    newHistory = [today];
  }

  localStorage.setItem(STREAK_KEY, JSON.stringify(newHistory));
  localStorage.setItem(STREAK_FREEZE_KEY, String(newFreezes));
  return {
    updated: true,
    oldLength,
    newLength: newHistory.length,
    today,
    freezes: newFreezes
  };
}

export function getGuestStreakFreezes() {
  initGuestSession();
  return parseInt(localStorage.getItem(STREAK_FREEZE_KEY), 10) || 0;
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
    'lastReadAyah',
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
    return JSON.parse(localStorage.getItem('lastReadAyah'));
  } catch {
    return null;
  }
}

