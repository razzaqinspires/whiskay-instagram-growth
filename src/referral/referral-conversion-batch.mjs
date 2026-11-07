/**
 * WHISKAY — Referral Conversion Batch
 *
 * Submits one-time referral attribution claims for accounts that have
 * ALREADY completed normal signup. This module does not create accounts.
 *
 * Node.js 20+ (ESM; uses built-in fetch).
 */

const MAX_BATCH_SIZE = 1_000;
const EXPECTED_PATH = "/v1/referrals/claims";

function assertNonEmptyString(value, label, maxLength = 8_192) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new RangeError(`${label} exceeds ${maxLength} characters`);
  }
}

export function validateReferralClaimEndpoint(endpoint, allowedHosts = process.env.REFERRAL_CLAIM_ALLOWED_HOSTS) {
  assertNonEmptyString(endpoint, "endpoint", 2_048);
  const allowlist = (Array.isArray(allowedHosts) ? allowedHosts : String(allowedHosts || '').split(','))
    .map(host => String(host).trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) {
    throw new TypeError("REFERRAL_CLAIM_ALLOWED_HOSTS must explicitly allow the API host");
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError("endpoint must be a valid absolute URL");
  }

  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localHost && url.protocol === "http:")) {
    throw new TypeError("endpoint must use HTTPS (HTTP is allowed only on localhost)");
  }
  if (!allowlist.includes(url.hostname.toLowerCase())) {
    throw new TypeError("endpoint host is not in REFERRAL_CLAIM_ALLOWED_HOSTS");
  }

  if (url.pathname.replace(/\/+$/, "") !== EXPECTED_PATH) {
    throw new TypeError(`endpoint path must be ${EXPECTED_PATH}`);
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new TypeError("endpoint must not contain query, fragment, or embedded credentials");
  }

  return url.toString().replace(/\/+$/, "");
}

function sleep(ms, signal) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error("Operation aborted"));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);

    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }

    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("Operation aborted"));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 60_000);
  }

  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs)
    ? Math.min(Math.max(0, dateMs - Date.now()), 60_000)
    : 0;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1_000) };
  }
}

/**
 * @param {Array<{eventId: string, claimToken: string}>} claims
 *   claimToken must be a short-lived, signed/opaque, one-time token issued
 *   by the backend AFTER successful signup. Never pass passwords,
 *   session cookies, access tokens, or raw account-registration credentials.
 *
 * @param {object} options
 * @param {string} [options.endpoint=process.env.REFERRAL_CLAIM_ENDPOINT]
 * @param {string} [options.serviceToken=process.env.REFERRAL_SERVICE_TOKEN]
 * @param {number} [options.delayMs=1000] Minimum spacing between request starts.
 * @param {number} [options.timeoutMs=15000]
 * @param {number} [options.maxAttempts=3]
 * @param {typeof fetch} [options.fetchImpl=globalThis.fetch]
 * @param {(ms:number, signal?:AbortSignal)=>Promise<void>} [options.sleepImpl=sleep] Delay injection for deterministic tests.
 * @param {AbortSignal} [options.signal]
 * @param {(progress: object) => void} [options.onProgress]
 *
 * @returns {Promise<{
 *   submitted: number,
 *   succeeded: number,
 *   alreadyClaimed: number,
 *   failed: number,
 *   aborted: boolean,
 *   results: Array<object>
 * }>}
 */
