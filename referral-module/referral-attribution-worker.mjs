/**
 * Sequential referral attribution worker for already-verified signups.
 *
 * This module DOES NOT create accounts. Each item must refer to a signup event
 * whose user has already completed the application's normal verification flow.
 * The API must independently validate the event, user state, referral token,
 * referral eligibility, and idempotency key.
 */

const DEFAULT_INTERVAL_MS = 1_000;
const MAX_BATCH_SIZE = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validateEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.trim() === '') {
    throw new TypeError('endpoint wajib diisi.');
  }

  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new TypeError('endpoint harus berupa URL yang valid.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHosts.has(parsed.hostname))) {
    throw new TypeError('endpoint harus menggunakan HTTPS (HTTP hanya diizinkan untuk localhost).');
  }

  if (parsed.pathname.replace(/\/$/, '') !== '/v1/referrals/attribute') {
    throw new TypeError('endpoint harus mengarah ke /v1/referrals/attribute; endpoint registrasi akun tidak didukung.');
  }

  return parsed.toString();
}

function validateItems(items) {
  if (!Array.isArray(items)) throw new TypeError('items harus berupa array.');
  if (items.length > MAX_BATCH_SIZE) {
    throw new RangeError(`Maksimal ${MAX_BATCH_SIZE} event per batch.`);
  }

  const seen = new Set();
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`items[${index}] harus berupa object.`);
    }

    const signupEventId = typeof item.signupEventId === 'string' ? item.signupEventId.trim() : '';
    const referralToken = typeof item.referralToken === 'string' ? item.referralToken.trim() : '';

    if (!/^[A-Za-z0-9_-]{8,128}$/.test(signupEventId)) {
      throw new TypeError(`items[${index}].signupEventId tidak valid.`);
    }
    if (referralToken.length < 8 || referralToken.length > 256 || /\s/.test(referralToken)) {
      throw new TypeError(`items[${index}].referralToken tidak valid.`);
    }
    if (seen.has(signupEventId)) {
      throw new TypeError(`signupEventId duplikat pada items[${index}].`);
    }
    seen.add(signupEventId);

    return { signupEventId, referralToken };
  });
}

/**
 * @param {Array<{signupEventId: string, referralToken: string}>} items
 * @param {object} options
 * @param {string} options.endpoint Must be /v1/referrals/attribute (HTTPS).
 * @param {string} options.serviceToken Server-to-server API credential.
 * @param {number} [options.intervalMs=1000] Delay between requests.
 * @param {number} [options.timeoutMs=10000] Per-request timeout.
 * @param {typeof fetch} [options.fetchImpl=fetch] Injectable fetch for tests.
 * @param {(ms:number)=>Promise<void>} [options.sleepImpl=sleep] Injectable delay for tests.
 * @param {(progress:object)=>void} [options.onProgress] Optional progress callback.
 * @returns {Promise<{total:number,succeeded:number,failed:number,results:Array<object>}>
 */
export async function processReferralAttributions(items, options = {}) {
  const {
    endpoint,
    serviceToken,
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = 10_000,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
    onProgress,
  } = options;

  const url = validateEndpoint(endpoint);
  const batch = validateItems(items);

  if (typeof serviceToken !== 'string' || serviceToken.trim().length < 16) {
    throw new TypeError('serviceToken server-to-server wajib diisi dan minimal 16 karakter.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch tidak tersedia pada runtime ini.');
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000) {
    throw new RangeError('intervalMs harus antara 1000 dan 60000 ms.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new RangeError('timeoutMs harus antara 1000 dan 120000 ms.');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('onProgress harus berupa function.');
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < batch.length; index += 1) {
    const item = batch[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let result;

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${serviceToken}`,
          'idempotency-key': item.signupEventId,
        },
        body: JSON.stringify(item),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response || typeof response.ok !== 'boolean') {
        throw new TypeError('Fetch implementation mengembalikan response yang tidak valid.');
      }

      if (response.ok) {
        succeeded += 1;
        result = { signupEventId: item.signupEventId, ok: true, status: response.status };
      } else {
        failed += 1;
        result = {
          signupEventId: item.signupEventId,
          ok: false,
          status: response.status,
          error: response.status === 429 ? 'rate_limited' : 'api_rejected',
        };
      }
    } catch (error) {
      failed += 1;
      result = {
        signupEventId: item.signupEventId,
        ok: false,
        error: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      };
    } finally {
      clearTimeout(timeout);
    }

    results.push(result);
    if (typeof onProgress === 'function') {
      try {
        onProgress({ index: index + 1, total: batch.length, succeeded, failed, result });
      } catch {
        // Progress hooks must not interrupt the processing queue.
      }
    }

    if (index < batch.length - 1) await sleepImpl(intervalMs);
  }

  return { total: batch.length, succeeded, failed, results };
}
