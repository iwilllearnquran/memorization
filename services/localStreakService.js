const STORAGE_KEY = 'localStreak';

export function isFirstCorrectToday() {
  const today = new Date().toISOString().split('T')[0];
  const streak = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  return !streak.includes(today);
}

export function logToday() {
  const today = new Date().toISOString().split('T')[0];
  const streak = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!streak.includes(today)) {
    streak.push(today);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streak));
  }
}
