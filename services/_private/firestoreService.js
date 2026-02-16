// src/services/firestoreService.js

// ————— Firebase Modular Imports —————
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
  signInAnonymously        
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  runTransaction,
  increment  
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';


// ————— Your Firebase Config —————
const firebaseConfig = {
  apiKey: "AIzaSyBuOs0LRjbcqvJULZlWkUqYdrfmGIJm88w",
  authDomain: "myquranquest786.firebaseapp.com",
  projectId: "myquranquest786",
  storageBucket: "myquranquest786.appspot.com",
  messagingSenderId: "970275375391",
  appId: "1:970275375391:web:d1cac998783348cb482a",
  measurementId: "G-KL3ZNNX844"
};

// ————— Init Firebase —————
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
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

const DEFAULT_STREAK_FREEZES = 2;
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

// ————— Ensure Anonymous Guest User —————
export async function ensureGuestUser() {
  const user = auth.currentUser;
  if (!user) {
    try {
      await signInAnonymously(auth);
      console.log('✅ Signed in anonymously as guest');
      // set default display name in Firestore
      const ref = doc(db, 'users', auth.currentUser.uid);
      await setDoc(ref, { name: 'Guest', lastLogin: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error('❌ Failed to sign in anonymously:', err);
      // fallback to session-only mode
      localStorage.setItem('hasSessionGuest','1');
    }
  } else if (user.isAnonymous) {
    // ensure name is set for returning anonymous users
    const ref = doc(db, 'users', user.uid);
    await setDoc(ref, { name: 'Guest' }, { merge: true });
  } else {
    // real user signed in — clear guest flags
    localStorage.removeItem('hasContinuedAsGuest');
    localStorage.removeItem('hasSessionGuest');
  }
}


export async function transferGuestStats(pendingPoints) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) return;
  try {
    // save the guest points under this user
    const ref = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(ref, {
      ajrPoints: increment(pendingPoints),
      lastLogin: serverTimestamp()
    });
    // record streak if needed
    const { updated, oldLength, newLength } = await recordStreak();
    return { updated, oldLength, newLength };
  } catch (err) {
    console.error('❌ Failed to transfer guest stats:', err);
  }
}


// ————— Auth Helpers —————
/**
 * Sign in via Google popup
 */
export async function signInWithGoogle() {
  if (isNativeWebViewEnvironment()) {
    const nativeWebViewError = new Error(
      'Google OAuth is blocked inside embedded WebView. Open secure browser login instead.'
    );
    nativeWebViewError.code = 'auth/webview-google-signin-disallowed';
    throw nativeWebViewError;
  }

  const provider = new GoogleAuthProvider();

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
  // ——— Purge guest stats so they don’t linger ———
  localStorage.removeItem('guestPoints');
  localStorage.removeItem('guestStreakHistory');
  localStorage.removeItem('hasSessionGuest');
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ————— Profile Persistence —————
export function persistProfile(name, email) {
  const ref = doc(db, 'users', auth.currentUser.uid);
  return setDoc(ref, {
    name,
    email,
    lastLogin: serverTimestamp()
  }, { merge: true });
}

export function getUserDoc(user = auth.currentUser) {
  if (!user?.uid) {
    throw new Error('No authenticated user');
  }
  const ref = doc(db, 'users', user.uid);
  return getDoc(ref);
}

// ————— Stats Persistence —————
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
  await updateDoc(userRef, {
    completedAyahs: arrayUnion(ayahObj)
  });
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
  await setDoc(userRef, { memorization: memoData }, { merge: true });
}

