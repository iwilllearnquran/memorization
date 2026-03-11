const STORAGE_KEY = 'localStreak';

export function isFirstCorrectToday() {
  const today = new Date().toISOString().split('T')[0];
  const streak = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  return !streak.includes(today);
}

const MAX_STREAK_ENTRIES = 365;

export function logToday() {
  const today = new Date().toISOString().split('T')[0];
  let streak = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!streak.includes(today)) {
    streak.push(today);
    if (streak.length > MAX_STREAK_ENTRIES) {
      streak = streak.slice(-MAX_STREAK_ENTRIES);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streak));
  }
}


