// src/services/firestoreService.js
import {
  getFirestore,
  doc,
  setDoc,
  increment,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export async function saveScore(uid, score) {
  const db = getFirestore();
  const today = new Date().toISOString().slice(0,10);
  const payload = {
    ajrPoints:     increment(score),
    streakHistory: arrayUnion(today)
  };
  await setDoc(doc(db, 'users', uid), payload, { merge: true });
}