export async function getMemorizationData() {
  if (!auth.currentUser) return null;
  const snap = await getUserDoc();
  if (!snap.exists()) return null;
  return snap.data()?.memorization || null;
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
      const existingFreezes = Number.isFinite(data.streakFreezes)
        ? data.streakFreezes
        : DEFAULT_STREAK_FREEZES;
      const guestFreezes = Number.isFinite(payload?.streakFreezes)
        ? payload.streakFreezes
        : existingFreezes;
      updates.streakFreezes = Math.min(existingFreezes, guestFreezes);
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
      const memo = data.memorization || {};
      const mergedMemo = { ...memo };
      if (payload.memorization.unlocked) {
        const incoming = payload.memorization.unlocked;
        const current = memo.unlocked || { surah: 1, ayah: 1 };
        mergedMemo.unlocked =
          compareAyahRef(incoming, current) > 0 ? incoming : current;
      }

      if (payload.memorization.listens) {
        const currentListens = memo.listens || {};
        mergedMemo.listens = mergeProgressMap(currentListens, payload.memorization.listens);
      }

      if (payload.memorization.lastProgress) {
        const incoming = payload.memorization.lastProgress;
        const current = memo.lastProgress;
        if (!current || (incoming?.timestamp || 0) > (current?.timestamp || 0)) {
          mergedMemo.lastProgress = incoming;
        }
      }

      updates.memorization = mergedMemo;
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
  const userRef  = doc(db, 'users', auth.currentUser.uid);
  const todayStr = getLocalDateStr();
  const snap0     = await getDoc(userRef);
  const data0     = snap0.exists() ? snap0.data() : {};
  const history0  = data0.streakHistory || [];
  const freezes0  = Number.isFinite(data0.streakFreezes) ? data0.streakFreezes : DEFAULT_STREAK_FREEZES;
  const oldLength = history0.length;
  if (history0.includes(todayStr)) {
    return { updated: false, oldLength, newLength: oldLength, freezes: freezes0 };
  }
  return runTransaction(db, async tx => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const hist = data.streakHistory || [];
    const freezes = Number.isFinite(data.streakFreezes)
      ? data.streakFreezes
      : freezes0;

    if (hist.includes(todayStr)) {
      return { updated: false, oldLength, newLength: hist.length, freezes };
    }

    let shouldAppend = false;
    let shouldReset = false;
    let nextFreezes = freezes;

    if (hist.length > 0) {
      const lastDate = [...hist].sort().pop();
      const diffDays = diffDaysUTC(todayStr, lastDate);
      if (diffDays === 1) {
        shouldAppend = true;
      } else if (diffDays > 1 && freezes > 0) {
        shouldAppend = true;
        nextFreezes = freezes - 1;
      } else {
        shouldReset = true;
      }
    } else {
      shouldReset = true;
    }

    if (shouldAppend) {
      tx.update(userRef, {
        streakHistory: arrayUnion(todayStr),
        streakFreezes: nextFreezes
      });
      return { updated: true, oldLength, newLength: oldLength + 1, freezes: nextFreezes };
    }

    tx.update(userRef, {
      streakHistory: [todayStr],
      streakFreezes: nextFreezes
    });
    return { updated: true, oldLength, newLength: 1, freezes: nextFreezes };
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

  // 3) Otherwise we need to reset—run a transaction with at least one write
  return runTransaction(db, async tx => {
    // re-read inside transaction
    const snap = await tx.get(userRef);
    const hist = snap.exists() ? snap.data().streakHistory || [] : [];

    // clear it out
    tx.update(userRef, { streakHistory: [] });
    return { reset: true, oldLength };
  });
}

// ————— Expose auth & db if needed elsewhere —————
export { auth, db };



// ── Initialize FCM ──
const messaging = getMessaging(app);

/**
 * Requests notification permission, fetches an FCM token,
 * and appends it to the current user's fcmTokens array in Firestore.
 */
export async function registerForNotifications() {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }
    const swReg = await navigator.serviceWorker.register('/_private/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: 'BE9W8HfVFsVQaBaU_WV2CWkgSJJJNKmve8NhXx1f0araDhnbEAxk9MlxYsCB2mjMpCdqeB2-PnwLy3uQ9g8JBik'
    , swRegistration: swReg});

    // Persist to Firestore under users/{uid}.fcmTokens
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await setDoc(userRef, {
      fcmTokens: arrayUnion(token)
    }, { merge: true });

    return token;
  } catch (err) {
    console.error('❌ registerForNotifications failed:', err);
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
  onMessage(messaging, payload => {
    console.log('🔔 FCM foreground message:', payload);
    callback(payload);
  });
}

/**
 * Persist the user’s last‐read location to Firestore
 * @param {number} surah – the Surah number
 * @param {number} ayah  – the Ayah number
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
