// src/services/firestoreService.js

// â€”â€”â€”â€”â€” Firebase Modular Imports â€”â€”â€”â€”â€”
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  runTransaction,
  increment  
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';


// â€”â€”â€”â€”â€” Your Firebase Config â€”â€”â€”â€”â€”
const firebaseConfig = {
  apiKey: "AIzaSyBuOs0LRjbcqvJULZlWkUqYdrfmGIJm88w",
  authDomain: "myquranquest786.firebaseapp.com",
  projectId: "myquranquest786",
  storageBucket: "myquranquest786.appspot.com",
  messagingSenderId: "970275375391",
  appId: "1:970275375391:web:d1cac998783348cb482a",
  measurementId: "G-KL3ZNNX844"
};

// â€”â€”â€”â€”â€” Init Firebase â€”â€”â€”â€”â€”
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const authPersistenceReady = (async () => {
  const strategies = [indexedDBLocalPersistence, browserLocalPersistence];
  for (let i = 0; i < strategies.length; i += 1) {
    const strategy = strategies[i];
    try {
      await setPersistence(auth, strategy);
      return;
    } catch (err) {
      console.warn(`[Auth] Persistence strategy #${i + 1} failed`, err);
    }
  }
  console.warn('[Auth] Falling back to default in-memory auth persistence');
})();
const POPUP_TO_REDIRECT_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment'
]);
let googleRedirectResolved = false;

function isNativeWebViewEnvironment() {
  try {
    return typeof window !== 'undefined' && Boolean(window.ReactNativeWebView);
  } catch {
    return false;
  }
}

const NAMAZ_GOAL_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

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

function compareAyahRef(a, b) {
  if (!a || !b) return 0;
  if (a.surah !== b.surah) return a.surah - b.surah;
  return a.ayah - b.ayah;
}

function mergeProgressMap(current = {}, incoming = {}) {
  const merged = { ...current };
  Object.entries(incoming).forEach(([key, value]) => {
    const next = Number(value) || 0;
    const prev = Number(merged[key]) || 0;
    if (next > prev) {
      merged[key] = next;
    }
  });
  return merged;
}

const SAVE_HISTORY_LIMIT = 240;
const SAVE_HISTORY_MODES = new Set(['learn', 'memorization', 'recite']);

function isValidAyahRef(ref) {
  const surah = Number(ref?.surah);
  const ayah = Number(ref?.ayah);
  return Number.isInteger(surah) && surah > 0 && Number.isInteger(ayah) && ayah > 0;
}

function normalizeAyahRef(ref, fallback = { surah: 1, ayah: 1 }) {
  if (!isValidAyahRef(ref)) return { ...fallback };
  return {
    surah: Number(ref.surah),
    ayah: Number(ref.ayah)
  };
}

function compareAyahKey(a, b) {
  const [sa, aa] = String(a || '').split(':').map(Number);
  const [sb, ab] = String(b || '').split(':').map(Number);
  if (sa !== sb) return sa - sb;
  return aa - ab;
}

function normalizeMemorizedKeys(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const deduped = new Set();
  source.forEach(value => {
    const [surah, ayah] = String(value || '').split(':').map(Number);
    if (!isValidAyahRef({ surah, ayah })) return;
    deduped.add(`${surah}:${ayah}`);
  });
  return Array.from(deduped).sort(compareAyahKey);
}

function normalizeAyahMistakeStats(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    const [surah, ayah] = String(key || '').split(':').map(Number);
    if (!isValidAyahRef({ surah, ayah })) return;
    const countSource = typeof value === 'number' ? value : value?.count;
    const count = Math.max(0, Math.round(Number(countSource) || 0));
    if (!count) return;
    normalized[`${surah}:${ayah}`] = {
      count,
      lastMistakeAt: Math.max(0, Number(value?.lastMistakeAt) || 0)
    };
  });
  return normalized;
}

