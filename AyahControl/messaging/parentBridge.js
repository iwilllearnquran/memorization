import { MSG } from './messageTypes.js';
import { log } from '../core/logger.js';

const logger = log('BRIDGE');

// For same-origin iframes, use the current origin.
// If this needs to support cross-origin embedding, configure allowed origins here.
const parentOrigin = window.location.origin;

export function send(type, payload = {}) {
  logger.info('→', type, payload);
  parent.postMessage({ type, ...payload }, parentOrigin);
}

export function initParentBridge() {
  window.addEventListener('message', e => {
    // Only accept messages from the same origin
    if (e.origin !== parentOrigin) {
      logger.warn('Rejected message from unauthorized origin:', e.origin);
      return;
    }
    logger.info('←', e.data);
  });
}
