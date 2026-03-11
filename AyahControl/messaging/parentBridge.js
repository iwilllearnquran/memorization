import { MSG } from './messageTypes.js';
import { log } from '../core/logger.js';

const logger = log('BRIDGE');

const RAW_ORIGIN = window.location.origin;
const TARGET_ORIGIN = RAW_ORIGIN === 'null' ? '*' : RAW_ORIGIN;

export function send(type, payload = {}) {
  logger.info('→', type, payload);
  parent.postMessage({ type, ...payload }, TARGET_ORIGIN);
}

export function initParentBridge() {
  window.addEventListener('message', e => {
    if (TARGET_ORIGIN !== '*' && e.origin !== TARGET_ORIGIN) return;
    logger.info('←', e.data);
  });
}