function mergeAyahMistakeStats(current = {}, incoming = {}) {
  const merged = normalizeAyahMistakeStats(current);
  Object.entries(normalizeAyahMistakeStats(incoming)).forEach(([key, value]) => {
    const existing = merged[key] || { count: 0, lastMistakeAt: 0 };
    merged[key] = {
      count: Math.max(Number(existing.count) || 0, Number(value?.count) || 0),
      lastMistakeAt: Math.max(
        Number(existing.lastMistakeAt) || 0,
        Number(value?.lastMistakeAt) || 0
      )
    };
  });
  return merged;
}

function sanitizeSaveHistoryEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = String(raw.mode || '').toLowerCase();
  if (!SAVE_HISTORY_MODES.has(mode)) return null;
  const surah = Number(raw.surah);
  const ayah = Number(raw.ayah);
  if (!isValidAyahRef({ surah, ayah })) return null;
  const timestamp = Number(raw.timestamp || raw.savedAt || Date.now());
  const source = typeof raw.source === 'string' ? raw.source : mode;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${mode}:${surah}:${ayah}:${timestamp}`,
    mode,
    surah,
    ayah,
    source,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
  };
}

function mergeSaveHistoryEntries(primary = [], secondary = []) {
  const byKey = new Map();
  [...primary, ...secondary].forEach(item => {
    const entry = sanitizeSaveHistoryEntry(item);
    if (!entry) return;
    const key = `${entry.mode}:${entry.surah}:${entry.ayah}`;
    const prev = byKey.get(key);
    if (!prev || entry.timestamp >= prev.timestamp) {
      byKey.set(key, entry);
    }
  });
  return Array.from(byKey.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, SAVE_HISTORY_LIMIT);
}

function mergeMemorizationPayload(current = {}, incoming = {}) {
  const merged = {
    ...(current && typeof current === 'object' ? current : {})
  };

  if (incoming?.unlocked) {
    const currentUnlocked = normalizeAyahRef(merged.unlocked, { surah: 1, ayah: 1 });
    const incomingUnlocked = normalizeAyahRef(incoming.unlocked, currentUnlocked);
    merged.unlocked =
      compareAyahRef(incomingUnlocked, currentUnlocked) > 0
        ? incomingUnlocked
        : currentUnlocked;
  } else if (merged.unlocked) {
    merged.unlocked = normalizeAyahRef(merged.unlocked, { surah: 1, ayah: 1 });
  }

  merged.listens = mergeProgressMap(merged.listens || {}, incoming?.listens || {});

  if (incoming?.lastProgress) {
    const currentProgressTs = Number(merged?.lastProgress?.timestamp) || 0;
    const incomingProgressTs = Number(incoming?.lastProgress?.timestamp) || 0;
    if (!merged.lastProgress || incomingProgressTs >= currentProgressTs) {
      merged.lastProgress = incoming.lastProgress;
    }
  }

  if (incoming?.lastMemorized) {
    const currentLastMemorizedTs = Number(merged?.lastMemorized?.timestamp) || 0;
    const incomingLastMemorizedTs = Number(incoming?.lastMemorized?.timestamp) || 0;
    if (!merged.lastMemorized || incomingLastMemorizedTs >= currentLastMemorizedTs) {
      merged.lastMemorized = incoming.lastMemorized;
    }
  }

  const memorizedKeys = normalizeMemorizedKeys([
    ...normalizeMemorizedKeys(merged.memorizedKeys),
    ...normalizeMemorizedKeys(incoming?.memorizedKeys)
  ]);
  if (memorizedKeys.length) {
    merged.memorizedKeys = memorizedKeys;
  }

  const ayahMistakes = mergeAyahMistakeStats(merged.ayahMistakes, incoming?.ayahMistakes);
  if (Object.keys(ayahMistakes).length) {
    merged.ayahMistakes = ayahMistakes;
  }

  return merged;
}

function normalizeNamazStatus(value) {
  if (value === true || value === 'yes') return true;
  if (value === false || value === 'no') return false;
  return null;
}

function normalizeNamazHistory(rawHistory) {
  const normalized = {};
  if (!rawHistory || typeof rawHistory !== 'object') return normalized;
  Object.entries(rawHistory).forEach(([dateKey, value]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return;
    const completed = Math.max(0, Math.min(5, Number(value) || 0));
    normalized[dateKey] = completed;
  });
  return normalized;
}

function countCompletedNamazPrayers(prayers = {}) {
  return NAMAZ_GOAL_KEYS.reduce((count, key) => (
    prayers[key] === true ? count + 1 : count
  ), 0);
}

function mergeNamazHistory(currentHistory = {}, incomingHistory = {}) {
  const merged = { ...normalizeNamazHistory(currentHistory) };
  Object.entries(normalizeNamazHistory(incomingHistory)).forEach(([dateKey, count]) => {
    const prev = Number(merged[dateKey]) || 0;
    merged[dateKey] = Math.max(prev, count);
  });
  return merged;
}

function normalizeNamazGoalsWidget(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const prayers = {};
  NAMAZ_GOAL_KEYS.forEach(key => {
    prayers[key] = normalizeNamazStatus(raw?.prayers?.[key]);
  });
  const history = normalizeNamazHistory(raw?.history);
  if (!Object.prototype.hasOwnProperty.call(history, date)) {
    history[date] = countCompletedNamazPrayers(prayers);
  }

  return {
    date,
    prayers,
    history,
    updatedAt: Number(raw.updatedAt) || 0
  };
}

// â€”â€”â€”â€”â€” Ensure Anonymous Guest User â€”â€”â€”â€”â€”
export async function ensureGuestUser() {
  const user = auth.currentUser;
  if (!user) {
    try {
      await signInAnonymously(auth);
      console.log('âœ… Signed in anonymously as guest');
      // set default display name in Firestore
      const ref = doc(db, 'users', auth.currentUser.uid);
      await setDoc(ref, { name: 'Guest', lastLogin: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error('âŒ Failed to sign in anonymously:', err);
      // fallback to session-only mode
      localStorage.setItem('hasSessionGuest','1');
    }
  } else if (user.isAnonymous) {
    // ensure name is set for returning anonymous users
    const ref = doc(db, 'users', user.uid);
    await setDoc(ref, { name: 'Guest' }, { merge: true });
  } else {
    // real user signed in â€” clear guest flags
    localStorage.removeItem('hasContinuedAsGuest');
    localStorage.removeItem('hasSessionGuest');
  }
}


export async function transferGuestStats(pendingPoints) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) return;
  try {
    // save the guest points under this user
    const ref = doc(db, 'users', auth.currentUser.uid);
    await setDoc(ref, {
      ajrPoints: increment(pendingPoints),
      lastLogin: serverTimestamp()
    }, { merge: true });
    // record streak if needed
    const { updated, oldLength, newLength } = await recordStreak();
    return { updated, oldLength, newLength };
  } catch (err) {
    console.error('âŒ Failed to transfer guest stats:', err);
  }
}


// â€”â€”â€”â€”â€” Auth Helpers â€”â€”â€”â€”â€”
/**
 * Sign in via Google popup
 */
export async function signInWithGoogle() {
  await authPersistenceReady;
  if (isNativeWebViewEnvironment()) {
    const nativeWebViewError = new Error(
      'Google OAuth is blocked inside embedded WebView. Open secure browser login instead.'
    );
    nativeWebViewError.code = 'auth/webview-google-signin-disallowed';
    throw nativeWebViewError;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    const code = String(err?.code || '');
    if (POPUP_TO_REDIRECT_CODES.has(code)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function signInWithGoogleTokens({ idToken, accessToken } = {}) {
  await authPersistenceReady;
  const normalizedIdToken = typeof idToken === 'string' ? idToken.trim() : '';
  const normalizedAccessToken =
    typeof accessToken === 'string' ? accessToken.trim() : '';

  if (!normalizedIdToken && !normalizedAccessToken) {
    throw new Error('Missing Google auth tokens');
  }

  const credential = GoogleAuthProvider.credential(
    normalizedIdToken || null,
    normalizedAccessToken || null
  );
  return signInWithCredential(auth, credential);
}

export async function resolveGoogleRedirectResult() {
  await authPersistenceReady;
  if (googleRedirectResolved) return null;
  googleRedirectResolved = true;
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    console.warn('[Auth] Redirect result handling failed', err);
    return null;
  }
}

/**
 * Sign out current user
 */
export async function logout() {
  await signOut(auth);
  // â€”â€”â€” Purge guest stats so they donâ€™t linger â€”â€”â€”
  localStorage.removeItem('guestPoints');
  localStorage.removeItem('guestStreakHistory');
  localStorage.removeItem('hasSessionGuest');
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback) {
  let unsub = () => {};
  let active = true;
  authPersistenceReady.finally(() => {
    if (!active) return;
    unsub = onAuthStateChanged(auth, callback);
  });
  return () => {
    active = false;
    unsub();
  };
}

// â€”â€”â€”â€”â€” Profile Persistence â€”â€”â€”â€”â€”
export function persistProfile(name, email) {
  const ref = doc(db, 'users', auth.currentUser.uid);
  return setDoc(ref, {
    name,
    email,
    lastLogin: serverTimestamp()
  }, { merge: true });
}

export async function updateUserDisplayName(name) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('No signed-in user for profile update');
  }

  const nextName = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!nextName) {
    throw new Error('Display name cannot be empty');
  }

  await updateProfile(user, { displayName: nextName });
  const ref = doc(db, 'users', user.uid);
  await setDoc(ref, {
    name: nextName,
    lastLogin: serverTimestamp()
  }, { merge: true });
  return nextName;
}

export function getUserDoc(user = auth.currentUser) {
  if (!user?.uid) {
    throw new Error('No authenticated user');
  }
  const ref = doc(db, 'users', user.uid);
  return getDoc(ref);
}

// â€”â€”â€”â€”â€” Stats Persistence â€”â€”â€”â€”â€”
export async function loadStatsFromFirestore() {
  const snap = await getUserDoc();
  if (!snap.exists()) return { score: 0 };
  return { score: snap.data().ajrPoints || 0 };
}

export async function addCompletedAyahToFirestore(ayahObj) {
  if (!auth.currentUser) {
    throw new Error('Must be signed in to record completed ayah in Firestore');
  }
  const userRef = doc(getFirestore(), 'users', auth.currentUser.uid);
  await setDoc(userRef, {
    completedAyahs: arrayUnion(ayahObj)
  }, { merge: true });
}

export async function saveStatsToFirestore(stats) {
  const ref = doc(db, 'users', auth.currentUser.uid);

  // Build up only the fields you actually passed in
  const payload = { ajrPoints: stats.score };

  if (Array.isArray(stats.streakHistory)) {
    payload.streakHistory = stats.streakHistory;
  }

  await setDoc(ref, payload, { merge: true });
}

export async function updateCompletedSurahsProgress(surah, ayah) {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const progressMap = data.completedSurahs_new || {};
    const current = Number(progressMap[surah]) || 0;
    if (ayah > current) {
      progressMap[surah] = ayah;
      tx.set(userRef, { completedSurahs_new: progressMap }, { merge: true });
    }
  });
}

export async function saveMemorizationData(memoData) {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const mergedMemo = mergeMemorizationPayload(data.memorization || {}, memoData || {});
    tx.set(userRef, {
      memorization: mergedMemo,
      lastLogin: serverTimestamp()
    }, { merge: true });
  });
}

export async function getMemorizationData() {
  if (!auth.currentUser) return null;
  const snap = await getUserDoc();
  if (!snap.exists()) return null;
  const memo = snap.data()?.memorization;
  if (!memo || typeof memo !== 'object') return null;
  return mergeMemorizationPayload({}, memo);
}

export async function saveSavedAyahHistory(entries) {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const mergedHistory = mergeSaveHistoryEntries(data.savedAyahHistory || [], entries || []);
    tx.set(userRef, {
      savedAyahHistory: mergedHistory,
      lastLogin: serverTimestamp()
    }, { merge: true });
  });
}

export async function getSavedAyahHistory() {
  if (!auth.currentUser) return [];
  const snap = await getUserDoc();
  if (!snap.exists()) return [];
  return mergeSaveHistoryEntries(snap.data()?.savedAyahHistory || [], []);
}

export async function saveNamazGoalsWidget(widgetData) {
  if (!auth.currentUser) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  await setDoc(userRef, {
    namazGoalsWidget: widgetData,
    lastLogin: serverTimestamp()
  }, { merge: true });
}

export async function getNamazGoalsWidget() {
  if (!auth.currentUser) return null;
  const snap = await getUserDoc();
  if (!snap.exists()) return null;
  return snap.data()?.namazGoalsWidget || null;
}

export async function mergeGuestData(payload) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) return;
  const userRef = doc(db, 'users', auth.currentUser.uid);

  await runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const updates = {};

    const guestPoints = Number(payload?.points) || 0;
    if (guestPoints) {
      updates.ajrPoints = (Number(data.ajrPoints) || 0) + guestPoints;
    }

    const guestStreak = Array.isArray(payload?.streakHistory)
      ? payload.streakHistory
      : [];
    if (guestStreak.length) {
      const mergedStreak = Array.from(new Set([...(data.streakHistory || []), ...guestStreak]));
      mergedStreak.sort();
      updates.streakHistory = mergedStreak;
    }

    if (payload?.completedSurahs) {
      updates.completedSurahs_new = mergeProgressMap(
        data.completedSurahs_new || {},
        payload.completedSurahs
      );
    }

    if (payload?.lastRead?.surah && payload?.lastRead?.ayah) {
      const incoming = {
        surah: Number(payload.lastRead.surah) || 0,
        ayah: Number(payload.lastRead.ayah) || 0
      };
      const current = {
        surah: Number(data.lastSurah) || 0,
        ayah: Number(data.lastAyah) || 0
      };
      const incomingSavedAt = Date.parse(payload?.lastRead?.savedAt || '');
      const currentSavedAt = typeof data.lastReadAt?.toMillis === 'function'
        ? data.lastReadAt.toMillis()
        : 0;

      const shouldReplace =
        !current.surah ||
        !current.ayah ||
        (Number.isFinite(incomingSavedAt) && incomingSavedAt > currentSavedAt) ||
        compareAyahRef(incoming, current) > 0;

      if (shouldReplace) {
        updates.lastSurah = incoming.surah;
        updates.lastAyah = incoming.ayah;
        updates.lastReadAt = serverTimestamp();
      }
    }

    if (payload?.reciteProgress?.surah && payload?.reciteProgress?.ayah) {
      const incoming = {
        surah: Number(payload.reciteProgress.surah) || 0,
        ayah: Number(payload.reciteProgress.ayah) || 0
      };
      const current = {
        surah: Number(data.lastReciteSurah) || 0,
        ayah: Number(data.lastReciteAyah) || 0
      };
      const incomingSavedAt = Number(payload?.reciteProgress?.timestamp) || 0;
      const currentSavedAt = typeof data.lastReciteAt?.toMillis === 'function'
        ? data.lastReciteAt.toMillis()
        : 0;

      const shouldReplace =
        !current.surah ||
        !current.ayah ||
        (incomingSavedAt > currentSavedAt) ||
        compareAyahRef(incoming, current) > 0;

      if (shouldReplace) {
        updates.lastReciteSurah = incoming.surah;
        updates.lastReciteAyah = incoming.ayah;
        updates.lastReciteAt = serverTimestamp();
      }
    }

    if (payload?.memorization) {
      updates.memorization = mergeMemorizationPayload(
        data.memorization || {},
        payload.memorization
      );
    }

    if (payload?.savedAyahHistory) {
      updates.savedAyahHistory = mergeSaveHistoryEntries(
        data.savedAyahHistory || [],
        payload.savedAyahHistory
      );
    }

    if (payload?.namazGoalsWidget) {
      const incomingWidget = normalizeNamazGoalsWidget(payload.namazGoalsWidget);
      const currentWidget = normalizeNamazGoalsWidget(data.namazGoalsWidget);

      if (incomingWidget && !currentWidget) {
        updates.namazGoalsWidget = incomingWidget;
      } else if (incomingWidget && currentWidget) {
        const mergedHistory = mergeNamazHistory(
          currentWidget.history,
          incomingWidget.history
        );
        mergedHistory[currentWidget.date] = Math.max(
          Number(mergedHistory[currentWidget.date]) || 0,
          countCompletedNamazPrayers(currentWidget.prayers)
        );
        mergedHistory[incomingWidget.date] = Math.max(
          Number(mergedHistory[incomingWidget.date]) || 0,
          countCompletedNamazPrayers(incomingWidget.prayers)
        );

        if (incomingWidget.date > currentWidget.date) {
          updates.namazGoalsWidget = {
            ...incomingWidget,
            history: mergedHistory
          };
        } else if (incomingWidget.date === currentWidget.date) {
          const mergedPrayers = { ...currentWidget.prayers };
          NAMAZ_GOAL_KEYS.forEach(key => {
            const next = incomingWidget.prayers[key];
            if (next === true || next === false) {
              mergedPrayers[key] = next;
            }
          });

          updates.namazGoalsWidget = {
            date: currentWidget.date,
            prayers: mergedPrayers,
            history: mergedHistory,
            updatedAt: Math.max(
              Number(currentWidget.updatedAt) || 0,
              Number(incomingWidget.updatedAt) || 0
            )
          };
        } else {
          updates.namazGoalsWidget = {
            ...currentWidget,
            history: mergedHistory,
            updatedAt: Math.max(
              Number(currentWidget.updatedAt) || 0,
              Number(incomingWidget.updatedAt) || 0
            )
          };
        }
      }
    }

    updates.lastLogin = serverTimestamp();
    tx.set(userRef, updates, { merge: true });
  });
}

export async function addPointsToFirestore(pointsDelta) {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  const userRef = doc(db, 'users', user.uid);
  await setDoc(userRef, {
    ajrPoints: increment(pointsDelta),
    lastLogin: serverTimestamp()
  }, { merge: true });
}

export async function recordStreak() {
  const userRef = doc(db, 'users', auth.currentUser.uid);
  const todayStr = getLocalDateStr();

  return runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const hist = Array.isArray(data.streakHistory) ? data.streakHistory : [];
    const oldLength = hist.length;

    if (hist.includes(todayStr)) {
      return { updated: false, oldLength, newLength: oldLength };
    }

    const lastDate = oldLength > 0 ? [...hist].sort().pop() : null;
    const shouldAppend = lastDate ? diffDaysUTC(todayStr, lastDate) === 1 : false;

    if (shouldAppend) {
      tx.set(userRef, {
        streakHistory: arrayUnion(todayStr)
      }, { merge: true });
      return { updated: true, oldLength, newLength: oldLength + 1 };
    }

    tx.set(userRef, {
      streakHistory: [todayStr]
    }, { merge: true });
    return { updated: true, oldLength, newLength: 1 };
  });
}

export async function resetStreakIfBroken() {
  const userRef  = doc(db, 'users', auth.currentUser.uid);
  const todayStr = getLocalDateStr();

  // 1) Read once outside the transaction
  const snap0     = await getDoc(userRef);
  const data0     = snap0.exists() ? snap0.data() : {};
  const history0  = data0.streakHistory || [];
  const oldLength = history0.length;

  // 2) If there's no streak or it's still current (0 or last entry is yesterday/today), bail
  if (oldLength === 0) {
    return { reset: false };
  }
  history0.sort();
  const lastDateStr = history0[history0.length - 1];
  const diffDays    = diffDaysUTC(todayStr, lastDateStr);

  // If the last-streak date is yesterday (diffDays === 1) or today (0), it's unbroken
  if (diffDays <= 1) {
    return { reset: false };
  }

  // 3) Otherwise we need to resetâ€”run a transaction with at least one write
  return runTransaction(db, async tx => {
    // re-read inside transaction
    const snap = await tx.get(userRef);
    const hist = snap.exists() ? snap.data().streakHistory || [] : [];

    // clear it out
    tx.set(userRef, { streakHistory: [] }, { merge: true });
    return { reset: true, oldLength };
  });
}

// â€”â€”â€”â€”â€” Expose auth & db if needed elsewhere â€”â€”â€”â€”â€”
export { auth, db };



// â”€â”€ Initialize FCM â”€â”€
const messaging = getMessaging(app);
const FCM_RETRY_AFTER_KEY = 'qq_fcm_retry_after_v1';
const FCM_RETRY_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Requests notification permission, fetches an FCM token,
 * and appends it to the current user's fcmTokens array in Firestore.
 */
export async function registerForNotifications() {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }
    const retryAfter = Number(localStorage.getItem(FCM_RETRY_AFTER_KEY)) || 0;
    if (Date.now() < retryAfter) {
      throw new Error('Notifications are temporarily rate-limited. Please try again shortly.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }
    const swReg = await navigator.serviceWorker.register('/_private/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: 'BE9W8HfVFsVQaBaU_WV2CWkgSJJJNKmve8NhXx1f0araDhnbEAxk9MlxYsCB2mjMpCdqeB2-PnwLy3uQ9g8JBik',
      swRegistration: swReg
    });
    if (!token) {
      throw new Error('FCM token unavailable');
    }

    // Persist to Firestore under users/{uid}.fcmTokens
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await setDoc(userRef, {
      fcmTokens: arrayUnion(token)
    }, { merge: true });

    localStorage.removeItem(FCM_RETRY_AFTER_KEY);
    return token;
  } catch (err) {
    const details = String(err?.message || err || '');
    if (details.includes('429') || details.toLowerCase().includes('too many requests')) {
      localStorage.setItem(FCM_RETRY_AFTER_KEY, String(Date.now() + FCM_RETRY_COOLDOWN_MS));
    }
    console.error('registerForNotifications failed:', err);
    throw err;
  }
}

/**
 * Listens for FCM messages when the page is in the foreground
 * and invokes your callback with the full payload.
 *
 * @param {(payload:import('firebase/messaging').MessagePayload)=>void} callback
 */
export function onForegroundMessage(callback) {
  if (typeof callback !== 'function') return () => {};
  return onMessage(messaging, payload => {
    console.log('FCM foreground message:', payload);
    callback(payload);
  });
}

/**
 * Persist the userâ€™s lastâ€read location to Firestore
 * @param {number} surah â€“ the Surah number
 * @param {number} ayah  â€“ the Ayah number
 */
export async function updateLastRead(surah, ayah) {
  if (!auth.currentUser) {
    console.warn('No user signed in; cannot update lastRead in Firestore');
    return;
  }
  try {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await setDoc(userRef, {
      lastSurah: surah,
      lastAyah: ayah,
      lastReadAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Failed to update lastRead:', err);
  }
}

export async function updateLastRecite(surah, ayah) {
  if (!auth.currentUser) {
    console.warn('No user signed in; cannot update recite progress in Firestore');
    return;
  }
  try {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await setDoc(userRef, {
      lastReciteSurah: Number(surah) || 0,
      lastReciteAyah: Number(ayah) || 0,
      lastReciteAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Failed to update recite progress:', err);
  }
}


/**
 * Fetch last-read Surah/Ayah from Firestore (for logged-in users)
 * @returns {Promise<{surah:number, ayah:number}|null>}
 */
export async function getLastReadFromDb(user = auth.currentUser) {
  if (!user || user.isAnonymous) return null;
  const snap = await getUserDoc(user);
  if (!snap.exists()) return null;
  const { lastSurah, lastAyah } = snap.data();
  return (lastSurah && lastAyah)
    ? { surah: lastSurah, ayah: lastAyah }
    : null;
}

export async function getLastReciteFromDb(user = auth.currentUser) {
  if (!user || user.isAnonymous) return null;
  const snap = await getUserDoc(user);
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  const surah = Number(data.lastReciteSurah) || 0;
  const ayah = Number(data.lastReciteAyah) || 0;
  if (!surah || !ayah) return null;
  const savedAtMs = typeof data.lastReciteAt?.toMillis === 'function'
    ? data.lastReciteAt.toMillis()
    : 0;
  return {
    surah,
    ayah,
    timestamp: savedAtMs
  };
}


