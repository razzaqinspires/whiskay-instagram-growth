const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 120_000;
const RECONNECT_EXPONENT_CAP = 10;

/**
 * Bounded exponential backoff with +/-20% jitter. The attempt counter is reset
 * by the socket manager only after a connection has stayed open for 60 seconds.
 */
export function getReconnectDelay(attempt, random = Math.random) {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new TypeError('attempt harus integer >= 1.');
  }
  if (typeof random !== 'function') throw new TypeError('random harus berupa function.');

  const sample = Number(random());
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('random() harus menghasilkan angka dalam rentang [0, 1).');
  }

  const exponent = Math.min(attempt - 1, RECONNECT_EXPONENT_CAP);
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * (2 ** exponent));
  return Math.round(base * (0.8 + sample * 0.4));
}
