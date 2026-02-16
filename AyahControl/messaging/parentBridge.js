import { MSG } from './messageTypes.js';
import { log } from '../core/logger.js';

const logger = log('BRIDGE');

const parentOrigin = (() => {
  try {
    // Prefer the embedding page's origin (from referrer), fall back to our own origin.
    const referrerOrSelf = document.referrer || window.location.href;
    return new URL(referrerOrSelf).origin;
  } catch (e) {
    return window.location.origin;
  }
})();

export function send(type, payload = {}) {
  logger.info('→', type, payload);
  parent.postMessage({ type, ...payload }, parentOrigin);
}

export function initParentBridge() {
  window.addEventListener('message', e => {
    if (e.origin !== parentOrigin) {
      return;
    }
    logger.info('←', e.data);
  });
}
