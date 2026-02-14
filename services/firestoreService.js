// src/services/firestoreService.js

// ————— Firebase Modular Imports —————
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
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

export function getUserDoc() {
  const ref = doc(db, 'users', auth.currentUser.uid);
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
      const shouldReplace = !data.lastReadAt || !data.lastSurah || !data.lastAyah;
      if (shouldReplace) {
        updates.lastSurah = payload.lastRead.surah;
        updates.lastAyah = payload.lastRead.ayah;
        updates.lastReadAt = serverTimestamp();
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

    updates.lastLogin = serverTimestamp();
    tx.set(userRef, updates, { merge: true });
  });
}

export async function addPointsToFirestore(pointsDelta) {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  const userRef = doc(db, 'users', user.uid);
  await updateDoc(userRef, {
    ajrPoints: increment(pointsDelta),
    lastLogin: serverTimestamp()
  });
}

export async function recordStreak() {
  const userRef  = doc(db, 'users', auth.currentUser.uid);
  const todayStr = getISTDateStr();
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
  const todayStr = getISTDateStr();

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
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }
    const swReg = await navigator.serviceWorker.register('/_private/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: 'fffff-PnwLy3uQ9g8JBik'
    , swRegistration: swReg});

    // Persist to Firestore under users/{uid}.fcmTokens
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      fcmTokens: arrayUnion(token)
    });

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
    await updateDoc(userRef, {
      lastSurah: surah,
      lastAyah: ayah,
      lastReadAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to update lastRead:', err);
  }
}


/**
 * Fetch last-read Surah/Ayah from Firestore (for logged-in users)
 * @returns {Promise<{surah:number, ayah:number}|null>}
 */
export async function getLastReadFromDb() {
  if (!auth.currentUser) return null;
  const snap = await getUserDoc();
  if (!snap.exists()) return null;
  const { lastSurah, lastAyah } = snap.data();
  return (lastSurah && lastAyah)
    ? { surah: lastSurah, ayah: lastAyah }
    : null;
}
