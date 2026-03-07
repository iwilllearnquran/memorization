import { MSG } from './messageTypes.js';
import { log } from '../core/logger.js';

const logger = log('BRIDGE');

export function send(type, payload = {}) {
  logger.info('→', type, payload);
  parent.postMessage({ type, ...payload }, '*');
}

export function initParentBridge() {
  window.addEventListener('message', e => {
    logger.info('←', e.data);
  });
}
