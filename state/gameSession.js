// src/state/gameSession.js

import guestSession from './guestGameSession.js';
import userSession from './userGameSession.js';
import { auth } from '/services/_private/firestoreService.js';

function resolveSessionByAuth() {
  return auth.currentUser && !auth.currentUser.isAnonymous
    ? userSession
    : guestSession;
}

let currentSession = null;

function getCurrentSession() {
  if (!currentSession) {
    currentSession = resolveSessionByAuth();
  }
  return currentSession;
}

const gameSession = {
  // Lock active session per game init so auth changes do not swap handlers mid-game.
  get active() {
    return getCurrentSession();
  },

  // Lifecycle
  init(type) {
    currentSession = resolveSessionByAuth();
    return currentSession.init(type);
  },

  end(success) {
    return getCurrentSession().end(success);
  },

  // Gameplay actions
  addPoints(points) {
    return getCurrentSession().addPoints(points);
  },

  loseLife() {
    return getCurrentSession().loseLife();
  },

  // Resets / aborts
  resetToBeforeGame() {
    return getCurrentSession().resetToBeforeGame?.();
  },

  restartGameOnly() {
    return getCurrentSession().restartGameOnly?.();
  },

  // State getters (used by UI)
  get lives() {
    return getCurrentSession().lives;
  },

  get sessionScore() {
    return getCurrentSession().sessionScore;
  },

  get score() {
    return getCurrentSession().score;
  }
};

export default gameSession;