export async function submitReferralConversionBatch(claims, options = {}) {
  const {
    endpoint = process.env.REFERRAL_CLAIM_ENDPOINT,
    allowedHosts = process.env.REFERRAL_CLAIM_ALLOWED_HOSTS,
    serviceToken = process.env.REFERRAL_SERVICE_TOKEN,
    delayMs = 1_000,
    timeoutMs = 15_000,
    maxAttempts = 3,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
    signal,
    onProgress = () => {},
  } = options;

  if (!Array.isArray(claims)) {
    throw new TypeError("claims must be an array");
  }
  if (claims.length > MAX_BATCH_SIZE) {
    throw new RangeError(`A batch may contain at most ${MAX_BATCH_SIZE} claims`);
  }
  if (!Number.isInteger(delayMs) || delayMs < 1_000) {
    throw new RangeError("delayMs must be an integer of at least 1000");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new RangeError("timeoutMs must be an integer of at least 1000");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new RangeError("maxAttempts must be an integer from 1 to 5");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl is unavailable; use Node.js 20+ or provide fetchImpl");
  }
  if (typeof sleepImpl !== "function") {
    throw new TypeError("sleepImpl must be a function");
  }
  assertNonEmptyString(serviceToken, "serviceToken", 4_096);

  const target = validateReferralClaimEndpoint(endpoint, allowedHosts);

  // Validate the entire batch before sending the first request.
  const seen = new Set();
  const normalized = claims.map((claim, index) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
      throw new TypeError(`claims[${index}] must be an object`);
    }

    assertNonEmptyString(claim.eventId, `claims[${index}].eventId`, 128);
    assertNonEmptyString(claim.claimToken, `claims[${index}].claimToken`, 8_192);

    if (seen.has(claim.eventId)) {
      throw new TypeError(`Duplicate eventId in batch: ${claim.eventId}`);
    }
    seen.add(claim.eventId);

    return {
      eventId: claim.eventId,
      claimToken: claim.claimToken,
    };
  });

  const results = [];
  let succeeded = 0;
  let alreadyClaimed = 0;
  let failed = 0;
  let aborted = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const claim = normalized[index];

    try {
      // Waiting after the prior response gives a conservative minimum gap
      // between request starts, including when the prior request was slow.
      if (index > 0) await sleepImpl(delayMs, signal);
      if (signal?.aborted) throw signal.reason ?? new Error("Operation aborted");

      let outcome = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const onExternalAbort = () => controller.abort(signal.reason);
        signal?.addEventListener("abort", onExternalAbort, { once: true });
        const timeout = setTimeout(
          () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );

        let response;
        try {
          response = await fetchImpl(target, {
            method: "POST",
            headers: {
              authorization: `Bearer ${serviceToken}`,
              "content-type": "application/json",
              "idempotency-key": claim.eventId,
            },
            body: JSON.stringify({ claimToken: claim.claimToken }),
            signal: controller.signal,
            redirect: "error",
          });
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? error;

          if (attempt === maxAttempts) {
            outcome = {
              eventId: claim.eventId,
              status: "failed",
              error: error?.name === "AbortError" || controller.signal.aborted
                ? "request_timeout"
                : "network_error",
              attempts: attempt,
            };
            break;
          }

          await sleepImpl(Math.max(delayMs, 1_000 * (2 ** (attempt - 1))), signal);
          continue;
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onExternalAbort);
        }

        const body = await readResponseBody(response);

        if (response.ok) {
          outcome = {
            eventId: claim.eventId,
            status: "succeeded",
            httpStatus: response.status,
            attempts: attempt,
          };
          break;
        }

        const errorCode = body?.code ?? body?.error;
        if (response.status === 409 && errorCode === "ALREADY_CLAIMED") {
          outcome = {
            eventId: claim.eventId,
            status: "already_claimed",
            httpStatus: response.status,
            attempts: attempt,
          };
          break;
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === maxAttempts) {
          outcome = {
            eventId: claim.eventId,
            status: "failed",
            httpStatus: response.status,
            // Never propagate arbitrary server messages: they may echo opaque
            // claim tokens or other sensitive backend values.
            error: "referral_claim_rejected",
            attempts: attempt,
          };
          break;
        }

        const backoffMs = Math.max(
          delayMs,
          retryAfterMs(response),
          1_000 * (2 ** (attempt - 1)),
        );
        await sleepImpl(backoffMs, signal);
      }

      results.push(outcome);
      if (outcome.status === "succeeded") succeeded += 1;
      else if (outcome.status === "already_claimed") alreadyClaimed += 1;
      else failed += 1;

      try {
        onProgress({
          completed: index + 1,
          total: normalized.length,
          succeeded,
          alreadyClaimed,
          failed,
          lastResult: outcome,
        });
      } catch {
        // A reporting callback must not interrupt the claim queue.
      }
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") {
        aborted = true;
        break;
      }

      failed += 1;
      const outcome = {
        eventId: claim.eventId,
        status: "failed",
        error: "claim_processing_failed",
      };
      results.push(outcome);

      try {
        onProgress({
          completed: index + 1,
          total: normalized.length,
          succeeded,
          alreadyClaimed,
          failed,
          lastResult: outcome,
        });
      } catch {
        // Ignore progress callback errors.
      }
    }
  }

  return {
    submitted: results.length,
    succeeded,
    alreadyClaimed,
    failed,
    aborted,
    results,
  };
}
