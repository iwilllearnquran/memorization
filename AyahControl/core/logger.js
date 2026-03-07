export const log = scope => ({
  info: (...a) => console.log(`[${scope}]`, ...a),
  warn: (...a) => console.warn(`[${scope}]`, ...a),
  error: (...a) => console.error(`[${scope}]`, ...a)
});
